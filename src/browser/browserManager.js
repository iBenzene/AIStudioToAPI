/**
 * File: src/browser/browserManager.js
 * Description: Browser manager for launching and controlling headless Firefox instances with authentication contexts
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

const fs = require("fs");
const path = require("path");
const { firefox, devices } = require("playwright");
const os = require("os");

/**
 * Browser Manager Module
 * Responsible for launching, managing, and switching browser contexts
 */
class BrowserManager {
    constructor(logger, config, authSource) {
        this.logger = logger;
        this.config = config;
        this.authSource = authSource;
        this.browser = null;
        this.context = null;
        this.page = null;
        this.currentAuthIndex = 0;
        this.scriptFileName = "blackBrowser.js";

        // Optimized launch arguments for low-memory Docker/cloud environments
        this.launchArgs = [
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-infobars",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-extensions",
            "--disable-sync",
            "--disable-translate",
            "--metrics-recording-only",
            "--mute-audio",
            "--safebrowsing-disable-auto-update",
        ];

        if (this.config.browserExecutablePath) {
            this.browserExecutablePath = this.config.browserExecutablePath;
        } else {
            const platform = os.platform();
            if (platform === "linux") {
                this.browserExecutablePath = path.join(
                    process.cwd(),
                    "camoufox-linux",
                    "camoufox"
                );
            } else if (platform === "win32") {
                this.browserExecutablePath = path.join(
                    process.cwd(),
                    "camoufox",
                    "camoufox.exe"
                );
            } else if (platform === "darwin") {
                this.browserExecutablePath = path.join(
                    process.cwd(),
                    "camoufox-macos",
                    "Camoufox.app",
                    "Contents",
                    "MacOS",
                    "camoufox"
                );
            } else {
                throw new Error(`Unsupported operating system: ${platform}`);
            }
        }
    }

    async launchBrowserForVNC(extraArgs = {}) {
        this.logger.info("🚀 [VNC] Launching a new, separate, headful browser instance for VNC session...");
        if (!fs.existsSync(this.browserExecutablePath)) {
            throw new Error(
                `Browser executable not found at path: ${this.browserExecutablePath}`
            );
        }

        // This browser instance is temporary and specific to the VNC session.
        // It does NOT affect the main `this.browser` used for the API proxy.
        const vncBrowser = await firefox.launch({
            args: this.launchArgs,
            // Must be false for VNC to be visible.
            env: {
                ...process.env,
                ...extraArgs.env,
            },

            executablePath: this.browserExecutablePath,
            headless: false,
        });

        vncBrowser.on("disconnected", () => {
            this.logger.warn("ℹ️ [VNC] The temporary VNC browser instance has been disconnected.");
        });

        this.logger.info("✅ [VNC] Temporary VNC browser instance launched successfully.");

        let contextOptions = {};
        if (extraArgs.isMobile) {
            this.logger.info("[VNC] Mobile device detected. Applying mobile user-agent, viewport, and touch events.");
            const mobileDevice = devices["Pixel 5"];
            contextOptions = {
                hasTouch: mobileDevice.hasTouch,
                userAgent: mobileDevice.userAgent,
                viewport: { height: 915, width: 412 }, // Set a specific portrait viewport
            };
        }

        const context = await vncBrowser.newContext(contextOptions);
        this.logger.info("✅ [VNC] VNC browser context successfully created.");

        // Return both the browser and context so the caller can manage their lifecycle.
        return { browser: vncBrowser, context };
    }

