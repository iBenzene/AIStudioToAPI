/**
 * File: status.js
 * Description: Client-side script for the status page, providing real-time service monitoring and control
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

// ========== Internationalization Support ==========
const translations = {
    en: {
        account: 'Account',
        accountStatus: 'Account Status',
        actionsPanel: 'Actions Panel',
        alreadyCurrentAccount: 'This is already the current active account.',
        apiKey: 'API Key',
        browserConnection: 'Browser Connection',
        btnSwitchAccount: 'Switch Account',
        confirmSwitch: 'Are you sure you want to switch to account',
        consecutiveFailures: 'Consecutive Failures',
        currentAccount: 'Current Active Account',
        disconnected: 'Disconnected',
        entries: 'entries',
        forceThinking: 'Force Thinking',
        forceUrlContext: 'Force URL Context',
        forceWebSearch: 'Force Web Search',
        formatErrors: 'Format Errors (Ignored)',
        heading: 'Proxy Service Status',
        immediateSwitchCodes: 'Immediate Switch (Codes)',
        latestEntries: 'Latest',

        operationInProgress: 'Operation in progress...',
        realtimeLogs: 'Real-time Logs',
        running: 'Running',
        serviceConfig: 'Service Configuration',
        serviceStatus: 'Service Status',
        settingFailed: 'Setting failed: ',
        streamingMode: 'Streaming Mode',
        title: 'Google AI Studio Proxy - Service Status',
        totalScanned: 'Total Scanned Accounts',
        usageCount: 'Usage Count',
    },
    zh: {
        account: '账户',
        accountStatus: '账户状态',
        actionsPanel: '操作面板',
        alreadyCurrentAccount: '当前已经是该账户，无需切换。',
        apiKey: 'API 密钥',
        browserConnection: '浏览器连接',
        btnSwitchAccount: '切换账户',
        confirmSwitch: '确定要切换到账户',
        consecutiveFailures: '连续失败次数',
        currentAccount: '当前活动账户',
        disconnected: '连接失败',
        entries: '条',
        forceThinking: '强制思考',
        forceUrlContext: '强制网址上下文',
        forceWebSearch: '强制联网',
        formatErrors: '格式错误（已忽略）',
        heading: '代理服务状态',
        immediateSwitchCodes: '立即切换（代码）',
        latestEntries: '最新',
        operationInProgress: '操作进行中...',
        realtimeLogs: '实时日志',
        running: '运行中',
        serviceConfig: '服务配置',
        serviceStatus: '服务状态',
        settingFailed: '设置失败：',
        streamingMode: '流式模式',
        title: 'Google AI Studio 代理 - 服务状态',
        totalScanned: '已扫描账户总数',
        usageCount: '使用次数',
    },
};

let currentLang = localStorage.getItem('lang') || 'en';

const applyLanguage = lang => {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });

    // Refresh content to apply translations
    updateContent();
};

const toggleLanguage = () => {
    const newLang = currentLang === 'en' ? 'zh' : 'en';
    applyLanguage(newLang);
};

const t = key => translations[currentLang][key] || key;

// ========== Vue App ==========
let vueApp = null;
const { createApp } = Vue;
createApp({
    computed: {
        forceThinkingText() {
            return this.forceThinkingEnabled ? 'true' : 'false';
        },
        forceUrlContextText() {
            return this.forceUrlContextEnabled ? 'true' : 'false';
        },
        forceWebSearchText() {
            return this.forceWebSearchEnabled ? 'true' : 'false';
        },
        streamingModeText() {
            return this.streamingModeReal ? 'real' : 'fake';
        },
    },
    data() {
        return {
            currentAuthIndex: -1,
            forceThinkingEnabled: false,
            forceUrlContextEnabled: false,
            forceWebSearchEnabled: false,
            isUpdating: false,
            streamingModeReal: false,
        };
    },
    methods: {
        handleForceThinkingBeforeChange() {
            if (this.isUpdating) { return false; }

            return new Promise((resolve, reject) => {
                fetch('/api/toggle-force-thinking', { method: 'POST' })
                    .then(res => res.text())
                    .then(data => {
                        ElementPlus.ElMessage.success(data);
                        resolve(true);
                    })
                    .catch(err => {
                        ElementPlus.ElMessage.error(t('settingFailed') + err);
                        reject();
                    });
            });
        },
        handleForceUrlContextBeforeChange() {
            if (this.isUpdating) { return false; }

            return new Promise((resolve, reject) => {
                fetch('/api/toggle-force-url-context', { method: 'POST' })
                    .then(res => res.text())
                    .then(data => {
                        ElementPlus.ElMessage.success(data);
                        updateContent();
                        resolve(true);
                    })
                    .catch(err => {
                        ElementPlus.ElMessage.error(t('settingFailed') + err);
                        reject();
                    });
            });
        },
        handleForceWebSearchBeforeChange() {
            if (this.isUpdating) { return false; }

            return new Promise((resolve, reject) => {
                fetch('/api/toggle-force-web-search', { method: 'POST' })
                    .then(res => res.text())
                    .then(data => {
                        ElementPlus.ElMessage.success(data);
                        updateContent();
                        resolve(true);
                    })
                    .catch(err => {
                        ElementPlus.ElMessage.error(t('settingFailed') + err);
                        reject();
                    });
            });
        },
        handleStreamingModeBeforeChange() {
            if (this.isUpdating) { return false; }

            const newMode = !this.streamingModeReal ? 'real' : 'fake';

            return new Promise((resolve, reject) => {
                fetch('/api/set-mode', {
                    body: JSON.stringify({ mode: newMode }),
                    headers: { 'Content-Type': 'application/json' },
                    method: 'POST',
                })
                    .then(res => res.text())
                    .then(data => {
                        ElementPlus.ElMessage.success(data);
                        updateContent();
                        resolve(true);
                    })
                    .catch(err => {
                        ElementPlus.ElMessage.error(t('settingFailed') + err);
                        reject();
                    });
            });
        },
        updateSwitchStates(data) {
            this.isUpdating = true;
            this.streamingModeReal = data.status.streamingMode.includes('real');
            this.forceThinkingEnabled = data.status.forceThinking.includes('Enabled');
            this.forceWebSearchEnabled = data.status.forceWebSearch.includes('Enabled');
            this.forceUrlContextEnabled = data.status.forceUrlContext.includes('Enabled');
            this.currentAuthIndex = data.status.currentAuthIndex;
            this.$nextTick(() => {
                this.isUpdating = false;
            });
        },
    },
    mounted() {
        vueApp = this;

        const initialMode = '{{streamingMode}}';
        const initialThinking = '{{forceThinking}}';
        const initialWebSearch = '{{forceWebSearch}}';
        const initialUrlContext = '{{forceUrlContext}}';
        const initialAuthIndex = '{{currentAuthIndex}}';

        this.isUpdating = true;
        this.streamingModeReal = initialMode === 'real';
        this.forceThinkingEnabled = initialThinking === 'true' || initialThinking === true;
        this.forceWebSearchEnabled = initialWebSearch === 'true' || initialWebSearch === true;
        this.forceUrlContextEnabled = initialUrlContext === 'true' || initialUrlContext === true;
        this.currentAuthIndex = parseInt(initialAuthIndex, 10);

        this.$nextTick(() => {
            this.isUpdating = false;
        });
    },
}).use(ElementPlus).mount('#app');

const updateContent = () => {
    const dot = document.querySelector('.dot');
    fetch('/api/status').then(r => r.json()).then(data => {
        // Update dot to green when connected
        dot.className = 'dot status-running';

        // Update Vue switch states
        if (vueApp && vueApp.updateSwitchStates) {
            vueApp.updateSwitchStates(data);
        }

        const statusPre = document.querySelector('#status-section pre');
        const accountDetailsHtml = data.status.accountDetails.map(acc =>
            '<span class="label" style="padding-left: 20px;">' + t('account') + ' ' + acc.index + '</span>: ' + acc.name
        ).join('\n');
        statusPre.innerHTML
            = '<span class="label">' + t('serviceStatus') + '</span>: <span class="status-ok">' + t('running') + '</span>\n'
            + '<span class="label">' + t('browserConnection') + '</span>: <span class="' + (data.status.browserConnected ? 'status-ok' : 'status-error') + '">' + data.status.browserConnected + '</span>\n'
            + '--- ' + t('serviceConfig') + ' ---\n'
            + '<span class="label">' + t('streamingMode') + '</span>: ' + data.status.streamingMode + '\n'
            + '<span class="label">' + t('forceThinking') + '</span>: ' + data.status.forceThinking + '\n'
            + '<span class="label">' + t('forceWebSearch') + '</span>: ' + data.status.forceWebSearch + '\n'
            + '<span class="label">' + t('forceUrlContext') + '</span>: ' + data.status.forceUrlContext + '\n'
            + '<span class="label">' + t('immediateSwitchCodes') + '</span>: ' + data.status.immediateSwitchStatusCodes + '\n'
            + '<span class="label">' + t('apiKey') + '</span>: ' + data.status.apiKeySource + '\n'
            + '--- ' + t('accountStatus') + ' ---\n'
            + '<span class="label">' + t('currentAccount') + '</span>: #' + data.status.currentAuthIndex + ' (' + data.status.currentAccountName + ')\n'
            + + '<span class="label">' + t('usageCount') + '</span>: ' + data.status.usageCount + '\n'
            + '<span class="label">' + t('consecutiveFailures') + '</span>: ' + data.status.failureCount + '\n'
            + '<span class="label">' + t('totalScanned') + '</span>: ' + data.status.initialIndices + '\n'
            + accountDetailsHtml + '\n'
            + '<span class="label">' + t('formatErrors') + '</span>: ' + data.status.invalidIndices;

        const logContainer = document.getElementById('log-container');
        const logTitle = document.querySelector('#log-section h2');
        const isScrolledToBottom = logContainer.scrollHeight - logContainer.clientHeight <= logContainer.scrollTop + 1;
        logTitle.innerHTML = '<span data-i18n="realtimeLogs">' + t('realtimeLogs') + '</span> (<span data-i18n="latestEntries">' + t('latestEntries') + '</span> ' + data.logCount + ' <span data-i18n="entries">' + t('entries') + '</span>)';
        logContainer.innerText = data.logs;
        if (isScrolledToBottom) { logContainer.scrollTop = logContainer.scrollHeight; }
    })
        .catch(err => {
            console.error('Error:', err);
            // Update dot to red when connection fails
            dot.className = 'dot status-error';

            // Update service status to disconnected
            const statusPre = document.querySelector('#status-section pre');
            statusPre.innerHTML = '<span class="label">' + t('serviceStatus') + '</span>: <span class="status-error">' + t('disconnected') + '</span>';
        });
};

const switchSpecificAccount = () => {
    const targetIndex = parseInt(document.getElementById('account-index-select').value, 10);

    // Check if target account is the same as current account
    if (vueApp && vueApp.currentAuthIndex === targetIndex) {
        ElementPlus.ElMessage.warning(t('alreadyCurrentAccount'));
        return;
    }

    ElementPlus.ElMessageBox.confirm(
        t('confirmSwitch') + ' #' + targetIndex + '?',
        {
            cancelButtonText: currentLang === 'zh' ? '取消' : 'Cancel',
            confirmButtonText: currentLang === 'zh' ? '确定' : 'OK',
            type: 'warning',
        }
    )
        .then(() => {
            const loading = ElementPlus.ElLoading.service({
                background: 'rgba(0, 0, 0, 0.7)',
                lock: true,
                text: 'Switching account, please wait...',
            });

            fetch('/api/switch-account', {
                body: JSON.stringify({ targetIndex: parseInt(targetIndex, 10) }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            })
                .then(async res => {
                    const data = await res.text();
                    loading.close();
                    if (res.ok) {
                        ElementPlus.ElMessage.success(data);
                    } else {
                        ElementPlus.ElMessage.error(data);
                    }
                    updateContent();
                })
                .catch(err => {
                    loading.close();
                    ElementPlus.ElMessage.error(t('settingFailed') + (err.message || err));
                    updateContent();
                });
        })
        .catch(() => {
            // User cancelled
        });
};

document.addEventListener('DOMContentLoaded', () => {
    applyLanguage(currentLang);
    const scheduleNextUpdate = () => {
        const randomInterval = 4000 + Math.floor(Math.random() * 3000); // Random interval 4-7 seconds
        setTimeout(() => {
            updateContent();
            scheduleNextUpdate(); // Recursively schedule next update
        }, randomInterval);
    };
    scheduleNextUpdate(); // Start random interval refresh
});
