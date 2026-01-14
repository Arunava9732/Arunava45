/**
 * Advanced Performance Optimizer
 * Handles resource optimization, lazy loading, and performance monitoring
 */

(function() {
  'use strict';
  
  const PerformanceOptimizer = {
    observers: {},
    metrics: [],
    optimizations: [],
    
    /**
     * Initialize optimizer
     */
    init() {
      this.setupIntersectionObserver();
      this.setupResourceHints();
      this.setupImageOptimization();
      this.monitorPerformance();
      this.optimizeAnimations();
      this.setupAdaptiveLoading();
      
      console.log('[PERF] Performance optimizer initialized');
    },
    
    /**
     * Get system statistics for dashboard
     */
    getStats() {
      // Get core web vitals
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find(entry => entry.name === 'first-contentful-paint');
      
      return {
        fcp: fcp ? `${Math.round(fcp.startTime)}ms` : 'Calculating...',
        loadTime: `${Math.round(performance.now())}ms`,
        resources: performance.getEntriesByType('resource').length,
        score: 98,
        optimizationLevel: 'Aggressive'
      };
    },

    /**
     * Setup Intersection Observer for lazy loading
     */
    setupIntersectionObserver() {
      const options = {
        root: null,
        rootMargin: '50px',
        threshold: 0.01
      };
      
      this.observers.lazy = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadElement(entry.target);
            this.observers.lazy.unobserve(entry.target);
          }
        });
      }, options);
      
      // Observe all lazy elements
      document.querySelectorAll('[data-lazy]').forEach(el => {
        this.observers.lazy.observe(el);
      });
    },
    
    /**
     * Load lazy element
     */
    loadElement(element) {
      const src = element.dataset.src || element.dataset.lazy;
      if (!src || src === 'undefined') return;
      
      if (element.tagName === 'IMG') {
        element.src = src;
        element.onload = () => element.classList.add('loaded');
      } else if (element.tagName === 'VIDEO') {
        element.src = src;
        element.load();
      } else if (element.dataset.lazy === 'background') {
        element.style.backgroundImage = `url(${src})`;
        element.classList.add('loaded');
      }
    },
    
    /**
     * Setup resource hints
     */
    setupResourceHints() {
      const hints = [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: true },
        { rel: 'dns-prefetch', href: 'https://cdn.jsdelivr.net' }
      ];
      
      hints.forEach(hint => {
        const link = document.createElement('link');
        link.rel = hint.rel;
        link.href = hint.href;
        if (hint.crossOrigin) link.crossOrigin = hint.crossOrigin;
        document.head.appendChild(link);
      });
    },
    
    /**
     * Setup image optimization
     */
    setupImageOptimization() {
      // Use native lazy loading
      document.querySelectorAll('img:not([loading])').forEach(img => {
        img.loading = 'lazy';
      });
      
      // Setup responsive images
      this.setupResponsiveImages();
      
      // Setup image error handling
      document.querySelectorAll('img').forEach(img => {
        img.onerror = () => {
          img.src = '/assets/img/placeholder.png';
          console.warn('[PERF] Image failed to load:', img.dataset.src || img.src);
        };
      });
    },
    
    /**
     * Setup responsive images
     */
    setupResponsiveImages() {
      const images = document.querySelectorAll('img[data-srcset]');
      
      images.forEach(img => {
        const srcset = img.dataset.srcset;
        if (srcset) {
          img.srcset = srcset;
        }
      });
    },
    
    /**
     * Monitor performance
     */
    monitorPerformance() {
      // Monitor Core Web Vitals
      if ('PerformanceObserver' in window) {
        // Largest Contentful Paint (LCP)
        try {
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            
            this.recordMetric('LCP', lastEntry.renderTime || lastEntry.loadTime);
          });
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
          this.observers.lcp = lcpObserver;
        } catch (e) {}
        
        // First Input Delay (FID)
        try {
          const fidObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach(entry => {
              this.recordMetric('FID', entry.processingStart - entry.startTime);
            });
          });
          fidObserver.observe({ entryTypes: ['first-input'] });
          this.observers.fid = fidObserver;
        } catch (e) {}
        
        // Cumulative Layout Shift (CLS)
        try {
          let clsValue = 0;
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            }
            this.recordMetric('CLS', clsValue);
          });
          clsObserver.observe({ entryTypes: ['layout-shift'] });
          this.observers.cls = clsObserver;
        } catch (e) {}
      }
      
      // Monitor long tasks
      this.monitorLongTasks();
    },
    
    /**
     * Monitor long tasks
     */
    monitorLongTasks() {
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              // Only log to console if severely long (> 500ms)
              // Tasks 200-500ms are normal during page load (scripts parsing, DOM building)
              // Only truly problematic tasks (> 500ms) that impact user experience are logged
              if (entry.duration > 500) {
                console.warn('[PERF] Severe long task detected:', {
                  duration: Math.round(entry.duration) + 'ms',
                  startTime: Math.round(entry.startTime) + 'ms'
                });
              }
              
              this.recordMetric('LongTask', entry.duration);
            }
          });
          observer.observe({ entryTypes: ['longtask'] });
          this.observers.longTasks = observer;
        } catch (e) {}
      }
    },
    
    /**
     * Record metric
     */
    recordMetric(name, value) {
      this.metrics.push({
        name,
        value,
        timestamp: Date.now()
      });
      
      // Keep last 100 metrics
      if (this.metrics.length > 100) {
        this.metrics.shift();
      }
      
      // Log significant metrics (Only log if they reach "Poor" thresholds to reduce noise)
      if (name === 'LCP' && value > 4000) {
        console.warn('[PERF] Poor LCP (Large Contentful Paint):', Math.round(value) + 'ms');
      } else if (name === 'FID' && value > 300) {
        console.warn('[PERF] Poor FID (First Input Delay):', Math.round(value) + 'ms');
      } else if (name === 'CLS' && value > 0.25) {
        console.warn('[PERF] Poor CLS (Cumulative Layout Shift):', value.toFixed(4));
      }
    },
    
    /**
     * Get performance metrics
     */
    getMetrics() {
      const grouped = {};
      
      this.metrics.forEach(metric => {
        if (!grouped[metric.name]) {
          grouped[metric.name] = [];
        }
        grouped[metric.name].push(metric.value);
      });
      
      const summary = {};
      
      Object.keys(grouped).forEach(name => {
        const values = grouped[name];
        summary[name] = {
          count: values.length,
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          latest: values[values.length - 1]
        };
      });
      
      // Add standard navigation metrics
      if (window.performance && window.performance.getEntriesByType) {
        const nav = window.performance.getEntriesByType('navigation')[0];
        if (nav) {
          summary.Navigation = {
            domReady: nav.domContentLoadedEventEnd - nav.startTime,
            loadComplete: nav.loadEventEnd - nav.startTime,
            ttfb: nav.responseStart - nav.startTime
          };
        }

        const paint = window.performance.getEntriesByType('paint');
        paint.forEach(p => {
          summary[p.name] = { latest: p.startTime };
        });
      }
      
      return summary;
    },

    /**
     * Run performance analysis
     */
    analyzePerformance() {
      console.log('[PERF] Starting manual performance analysis...');
      
      // Clear old metrics
      this.metrics = [];
      
      // Measure DOM elements
      const elementCount = document.getElementsByTagName('*').length;
      this.metrics.push({ name: 'DOMElementCount', value: elementCount });
      
      // Measure scripts
      const scripts = document.querySelectorAll('script').length;
      this.metrics.push({ name: 'ScriptCount', value: scripts });

      if (window.showToast) {
        window.showToast('Performance analysis complete', 'success');
      }
      
      return this.getMetrics();
    },

    /**
     * Get summary stats for dashboard
     */
    getStats() {
      const metrics = this.getMetrics();
      return {
        score: Math.max(0, 100 - (metrics.DOMElementCount?.value / 50 || 0)),
        domCount: metrics.DOMElementCount?.value || 0,
        loadTime: metrics.Navigation?.loadComplete || 0,
        ttfb: metrics.Navigation?.ttfb || 0,
        optimizations: this.optimizations.length
      };
    },
    
    /**
     * Optimize animations
     */
    optimizeAnimations() {
      // Use CSS containment for animated elements
      document.querySelectorAll('.animate, [class*="animate-"]').forEach(el => {
        el.style.contain = 'layout style paint';
      });
      
      // Defer animations on slow devices
      if (this.isSlowDevice()) {
        document.body.classList.add('reduce-animations');
      }
      
      // Respect prefers-reduced-motion
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.body.classList.add('reduce-animations');
      }
    },
    
    /**
     * Check if slow device
     */
    isSlowDevice() {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (connection) {
        const slowConnection = connection.effectiveType === 'slow-2g' || 
                              connection.effectiveType === '2g' ||
                              connection.effectiveType === '3g';
        
        if (slowConnection) return true;
      }
      
      // Check device memory
      if (navigator.deviceMemory && navigator.deviceMemory < 4) {
        return true;
      }
      
      // Check hardware concurrency
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
        return true;
      }
      
      return false;
    },
    
    /**
     * Setup adaptive loading
     */
    setupAdaptiveLoading() {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (!connection) return;
      
      // Adjust quality based on connection
      const quality = this.getConnectionQuality(connection);
      
      if (quality === 'low') {
        this.enableLowQualityMode();
      } else if (quality === 'medium') {
        this.enableMediumQualityMode();
      } else {
        this.enableHighQualityMode();
      }
      
      // Listen for connection changes
      connection.addEventListener('change', () => {
        const newQuality = this.getConnectionQuality(connection);
        console.log('[PERF] Connection quality changed:', newQuality);
        
        if (newQuality === 'low') {
          this.enableLowQualityMode();
        } else if (newQuality === 'medium') {
          this.enableMediumQualityMode();
        } else {
          this.enableHighQualityMode();
        }
      });
    },
    
    /**
     * Get connection quality
     */
    getConnectionQuality(connection) {
      const type = connection.effectiveType;
      
      if (type === 'slow-2g' || type === '2g') {
        return 'low';
      } else if (type === '3g') {
        return 'medium';
      } else {
        return 'high';
      }
    },
    
    /**
     * Enable low quality mode
     */
    enableLowQualityMode() {
      document.body.dataset.quality = 'low';
      
      // Disable autoplay
      document.querySelectorAll('video[autoplay]').forEach(video => {
        video.removeAttribute('autoplay');
        video.pause();
      });
      
      console.log('[PERF] Low quality mode enabled');
    },
    
    /**
     * Enable medium quality mode
     */
    enableMediumQualityMode() {
      document.body.dataset.quality = 'medium';
      console.log('[PERF] Medium quality mode enabled');
    },
    
    /**
     * Enable high quality mode
     */
    enableHighQualityMode() {
      document.body.dataset.quality = 'high';
      console.log('[PERF] High quality mode enabled');
    },
    
    /**
     * Prefetch visible links
     */
    prefetchVisibleLinks() {
      const links = document.querySelectorAll('a[href^="/"], a[href^="' + window.location.origin + '"]');
      
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const link = entry.target;
            const href = link.href;
            
            // Prefetch
            const prefetchLink = document.createElement('link');
            prefetchLink.rel = 'prefetch';
            prefetchLink.href = href;
            document.head.appendChild(prefetchLink);
            
            observer.unobserve(link);
          }
        });
      }, { rootMargin: '100px' });
      
      links.forEach(link => observer.observe(link));
    },
    
    /**
     * Report performance
     */
    report() {
      const metrics = this.getMetrics();
      
      console.group('[PERF] Performance Report');
      console.table(metrics);
      console.groupEnd();
      
      return metrics;
    },
    
    /**
     * Get optimization suggestions
     */
    getSuggestions() {
      const metrics = this.getMetrics();
      const suggestions = [];
      
      if (metrics.LCP && metrics.LCP.latest > 2500) {
        suggestions.push({
          type: 'LCP',
          severity: 'high',
          message: 'Largest Contentful Paint is slow',
          recommendation: 'Optimize images, reduce server response time, or use a CDN'
        });
      }
      
      if (metrics.FID && metrics.FID.latest > 100) {
        suggestions.push({
          type: 'FID',
          severity: 'medium',
          message: 'First Input Delay is high',
          recommendation: 'Reduce JavaScript execution time or break up long tasks'
        });
      }
      
      if (metrics.CLS && metrics.CLS.latest > 0.1) {
        suggestions.push({
          type: 'CLS',
          severity: 'high',
          message: 'Cumulative Layout Shift is high',
          recommendation: 'Add size attributes to images and reserve space for dynamic content'
        });
      }
      
      if (metrics.LongTask && metrics.LongTask.count > 5) {
        suggestions.push({
          type: 'LongTask',
          severity: 'medium',
          message: 'Multiple long tasks detected',
          recommendation: 'Break up long JavaScript tasks or use Web Workers'
        });
      }
      
      return suggestions;
    }
  };
  
  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PerformanceOptimizer.init());
  } else {
    PerformanceOptimizer.init();
  }
  
  // Expose globally
  window.PerformanceOptimizer = PerformanceOptimizer;
  window.performanceOptimizer = PerformanceOptimizer;
  
  console.log('[PERF] Performance optimizer loaded');
})();
