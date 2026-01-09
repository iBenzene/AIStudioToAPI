# Google AI Studio to API Adapter

[中文文档](README.md) | English

A tool that wraps Google AI Studio web interface to provide OpenAI API and Gemini API compatible endpoints. The service acts as a proxy, converting API requests to browser interactions with the AI Studio web interface.

> **👏 Acknowledgements**: This project is forked from [ais2api](https://github.com/Ellinav/ais2api) by [Ellinav](https://github.com/Ellinav). We express our sincere gratitude to the original author for creating this excellent foundation.

## ✨ Features

- 🔄 **API Compatibility**: Compatible with both OpenAI API and Gemini API formats
- 🌐 **Web Automation**: Uses browser automation to interact with AI Studio web interface
- 🔐 **Authentication**: Secure API key-based authentication
- 🐳 **Docker Support**: Easy deployment with Docker and Docker Compose
- 📝 **Model Support**: Access to various Gemini models through AI Studio, including image generation models
- 🎨 **Homepage Display Control**: Provides a visual web console with account management, VNC login, and more

## 🚀 Quick Start

### 💻 Local Development (Windows / macOS / Linux)

1. Clone the repository:

```bash
git clone https://github.com/iBenzene/AIStudioToAPI.git
cd AIStudioToAPI
```

2. Run the setup script:

```bash
npm run setup-auth
```

This script will:

- Automatically download the Camoufox browser (a privacy-focused Firefox fork)
- Launch the browser and navigate to AI Studio automatically
- Save your authentication credentials locally

3. Start the service:

```bash
npm start
```

The API server will be available at `http://localhost:7860`

After the service starts, you can access `http://localhost:7860` in your browser to open the web console homepage, where you can view account status and service status.

> ⚠ **Note:** Local deployment does not support adding accounts via VNC online. You need to use the `npm run setup-auth` script to add accounts. VNC login is only available in Docker deployments on Linux servers.

### ☁ Cloud Deployment (Linux VPS)

For production deployment on a server (Linux VPS), you can now deploy directly using Docker without pre-extracting authentication credentials.

#### 🚢 Step 1: Deploy on Server

##### 🐋 Option 1: Docker Command

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

Parameters:

- `-p 7860:7860`: API server port (if using a reverse proxy, strongly consider `127.0.0.1:7860`)
- `-v /path/to/auth:/app/configs/auth`: Mount directory containing auth files
- `-e API_KEYS`: Comma-separated list of API keys for authentication
- `-e TZ=Asia/Shanghai`: Timezone for logs (optional, defaults to system timezone)

##### 📦 Option 2: Docker Compose

Create a `docker-compose.yml` file:

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
      TZ: Asia/Shanghai # Timezone for logs (optional)
```

Start the service:

```bash
sudo docker compose up -d
```

View logs:

```bash
sudo docker compose logs -f
```

Stop the service:

```bash
sudo docker compose down
```

**Proxy Configuration (Optional):** If you need to use a proxy to access Google services, add `-e HTTP_PROXY=http://your-proxy:port -e HTTPS_PROXY=http://your-proxy:port` to the Docker command, or add these environment variables to your `docker-compose.yml`.

#### 🔑 Step 2: Account Management

After deployment, you need to add Google accounts using one of these methods:

**Method 1: VNC-Based Login (Recommended)**

- Access the deployed service address in your browser (e.g., `http://your-server:7860`) and click the "Add User" button
- You'll be redirected to a VNC page with a browser instance
- Log in to your Google account, then click the "Save" button after login is complete
- The account will be automatically saved as `auth-N.json` (N starts from 0)

**Method 2: Upload Auth Files**

- Run `npm run setup-auth` on your local machine to generate auth files
- In the web console, click "Upload Auth" to upload the auth JSON file, or manually upload to the mounted `/path/to/auth` directory

> 💡 **Tip**: You can also download auth files from an existing server and upload them to a new server. Click the "Download Auth" button for the corresponding account in the web console to download the auth file.

> ⚠ Environment variable-based auth injection is no longer supported.

#### 🌐 Step 3 (Optional): Nginx Reverse Proxy

If you need to access via a domain name or want unified management at the reverse proxy layer (e.g., configure HTTPS, load balancing, etc.), you can use Nginx.

> 📖 For detailed Nginx configuration instructions, see: [Nginx Reverse Proxy Configuration](docs/en/nginx-setup.md)

### 🐾 Claw Cloud Run Deployment

Deploy directly on Claw Cloud Run, a fully managed container platform.

> 📖 For detailed deployment instructions, see: [Deploy on Claw Cloud Run](docs/en/claw-cloud-run.md)

### 🦓 Zeabur Deployment

Deploy on the Zeabur container platform.

> ⚠ **Note:** Zeabur's free tier provides only $5 credits per month, which is not enough to run 24/7. Please pause the service when not in use!

> 📖 For detailed deployment instructions, see: [Deploy on Zeabur](docs/en/zeabur.md)

## 📡 API Usage

### 🤖 OpenAI-Compatible API

This endpoint is processed and then forwarded to the official Gemini API format endpoint.

- `GET /v1/models`: List models.
- `POST /v1/chat/completions`: Chat completion and image generation, supports non-streaming, real streaming, and fake streaming.

### ♊ Gemini Native API Format

This endpoint is forwarded to the official Gemini API format endpoint.

- `GET /v1beta/models`: List available Gemini models.
- `POST /v1beta/models/{model_name}:generateContent`: Generate content and images.
- `POST /v1beta/models/{model_name}:streamGenerateContent`: Stream content and image generation, supports real and fake streaming.

> 📖 For detailed API usage examples, see: [API Usage Examples](docs/en/api-examples.md)

## 🧰 Configuration

### 🔧 Environment Variables

#### 📱 Application Configuration

| Variable                    | Description                                                                    | Default              |
| :-------------------------- | :----------------------------------------------------------------------------- | :------------------- |
| `API_KEYS`                  | Comma-separated list of valid API keys for authentication.                     | `123456`             |
| `PORT`                      | API server port.                                                               | `7860`               |
| `HOST`                      | Server listening host address.                                                 | `0.0.0.0`            |
| `ICON_URL`                  | Custom favicon URL for the console. Supports ICO, PNG, SVG, etc.               | `/AIStudio_logo.svg` |
| `SECURE_COOKIES`            | Enable secure cookies. `true` for HTTPS only, `false` for both HTTP and HTTPS. | `false`              |
| `RATE_LIMIT_MAX_ATTEMPTS`   | Maximum failed login attempts allowed within the time window (`0` to disable). | `5`                  |
| `RATE_LIMIT_WINDOW_MINUTES` | Time window for rate limiting in minutes.                                      | `15`                 |
| `CHECK_UPDATE`              | Enable version update check on page load. Set to `false` to disable.           | `true`               |
| `LOG_LEVEL`                 | Logging output level. Set to `DEBUG` for detailed debug logs.                  | `INFO`               |

#### 🌐 Proxy Configuration

| Variable                        | Description                                                                                          | Default   |
| :------------------------------ | :--------------------------------------------------------------------------------------------------- | :-------- |
| `INITIAL_AUTH_INDEX`            | Initial authentication index to use on startup.                                                      | `0`       |
| `MAX_RETRIES`                   | Maximum number of retries for failed requests (only effective for fake streaming and non-streaming). | `3`       |
| `RETRY_DELAY`                   | Delay between retries in milliseconds.                                                               | `2000`    |
| `SWITCH_ON_USES`                | Number of requests before automatically switching accounts (`0` to disable).                         | `40`      |
| `FAILURE_THRESHOLD`             | Number of consecutive failures before switching accounts (`0` to disable).                           | `3`       |
| `IMMEDIATE_SWITCH_STATUS_CODES` | HTTP status codes that trigger immediate account switching (comma-separated).                        | `429,503` |

#### 🗒️ Other Configuration

| Variable            | Description                                                           | Default |
| :------------------ | :-------------------------------------------------------------------- | :------ |
| `STREAMING_MODE`    | Streaming mode. `real` for real streaming, `fake` for fake streaming. | `real`  |
| `FORCE_THINKING`    | Force enable thinking mode for all requests.                          | `false` |
| `FORCE_WEB_SEARCH`  | Force enable web search for all requests.                             | `false` |
| `FORCE_URL_CONTEXT` | Force enable URL context for all requests.                            | `false` |

### 🧠 Model List Configuration

Edit `configs/models.json` to customize available models and their settings.

## 📄 License

This project is a fork of [**ais2api**](https://github.com/Ellinav/ais2api) by [**Ellinav**](https://github.com/Ellinav), and fully adopts the CC BY-NC 4.0 license used by the upstream project. All usage, distribution, and modification activities must comply with all terms of the original license. See the full license text in [LICENSE](LICENSE).

### ©️ Copyright / Attribution

- Original work Copyright © [Ellinav](https://github.com/Ellinav)
- Modifications and additions Copyright © 2024 [iBenzene](https://github.com/iBenzene)、[bbbugg](https://github.com/bbbugg)、[挈挈](https://github.com/ljh156705) and contributors
