/**
 * File: login.js
 * Description: Client-side script for the login page, handling internationalization and user authentication
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

// Translation dictionary
const translations = {
    en: {
        apiKeyPlaceholder: 'API Key',
        heading: 'Please enter API Key',
        loginBtn: 'Login',
        title: 'Google AI Studio Proxy - Login',
    },
    zh: {
        apiKeyPlaceholder: 'API 密钥',
        heading: '请输入 API 密钥',
        loginBtn: '登录',
        title: 'Google AI Studio 代理 - 登录',
    },
};

// Get current language, default to English
let currentLang = localStorage.getItem('lang') || 'en';

// Apply language
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

    // Update placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang][key]) {
            el.placeholder = translations[lang][key];
        }
    });
};

// Toggle language
const toggleLanguage = () => {
    const newLang = currentLang === 'en' ? 'zh' : 'en';
    applyLanguage(newLang);
};

// Apply saved language on page load
document.addEventListener('DOMContentLoaded', () => applyLanguage(currentLang));
