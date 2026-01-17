# API 使用示例

本文档提供了简要的 API 使用示例，包括 OpenAI 兼容 API 和 Gemini 原生 API 格式。

## 🤖 OpenAI 兼容 API

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "你好，最近怎么样？"
      }
    ],
    "stream": false
  }'
```

### 🌊 使用流式响应

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "写一首关于秋天的诗"
      }
    ],
    "stream": true
  }'
```

### 🖼️ 生成图片

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-image",
    "messages": [
      {
        "role": "user",
        "content": "生成一只小猫"
      }
    ],
    "stream": false
  }'
```

#### 🫗 流式生成

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-image",
    "messages": [
      {
        "role": "user",
        "content": "生成一只小猫"
      }
    ],
    "stream": true
  }'
```

## ♊ Gemini 原生 API 格式

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-lite:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "你好，最近怎么样？"
          }
        ]
      }
    ]
  }'
```

### 🌊 使用流式响应

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "写一首关于秋天的诗"
          }
        ]
      }
    ]
  }'
```

### 🖼️ 生成图片

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-image:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "生成一只小猫"
          }
        ]
      }
    ]
  }'
```

#### 🫗 流式生成

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-image:streamGenerateContent?alt=sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "生成一只小猫"
          }
        ]
      }
    ]
  }'
```

### 🎤 TTS 语音合成

#### 基础 TTS（默认声音）

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-preview-tts:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "你好，这是一个语音合成测试。"
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"]
    }
  }'
```

#### 指定声音

可选声音：`Kore`、`Puck`、`Charon`、`Fenrir`、`Aoede`

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-preview-tts:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "你好，这是一个语音合成测试。"
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "voiceConfig": {
          "prebuiltVoiceConfig": {
            "voiceName": "Kore"
          }
        }
      }
    }
  }'
```

#### 多人对话

对话内容写在 prompt 中，使用 `multiSpeakerVoiceConfig` 配置多个说话者的声音（最多 2 个）。

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-preview-tts:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "TTS the following conversation between Joe and Jane:\nJoe: How are you today Jane?\nJane: I am doing great, thanks for asking!"
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "multiSpeakerVoiceConfig": {
          "speakerVoiceConfigs": [
            {
              "speaker": "Joe",
              "voiceConfig": {
                "prebuiltVoiceConfig": {
                  "voiceName": "Charon"
                }
              }
            },
            {
              "speaker": "Jane",
              "voiceConfig": {
                "prebuiltVoiceConfig": {
                  "voiceName": "Kore"
                }
              }
            }
          ]
        }
      }
    }
  }'
```

> 💡 **提示**：TTS 响应返回的是 `audio/L16;codec=pcm;rate=24000` 格式的 base64 编码音频数据，需要解码后转换为 WAV 格式播放。
