# AIStudio To API

中文文档 | [English](README.md)

一个将 Google AI Studio 网页端封装为兼容 OpenAI API 和 Gemini API 的工具。该服务将充当代理，将 API 请求转换为与 AI Studio 网页界面的浏览器交互。

> **👏 鸣谢**：本项目为基于 [Ellinav](https://github.com/Ellinav) 的 [ais2api](https://github.com/Ellinav/ais2api) 分支进行的二次开发，我们对原作者创立这个优秀的项目表示诚挚的感谢。

## ✨ 功能特性

- 🔄 **API 兼容性**：同时兼容 OpenAI API 和 Gemini API 格式
- 🌐 **网页自动化**：使用浏览器自动化技术与 AI Studio 网页界面交互
- 🔐 **身份验证**：基于 API 密钥的安全认证机制
- 🐳 **Docker 支持**：通过 Docker 和 Docker Compose 轻松部署
- 📝 **模型支持**：通过 AI Studio 访问各种 Gemini 模型

## 🚀 快速开始

### 💻 本地运行（仅支持 Windows）

1. 克隆仓库：
```powershell
git clone https://github.com/iBenzene/AIStudioToAPI.git
cd AIStudioToAPI
```

2. 运行快速设置脚本：
```powershell
npm run setup-auth
```

该脚本将：
- 自动下载 Camoufox 浏览器（一个注重隐私的 Firefox 分支）
- 启动浏览器并自动导航到 AI Studio
- 在本地保存您的身份验证凭据

3. 启动服务：
```powershell
npm install
npm start
```

API 服务将在 `http://localhost:7860` 上运行。

### 🌐 服务器部署（Linux VPS）

在生产环境中部署到服务器（Linux VPS）时，需要先从 Windows 机器中提取身份验证凭据。

#### 📝 步骤 1：提取身份验证凭据（在 Windows 上）

1. 在 Windows 机器上克隆仓库：
```powershell
git clone https://github.com/iBenzene/AIStudioToAPI.git
cd AIStudioToAPI
```

2. 运行设置脚本：
```powershell
npm run setup-auth
```

这将：
- 自动下载 Camoufox 浏览器
- 启动浏览器并自动导航到 AI Studio
- 手动登录你的 Google 账号
- 将身份验证凭据保存到 `configs/auth/auth-N.json`（其中 N 是从 0 开始自动递增的索引）

**工作原理**：脚本使用浏览器自动化技术捕获您的 AI Studio 会话 Cookie 和令牌，并将它们安全地存储在 JSON 文件中。认证文件使用自动递增的索引命名（auth-0.json、auth-1.json 等）以支持多个账户。这样 API 就可以在服务器上进行经过身份验证的请求，而无需交互式登录。

3. 找到身份验证文件：
```powershell
ls configs/auth/auth-*.json
```

4. 将认证文件复制到服务器：
```powershell
scp configs/auth/auth-*.json user@your-server:/path/to/deployment/configs/auth/
```

5. 现在可以从 Windows 机器中删除克隆的仓库了。

#### 🚢 步骤 2：在服务器上部署

##### 🐋 方式 1：Docker 命令

```bash
docker run -d \
  --name aistudio-to-api \
  -p 7860:7860 \
  -v /path/to/auth:/app/configs/auth \
  -e API_KEYS=your-api-key-1,your-api-key-2 \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  ghcr.io/ibenzene/aistudio-to-api:latest
```

参数说明：
- `-p 7860:7860`：API 服务器端口（如果使用反向代理，强烈建议改成 127.0.0.1:7860）
- `-v /path/to/auth:/app/configs/auth`：挂载包含认证文件的目录
- `-e API_KEYS`：用于身份验证的 API 密钥列表（使用逗号分隔）
- `-e TZ=Asia/Shanghai`：时区设置（可选，默认使用系统时区）

##### 📦 方式 2：Docker Compose

创建 `docker-compose.yml` 文件：

```yaml
name: aistudio-to-api

services:
  app:
    image: ghcr.io/ibenzene/aistudio-to-api:latest
    container_name: aistudio-to-api    
    ports:
      - 7860:7860
    restart: unless-stopped
    volumes:
      - ./auth:/app/configs/auth
    environment:
      API_KEYS: your-api-key-1,your-api-key-2
      TZ: Asia/Shanghai  # 日志时区设置（可选）
```

启动服务：
```bash
sudo docker compose up -d
```

查看日志：
```bash
sudo docker compose logs -f
```

停止服务：
```bash
sudo docker compose down
```

##### 🌐 步骤 3（可选）：使用 Nginx 反向代理

如果需要通过域名访问或希望在反向代理层统一管理（例如配置 HTTPS、负载均衡等），可以使用 Nginx。以下是推荐的配置：

创建 Nginx 配置文件 `/etc/nginx/sites-available/aistudio-api`：

```nginx
server {
    listen 80;
    listen [::]:80;  # IPv6 支持
    server_name your-domain.com;  # 替换为你的域名

    # 如果使用 HTTPS，取消注释以下行并配置 SSL 证书
    # listen 443 ssl http2;
    # listen [::]:443 ssl http2;  # IPv6 HTTPS
    # ssl_certificate /path/to/your/certificate.crt;
    # ssl_certificate_key /path/to/your/private.key;

    # 客户端请求体大小的限制（0 = 不限制）
    client_max_body_size 0;

    location / {
        # 反向代理到 Docker 容器
        proxy_pass http://127.0.0.1:7860;

        # X-Real-IP: 传递真实客户端 IP
        proxy_set_header X-Real-IP $remote_addr;
        
        # X-Forwarded-For: 包含完整的代理链
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # 其他必要的代理头
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置（适配长时间运行的 AI 请求）
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;

        # 禁用缓冲区以支持流式响应
        proxy_buffering off;
    }
}
```

启用配置并重启 Nginx：

```bash
# 创建符号链接以启用站点
sudo ln -s /etc/nginx/sites-available/aistudio-api /etc/nginx/sites-enabled/

# 检查一下配置是否正确
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

**⚠ 多层代理配置（重要）**：

如果使用多层 Nginx 代理（例如：客户端 -> 公网网关 -> 内网网关 -> 应用），内层代理**不应覆盖** `X-Real-IP`：

```nginx
# 内层 Nginx（内网网关）配置示例
location / {
    proxy_pass http://127.0.0.1:7860;
    
    # 关键：透传上游的 X-Real-IP，不要用 $remote_addr 覆盖
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # ... 其他配置
}
```

**提示**：

- 如果配置了 HTTPS，建议设置环境变量 `SECURE_COOKIES=true` 以启用安全 Cookie
- 如果只使用 HTTP，保持 `SECURE_COOKIES=false`（默认值）或不设置此变量
- 仅在**最外层公网入口**使用 `proxy_set_header X-Real-IP $remote_addr;`，内层代理使用 `$http_x_real_ip` 透传

## 📡 使用 API

### 🤖 OpenAI 兼容 API

此端点处理后转发到官方 Gemini API 格式端点，支持思考参数。

*   `GET /openai/v1/models`: 列出模型。
*   `POST /openai/v1/chat/completions`: 聊天补全，支持非流式、真流式和假流式。

### ♊ Gemini 原生 API 格式

此端点转发到官方 Gemini API 格式端点，支持各种扩展参数。

*   `GET /models`: 列出可用的 Gemini 模型。
*   `POST /models/{model_name}:generateContent`: 生成内容。
*   `POST /models/{model_name}:streamGenerateContent`: 流式生成内容，支持真流式和假流式。

<details>
  <summary><h3>使用示例</h3></summary>

#### 🤖 OpenAI 兼容 API

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

#### ♊ Gemini 原生 API 格式

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

#### 🌊 流式响应

```bash
# OpenAI 兼容 API 流式响应
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

```bash
# Gemini 原生 API 流式响应
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

</details>

## ⚙️ 相关配置

### 🔧 环境变量

| 变量名 | 描述 | 默认值                  |
| :--- | :--- |:---------------------|
| **应用配置** | |                      |
| `API_KEYS` | 用于身份验证的有效 API 密钥列表（使用逗号分隔） | `123456`               |
| `PORT` | API 服务器端口 | `7860`               |
| `HOST` | 服务器监听主机地址 | `0.0.0.0`            |
| `ICON_URL` | 自定义控制台的 favicon 图标 URL。支持 ICO, PNG, SVG 等格式。 | `/AIStudio_icon.svg` |
| **安全设置** | |                      |
| `SECURE_COOKIES` | 是否启用安全 Cookie。`true` 表示仅 HTTPS，`false` 表示 HTTP 和 HTTPS。 | `false`              |
| **模型调用功能** | |                      |
| `STREAMING_MODE` | 流式传输模式。`real` 为真实流式，`fake` 为模拟流式。 | `real`               |
| `FORCE_THINKING` | 强制为所有请求启用思考模式。 | `false`              |
| `FORCE_WEB_SEARCH` | 强制为所有请求启用网络搜索。 | `false`              |
| `FORCE_URL_CONTEXT` | 强制为所有请求启用 URL 上下文。 | `false`              |
| **自动账户切换与重试** | |                      |
| `MAX_RETRIES` | 请求失败后的最大重试次数。 | `3`                  |
| `RETRY_DELAY` | 两次重试之间的延迟（毫秒）。 | `2000`               |
| `SWITCH_ON_USES` | 自动切换帐户前的请求次数（0 禁用）。 | `40`                 |
| `FAILURE_THRESHOLD` | 切换帐户前的连续失败次数（0 禁用）。 | `3`                  |
| `IMMEDIATE_SWITCH_STATUS_CODES` | 触发立即切换帐户的 HTTP 状态码（逗号分隔）。 | `429,503`            |

### 🧠 模型列表配置

编辑 `configs/models.json` 以自定义可用模型及其设置。

## 📄 许可证

本项目基于 [**ais2api**](https://github.com/Ellinav/ais2api)（作者：[**Ellinav**](https://github.com/Ellinav)）分支开发，并完全沿用上游项目所采用的 CC BY-NC 4.0 许可证，其使用、分发与修改行为均需遵守原有许可证的全部条款，完整许可的内容请参见 [LICENSE](LICENSE) 文件。

### ©️ 版权 / 署名

- 原始作品 Copyright © [Ellinav](https://github.com/Ellinav)
- 修改与新增部分 Copyright © 2024 [iBenzene](https://github.com/iBenzene) 及其他贡献者
