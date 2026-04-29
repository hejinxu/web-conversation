# Speech Server - 离线语音识别服务

独立的 WebSocket 语音识别服务，支持多种离线识别引擎。

## 支持的引擎

| 引擎 | 模型 | 说明 | 速度 | 精度 |
|---|---|---|---|---|
| Whisper Tiny | onnx-community/whisper-tiny | HuggingFace Transformers.js + ONNX | ⚡⚡⚡ | ★★ |
| Whisper Base | onnx-community/whisper-base | HuggingFace Transformers.js + ONNX | ⚡⚡ | ★★★ |
| Whisper Small | onnx-community/whisper-small | HuggingFace Transformers.js + ONNX | ⚡ | ★★★★ |
| FunASR Paraformer | paraformer-zh | Python sidecar + FunASR | ⚡⚡⚡ | ★★★★ |
| FunASR SenseVoice | SenseVoiceSmall | Python sidecar + FunASR | ⚡⚡ | ★★★★★ |

## 快速开始

### Whisper 引擎（默认）

```bash
# 1. 安装依赖
cd speech-server
npm install

# 2. 下载模型（首次使用）
cd ..
node scripts/download-whisper-model.js whisper-tiny

# 3. 启动服务
npm run speech-server
```

### FunASR 引擎

```bash
# 1. 安装 Python 依赖
pip install funasr torch torchaudio

# 2. 启动服务（会自动启动 Python sidecar）
npm run speech-server
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SPEECH_PORT` | `8787` | WebSocket 端口 |
| `SPEECH_MODEL` | `whisper-tiny` | 默认模型 |
| `SPEECH_MODEL_PATH` | `./models` | 模型文件路径 |
| `SPEECH_PROCESS_INTERVAL` | `1500` | 推理间隔（毫秒） |
| `SPEECH_MIN_AUDIO_LENGTH` | `8000` | 最小音频长度（16kHz下0.5秒=8000采样） |
| `SPEECH_OFFLINE` | - | 设置后禁止从远程下载模型 |
| `SPEECH_MIRROR` | - | 设置模型下载镜像地址（如 `https://hf-mirror.com/`） |
| `FUNASR_PYTHON` | `python3` | FunASR Python 解释器路径 |

## 架构

```
浏览器                            Speech Server (ws://localhost:8787)
┌──────────────┐    WebSocket    ┌──────────────────┐
│ AudioContext   │ ─── Float32 ──→ │ 累积音频缓冲区    │
│ ScriptProcessor │ ←── JSON ──── │                  │
│ (16kHz采样)     │    识别结果    │ ┌──────────────┐ │
└──────────────┘                  │ │ Whisper ONNX │ │
                                  │ └──────────────┘ │
                                  │        或        │
                                  │ ┌──────────────┐ │
                                  │ │ FunASR Python│ │
                                  │ └──────────────┘ │
                                  └──────────────────┘
```

## WebSocket 协议

### 客户端 → 服务端

```json
{ "type": "config", "model": "whisper-tiny" }  // 设置模型
{ "type": "audio", "data": [...] }              // Float32Array 采样数据
{ "type": "stop" }                              // 停止识别
```

### 服务端 → 客户端

```json
{ "type": "ready" }                                       // 连接就绪
{ "type": "config_ok", "model": "whisper-tiny" }          // 模型设置成功
{ "type": "result", "text": "识别结果", "is_final": true } // 识别结果
{ "type": "stopped" }                                      // 已停止
{ "type": "error", "message": "错误信息" }                    // 错误
```

## 开发调试

同时启动 Next.js 和 Speech Server：

```bash
# 终端1：启动 webapp
pnpm dev

# 终端2：启动 speech-server
npm run speech-server
```

语音设置中选择 "Whisper 离线" 或 "FunASR" 即可使用。

## 模型对比

| 模型 | 大小 | 中文 | 英文 | 多语言 | 适用场景 |
|---|---|---|---|---|---|
| Whisper Tiny | ~114MB | ★★ | ★★★ | ✓ | 快速识别，资源受限 |
| Whisper Base | ~197MB | ★★★ | ★★★★ | ✓ | 平衡速度和精度 |
| Whisper Small | ~558MB | ★★★★ | ★★★★★ | ✓ | 高精度识别 |
| FunASR Paraformer | ~1GB | ★★★★★ | ✗ | ✗ | 中文专用，最佳中文效果 |
| FunASR SenseVoice | ~1GB | ★★★★★ | ★★★★★ | ✓ | 多语言，支持31种语言 |
