import { WebSocketServer } from 'ws'
import { pipeline, env } from '@huggingface/transformers'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { spawn } from 'child_process'
import { Converter } from 'opencc-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.SPEECH_PORT || '8787', 10)
const MODEL_PATH = process.env.SPEECH_MODEL_PATH || resolve(__dirname, 'models')
const PROCESS_INTERVAL_MS = parseInt(process.env.SPEECH_PROCESS_INTERVAL || '1500', 10)
const MIN_AUDIO_LENGTH = parseInt(process.env.SPEECH_MIN_AUDIO_LENGTH || '8000', 10)
const DEFAULT_MODEL = process.env.SPEECH_MODEL || 'whisper-tiny'
const FUNASR_PYTHON = process.env.FUNASR_PYTHON || 'python3'
const SILENCE_THRESHOLD = 0.03
const toSimplified = Converter({ from: 'tw', to: 'cn' })

const MODELS = {
  'whisper-tiny': {
    name: 'whisper-tiny',
    type: 'whisper',
    hub: 'onnx-community/whisper-tiny',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    description: '最快，精度一般',
  },
  'whisper-base': {
    name: 'whisper-base',
    type: 'whisper',
    hub: 'onnx-community/whisper-base',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    description: '较快，精度良好',
  },
  'whisper-small': {
    name: 'whisper-small',
    type: 'whisper',
    hub: 'onnx-community/whisper-small',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    description: '较慢，精度最好',
  },
  'funasr-paraformer-zh': {
    name: 'funasr-paraformer-zh',
    type: 'funasr',
    funasrModel: 'paraformer-zh',
    description: 'FunASR Paraformer 中文，速度快精度高',
  },
  'funasr-sensevoice': {
    name: 'funasr-sensevoice',
    type: 'funasr',
    funasrModel: 'sensevoice',
    description: 'FunASR SenseVoice 多语言，支持中英日韩粤',
  },
}

console.log(`[Speech Server] Config:`)
console.log(`  Port: ${PORT}`)
console.log(`  Model path: ${MODEL_PATH}`)
console.log(`  Default model: ${DEFAULT_MODEL}`)
console.log(`  Process interval: ${PROCESS_INTERVAL_MS}ms`)
console.log(`  Min audio length: ${MIN_AUDIO_LENGTH} samples`)

env.allowLocalModels = true
env.localModelPath = MODEL_PATH + '/'
env.allowRemoteModels = !process.env.SPEECH_OFFLINE

if (process.env.SPEECH_MIRROR) {
  env.remoteHost = process.env.SPEECH_MIRROR
}

const models = new Map()
const modelLoading = new Map()

