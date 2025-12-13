/**
 * File: src/webRoutes.js
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

/**
 * Web Routes Manager
 * Manages Web UI and API routes
 */
class WebRoutes {
    constructor(serverSystem) {
        this.serverSystem = serverSystem;
        this.logger = serverSystem.logger;
        this.config = serverSystem.config;
        this.loginAttempts = new Map(); // Track login attempts for rate limiting
    }

    /**
     * Get real client IP address, handling various proxy scenarios
     * Priority: X-Real-IP > X-Forwarded-For (first IP) > req.ip
     */
    _getClientIP(req) {
        // X-Real-IP is set by Nginx and contains the actual client IP
        if (req.headers["x-real-ip"]) {
            return req.headers["x-real-ip"];
        }

        // X-Forwarded-For contains a comma-separated list of IPs
        // Format: client, proxy1, proxy2, ...
        // We want the first IP (the original client)
        if (req.headers["x-forwarded-for"]) {
            return req.headers["x-forwarded-for"].split(",")[0].trim();
        }

        // Fallback to Express's req.ip (works if trust proxy is configured)
        // This will be the direct connection IP if no proxy headers exist
        return req.ip || req.connection.remoteAddress || "unknown";
    }

    /**
     * Configure session and login related middleware
     */
    setupSession(app) {
        // Generate a secure random session secret
        const sessionSecret = crypto.randomBytes(32).toString("hex");

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
            let errorMessageHtml = "";
            if (req.query.error === "1") {
                errorMessageHtml = '<p class="error">Invalid API Key!</p>';
            } else if (req.query.error === "2") {
                errorMessageHtml = '<p class="error">Too many failed attempts. Please try again in 15 minutes.</p>';
            }
            const loginHtml = this._loadTemplate("login.html", {
                errorMessageHtml,
            });
            res.send(loginHtml);
        });

        app.post("/login", (req, res) => {
            const ip = this._getClientIP(req);
            const now = Date.now();
            const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
            const MAX_ATTEMPTS = 5;

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

            const { apiKey } = req.body;
            if (apiKey && this.config.apiKeys.includes(apiKey)) {
                // Clear failed attempts on successful login
                this.loginAttempts.delete(ip);

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
                // Record failed login attempt
                attempts.count++;
                attempts.lastAttempt = now;
                this.loginAttempts.set(ip, attempts);
                this.logger.warn(`[Auth] Failed login attempt from IP: ${ip} (${attempts.count}/${MAX_ATTEMPTS})`);

                // Periodic cleanup: remove expired entries from other IPs
                if (Math.random() < 0.1) { // 10% chance to trigger cleanup
                    this._cleanupExpiredAttempts(now, RATE_LIMIT_WINDOW);
                }

                res.redirect("/login?error=1");
            }
        });
    }

    /**
     * Setup status page and API routes
     */
    setupStatusRoutes(app) {
        const isAuthenticated = this.isAuthenticated.bind(this);

        // Favicon endpoint (public, no authentication required)
        app.get("/favicon.ico", (req, res) => {
            const iconUrl = process.env.ICON_URL || "/AIStudio_icon.svg";

            // Redirect to the configured icon URL (default: local SVG icon)
            // This supports any icon format (ICO, PNG, SVG, etc.) and any size
            res.redirect(302, iconUrl);
        });

        // Health check endpoint (public, no authentication required)
        app.get("/health", (req, res) => {
            const healthStatus = {
                browserConnected: !!this.serverSystem.browserManager.browser,
                status: "ok",
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
            };
            res.status(200).json(healthStatus);
        });

        app.get("/", isAuthenticated, (req, res) => {
            res.status(200).send(this._generateStatusPage());
        });

        app.get("/api/status", isAuthenticated, (req, res) => {
            res.json(this._getStatusData());
        });

        app.post("/api/switch-account", isAuthenticated, async (req, res) => {
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
                        res.status(200).send(`Switch successful! Account #${result.newIndex} activated.`);
                    } else {
                        res.status(400).send(result.reason);
                    }
                } else {
                    this.logger.info("[WebUI] Received manual request to switch to next account...");
                    if (this.serverSystem.authSource.availableIndices.length <= 1) {
                        return res
                            .status(400)
                            .send("Switch operation cancelled: Only one available account, cannot switch.");
                    }
                    const result = await this.serverSystem.requestHandler._switchToNextAuth();
                    if (result.success) {
                        res
                            .status(200)
                            .send(`Switch successful! Switched to account #${result.newIndex}.`);
                    } else if (result.fallback) {
                        res
                            .status(200)
                            .send(`Switch failed, but successfully fell back to account #${result.newIndex}.`);
                    } else {
                        res.status(409).send(`Operation not executed: ${result.reason}`);
                    }
                }
            } catch (error) {
                res
                    .status(500)
                    .send(`Fatal error: Operation failed! Please check logs. Error: ${error.message}`);
            }
        });

        app.post("/api/set-mode", isAuthenticated, (req, res) => {
            const newMode = req.body.mode;
            if (newMode === "fake" || newMode === "real") {
                this.serverSystem.streamingMode = newMode;
                this.logger.info(
                    `[WebUI] Streaming mode switched by authenticated user to: ${this.serverSystem.streamingMode}`
                );
                res.status(200).send(`Streaming mode switched to: ${this.serverSystem.streamingMode}`);
            } else {
                res.status(400).send('Invalid mode. Use "fake" or "real".');
            }
        });

        app.post("/api/toggle-force-thinking", isAuthenticated, (req, res) => {
            this.serverSystem.forceThinking = !this.serverSystem.forceThinking;
            const statusText = this.serverSystem.forceThinking ? "Enabled" : "Disabled";
            this.logger.info(`[WebUI] Force thinking toggle switched to: ${statusText}`);
            res.status(200).send(`Force thinking mode: ${statusText}`);
        });

        app.post("/api/toggle-force-web-search", isAuthenticated, (req, res) => {
            this.serverSystem.forceWebSearch = !this.serverSystem.forceWebSearch;
            const statusText = this.serverSystem.forceWebSearch ? "Enabled" : "Disabled";
            this.logger.info(`[WebUI] Force web search toggle switched to: ${statusText}`);
            res.status(200).send(`Force web search: ${statusText}`);
        });

        app.post("/api/toggle-force-url-context", isAuthenticated, (req, res) => {
            this.serverSystem.forceUrlContext = !this.serverSystem.forceUrlContext;
            const statusText = this.serverSystem.forceUrlContext ? "Enabled" : "Disabled";
            this.logger.info(`[WebUI] Force URL context toggle switched to: ${statusText}`);
            res.status(200).send(`Force URL context: ${statusText}`);
        });
    }

    /**
     * Load HTML template and replace placeholders
     */
    _loadTemplate(templateName, data = {}) {
        const templatePath = path.join(__dirname, "..", "views", "templates", templateName);
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
            '"': "&quot;",
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

        return {
            logCount: logs.length,
            logs: logs.join("\n"),
            status: {
                accountDetails,
                apiKeySource: config.apiKeySource,
                browserConnected: !!browserManager.browser,
                currentAccountName,
                currentAuthIndex,
                failureCount: `${requestHandler.failureCount} / ${config.failureThreshold > 0 ? config.failureThreshold : "N/A"
                }`,
                forceThinking: this.serverSystem.forceThinking ? "✅ Enabled" : "❌ Disabled",
                forceUrlContext: this.serverSystem.forceUrlContext ? "✅ Enabled" : "❌ Disabled",
                forceWebSearch: this.serverSystem.forceWebSearch ? "✅ Enabled" : "❌ Disabled",
                immediateSwitchStatusCodes:
                    config.immediateSwitchStatusCodes.length > 0
                        ? `[${config.immediateSwitchStatusCodes.join(", ")}]`
                        : "Disabled",
                initialIndices: `[${initialIndices.join(", ")}] (Total: ${initialIndices.length
                })`,
                invalidIndices: `[${invalidIndices.join(", ")}] (Total: ${invalidIndices.length
                })`,
                streamingMode: `${this.serverSystem.streamingMode} (only applies when streaming is enabled)`,
                usageCount: `${requestHandler.usageCount} / ${config.switchOnUses > 0 ? config.switchOnUses : "N/A"
                }`,
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

        return this._loadTemplate("status.html", {
            accountDetailsHtml,
            accountOptionsHtml,
            apiKeySource: config.apiKeySource,
            browserConnected: !!browserManager.browser,
            browserConnectedClass: browserManager.browser ? "status-ok" : "status-error",
            currentAccountName: this._escapeHtml(currentAccountName),
            currentAuthIndex,
            failureCount: `${requestHandler.failureCount} / ${config.failureThreshold > 0 ? config.failureThreshold : "N/A"}`,
            forceThinking: this.serverSystem.forceThinking ? "✅ Enabled" : "❌ Disabled",
            forceUrlContext: this.serverSystem.forceUrlContext ? "✅ Enabled" : "❌ Disabled",
            forceWebSearch: this.serverSystem.forceWebSearch ? "✅ Enabled" : "❌ Disabled",
            formatErrors: `[${invalidIndices.join(", ")}] (Total: ${invalidIndices.length})`,
            logCount: logs.length,
            logs: this._escapeHtml(logs.join("\n")),
            streamingMode: config.streamingMode,
            totalScannedAccounts: `[${initialIndices.join(", ")}] (Total: ${initialIndices.length})`,
            usageCount: `${requestHandler.usageCount} / ${config.switchOnUses > 0 ? config.switchOnUses : "N/A"}`,
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
