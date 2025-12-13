/**
 * File: src/proxyServerSystem.js
 * Description: Main proxy server system that orchestrates all components including HTTP/WebSocket servers, authentication, and request handling
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

const { EventEmitter } = require("events");
const express = require("express");
const WebSocket = require("ws");
const http = require("http");

const LoggingService = require("./utils/loggingService");
const AuthSource = require("./auth/authSource");
const BrowserManager = require("./browser/browserManager");
const ConnectionRegistry = require("./utils/connectionRegistry");
const RequestHandler = require("./handlers/requestHandler");
const ConfigLoader = require("./configLoader");
const WebRoutes = require("./webRoutes");

/**
 * Proxy Server System
 * Main server system class that integrates all modules
 */
class ProxyServerSystem extends EventEmitter {
    constructor() {
        super();
        this.logger = new LoggingService("ProxySystem");

        const configLoader = new ConfigLoader(this.logger);
        this.config = configLoader.loadConfiguration();
        this.streamingMode = this.config.streamingMode;
        this.forceThinking = this.config.forceThinking;
        this.forceWebSearch = this.config.forceWebSearch;
        this.forceUrlContext = this.config.forceUrlContext;

        this.authSource = new AuthSource(this.logger);
        this.browserManager = new BrowserManager(
            this.logger,
            this.config,
            this.authSource
        );
        this.connectionRegistry = new ConnectionRegistry(this.logger);
        this.requestHandler = new RequestHandler(
            this,
            this.connectionRegistry,
            this.logger,
            this.browserManager,
            this.config,
            this.authSource
        );

        this.httpServer = null;
        this.wsServer = null;
        this.webRoutes = new WebRoutes(this);
    }

    async start(initialAuthIndex = null) {
        this.logger.info("[System] Starting flexible startup process...");
        const allAvailableIndices = this.authSource.availableIndices;

        if (allAvailableIndices.length === 0) {
            throw new Error("No available authentication source, unable to start.");
        }

        let startupOrder = [...allAvailableIndices];
        if (initialAuthIndex && allAvailableIndices.includes(initialAuthIndex)) {
            this.logger.info(
                `[System] Detected specified startup index #${initialAuthIndex}, will try it first.`
            );
            startupOrder = [
                initialAuthIndex,
                ...allAvailableIndices.filter(i => i !== initialAuthIndex),
            ];
        } else {
            if (initialAuthIndex) {
                this.logger.warn(
                    `[System] Specified startup index #${initialAuthIndex} is invalid or unavailable, will start in default order.`
                );
            }
            this.logger.info(
                `[System] No valid startup index specified, will try in default order [${startupOrder.join(
                    ", "
                )}].`
            );
        }

        let isStarted = false;
        for (const index of startupOrder) {
            try {
                this.logger.info(`[System] Attempting to start service with account #${index}...`);
                await this.browserManager.launchOrSwitchContext(index);

                isStarted = true;
                this.logger.info(`[System] ✅ Successfully started with account #${index}!`);
                break;
            } catch (error) {
                this.logger.error(
                    `[System] ❌ Failed to start with account #${index}. Reason: ${error.message}`
                );
            }
        }

        if (!isStarted) {
            throw new Error("All authentication sources failed, server cannot start.");
        }

        await this._startHttpServer();
        await this._startWebSocketServer();
        this.logger.info(`[System] Proxy server system startup complete.`);
        this.emit("started");
    }

    _createAuthMiddleware() {
        return (req, res, next) => {
            // Whitelist paths that don't require API key authentication
            // Note: /, /api/status use session authentication instead
            const whitelistPaths = ["/", "/favicon.ico", "/login", "/health", "/api/status", "/api/switch-account",
                "/api/set-mode", "/api/toggle-force-thinking", "/api/toggle-force-web-search", "/api/toggle-force-url-context"];

            // Skip authentication for static files
            const staticPrefixes = ["/styles/", "/AIStudio_icon.svg", "/AIStudio_logo.svg", "/login.js", "/status.js"];
            const isStaticFile = staticPrefixes.some(prefix => req.path.startsWith(prefix) || req.path === prefix);

            if (whitelistPaths.includes(req.path) || isStaticFile) {
                return next();
            }

            const serverApiKeys = this.config.apiKeys;
            if (!serverApiKeys || serverApiKeys.length === 0) {
                return next();
            }

            let clientKey = null;
            if (req.headers["x-goog-api-key"]) {
                clientKey = req.headers["x-goog-api-key"];
            } else if (
                req.headers.authorization
                && req.headers.authorization.startsWith("Bearer ")
            ) {
                clientKey = req.headers.authorization.substring(7);
            } else if (req.headers["x-api-key"]) {
                clientKey = req.headers["x-api-key"];
            } else if (req.query.key) {
                clientKey = req.query.key;
            }

            if (clientKey && serverApiKeys.includes(clientKey)) {
                this.logger.info(
                    `[Auth] API Key verification passed (from: ${req.headers["x-forwarded-for"] || req.ip
                    })`
                );
                if (req.query.key) {
                    delete req.query.key;
                }
                return next();
            }

            if (req.path !== "/favicon.ico") {
                const clientIp = req.headers["x-forwarded-for"] || req.ip;
                this.logger.warn(
                    `[Auth] Access password incorrect or missing, request denied. IP: ${clientIp}, Path: ${req.path}`
                );
            }

            return res.status(401).json({
                error: {
                    message:
                        "Access denied. A valid API key was not found or is incorrect.",
                },
            });
        };
    }

