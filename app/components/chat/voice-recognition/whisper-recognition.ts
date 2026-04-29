import type { VoiceRecognitionResult } from './types'

type WhisperCallback = (result: VoiceRecognitionResult) => void

export type WhisperModel = 'whisper-tiny' | 'whisper-base' | 'whisper-small' | 'funasr-paraformer-zh' | 'funasr-sensevoice'

function getWhisperWsUrl(): string {
  if (typeof window === 'undefined') { return '' }
  const port = (window as any).__WHISPER_PORT__ || '8787'
  return `ws://${window.location.hostname}:${port}`
}

export class WhisperRecognition {
  private isActive = false
  private callback: WhisperCallback | null = null
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private ws: WebSocket | null = null
  private modelName: WhisperModel

  constructor(callback: WhisperCallback, modelName: WhisperModel = 'whisper-tiny') {
    this.callback = callback
    this.modelName = modelName
  }

  isSupported(): boolean {
    return typeof window !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia
      && typeof WebSocket !== 'undefined'
  }

  isListening(): boolean {
    return this.isActive
  }

  isReady(): boolean {
    return true
  }

  getLoadingProgress(): number {
    return 1
  }

  start(): void {
    if (this.isActive) { return }
    this.connectAndRecord()
  }

  private async connectAndRecord(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(this.stream)
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1)

      await this.connectWebSocket()

      this.isActive = true

      processor.onaudioprocess = (e) => {
        if (!this.isActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) { return }

        const inputData = e.inputBuffer.getChannelData(0)

        this.ws.send(JSON.stringify({
          type: 'audio',
          data: Array.from(inputData),
        }))
      }

      source.connect(processor)
      processor.connect(this.audioContext.destination)
    } catch (e) {
      console.warn('[WhisperRecognition] Failed to start:', e)
      this.isActive = false
      this.cleanup()
    }
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = getWhisperWsUrl()
      this.ws = new WebSocket(url)

      const timeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          this.ws?.close()
          reject(new Error('WebSocket connection timeout'))
        }
      }, 5000)

      this.ws.onopen = () => {
        clearTimeout(timeout)
        console.log('[WhisperRecognition] WebSocket connected')
        this.ws?.send(JSON.stringify({ type: 'config', model: this.modelName }))
        resolve()
      }

      this.ws.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onclose = () => {
        console.log('[WhisperRecognition] WebSocket closed')
        this.cleanup()
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'result' && msg.text && this.callback) {
            this.callback({ text: msg.text, isFinal: true })
          } else if (msg.type === 'config_ok') {
            console.log(`[WhisperRecognition] Server using model: ${msg.model}`)
          } else if (msg.type === 'error') {
            console.warn('[WhisperRecognition] Server error:', msg.message)
          }
        } catch {}
      }
    })
  }

  stop(): void {
    this.isActive = false

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'stop' }))
      } catch {}
    }
  }

  private cleanup(): void {
    if (this.ws) {
      const ws = this.ws
      this.ws = null
      try { ws.close() } catch {}
    }

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
  }

  setProgressCallback(_cb: (progress: number) => void): void {
  }
}
