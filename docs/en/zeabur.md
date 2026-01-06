# Deploy on Zeabur

This guide will help you deploy the `aistudio-to-api` service on [Zeabur](https://zeabur.com/).

> [!CAUTION]
> **Zeabur's free tier provides only $5 credits per month, which is not enough to run the service 24/7. Please make sure to pause the service when not in use!**

## 📦 Deployment Steps

1. **Login**: After logging in, go to [https://zeabur.com/projects](https://zeabur.com/projects).
2. **Create Project**: Click to create a project and select **Jakarta, Indonesia** as the region.
3. **Select Service Type**: Choose **Docker Container Image**.
4. **Configure Application**: Fill in the following parameters:

   **Image**:
   - **Image Name**: `ghcr.io/ibenzene/aistudio-to-api:latest`
   - **Username**, **Password**: Leave empty

   **Environment Variables**:

   Click **Add Environment Variable**. **Do NOT click "Expose"**.

   You must set the `API_KEYS` variable. Other variables are optional (refer to the [Configuration](../../README.md#-configuration) section in the main README).

   | Name       | Value                 | Description                                |
   | :--------- | :-------------------- | :----------------------------------------- |
   | `API_KEYS` | `your-secret-key-123` | **Required**. Define your own access keys. |

   **Port**:
   - Click **Add Port**
   - **Port Number**: `7860`
   - **Port Type**: `HTTP`

5. **Deploy**: Click **Deploy** to start the deployment.
6. **Configure Public Access**:
   - Click the **Network** tab
   - Click **Public Access**
   - Click **+ Generate Domain** to create a custom domain

## 📡 Accessing the Service

Once the application is running, access the service via the generated public domain. Enter the `API_KEYS` you configured to access the management console.

## 🔑 Account Management

After deployment, you need to add Google accounts. There are two methods:

**Method 1: VNC-Based Login (Recommended)**

- Access the deployed service address in your browser and click the "Add User" button
- You'll be redirected to a VNC page with a browser instance
- Log in to your Google account, then click the "Save" button after login is complete

**Method 2: Upload Auth Files**

- Run `npm run setup-auth` on a Windows machine to generate auth files
- In the web console, click "Upload Auth" to upload the auth JSON file

> 💡 **Tip**: You can also download auth files from an existing server and upload them to a new server. Click the "Download Auth" button for the corresponding account in the web console to download the auth file.

## 🔌 API Endpoints

After deployment, you can access the API using the public domain combined with the following Base URLs:

- **OpenAI Compatible Base URL**: `https://<your-public-domain>/v1`
- **Gemini Compatible Base URL**: `https://<your-public-domain>/v1beta`

> For more details, please refer to the [API Usage](../../README.md#-api-usage) section in the main README.

## ⏸️ Pausing and Starting the Service

> [!WARNING]
> Zeabur's $5 credits are not enough to run 24/7. **It is strongly recommended to pause the service when not in use** to save credits! Start it again when needed.

### Pausing the Service

1. Go to the service details page
2. Click **Settings**
3. Scroll to the bottom and click **Pause Service**

### Starting the Service

1. Go to the service status page
2. Click **Restart Current Version**
