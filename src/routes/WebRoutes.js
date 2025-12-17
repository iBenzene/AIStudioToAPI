/**
 * File: src/routes/WebRoutes.js
 * Description: Web routes manager for handling HTTP routes including status pages, authentication, and API endpoints
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

const session = require("express-session");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

/**
 * Web Routes Manager
 * Manages Web UI and API routes
 */
class WebRoutes {
    constructor(serverSystem) {
        this.serverSystem = serverSystem;
        this.logger = serverSystem.logger;
        this.config = serverSystem.config;
        this.distIndexPath = path.join(__dirname, "..", "..", "ui", "dist", "index.html");
        this.loginAttempts = new Map(); // Track login attempts for rate limiting
        this.vncSession = null;
        this.isVncOperationInProgress = false; // Mutex for VNC operations

        // Rate limiting configuration from environment variables
        this.rateLimitEnabled = process.env.RATE_LIMIT_MAX_ATTEMPTS !== "0";
        this.rateLimitWindow = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15; // minutes
        this.rateLimitMaxAttempts = parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS) || 5;

        if (this.rateLimitEnabled) {
            this.logger.info(`[Auth] Rate limiting enabled: ${this.rateLimitMaxAttempts} attempts per ${this.rateLimitWindow} minutes`);
        } else {
            this.logger.info("[Auth] Rate limiting disabled");
        }
    }

    /**
     * Get real client IP address, handling various proxy scenarios
     * Priority: CDN headers > X-Real-IP > X-Forwarded-For (first IP) > req.ip
     *
     * Supports common CDN providers:
     * - Cloudflare: CF-Connecting-IP
     * - Fastly/Firebase: Fastly-Client-IP
     * - Akamai/Cloudfront: True-Client-IP
     */
    _getClientIP(req) {
        // Priority 1: CDN-specific headers (most reliable when using CDN)
        // Cloudflare
        if (req.headers["cf-connecting-ip"]) {
            return req.headers["cf-connecting-ip"];
        }
        // Fastly / Firebase Hosting
        if (req.headers["fastly-client-ip"]) {
            return req.headers["fastly-client-ip"];
        }
        // Akamai / Cloudfront
        if (req.headers["true-client-ip"]) {
            return req.headers["true-client-ip"];
        }

        // Priority 2: X-Real-IP (reliable in trusted internal proxy chains)
        if (req.headers["x-real-ip"]) {
            return req.headers["x-real-ip"];
        }

        // Priority 3: X-Forwarded-For (can be spoofed, use as fallback)
        // Format: client, proxy1, proxy2, ...
        // We want the first IP (the original client)
        if (req.headers["x-forwarded-for"]) {
            return req.headers["x-forwarded-for"].split(",")[0].trim();
        }

        // Priority 4: Direct connection IP (fallback)
        // This will be the direct connection IP if no proxy headers exist
        return req.ip || req.connection.remoteAddress || "unknown";
    }

    /**
     * Configure session and login related middleware
     */
    setupSession(app) {
        // Generate a secure random session secret
        const sessionSecret = crypto.randomBytes(32)
            .toString("hex");

        // Trust first proxy (Nginx) for secure cookies and IP forwarding
        app.set("trust proxy", 1);

        app.use(cookieParser());
        app.use(
            session({
                cookie: {

                    httpOnly: true,

                    maxAge: 86400000,

                    sameSite: "lax",
                    // This allows HTTP access in production if HTTPS is not configured
                    // Set SECURE_COOKIES=true when using HTTPS/SSL
                    secure: process.env.SECURE_COOKIES === "true",
                },
                resave: false,
                saveUninitialized: false,
                secret: sessionSecret,
            })
        );
    }

    /**
     * Authentication middleware
     */
    isAuthenticated(req, res, next) {
        if (req.session.isAuthenticated) {
            return next();
        }
        res.redirect("/login");
    }

    /**
     * Setup login routes
     */
    setupAuthRoutes(app) {
        app.get("/login", (req, res) => {
            if (req.session.isAuthenticated) {
                return res.redirect("/");
            }
            res.sendFile(this.distIndexPath);
        });

        // Login endpoint with rate limiting
        app.post("/login", (req, res) => {
            const ip = this._getClientIP(req);
            const now = Date.now();
            const RATE_LIMIT_WINDOW = this.rateLimitWindow * 60 * 1000; // Convert minutes to milliseconds
            const MAX_ATTEMPTS = this.rateLimitMaxAttempts;

            // Skip rate limiting if disabled
            if (this.rateLimitEnabled) {
                const attempts = this.loginAttempts.get(ip) || { count: 0, firstAttempt: now, lastAttempt: 0 };

                // Clean up old entries (older than rate limit window)
                if (now - attempts.firstAttempt > RATE_LIMIT_WINDOW) {
                    // Time window expired, reset counter
                    attempts.count = 0;
                    attempts.firstAttempt = now;
                }

                // Check if IP is rate limited (MAX_ATTEMPTS in RATE_LIMIT_WINDOW)
                if (attempts.count >= MAX_ATTEMPTS) {
                    const timeLeft = Math.ceil((RATE_LIMIT_WINDOW - (now - attempts.firstAttempt)) / 60000);
                    this.logger.warn(`[Auth] Rate limit exceeded for IP: ${ip}, ${timeLeft} minutes remaining`);
                    return res.redirect("/login?error=2");
                }
            }

            const { apiKey } = req.body;
            if (apiKey && this.config.apiKeys.includes(apiKey)) {
                // Clear failed attempts on successful login
                if (this.rateLimitEnabled) {
                    this.loginAttempts.delete(ip);
                }

                // Regenerate session to prevent session fixation attacks
                req.session.regenerate(err => {
                    if (err) {
                        this.logger.error(`[Auth] Session regeneration failed: ${err.message}`);
                        return res.redirect("/login?error=1");
                    }
                    req.session.isAuthenticated = true;
                    this.logger.info(`[Auth] Successful login from IP: ${ip}`);
                    res.redirect("/");
                });
            } else {
                // Record failed login attempt (only if rate limiting is enabled)
                if (this.rateLimitEnabled) {
                    const attempts = this.loginAttempts.get(ip) || { count: 0, firstAttempt: now, lastAttempt: 0 };
                    attempts.count++;
                    attempts.lastAttempt = now;
                    this.loginAttempts.set(ip, attempts);
                    this.logger.warn(`[Auth] Failed login attempt from IP: ${ip} (${attempts.count}/${MAX_ATTEMPTS})`);

                    // Periodic cleanup: remove expired entries from other IPs
                    if (Math.random() < 0.1) { // 10% chance to trigger cleanup
                        this._cleanupExpiredAttempts(now, RATE_LIMIT_WINDOW);
                    }
                } else {
                    this.logger.warn(`[Auth] Failed login attempt from IP: ${ip}`);
                }

                res.redirect("/login?error=1");
            }
        });

        // Logout endpoint
        const isAuthenticated = this.isAuthenticated.bind(this);
        app.post("/logout", isAuthenticated, (req, res) => {
            const ip = this._getClientIP(req);
            req.session.destroy(err => {
                if (err) {
                    this.logger.error(`[Auth] Session destruction failed for IP ${ip}: ${err.message}`);
                    return res.status(500)
                        .json({ message: "logoutFailed" });
                }
                this.logger.info(`[Auth] User logged out from IP: ${ip}`);
                res.clearCookie("connect.sid");
                res.status(200)
                    .json({ message: "logoutSuccess" });
            });
        });
    }

    /**
     * Setup status page and API routes
     */
    setupStatusRoutes(app) {
        const isAuthenticated = this.isAuthenticated.bind(this);

        // Favicon endpoint (public, no authentication required)
        app.get("/favicon.ico", (req, res) => {
            const iconUrl = process.env.ICON_URL || "/AIStudio_logo.svg";

            // Redirect to the configured icon URL (default: local SVG icon)
            // This supports any icon format (ICO, PNG, SVG, etc.) and any size
            res.redirect(302, iconUrl);
        });

        // Health check endpoint (public, no authentication required)
        app.get("/health", (req, res) => {
            const now = new Date();
            const timezone = process.env.TZ || Intl.DateTimeFormat()
                .resolvedOptions().timeZone;
            let timestamp;

            try {
                timestamp = now.toLocaleString("zh-CN", {
                    day: "2-digit",
                    hour: "2-digit",
                    hour12: false,
                    minute: "2-digit",
                    month: "2-digit",
                    second: "2-digit",
                    timeZone: timezone,
                    year: "numeric",
                })
                    .replace(/\//g, "-") + `.${now.getMilliseconds()
                    .toString()
                    .padStart(3, "0")} [${timezone}]`;
            } catch (err) {
                timestamp = now.toISOString();
            }

            const healthStatus = {
                browserConnected: !!this.serverSystem.browserManager.browser,
                status: "ok",
                timestamp,
                uptime: process.uptime(),
            };
            res.status(200)
                .json(healthStatus);
        });

        app.get("/", isAuthenticated, (req, res) => {
            res.status(200)
                .sendFile(this.distIndexPath);
        });

        app.get("/auth", isAuthenticated, (req, res) => {
            res.sendFile(this.distIndexPath);
        });

        app.get("/api/status", isAuthenticated, async (req, res) => {
            // Force a reload of auth sources on each status check for real-time accuracy
            this.serverSystem.authSource.reloadAuthSources();

            const { authSource, browserManager, requestHandler } = this.serverSystem;

            // If the system is busy switching accounts, skip the validity check to prevent race conditions
            if (requestHandler.isSystemBusy) {
                return res.json(this._getStatusData());
            }

            // After reloading, only check for auth validity if a browser is active.
            if (browserManager.browser) {
                const currentAuthIndex = requestHandler.currentAuthIndex;

                if (currentAuthIndex !== null && !authSource.availableIndices.includes(currentAuthIndex)) {
                    this.logger.warn(`[System] Current auth index #${currentAuthIndex} is no longer valid after reload (e.g., file deleted).`);
                    this.logger.warn("[System] Closing browser connection due to invalid auth.");
                    try {
                        // Await closing to prevent repeated checks on subsequent status polls
                        await browserManager.closeBrowser();
                        // Reset currentAuthIndex to 0 to reflect that no valid account is currently active
                        browserManager.currentAuthIndex = 0;
                    } catch (err) {
                        this.logger.error(`[System] Error while closing browser automatically: ${err.message}`);
                    }
                }
            }

            res.json(this._getStatusData());
        });

        app.post("/api/vnc/sessions", isAuthenticated, this.startVncSession.bind(this));
        app.post("/api/vnc/auth", isAuthenticated, this.saveAuthFile.bind(this));
        app.delete("/api/vnc/sessions", async (req, res) => {
            this.logger.info("[VNC] Received cleanup request from client (beacon).");
            await this._cleanupVncSession("client_beacon");
            res.sendStatus(204); // No content
        });

        app.put("/api/accounts/current", isAuthenticated, async (req, res) => {
            try {
                const { targetIndex } = req.body;
                if (targetIndex !== undefined && targetIndex !== null) {
                    this.logger.info(
                        `[WebUI] Received request to switch to specific account #${targetIndex}...`
                    );
                    const result = await this.serverSystem.requestHandler._switchToSpecificAuth(
                        targetIndex
                    );
                    if (result.success) {
                        res.status(200).json({ message: "accountSwitchSuccess", newIndex: result.newIndex });
                    } else {
                        res.status(400).json({ message: "accountSwitchFailed", reason: result.reason });
                    }
                } else {
                    this.logger.info("[WebUI] Received manual request to switch to next account...");
                    if (this.serverSystem.authSource.availableIndices.length <= 1) {
                        return res.status(400).json({ message: "accountSwitchCancelledSingle" });
                    }
                    const result = await this.serverSystem.requestHandler._switchToNextAuth();
                    if (result.success) {
                        res.status(200).json({ message: "accountSwitchSuccessNext", newIndex: result.newIndex });
                    } else if (result.fallback) {
                        res.status(200).json({ message: "accountSwitchFallback", newIndex: result.newIndex });
                    } else {
                        res.status(409).json({ message: "accountSwitchSkipped", reason: result.reason });
                    }
                }
            } catch (error) {
                res.status(500).json({ error: error.message, message: "accountSwitchFatal" });
            }
        });

        app.delete("/api/accounts/:index", isAuthenticated, (req, res) => {
            const rawIndex = req.params.index;
            const targetIndex = Number(rawIndex);
            const currentAuthIndex = this.serverSystem.requestHandler.currentAuthIndex;

            if (!Number.isInteger(targetIndex)) {
                return res.status(400).json({ message: "errorInvalidIndex" });
            }

            if (targetIndex === currentAuthIndex) {
                return res.status(400).json({ message: "errorDeleteCurrentAccount" });
            }

            const { authSource } = this.serverSystem;

            if (!authSource.availableIndices.includes(targetIndex)) {
                return res.status(404).json({ index: targetIndex, message: "errorAccountNotFound" });
            }

            try {
                authSource.removeAuth(targetIndex);
                this.logger.warn(
                    `[WebUI] Account #${targetIndex} deleted via web interface. Current account: #${currentAuthIndex}`
                );
                res.status(200).json({ index: targetIndex, message: "accountDeleteSuccess" });
            } catch (error) {
                this.logger.error(`[WebUI] Failed to delete account #${targetIndex}: ${error.message}`);
                return res.status(500).json({ error: error.message, message: "accountDeleteFailed" });
            }
        });

        app.put("/api/settings/streaming-mode", isAuthenticated, (req, res) => {
            const newMode = req.body.mode;
            if (newMode === "fake" || newMode === "real") {
                this.serverSystem.streamingMode = newMode;
                this.logger.info(
                    `[WebUI] Streaming mode switched by authenticated user to: ${this.serverSystem.streamingMode}`
                );
                res.status(200).json({ message: "settingUpdateSuccess", setting: "streamingMode", value: newMode });
            } else {
                res.status(400).json({ message: "errorInvalidMode" });
            }
        });

        app.put("/api/settings/force-thinking", isAuthenticated, (req, res) => {
            this.serverSystem.forceThinking = !this.serverSystem.forceThinking;
            const statusText = this.serverSystem.forceThinking;
            this.logger.info(`[WebUI] Force thinking toggle switched to: ${statusText}`);
            res.status(200).json({ message: "settingUpdateSuccess", setting: "forceThinking", value: statusText });
        });

        app.put("/api/settings/force-web-search", isAuthenticated, (req, res) => {
            this.serverSystem.forceWebSearch = !this.serverSystem.forceWebSearch;
            const statusText = this.serverSystem.forceWebSearch;
            this.logger.info(`[WebUI] Force web search toggle switched to: ${statusText}`);
            res.status(200).json({ message: "settingUpdateSuccess", setting: "forceWebSearch", value: statusText });
        });

        app.put("/api/settings/force-url-context", isAuthenticated, (req, res) => {
            this.serverSystem.forceUrlContext = !this.serverSystem.forceUrlContext;
            const statusText = this.serverSystem.forceUrlContext;
            this.logger.info(`[WebUI] Force URL context toggle switched to: ${statusText}`);
            res.status(200).json({ message: "settingUpdateSuccess", setting: "forceUrlContext", value: statusText });
        });
    }

    _waitForPort(port, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const tryConnect = () => {
                const socket = new net.Socket();
                socket.on("connect", () => {
                    socket.end();
                    resolve();
                });
                socket.on("error", () => {
                    if (Date.now() - startTime > timeout) {
                        reject(new Error(`Timeout waiting for port ${port}`));
                    } else {
                        setTimeout(tryConnect, 100);
                    }
                });
                socket.connect(port, "localhost");
            };
            tryConnect();
        });
    }

    async startVncSession(req, res) {
        if (process.platform === "win32") {
            this.logger.error("[VNC] VNC feature is not supported on Windows.");
            return res.status(501)
                .json({ message: "errorVncUnsupportedOs" });
        }

        if (this.isVncOperationInProgress) {
            this.logger.warn("[VNC] A VNC operation is already in progress. Please wait.");
            return res.status(429)
                .json({ message: "errorVncInProgress" });
        }

        this.isVncOperationInProgress = true;

        try {
            // Always clean up any existing session before starting a new one
            await this._cleanupVncSession("new_session_request");
            // Add a small delay to ensure OS releases ports
            await new Promise(resolve => setTimeout(resolve, 200));

            const userAgent = req.headers["user-agent"] || "";
            const isMobile = /Mobi|Android/i.test(userAgent);
            this.logger.info(`[VNC] Detected User-Agent: "${userAgent}". Is mobile: ${isMobile}`);

            const { width, height } = req.body;
            const screenWidth = (typeof width === "number" && width > 0)
                ? Math.floor(width / 2) * 2
                : (isMobile ? 412 : 1280);
            const screenHeight = (typeof height === "number" && height > 0)
                ? Math.floor(height / 2) * 2
                : (isMobile ? 915 : 720);

            const screenResolution = `${screenWidth}x${screenHeight}x24`;
            this.logger.info(`[VNC] Requested VNC resolution: ${screenWidth}x${screenHeight}`);

            const vncPort = 5901;
            const websockifyPort = 6080;
            const display = ":99";

            const sessionResources = {};

            const cleanup = reason => this._cleanupVncSession(reason);

            this.logger.info(`[VNC] Starting virtual screen (Xvfb) on display ${display} with resolution ${screenResolution}...`);
            const xvfb = spawn("Xvfb", [display, "-screen", "0", screenResolution, "+extension", "RANDR"]);
            xvfb.stderr.on("data", data => {
                const msg = data.toString();
                // Filter out common, harmless X11 warnings
                if (msg.includes("_XSERVTransmkdir: ERROR: euid != 0")) {
                    return;
                }
                this.logger.info(`[Xvfb] ${msg}`);
            });
            xvfb.once("close", code => {
                this.logger.warn(`[Xvfb] Process exited with code ${code}. Triggering cleanup.`);
                cleanup("xvfb_closed");
            });
            sessionResources.xvfb = xvfb;

            // Wait for Xvfb to be ready
            await new Promise(resolve => setTimeout(resolve, 500));

            this.logger.info(`[VNC] Starting VNC server (x11vnc) on port ${vncPort}...`);
            const x11vnc = spawn("x11vnc", ["-display", display, "-rfbport", String(vncPort), "-forever", "-nopw", "-shared", "-quiet"]);
            x11vnc.stderr.on("data", data => {
                const msg = data.toString();
                // Filter out common, harmless X11 warnings and info messages
                if (msg.includes("extension \"DPMS\" missing")
                    || msg.includes("caught signal")
                    || msg.includes("X connection to")
                    || msg.includes("The VNC desktop is:")) {
                    return; // Ignore these messages
                }
                this.logger.error(`[x11vnc Error] ${msg}`);
            });
            x11vnc.once("close", code => {
                this.logger.warn(`[x11vnc] Process exited with code ${code}. Triggering cleanup.`);
                cleanup("x11vnc_closed");
            });
            sessionResources.x11vnc = x11vnc;

            await this._waitForPort(vncPort);
            this.logger.info("[VNC] VNC server is ready.");

            this.logger.info(`[VNC] Starting websockify on port ${websockifyPort}...`);
            const websockify = spawn("websockify", [String(websockifyPort), `localhost:${vncPort}`]);
            websockify.stdout.on("data", data => this.logger.info(`[websockify] ${data.toString()}`));
            websockify.stderr.on("data", data => {
                const msg = data.toString();

                // Downgrade ECONNRESET to INFO as it's expected during cleanup
                if (msg.includes("read ECONNRESET")) {
                    this.logger.info(`[VNC Proxy] Connection reset, likely during cleanup: ${msg.trim()}`);
                    return;
                }

                // Log normal connection info as INFO
                if (msg.includes("Plain non-SSL (ws://) WebSocket connection")
                    || msg.includes("Path: '/vnc'")) {
                    this.logger.info(`[websockify] ${msg.trim()}`);
                    return;
                }

                // Filter out websockify startup info that is printed to stderr
                if (msg.includes("In exit")
                    || msg.includes("WebSocket server settings")
                    || msg.includes("- Listen on")
                    || msg.includes("- Web server")
                    || msg.includes("- No SSL")
                    || msg.includes("- proxying from")) {
                    return;
                }
                this.logger.error(`[websockify Error] ${msg}`);
            });
            websockify.once("close", code => {
                this.logger.warn(`[websockify] Process exited with code ${code}. Triggering cleanup.`);
                cleanup("websockify_closed");
            });
            sessionResources.websockify = websockify;

            await this._waitForPort(websockifyPort);
            this.logger.info("[VNC] Websockify is ready.");

            this.logger.info("[VNC] Launching browser for VNC session...");
            const { browser, context } = await this.serverSystem.browserManager.launchBrowserForVNC({
                args: [
                    `--window-size=${screenWidth},${screenHeight}`,
                    "--start-fullscreen",  // 全屏模式
                    "--kiosk",             // Kiosk 模式，移除所有UI
                    "--no-first-run",      // 跳过首次运行提示
                    "--disable-infobars",  // 禁用信息栏
                    "--disable-session-crashed-bubble", // 禁用崩溃提示
                ], env: { DISPLAY: display },
                isMobile,
                viewport: { height: screenHeight, width: screenWidth },
            });
            sessionResources.browser = browser;
            sessionResources.context = context;

            browser.once("disconnected", () => {
                this.logger.warn("[VNC] Browser disconnected. Triggering cleanup.");
                cleanup("browser_disconnected");
            });

            const page = await context.newPage();

            // 额外设置：确保页面视口完全匹配
            await page.setViewportSize({ height: screenHeight, width: screenWidth });

            // 注入 CSS 来隐藏可能的滚动条，确保内容完美填充
            await page.addInitScript(`
                (function() {
                    const style = document.createElement("style");
                    style.textContent = \`
                        html, body {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100vw !important;
                            height: 100vh !important;
                            overflow: hidden !important;
                        }
                    \`;
                    document.addEventListener("DOMContentLoaded", () => {
                        document.head.appendChild(style);
                    });
                })();
            `);

            await page.goto("https://aistudio.google.com/", { timeout: 60000, waitUntil: "networkidle" });
            sessionResources.page = page;

            sessionResources.timeoutHandle = setTimeout(() => {
                this.logger.warn("[VNC-Timeout] Session has been idle for 10 minutes. Automatically cleaning up.");
                cleanup("idle_timeout");
            }, 10 * 60 * 1000);

            this.vncSession = sessionResources;

            this.logger.info(`[VNC] VNC session is live and accessible via the server's WebSocket proxy.`);
            res.json({ protocol: "websocket", success: true });
        } catch (error) {
            this.logger.error(`[VNC] Failed to start VNC session: ${error.message}`);
            await this._cleanupVncSession("startup_error");
            res.status(500)
                .json({ message: "errorVncStartFailed" });
        } finally {
            this.isVncOperationInProgress = false;
        }
    }

    async saveAuthFile(req, res) {
        if (!this.vncSession || !this.vncSession.context) {
            return res.status(400)
                .json({ message: "errorVncNoSession" });
        }

        let { accountName } = req.body;
        const { context, page } = this.vncSession;

        if (!accountName) {
            try {
                this.logger.info("[VNC] Attempting to retrieve account name by scanning <script> JSON...");
                const scriptLocators = page.locator("script[type=\"application/json\"]");
                const count = await scriptLocators.count();
                this.logger.info(`[VNC] -> Found ${count} JSON <script> tags.`);

                const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
                let foundEmail = false;

                for (let i = 0; i < count; i++) {
                    const content = await scriptLocators.nth(i)
                        .textContent();
                    if (content) {
                        const match = content.match(emailRegex);
                        if (match && match[0]) {
                            accountName = match[0];
                            this.logger.info(`[VNC] -> Successfully retrieved account: ${accountName}`);
                            foundEmail = true;
                            break;
                        }
                    }
                }

                if (!foundEmail) {
                    throw new Error(`Iterated through all ${count} <script> tags, but no email found.`);
                }
            } catch (e) {
                this.logger.warn(`[VNC] Could not automatically detect email: ${e.message}. Requesting manual input from client.`);
                return res.status(400)
                    .json({ message: "errorVncEmailFetchFailed" });
            }
        }

        try {
            const storageState = await context.storageState();
            const authData = { ...storageState, accountName };

            const configDir = path.join(process.cwd(), "configs", "auth");
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            let nextAuthIndex = 1;
            while (fs.existsSync(path.join(configDir, `auth-${nextAuthIndex}.json`))) {
                nextAuthIndex++;
            }

            const newAuthFilePath = path.join(configDir, `auth-${nextAuthIndex}.json`);
            fs.writeFileSync(newAuthFilePath, JSON.stringify(authData, null, 2));

            this.logger.info(`[VNC] Saved new auth file: ${newAuthFilePath}`);

            this.serverSystem.authSource.reloadAuthSources();

            res.json({
                accountName,
                accountNameMap: Object.fromEntries(this.serverSystem.authSource.accountNameMap),
                availableIndices: this.serverSystem.authSource.availableIndices,
                filePath: newAuthFilePath,
                message: "vncAuthSaveSuccess",
                newAuthIndex: nextAuthIndex,
            });

            setTimeout(() => {
                this.logger.info("[VNC] Cleaning up VNC session after saving...");
                this._cleanupVncSession("auth_saved");
            }, 500);
        } catch (error) {
            this.logger.error(`[VNC] Failed to save auth file: ${error.message}`);
            res.status(500)
                .json({ error: error.message, message: "errorVncSaveFailed" });
        }
    }

    async _cleanupVncSession(reason = "unknown") {
        if (!this.vncSession) {
            return;
        }

        const sessionToCleanup = this.vncSession;
        this.vncSession = null;

        this.logger.info(`[VNC] Starting VNC session cleanup (Reason: ${reason})...`);

        const { browser, context, xvfb, x11vnc, websockify, timeoutHandle } = sessionToCleanup;

        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }

        xvfb?.removeAllListeners();
        x11vnc?.removeAllListeners();
        websockify?.removeAllListeners();
        browser?.removeAllListeners();

        // Helper to race a promise against a timeout
        const withTimeout = (promise, ms) => Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
        ]);

        try {
            if (context) {
                // Wait max 2 seconds for context to close, otherwise proceed
                await withTimeout(context.close(), 2000);
            }
        } catch (e) {
            // Ignore errors or timeouts
        }

        try {
            if (browser) {
                // Wait max 2 seconds for browser to close, otherwise proceed
                await withTimeout(browser.close(), 2000);
            }
        } catch (e) {
            this.logger.info(`[VNC] Browser close timed out or failed: ${e.message}. Proceeding to force kill.`);
        }

        const killProcess = (proc, name) => {
            if (proc && !proc.killed) {
                try {
                    // Use SIGKILL for immediate termination to prevent hangs
                    proc.kill("SIGKILL");
                    this.logger.info(`[VNC] Forcefully terminated ${name} process.`);
                } catch (e) {
                    this.logger.warn(`[VNC] Failed to kill ${name} process: ${e.message}`);
                }
            }
        };

        killProcess(websockify, "websockify");
        killProcess(x11vnc, "x11vnc");
        killProcess(xvfb, "Xvfb");

        this.logger.info("[VNC] VNC session cleanup finished.");
    }

    /**
     * Load HTML template and replace placeholders
     */
    _loadTemplate(templateName, data = {}) {
        const templatePath = path.join(__dirname, "..", "ui", "templates", templateName);
        let template = fs.readFileSync(templatePath, "utf8");

        // Replace all {{placeholder}} with corresponding data
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{${key}}}`, "g");

            // HTML escape the value to prevent XSS (except for pre-built HTML like accountDetailsHtml)
            const escapedValue = key.endsWith("Html") ? value : this._escapeHtml(String(value));
            template = template.replace(regex, escapedValue);
        }

        return template;
    }

    /**
     * Escape HTML to prevent XSS attacks
     */
    _escapeHtml(text) {
        const htmlEscapeMap = {
            "\"": "&quot;",
            "&": "&amp;",
            "'": "&#x27;",
            "/": "&#x2F;",
            "<": "&lt;",
            ">": "&gt;",
        };
        return text.replace(/[&<>"'/]/g, char => htmlEscapeMap[char]);
    }

    _getStatusData() {
        const { config, requestHandler, authSource, browserManager } = this.serverSystem;
        const initialIndices = authSource.initialIndices || [];
        const invalidIndices = initialIndices.filter(
            i => !authSource.availableIndices.includes(i)
        );
        const logs = this.logger.logBuffer || [];
        const accountNameMap = authSource.accountNameMap;
        const accountDetails = initialIndices.map(index => {
            const isInvalid = invalidIndices.includes(index);
            const name = isInvalid
                ? "N/A (JSON format error)"
                : accountNameMap.get(index) || "N/A (Unnamed)";
            return { index, name };
        });

        const currentAuthIndex = requestHandler.currentAuthIndex;
        const currentAccountName = accountNameMap.get(currentAuthIndex) || "N/A";

        const usageCount = config.switchOnUses > 0
            ? `${requestHandler.usageCount} / ${config.switchOnUses}`
            : requestHandler.usageCount;

        const failureCount = config.failureThreshold > 0
            ? `${requestHandler.failureCount} / ${config.failureThreshold}`
            : requestHandler.failureCount;

        return {
            logCount: logs.length,
            logs: logs.join("\n"),
            status: {
                accountDetails,
                apiKeySource: config.apiKeySource,
                browserConnected: !!browserManager.browser,
                currentAccountName,
                currentAuthIndex,
                failureCount,
                forceThinking: this.serverSystem.forceThinking,
                forceUrlContext: this.serverSystem.forceUrlContext,
                forceWebSearch: this.serverSystem.forceWebSearch,
                immediateSwitchStatusCodes:
                    config.immediateSwitchStatusCodes.length > 0
                        ? `[${config.immediateSwitchStatusCodes.join(", ")}]`
                        : "Disabled",
                initialIndicesRaw: initialIndices,
                invalidIndicesRaw: invalidIndices,
                streamingMode: this.serverSystem.streamingMode,
                usageCount,
            },
        };
    }

    _generateStatusPage() {
        const { config, requestHandler, authSource, browserManager } = this.serverSystem;
        const initialIndices = authSource.initialIndices || [];
        const availableIndices = authSource.availableIndices || [];
        const invalidIndices = initialIndices.filter(
            i => !availableIndices.includes(i)
        );
        const logs = this.logger.logBuffer || [];

        const accountNameMap = authSource.accountNameMap;
        const accountDetailsHtml = initialIndices
            .map(index => {
                const isInvalid = invalidIndices.includes(index);
                const name = isInvalid
                    ? "N/A (JSON format error)"
                    : accountNameMap.get(index) || "N/A (Unnamed)";

                // Escape account name to prevent XSS
                const escapedName = this._escapeHtml(String(name));
                return `<span class="label" style="padding-left: 20px;">Account ${index}</span>: ${escapedName}`;
            })
            .join("\n");

        const currentAuthIndex = requestHandler.currentAuthIndex;
        const accountOptionsHtml = availableIndices
            .map(index => {
                const selected = index === currentAuthIndex ? " selected" : "";
                return `<option value="${index}"${selected}>Account #${index}</option>`;
            })
            .join("");

        const currentAccountName = accountNameMap.get(currentAuthIndex) || "N/A";

        const usageCount = config.switchOnUses > 0
            ? `${requestHandler.usageCount} / ${config.switchOnUses}`
            : requestHandler.usageCount;

        const failureCount = config.failureThreshold > 0
            ? `${requestHandler.failureCount} / ${config.failureThreshold}`
            : requestHandler.failureCount;

        return this._loadTemplate("status.html", {
            accountDetailsHtml,
            accountOptionsHtml,
            apiKeySource: config.apiKeySource,
            browserConnected: !!browserManager.browser,
            currentAccountName: this._escapeHtml(currentAccountName),
            currentAuthIndex,
            failureCount,
            initialForceThinking: String(this.serverSystem.forceThinking),
            initialForceUrlContext: String(this.serverSystem.forceUrlContext),
            initialForceWebSearch: String(this.serverSystem.forceWebSearch),
            initialStreamingMode: config.streamingMode,
            logCount: logs.length,
            logs: this._escapeHtml(logs.join("\n")),
            usageCount,
        });
    }

    /**
     * Clean up expired login attempt records to prevent memory leaks
     */
    _cleanupExpiredAttempts(now, rateLimit) {
        for (const [ip, data] of this.loginAttempts.entries()) {
            if (now - data.firstAttempt > rateLimit) {
                this.loginAttempts.delete(ip);
            }
        }
    }
}

module.exports = WebRoutes;