    async launchOrSwitchContext(authIndex) {
        if (!this.browser) {
            this.logger.info("🚀 [Browser] Main browser instance not running, performing first-time launch...");
            if (!fs.existsSync(this.browserExecutablePath)) {
                throw new Error(
                    `Browser executable not found at path: ${this.browserExecutablePath}`
                );
            }
            this.browser = await firefox.launch({
                args: this.launchArgs,
                executablePath: this.browserExecutablePath,
                headless: true, // Main browser is always headless
            });
            this.browser.on("disconnected", () => {
                this.logger.error("❌ [Browser] Main browser unexpectedly disconnected!");
                this.browser = null;
                this.context = null;
                this.page = null;
            });
            this.logger.info("✅ [Browser] Main browser instance successfully launched.");
        }

        if (this.context) {
            this.logger.info("[Browser] Closing old API browser context...");
            await this.context.close();
            this.context = null;
            this.page = null;
            this.logger.info("[Browser] Old API context closed.");
        }

        const sourceDescription = `File auth-${authIndex}.json`;
        this.logger.info("==================================================");
        this.logger.info(
            `🔄 [Browser] Creating new API browser context for account #${authIndex}`
        );
        this.logger.info(`   • Auth source: ${sourceDescription}`);
        this.logger.info("==================================================");

        const storageStateObject = this.authSource.getAuth(authIndex);
        if (!storageStateObject) {
            throw new Error(
                `Failed to get or parse auth source for index ${authIndex}.`
            );
        }

        let buildScriptContent = fs.readFileSync(
            path.join(__dirname, "blackBrowser.js"),
            "utf-8"
        );

        if (process.env.TARGET_DOMAIN) {
            const lines = buildScriptContent.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("this.targetDomain =")) {
                    this.logger.info(`[Config] Found targetDomain line: ${lines[i]}`);
                    lines[i] = `    this.targetDomain = "${process.env.TARGET_DOMAIN}";`;
                    this.logger.info(`[Config] Replaced with: ${lines[i]}`);
                    break;
                }
            }
            buildScriptContent = lines.join("\n");
        }

        try {
            this.context = await this.browser.newContext({
                storageState: storageStateObject,
                viewport: { height: 1080, width: 1920 },
            });
            this.page = await this.context.newPage();
            this.page.on("console", msg => {
                const msgText = msg.text();
                if (msgText.includes("[ProxyClient]")) {
                    this.logger.info(
                        `[Browser] ${msgText.replace("[ProxyClient] ", "")}`
                    );
                } else if (msg.type() === "error") {
                    this.logger.error(`[Browser Page Error] ${msgText}`);
                }
            });

            this.logger.info(`[Browser] Navigating to target page...`);
            const targetUrl
                = "https://aistudio.google.com/u/0/apps/bundled/blank?showPreview=true&showCode=true&showAssistant=true";
            await this.page.goto(targetUrl, {
                timeout: 180000,
                waitUntil: "domcontentloaded",
            });
            this.logger.info("[Browser] Page loaded.");

            await this.page.waitForTimeout(3000);

            const currentUrl = this.page.url();
            let pageTitle = "";
            try {
                pageTitle = await this.page.title();
            } catch (e) {
                this.logger.warn(`[Browser] Unable to get page title: ${e.message}`);
            }

            this.logger.info(`[Browser] [Diagnostic] URL: ${currentUrl}`);
            this.logger.info(`[Browser] [Diagnostic] Title: "${pageTitle}"`);

            // Check for various error conditions
            if (
                currentUrl.includes("accounts.google.com")
                || currentUrl.includes("ServiceLogin")
                || pageTitle.includes("Sign in")
                || pageTitle.includes("登录")
            ) {
                throw new Error(
                    "🚨 Cookie expired/invalid! Browser was redirected to Google login page. Please re-extract storageState."
                );
            }

            if (
                pageTitle.includes("Available regions")
                || pageTitle.includes("not available")
            ) {
                throw new Error(
                    "🚨 Current IP does not support access to Google AI Studio (region restricted). Claw node may be identified as restricted region, try restarting container to get a new IP."
                );
            }

            if (pageTitle.includes("403") || pageTitle.includes("Forbidden")) {
                throw new Error(
                    "🚨 403 Forbidden: Current IP reputation too low, access denied by Google risk control."
                );
            }

            if (currentUrl === "about:blank") {
                throw new Error(
                    "🚨 Page load failed (about:blank), possibly network timeout or browser crash."
                );
            }

            // Handle various popups
            this.logger.info(`[Browser] Checking for Cookie consent banner...`);
            try {
                const agreeButton = this.page.locator('button:text("Agree")');
                await agreeButton.waitFor({ state: "visible", timeout: 10000 });
                this.logger.info(
                    `[Browser] ✅ Found Cookie consent banner, clicking "Agree"...`
                );
                await agreeButton.click({ force: true });
                await this.page.waitForTimeout(1000);
            } catch (error) {
                this.logger.info(`[Browser] No Cookie consent banner found, skipping.`);
            }

            this.logger.info(`[Browser] Checking for "Got it" popup...`);
            try {
                const gotItButton = this.page.locator(
                    'div.dialog button:text("Got it")'
                );
                await gotItButton.waitFor({ state: "visible", timeout: 15000 });
                this.logger.info(`[Browser] ✅ Found "Got it" popup, clicking...`);
                await gotItButton.click({ force: true });
                await this.page.waitForTimeout(1000);
            } catch (error) {
                this.logger.info(`[Browser] No "Got it" popup found, skipping.`);
            }

            this.logger.info(`[Browser] Checking for onboarding tutorial...`);
            try {
                const closeButton = this.page.locator('button[aria-label="Close"]');
                await closeButton.waitFor({ state: "visible", timeout: 15000 });
                this.logger.info(`[Browser] ✅ Found onboarding tutorial popup, clicking close button...`);
                await closeButton.click({ force: true });
                await this.page.waitForTimeout(1000);
            } catch (error) {
                this.logger.info(
                    `[Browser] No "It's time to build" onboarding tutorial found, skipping.`
                );
            }

            this.logger.info("[Browser] Preparing UI interaction, forcefully removing all possible overlay layers...");
            await this.page.evaluate(() => {
                const overlays = document.querySelectorAll("div.cdk-overlay-backdrop");
                if (overlays.length > 0) {
                    console.log(
                        `[ProxyClient] (Internal JS) Found and removed ${overlays.length} overlay layers.`
                    );
                    overlays.forEach(el => el.remove());
                }
            });

            this.logger.info('[Browser] (Step 1/5) Preparing to click "Code" button...');
            for (let i = 1; i <= 5; i++) {
                try {
                    this.logger.info(`  [Attempt ${i}/5] Cleaning overlay layers and clicking...`);
                    await this.page.evaluate(() => {
                        document
                            .querySelectorAll("div.cdk-overlay-backdrop")
                            .forEach(el => el.remove());
                    });
                    await this.page.waitForTimeout(500);

                    await this.page
                        .locator('button:text("Code")')
                        .click({ timeout: 10000 });
                    this.logger.info("  ✅ Click successful!");
                    break;
                } catch (error) {
                    this.logger.warn(
                        `  [Attempt ${i}/5] Click failed: ${error.message.split("\n")[0]}`
                    );
                    if (i === 5) {
                        try {
                            const screenshotPath = path.join(
                                process.cwd(),
                                "debug_screenshot_final.png"
                            );
                            await this.page.screenshot({
                                fullPage: true,
                                path: screenshotPath,
                            });
                            this.logger.info(
                                `[Debug] Final failure screenshot saved to: ${screenshotPath}`
                            );
                        } catch (screenshotError) {
                            this.logger.error(
                                `[Debug] Failed to save screenshot: ${screenshotError.message}`
                            );
                        }
                        throw new Error(`Unable to click "Code" button after multiple attempts, initialization failed.`);
                    }
                }
            }

            this.logger.info(
                '[Browser] (Step 2/5) "Code" button clicked successfully, waiting for editor to become visible...'
            );
            const editorContainerLocator = this.page
                .locator("div.monaco-editor")
                .first();
            await editorContainerLocator.waitFor({
                state: "visible",
                timeout: 60000,
            });

            this.logger.info(
                "[Browser] (Cleanup #2) Preparing to click editor, forcefully removing all possible overlay layers again..."
            );
            await this.page.evaluate(() => {
                const overlays = document.querySelectorAll("div.cdk-overlay-backdrop");
                if (overlays.length > 0) {
                    console.log(
                        `[ProxyClient] (Internal JS) Found and removed ${overlays.length} newly appeared overlay layers.`
                    );
                    overlays.forEach(el => el.remove());
                }
            });
            await this.page.waitForTimeout(250);

            this.logger.info("[Browser] (Step 3/5) Editor displayed, focusing and pasting script...");
            await editorContainerLocator.click({ timeout: 30000 });

            await this.page.evaluate(
                text => navigator.clipboard.writeText(text),
                buildScriptContent
            );
            const isMac = os.platform() === "darwin";
            const pasteKey = isMac ? "Meta+V" : "Control+V";
            await this.page.keyboard.press(pasteKey);
            this.logger.info("[Browser] (Step 4/5) Script pasted.");
            this.logger.info(
                '[Browser] (Step 5/5) Clicking "Preview" button to activate script...'
            );
            await this.page.locator('button:text("Preview")').click();
            this.logger.info("[Browser] ✅ UI interaction complete, script is now running.");
            this.currentAuthIndex = authIndex;
            this.logger.info("==================================================");
            this.logger.info(`✅ [Browser] Account ${authIndex} context initialized successfully!`);
            this.logger.info("✅ [Browser] Browser client is ready.");
            this.logger.info("==================================================");
        } catch (error) {
            this.logger.error(
                `❌ [Browser] Account ${authIndex} context initialization failed: ${error.message}`
            );
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            throw error;
        }
    }

    async closeBrowser() {
        if (this.browser) {
            this.logger.info("[Browser] Closing main browser instance...");
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
            this.logger.info("[Browser] Main browser instance closed.");
        }
    }

    async switchAccount(newAuthIndex) {
        this.logger.info(
            `🔄 [Browser] Starting account switch: from ${this.currentAuthIndex} to ${newAuthIndex}`
        );
        await this.launchOrSwitchContext(newAuthIndex);
        this.logger.info(
            `✅ [Browser] Account switch completed, current account: ${this.currentAuthIndex}`
        );
    }
}

module.exports = BrowserManager;