    async _startHttpServer() {
        const app = this._createExpressApp();
        this.httpServer = http.createServer(app);

        this.httpServer.keepAliveTimeout = 120000;
        this.httpServer.headersTimeout = 125000;
        this.httpServer.requestTimeout = 120000;

        return new Promise(resolve => {
            this.httpServer.listen(this.config.httpPort, this.config.host, () => {
                this.logger.info(
                    `[System] HTTP server is listening on http://${this.config.host}:${this.config.httpPort}`
                );
                this.logger.info(
                    `[System] Keep-Alive timeout set to ${this.httpServer.keepAliveTimeout / 1000
                    } seconds.`
                );
                resolve();
            });
        });
    }

    _createExpressApp() {
        const app = express();

        // CORS middleware
        app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header(
                "Access-Control-Allow-Methods",
                "GET, POST, PUT, DELETE, PATCH, OPTIONS"
            );
            res.header(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization, x-requested-with, x-api-key, x-goog-api-key, x-goog-api-client, x-user-agent,"
                + " origin, accept, baggage, sentry-trace, openai-organization, openai-project, openai-beta, x-stainless-lang, "
                + "x-stainless-package-version, x-stainless-os, x-stainless-arch, x-stainless-runtime, x-stainless-runtime-version, "
                + "x-stainless-retry-count, x-stainless-timeout, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform"
            );
            if (req.method === "OPTIONS") {
                return res.sendStatus(204);
            }
            next();
        });

        // Request logging
        app.use((req, res, next) => {
            if (
                req.path !== "/api/status"
                && req.path !== "/"
                && req.path !== "/favicon.ico"
                && req.path !== "/login"
                && req.path !== "/health"
            ) {
                this.logger.info(
                    `[Entrypoint] Received a request: ${req.method} ${req.path}`
                );
            }
            next();
        });

        app.use(express.json({ limit: "100mb" }));
        app.use(express.urlencoded({ extended: true }));

        // Serve static files from public directory (compiled CSS, images, etc.)
        const path = require("path");
        app.use(express.static(path.join(__dirname, "..", "public")));

        // Serve static files from views directory (client-side JS files)
        app.use(express.static(path.join(__dirname, "..", "views")));

        // Setup session and login
        this.webRoutes.setupSession(app);
        this.webRoutes.setupAuthRoutes(app);

        // Setup status pages and API
        this.webRoutes.setupStatusRoutes(app);

        // API authentication middleware
        app.use(this._createAuthMiddleware());

        // API routes
        app.get(["/v1/models", "/v1beta/models"], (req, res) => {
            const modelIds = this.config.modelList || ["gemini-2.5-pro"];

            const models = modelIds.map(id => ({
                created: Math.floor(Date.now() / 1000),
                id,
                object: "model",
                owned_by: "google",
            }));

            res.status(200).json({
                data: models,
                object: "list",
            });
        });

        app.post("/v1/chat/completions", (req, res) => {
            this.requestHandler.processOpenAIRequest(req, res);
        });

        app.all(/(.*)/, (req, res) => {
            this.requestHandler.processRequest(req, res);
        });

        return app;
    }

    async _startWebSocketServer() {
        this.wsServer = new WebSocket.Server({
            host: this.config.host,
            port: this.config.wsPort,
        });
        this.wsServer.on("connection", (ws, req) => {
            this.connectionRegistry.addConnection(ws, {
                address: req.socket.remoteAddress,
            });
        });
    }
}

module.exports = ProxyServerSystem;
