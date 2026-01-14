/**
 * Internationalization (i18n) Manager
 * Multi-language support with dynamic loading
 * @version 2.0.0
 */

class I18nManager {
  constructor() {
    this.currentLanguage = 'en';
    this.fallbackLanguage = 'en';
    this.translations = new Map();
    this.loadedLanguages = new Set();
    
    this.config = {
      enabled: true,
      autoDetect: true,
      persistLanguage: true,
      lazyLoad: true,
      cacheTranslations: true,
      enableRTL: true,
      defaultLanguage: 'en',
      supportedLanguages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ar', 'hi']
    };

    this.languageNames = {
      en: 'English',
      es: 'Español',
      fr: 'Français',
      de: 'Deutsch',
      zh: '中文',
      ja: '日本語',
      ar: 'العربية',
      hi: 'हिन्दी'
    };

    this.rtlLanguages = ['ar', 'he', 'fa', 'ur'];
    
    this.pluralRules = new Map();
  }

  /**
   * Initialize I18n Manager
   */
  async init() {
    try {
      // Detect language
      if (this.config.autoDetect) {
        this.detectLanguage();
      }

      // Load current language
      await this.loadLanguage(this.currentLanguage);

      // Apply translations
      this.applyTranslations();

      // Setup RTL if needed
      if (this.config.enableRTL) {
        this.setupRTL();
      }

      // Setup language switcher
      this.setupLanguageSwitcher();

      // Monitor new content
      this.observeNewContent();

      console.log('🌍 I18nManager initialized');
      return true;
    } catch (error) {
      console.error('❌ I18nManager init failed:', error);
      return false;
    }
  }

  /**
   * Detect user language
   */
  detectLanguage() {
    // Check stored preference
    if (this.config.persistLanguage) {
      const stored = localStorage.getItem('language');
      if (stored && this.config.supportedLanguages.includes(stored)) {
        this.currentLanguage = stored;
        return;
      }
    }

    // Check browser language
    const browserLang = navigator.language || navigator.userLanguage;
    const langCode = browserLang.split('-')[0];
    
    if (this.config.supportedLanguages.includes(langCode)) {
      this.currentLanguage = langCode;
    } else {
      this.currentLanguage = this.config.defaultLanguage;
    }
  }

