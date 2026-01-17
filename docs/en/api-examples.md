# API Usage Examples

This document provides simple API usage examples, including both OpenAI-compatible API and Gemini native API formats.

## 🤖 OpenAI-Compatible API

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ],
    "stream": false
  }'
```

### 🌊 Streaming Response

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "Write a short poem about autumn"
      }
    ],
    "stream": true
  }'
```

### 🖼️ Generate Image

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-image",
    "messages": [
      {
        "role": "user",
        "content": "Generate a kitten"
      }
    ],
    "stream": false
  }'
```

#### 🫗 Stream Generation

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-image",
    "messages": [
      {
        "role": "user",
        "content": "Generate a kitten"
      }
    ],
    "stream": true
  }'
```

## ♊ Gemini Native API Format

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
            "text": "Hello, how are you?"
          }
        ]
      }
    ]
  }'
```

### 🌊 Streaming Content Generation

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
            "text": "Write a short poem about autumn"
          }
        ]
      }
    ]
  }'
```

### 🖼️ Generate Image

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
            "text": "Generate a kitten"
          }
        ]
      }
    ]
  }'
```

#### 🫗 Stream Generation

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
            "text": "Generate a kitten"
          }
        ]
      }
    ]
  }'
```

### 🎤 TTS (Text-to-Speech)

#### Basic TTS (Default Voice)

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
            "text": "Hello, this is a text-to-speech test."
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"]
    }
  }'
```

#### Specify Voice

Available voices: `Kore`, `Puck`, `Charon`, `Fenrir`, `Aoede`

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
            "text": "Hello, this is a text-to-speech test."
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

#### Multi-Speaker Dialogue

Write the dialogue in the prompt and configure multiple speaker voices using `multiSpeakerVoiceConfig` (up to 2 speakers).

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

> 💡 **Tip**: TTS responses return base64-encoded audio data in `audio/L16;codec=pcm;rate=24000` format. You need to decode and convert it to WAV format for playback.
