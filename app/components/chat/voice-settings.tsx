'use client'

import { useState } from 'react'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import type { VoiceRecognitionEngine } from '@/config/voice-input'
import type { WhisperModel } from './voice-recognition/whisper-recognition'

interface VoiceSettingsProps {
  autoStopOnNoInput: boolean
  onAutoStopChange: (val: boolean) => void
  autoSendOnStop: boolean
  onAutoSendChange: (val: boolean) => void
  autoReadAloud: boolean
  onAutoReadAloudChange: (val: boolean) => void
  noInputMs: number
  onTimeoutChange: (val: number) => void
  engine: VoiceRecognitionEngine
  onEngineChange: (val: VoiceRecognitionEngine) => void
  whisperModel: WhisperModel
  onWhisperModelChange: (val: WhisperModel) => void
}

const WHISPER_MODELS: { value: WhisperModel, label: string, desc: string }[] = [
  { value: 'whisper-tiny', label: 'Whisper Tiny', desc: '最快，精度一般' },
  { value: 'whisper-base', label: 'Whisper Base', desc: '较快，精度良好' },
  { value: 'whisper-small', label: 'Whisper Small', desc: '较慢，精度最好' },
  { value: 'funasr-paraformer-zh', label: 'FunASR Paraformer', desc: '中文识别，速度快精度高' },
  { value: 'funasr-sensevoice', label: 'FunASR SenseVoice', desc: '多语言，中英日韩粤' },
]

export function VoiceSettings({
  autoStopOnNoInput,
  onAutoStopChange,
  autoSendOnStop,
  onAutoSendChange,
  autoReadAloud,
  onAutoReadAloudChange,
  noInputMs,
  onTimeoutChange,
  engine,
  onEngineChange,
  whisperModel,
  onWhisperModelChange,
}: VoiceSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-8 h-8 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="语音设置"
      >
        <Cog6ToothIcon className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full right-0 mb-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 p-3">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">语音设置</div>

            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">识别引擎</span>
                <select
                  value={engine}
                  onChange={e => onEngineChange(e.target.value as VoiceRecognitionEngine)}
                  className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="browser">浏览器识别</option>
                  <option value="whisper">Whisper 离线</option>
                </select>
              </label>

              {engine === 'whisper' && (
                <label className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Whisper 模型</span>
                  <select
                    value={whisperModel}
                    onChange={e => onWhisperModelChange(e.target.value as WhisperModel)}
                    className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {WHISPER_MODELS.map(m => (
                      <option key={m.value} value={m.value}>{m.label} - {m.desc}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700 dark:text-gray-300">无录音输入自动结束</span>
                <input
                  type="checkbox"
                  checked={autoStopOnNoInput}
                  onChange={e => onAutoStopChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              {autoStopOnNoInput && (
                <label className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">无录音时长(秒)</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={noInputMs / 1000}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (val >= 1 && val <= 30) {
                        onTimeoutChange(val * 1000)
                      }
                    }}
                    className="w-16 text-right text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
              )}

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700 dark:text-gray-300">录音结束自动发送</span>
                <input
                  type="checkbox"
                  checked={autoSendOnStop}
                  onChange={e => onAutoSendChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700 dark:text-gray-300">自动朗读回复</span>
                <input
                  type="checkbox"
                  checked={autoReadAloud}
                  onChange={e => onAutoReadAloudChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