  /**
   * Load language pack
   */
  async loadLanguage(lang) {
    if (this.loadedLanguages.has(lang)) {
      return this.translations.get(lang);
    }

    try {
      // Try cache first
      if (this.config.cacheTranslations && typeof AdvancedCache !== 'undefined') {
        const cached = await AdvancedCache.fetchWithCache(
          `/locales/${lang}.json`,
          {},
          AdvancedCache.strategies.CACHE_FIRST
        );
        
        if (cached) {
          this.translations.set(lang, cached);
          this.loadedLanguages.add(lang);
          return cached;
        }
      }

      // Load from server
      const response = await fetch(`/locales/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch language pack: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const translations = await response.json();
      
      this.translations.set(lang, translations);
      this.loadedLanguages.add(lang);
      
      return translations;
      
    } catch (error) {
      console.error(`Failed to load language: ${lang}`, error);
      
      // Try fallback
      if (lang !== this.fallbackLanguage) {
        return await this.loadLanguage(this.fallbackLanguage);
      }
      
      return {};
    }
  }

  /**
   * Get translation
   */
  t(key, params = {}, count = null) {
    const lang = this.translations.get(this.currentLanguage);
    
    // Get translation value
    let value = this.getNestedValue(lang, key);
    
    // Fallback to default language
    if (!value && this.currentLanguage !== this.fallbackLanguage) {
      const fallback = this.translations.get(this.fallbackLanguage);
      value = this.getNestedValue(fallback, key);
    }
    
    // Fallback to key
    if (!value) {
      console.warn(`Translation missing: ${key}`);
      return key;
    }

    // Handle pluralization
    if (count !== null && typeof value === 'object') {
      value = this.pluralize(value, count);
    }

    // Replace parameters
    if (params && typeof value === 'string') {
      value = this.interpolate(value, params);
    }

    return value;
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    if (!obj) return null;
    
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current[key] === undefined) {
        return null;
      }
      current = current[key];
    }
    
    return current;
  }

  /**
   * Interpolate parameters in string
   */
  interpolate(str, params) {
    return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  /**
   * Handle pluralization
   */
  pluralize(value, count) {
    // Handle different plural forms
    if (value.zero !== undefined && count === 0) {
      return value.zero;
    }
    
    if (value.one !== undefined && count === 1) {
      return value.one;
    }
    
    if (value.other !== undefined) {
      return value.other;
    }
    
    // Default to first available
    return value[Object.keys(value)[0]];
  }

  /**
   * Change language
   */
  async changeLanguage(lang) {
    if (!this.config.supportedLanguages.includes(lang)) {
      console.error(`Unsupported language: ${lang}`);
      return false;
    }

    // Load new language
    await this.loadLanguage(lang);
    
    // Update current
    this.currentLanguage = lang;
    
    // Save preference
    if (this.config.persistLanguage) {
      localStorage.setItem('language', lang);
    }

    // Apply translations
    this.applyTranslations();
    
    // Update RTL
    if (this.config.enableRTL) {
      this.setupRTL();
    }

    // Update state
    if (typeof StateManager !== 'undefined') {
      StateManager.set('i18n.language', lang);
    }

    // Track change
    if (typeof AIAnalytics !== 'undefined' && typeof AIAnalytics.trackEvent === 'function') {
      AIAnalytics.trackEvent('i18n', 'language_changed', lang);
    }

    // Emit event
    window.dispatchEvent(new CustomEvent('languagechange', { 
      detail: { language: lang } 
    }));

    return true;
  }

  /**
   * Apply translations to DOM
   */
  applyTranslations() {
    // Elements with data-i18n attribute
    const elements = document.querySelectorAll('[data-i18n]');
    
    elements.forEach(el => {
      const key = el.dataset.i18n;
      const params = this.parseParams(el.dataset.i18nParams);
      const count = el.dataset.i18nCount ? parseInt(el.dataset.i18nCount) : null;
      
      const translation = this.t(key, params, count);
      
      // Update element
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.type === 'submit' || el.type === 'button') {
          el.value = translation;
        } else {
          el.placeholder = translation;
        }
      } else {
        el.textContent = translation;
      }
    });

    // Elements with data-i18n-html (for HTML content)
    const htmlElements = document.querySelectorAll('[data-i18n-html]');
    
    htmlElements.forEach(el => {
      const key = el.dataset.i18nHtml;
      const params = this.parseParams(el.dataset.i18nParams);
      
      const translation = this.t(key, params);
      el.innerHTML = translation;
    });

    // Attributes like title, alt
    const attrElements = document.querySelectorAll('[data-i18n-title], [data-i18n-alt]');
    
    attrElements.forEach(el => {
      if (el.dataset.i18nTitle) {
        el.title = this.t(el.dataset.i18nTitle);
      }
      if (el.dataset.i18nAlt) {
        el.alt = this.t(el.dataset.i18nAlt);
      }
    });
  }

  /**
   * Parse parameters from data attribute
   */
  parseParams(paramsStr) {
    if (!paramsStr) return {};
    
    try {
      return JSON.parse(paramsStr);
    } catch (e) {
      console.error('Invalid i18n params:', paramsStr);
      return {};
    }
  }

  /**
   * Setup RTL layout
   */
  setupRTL() {
    const isRTL = this.rtlLanguages.includes(this.currentLanguage);
    
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = this.currentLanguage;
    
    if (isRTL) {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
  }

  /**
   * Setup language switcher
   */
  setupLanguageSwitcher() {
    // Find language switcher elements
    const switchers = document.querySelectorAll('[data-language-switcher]');
    
    switchers.forEach(switcher => {
      // Populate with languages
      if (switcher.tagName === 'SELECT') {
        this.config.supportedLanguages.forEach(lang => {
          const option = document.createElement('option');
          option.value = lang;
          option.textContent = this.languageNames[lang];
          option.selected = lang === this.currentLanguage;
          switcher.appendChild(option);
        });
        
        switcher.addEventListener('change', (e) => {
          this.changeLanguage(e.target.value);
        });
      }
    });

    // Language links
    document.addEventListener('click', (e) => {
      const langLink = e.target.closest('[data-language]');
      if (langLink) {
        e.preventDefault();
        const lang = langLink.dataset.language;
        this.changeLanguage(lang);
      }
    });
  }

  /**
   * Format number
   */
  formatNumber(number, options = {}) {
    try {
      return new Intl.NumberFormat(this.currentLanguage, options).format(number);
    } catch (e) {
      return number.toString();
    }
  }

  /**
   * Format currency
   */
  formatCurrency(amount, currency = 'USD') {
    try {
      return new Intl.NumberFormat(this.currentLanguage, {
        style: 'currency',
        currency
      }).format(amount);
    } catch (e) {
      return `${currency} ${amount}`;
    }
  }

  /**
   * Format date
   */
  formatDate(date, options = {}) {
    try {
      return new Intl.DateTimeFormat(this.currentLanguage, options).format(new Date(date));
    } catch (e) {
      return new Date(date).toLocaleDateString();
    }
  }

  /**
   * Format relative time
   */
  formatRelativeTime(date) {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
      return this.t('time.just_now');
    } else if (diffMin < 60) {
      return this.t('time.minutes_ago', { count: diffMin });
    } else if (diffHour < 24) {
      return this.t('time.hours_ago', { count: diffHour });
    } else if (diffDay < 7) {
      return this.t('time.days_ago', { count: diffDay });
    } else {
      return this.formatDate(date);
    }
  }

  /**
   * Observe new content
   */
  observeNewContent() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            // Check for i18n attributes
            if (node.hasAttribute?.('data-i18n')) {
              this.translateElement(node);
            }
            
            // Check subtree
            const i18nElements = node.querySelectorAll?.('[data-i18n]');
            i18nElements?.forEach(el => this.translateElement(el));
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Translate single element
   */
  translateElement(el) {
    const key = el.dataset.i18n;
    const params = this.parseParams(el.dataset.i18nParams);
    const count = el.dataset.i18nCount ? parseInt(el.dataset.i18nCount) : null;
    
    const translation = this.t(key, params, count);
    
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.type === 'submit' || el.type === 'button') {
        el.value = translation;
      } else {
        el.placeholder = translation;
      }
    } else {
      el.textContent = translation;
    }
  }

  /**
   * Get available languages
   */
  getAvailableLanguages() {
    return this.config.supportedLanguages.map(lang => ({
      code: lang,
      name: this.languageNames[lang],
      isRTL: this.rtlLanguages.includes(lang),
      isCurrent: lang === this.currentLanguage
    }));
  }

  /**
   * Get current language
   */
  getCurrentLanguage() {
    return {
      code: this.currentLanguage,
      name: this.languageNames[this.currentLanguage],
      isRTL: this.rtlLanguages.includes(this.currentLanguage)
    };
  }
}

// Create global instance
window.I18nManager = window.I18nManager || new I18nManager();

// Helper function
window.t = (key, params, count) => window.I18nManager.t(key, params, count);

// Auto-initialize
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.I18nManager.init();
  });
}