async function loadModel(modelName = DEFAULT_MODEL) {
  if (models.has(modelName)) return models.get(modelName)
  if (modelLoading.get(modelName)) {
    while (modelLoading.get(modelName)) {
      await new Promise(r => setTimeout(r, 500))
    }
    return models.get(modelName)
  }

  const modelConfig = MODELS[modelName]
  if (!modelConfig) {
    throw new Error(`Unknown model: ${modelName}. Available: ${Object.keys(MODELS).join(', ')}`)
  }

  modelLoading.set(modelName, true)
  const startTime = Date.now()
  console.log(`[Speech Server] Loading model: ${modelName}...`)

  try {
    const transcriber = await pipeline(
      'automatic-speech-recognition',
      modelConfig.hub,
      {
        dtype: modelConfig.dtype,
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.progress) {
            process.stdout.write(`\r[Speech Server] Loading ${modelName}: ${Math.round(progress.progress)}%`)
          } else if (progress.status === 'done') {
            process.stdout.write(`\r[Speech Server] Loading ${modelName}: 100%\n`)
          }
        },
      },
    )
    models.set(modelName, transcriber)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[Speech Server] Model ${modelName} loaded in ${elapsed}s`)
    return transcriber
  } catch (e) {
    console.error(`[Speech Server] Failed to load model ${modelName}:`, e)
    throw e
  } finally {
    modelLoading.set(modelName, false)
  }
}

let funasrProcess = null
let funasrRequestId = 0
const funasrPending = new Map()
let funasrAvailable = null

async function checkFunASRAvailable() {
  if (funasrAvailable !== null) return funasrAvailable
  try {
    const { execSync } = await import('child_process')
    execSync(`${FUNASR_PYTHON} -c "import funasr"`, { timeout: 5000, stdio: 'ignore' })
    funasrAvailable = true
    console.log('[FunASR] Python funasr package found')
  } catch {
    funasrAvailable = false
    console.log('[FunASR] Python funasr package not found. FunASR models disabled.')
    console.log('[FunASR] Install with: pip install funasr torch torchaudio')
  }
  return funasrAvailable
}

function startFunASRSidecar() {
  if (funasrProcess && !funasrProcess.killed) return true

  const scriptPath = resolve(__dirname, 'funasr_server.py')
  try {
    funasrProcess = spawn(FUNASR_PYTHON, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err) {
    console.error(`[FunASR] Failed to start process:`, err.message)
    funasrProcess = null
    return false
  }

  funasrProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim())
    for (const line of lines) {
      try {
        const result = JSON.parse(line)
        const pending = funasrPending.get(result.id)
        if (pending) {
          funasrPending.delete(result.id)
          if (result.error) {
            pending.reject(new Error(result.error))
          } else {
            pending.resolve(result.text || '')
          }
        }
      } catch {}
    }
  })

  funasrProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim()
    if (msg) console.log(`[FunASR] ${msg}`)
  })

  funasrProcess.on('close', (code) => {
    console.log(`[FunASR] Process exited with code ${code}`)
    funasrProcess = null
    for (const [, pending] of funasrPending) {
      pending.reject(new Error('FunASR process exited'))
    }
    funasrPending.clear()
  })

  funasrProcess.on('error', (err) => {
    console.error(`[FunASR] Process error:`, err.message)
    funasrProcess = null
  })

  return true
}

function callFunASR(audioData, modelName, sampleRate = 16000) {
  return new Promise(async (resolve, reject) => {
    const available = await checkFunASRAvailable()
    if (!available) {
      return reject(new Error('FunASR not available. Install with: pip install funasr torch torchaudio'))
    }

    if (!funasrProcess || funasrProcess.killed) {
      if (!startFunASRSidecar()) {
        return reject(new Error('Failed to start FunASR process'))
      }
    }

    const id = ++funasrRequestId
    funasrPending.set(id, { resolve, reject })

    const request = JSON.stringify({
      id,
      audio: Array.from(audioData),
      model: modelName,
      sample_rate: sampleRate,
    })

    try {
      funasrProcess.stdin.write(request + '\n')
    } catch (err) {
      funasrPending.delete(id)
      return reject(new Error(`Failed to write to FunASR: ${err.message}`))
    }

    setTimeout(() => {
      if (funasrPending.has(id)) {
        funasrPending.delete(id)
        reject(new Error('FunASR timeout'))
      }
    }, 30000)
  })
}

async function transcribe(audioData, language = 'chinese', task = 'transcribe', modelName = DEFAULT_MODEL) {
  const modelConfig = MODELS[modelName]

  if (modelConfig?.type === 'funasr') {
    const text = await callFunASR(audioData, modelConfig.funasrModel)
    return text
  }

  const model = await loadModel(modelName)
  const result = await model(audioData, {
    language,
    task,
    return_timestamps: false,
    initial_prompt: '以下是普通话的句子。',
  })
  let text = (result?.text || '').trim()
  text = filterHallucinations(text)
  text = toSimplified(text)
  return text
}

function filterHallucinations(text) {
  if (!text) return ''
  // Filter common Whisper hallucination patterns
  const hallucinationPatterns = [
    /^\(字幕[：:].*?\)$/,           // (字幕:xxx)
    /^\(字幕君\)$/,                 // (字幕君)
    /^字幕[：:]/,                   // 字幕: / 字幕：
    /^ thanks for watching/i,       // common English hallucination
    /^ subscribe/i,
    /^ thank you for watching/i,
    /^\[.*?\]$/,                    // [xxx] empty tags
    /^the output of this/,          // common hallucination
    /^you$/,                         // single word hallucination
  ]
  for (const pattern of hallucinationPatterns) {
    if (pattern.test(text)) return ''
  }
  // Remove any remaining subtitle-like prefixes
  text = text.replace(/^[\(（]字幕[：:].*?[\)）]\s*/, '')
  return text.trim()
}

const wss = new WebSocketServer({ port: PORT })

const clients = new Map()

wss.on('connection', (ws) => {
  const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  console.log(`[Speech Server] Client connected: ${clientId}`)

  const clientState = {
    audioBuffer: new Float32Array(0),
    isProcessing: false,
    lastResult: '',
    processTimeout: null,
    modelName: DEFAULT_MODEL,
  }
  clients.set(clientId, clientState)

  ws.on('message', async (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
      return
    }

    if (msg.type === 'config') {
      if (msg.model && MODELS[msg.model]) {
        clientState.modelName = msg.model
        console.log(`[Speech Server] Client ${clientId} set model: ${msg.model}`)
        ws.send(JSON.stringify({ type: 'config_ok', model: msg.model }))
      } else {
        ws.send(JSON.stringify({ type: 'error', message: `Invalid model: ${msg.model}. Available: ${Object.keys(MODELS).join(', ')}` }))
      }
      return
    }

    if (msg.type === 'audio') {
      const newAudio = new Float32Array(msg.data)
      const oldBuffer = clientState.audioBuffer
      const merged = new Float32Array(oldBuffer.length + newAudio.length)
      merged.set(oldBuffer, 0)
      merged.set(newAudio, oldBuffer.length)
      clientState.audioBuffer = merged

      if (clientState.audioBuffer.length % 48000 < 4096) {
        process.stdout.write(`\r[Speech Server] Buffer: ${clientState.audioBuffer.length} samples (${(clientState.audioBuffer.length / 16000).toFixed(1)}s)`)
      }

      if (!clientState.isProcessing && clientState.audioBuffer.length >= MIN_AUDIO_LENGTH) {
        if (clientState.processTimeout) {
          clearTimeout(clientState.processTimeout)
          clientState.processTimeout = null
        }
        await processBuffer(clientId, ws)
      } else if (!clientState.isProcessing && !clientState.processTimeout) {
        clientState.processTimeout = setTimeout(async () => {
          clientState.processTimeout = null
          if (!clientState.isProcessing && clientState.audioBuffer.length > 0) {
            let sq = 0
            for (let i = 0; i < clientState.audioBuffer.length; i++) {
              sq += clientState.audioBuffer[i] * clientState.audioBuffer[i]
            }
            const rms = Math.sqrt(sq / clientState.audioBuffer.length)
            if (rms >= SILENCE_THRESHOLD) {
              await processBuffer(clientId, ws, true)
            }
          }
        }, PROCESS_INTERVAL_MS)
      }
    } else if (msg.type === 'stop') {
      if (clientState.processTimeout) {
        clearTimeout(clientState.processTimeout)
        clientState.processTimeout = null
      }
      if (clientState.audioBuffer.length > 0) {
        await processBuffer(clientId, ws, true)
      }
      clientState.audioBuffer = new Float32Array(0)
      clientState.lastResult = ''
      ws.send(JSON.stringify({ type: 'stopped' }))
    }
  })

  ws.on('close', () => {
    console.log(`[Speech Server] Client disconnected: ${clientId}`)
    if (clientState.processTimeout) {
      clearTimeout(clientState.processTimeout)
    }
    clients.delete(clientId)
  })

  ws.on('error', (err) => {
    console.error(`[Speech Server] Client ${clientId} error:`, err.message)
    if (clientState.processTimeout) {
      clearTimeout(clientState.processTimeout)
    }
    clients.delete(clientId)
  })

  ws.send(JSON.stringify({ type: 'ready' }))
})

async function processBuffer(clientId, ws, force = false) {
  const state = clients.get(clientId)
  if (!state) return
  if (state.isProcessing && !force) return
  if (state.audioBuffer.length < MIN_AUDIO_LENGTH && !force) return

  state.isProcessing = true
  const audioToProcess = state.audioBuffer

  let sumSquares = 0
  for (let i = 0; i < audioToProcess.length; i++) {
    sumSquares += audioToProcess[i] * audioToProcess[i]
  }
  const rms = Math.sqrt(sumSquares / audioToProcess.length)
  if (rms < SILENCE_THRESHOLD && !force) {
    state.isProcessing = false
    return
  }

  try {
    const text = await transcribe(audioToProcess, 'chinese', 'transcribe', state.modelName)
    const duration = (audioToProcess.length / 16000).toFixed(1)
    console.log(`[Speech Server] [${state.modelName}] Transcribed ${audioToProcess.length} samples (${duration}s): "${text}"`)
    if (text && ws.readyState === 1) {
      state.lastResult = text
      ws.send(JSON.stringify({ type: 'result', text, is_final: true }))
    }
  } catch (e) {
    console.error(`[Speech Server] Transcription error for ${clientId}:`, e.message)
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'error', message: e.message }))
    }
  } finally {
    state.isProcessing = false
  }
}

process.on('uncaughtException', (err) => {
  console.error('[Speech Server] Uncaught exception:', err.message)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Speech Server] Unhandled rejection:', reason)
})

const WHISPER_MODELS = ['whisper-tiny', 'whisper-base', 'whisper-small']

Promise.all(WHISPER_MODELS.map(m => loadModel(m).catch(e => {
  console.error(`[Speech Server] Failed to preload ${m}:`, e.message)
}))).then(() => {
  console.log(`[Speech Server] WebSocket server listening on ws://localhost:${PORT}`)
})

console.log(`[Speech Server] Starting...`)