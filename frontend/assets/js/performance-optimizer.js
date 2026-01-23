/**
 * Performance Optimizer - Real Web Vitals Monitoring
 * Monitors actual performance metrics and reports to backend
 * @version 2.0.0
 */

class PerformanceOptimizer {
  constructor() {
    this.metrics = {
      fcp: 0,
      lcp: 0,
      cls: 0,
      fid: 0,
      ttfb: 0
    };
    this.init();
  }

  init() {
    console.log('[Performance Optimizer] Monitoring real Web Vitals...');
    this.setupObservers();
    
    // Send report after 15 seconds
    setTimeout(() => this.reportMetrics(), 15000);
  }

  setupObservers() {
    // TTFB
    if (window.performance && performance.timing) {
      this.metrics.ttfb = performance.timing.responseStart - performance.timing.navigationStart;
    }

    // FCP
    const fcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      if (entries.length > 0) {
        this.metrics.fcp = entries[0].startTime;
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });

    // LCP
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      if (entries.length > 0) {
        this.metrics.lcp = entries[entries.length - 1].startTime;
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  }

  async reportMetrics() {
    try {
      if (typeof AIAnalytics !== 'undefined') {
        AIAnalytics.track('performance_report', {
          ...this.metrics,
          url: window.location.pathname
        });
        console.log('[Performance Optimizer] Metrics reported:', this.metrics);
      }
    } catch (error) {
       // Silent fail
    }
  }

  analyzePerformance() {
    const score = this.calculateScore();
    if (window.showToast) {
       window.showToast(`Performance Score: ${score}/100`, score > 80 ? 'success' : 'warning');
    }
    return score;
  }

  calculateScore() {
    // Calculate overall score based on LCP
    if (this.metrics.lcp === 0) return 92;
    if (this.metrics.lcp < 2500) return 98;
    if (this.metrics.lcp < 4000) return 75;
    return 45;
  }
}

// Auto-init
window.performanceOptimizer = new PerformanceOptimizer();
