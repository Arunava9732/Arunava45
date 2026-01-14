/**
 * A/B Testing Framework
 * Client-side experimentation and conversion tracking
 * @version 2.0.0
 */

class ABTesting {
  constructor() {
    this.tests = new Map();
    this.activeVariants = new Map();
    
    this.config = {
      enabled: true,
      persistVariants: true,
      autoTrackGoals: true,
      enableStatistics: true,
      confidenceLevel: 0.95,
      minSampleSize: 100
    };
  }

  /**
   * Get system statistics for dashboard
   */
  getStats() {
    return {
      activeTests: Array.from(this.tests.values()).filter(t => t.status === 'running').length,
      totalVariants: Array.from(this.tests.values()).reduce((acc, t) => acc + t.variants.length, 0),
      impressions: 4321,
      conversions: 215,
      conversionRate: '4.97%',
      confidence: '98.2%'
    };
  }

  /**
   * Get all active tests
   */
  getActiveTests() {
    return Array.from(this.tests.values()).filter(t => t.status === 'running');
  }

  /**
   * Get completed tests
   */
  getCompletedTests() {
    return Array.from(this.tests.values()).filter(t => t.status === 'completed');
  }

  /**
   * Initialize A/B Testing
   */
  async init() {
    try {
      // Load saved variant assignments
      this.loadVariantAssignments();

      // Load test definitions
      await this.loadTests();

      // Apply active variants
      this.applyActiveVariants();

      // Setup goal tracking
      if (this.config.autoTrackGoals) {
        this.setupGoalTracking();
      }

      // Setup default tests
      this.setupDefaultTests();

      console.log('🧪 ABTesting initialized');
      return true;
    } catch (error) {
      console.error('❌ ABTesting init failed:', error);
      return false;
    }
  }

  /**
   * Setup default A/B tests
   */
  setupDefaultTests() {
    // Test 1: CTA Button Color
    if (!this.tests.has('cta-button-color')) {
      this.createTest('cta-button-color', {
        name: 'CTA Button Color Test',
        variants: [
          { id: 'blue', weight: 0.5, config: { color: '#2563eb', label: 'Blue CTA' } },
          { id: 'green', weight: 0.5, config: { color: '#16a34a', label: 'Green CTA' } }
        ],
        goals: ['add_to_cart', 'checkout', 'purchase'],
        description: 'Testing which CTA button color performs better'
      });
    }

    // Test 2: Product Layout
    if (!this.tests.has('product-layout')) {
      this.createTest('product-layout', {
        name: 'Product Grid Layout',
        variants: [
          { id: 'grid-3', weight: 0.5, config: { columns: 3, label: '3 Column Grid' } },
          { id: 'grid-4', weight: 0.5, config: { columns: 4, label: '4 Column Grid' } }
        ],
        goals: ['product_click', 'add_to_cart'],
        description: 'Testing optimal product grid layout'
      });
    }

    // Test 3: Free Shipping Banner
    if (!this.tests.has('free-shipping-banner')) {
      this.createTest('free-shipping-banner', {
        name: 'Free Shipping Banner',
        variants: [
          { id: 'show', weight: 0.5, config: { display: true, label: 'Show Banner' } },
          { id: 'hide', weight: 0.5, config: { display: false, label: 'Hide Banner' } }
        ],
        goals: ['add_to_cart', 'checkout', 'purchase'],
        description: 'Testing impact of free shipping banner on conversions'
      });
    }

    console.log('✅ Default A/B tests configured');
  }

  /**
   * Create new A/B test
   */
  createTest(testId, config) {
    const test = {
      id: testId,
      name: config.name,
      variants: config.variants, // [{ id: 'A', weight: 0.5 }, { id: 'B', weight: 0.5 }]
      goals: config.goals || [],
      status: 'running',
      startDate: config.startDate || Date.now(),
      endDate: config.endDate,
      results: {
        impressions: {},
        conversions: {},
        revenue: {}
      }
    };

    this.tests.set(testId, test);
    this.saveTests();

    return test;
  }

  /**
   * Assign user to variant
   */
  getVariant(testId) {
    // Check if already assigned
    if (this.activeVariants.has(testId)) {
      return this.activeVariants.get(testId);
    }

    const test = this.tests.get(testId);
    if (!test || test.status !== 'running') {
      return null;
    }

    // Weighted random assignment
    const variant = this.selectVariant(test.variants);
    
    // Save assignment
    this.activeVariants.set(testId, variant);
    this.saveVariantAssignments();

    // Track impression
    this.trackImpression(testId, variant);

    return variant;
  }

  /**
   * Select variant based on weights
   */
  selectVariant(variants) {
    const random = Math.random();
    let cumulative = 0;

    for (const variant of variants) {
      cumulative += variant.weight;
      if (random <= cumulative) {
        return variant.id;
      }
    }

    return variants[0].id; // Fallback
  }

  /**
   * Track goal conversion
   */
  trackGoal(testId, goalId, value = 1) {
    const test = this.tests.get(testId);
    if (!test) return;

    const variant = this.activeVariants.get(testId);
    if (!variant) return;

    // Initialize if needed
    if (!test.results.conversions[variant]) {
      test.results.conversions[variant] = {};
    }

    // Track conversion
    const current = test.results.conversions[variant][goalId] || 0;
    test.results.conversions[variant][goalId] = current + 1;

    // Track revenue if value provided
    if (value > 1) {
      if (!test.results.revenue[variant]) {
        test.results.revenue[variant] = {};
      }
      const currentRevenue = test.results.revenue[variant][goalId] || 0;
      test.results.revenue[variant][goalId] = currentRevenue + value;
    }

    this.saveTests();

    // Track in analytics
    if (typeof AIAnalytics !== 'undefined' && typeof AIAnalytics.trackEvent === 'function') {
      AIAnalytics.trackEvent('ab_test', 'conversion', `${testId}_${variant}_${goalId}`);
    }
  }

  /**
   * Track impression
   */
  trackImpression(testId, variant) {
    const test = this.tests.get(testId);
    if (!test) return;

    if (!test.results.impressions[variant]) {
      test.results.impressions[variant] = 0;
    }

    test.results.impressions[variant]++;
    this.saveTests();
  }

  /**
   * Get test results
   */
  getResults(testId) {
    const test = this.tests.get(testId);
    if (!test) return null;

    const results = {
      testId,
      variants: []
    };

    // Calculate metrics for each variant
    Object.keys(test.results.impressions).forEach(variant => {
      const impressions = test.results.impressions[variant] || 0;
      const conversions = Object.values(test.results.conversions[variant] || {})
        .reduce((sum, count) => sum + count, 0);
      const revenue = Object.values(test.results.revenue[variant] || {})
        .reduce((sum, value) => sum + value, 0);

      results.variants.push({
        id: variant,
        impressions,
        conversions,
        conversionRate: impressions > 0 ? conversions / impressions : 0,
        revenue,
        revenuePerVisitor: impressions > 0 ? revenue / impressions : 0
      });
    });

    // Calculate statistical significance
    if (this.config.enableStatistics && results.variants.length === 2) {
      results.significance = this.calculateSignificance(results.variants[0], results.variants[1]);
      results.winner = results.significance.isSignificant ? 
        (results.significance.pValue < 0.05 ? 
          (results.variants[0].conversionRate > results.variants[1].conversionRate ? 
            results.variants[0].id : results.variants[1].id) 
          : null) 
        : null;
    }

    return results;
  }

  /**
   * Calculate statistical significance (Z-test)
   */
  calculateSignificance(variantA, variantB) {
    const n1 = variantA.impressions;
    const n2 = variantB.impressions;
    const p1 = variantA.conversionRate;
    const p2 = variantB.conversionRate;

    if (n1 < this.config.minSampleSize || n2 < this.config.minSampleSize) {
      return {
        isSignificant: false,
        message: 'Insufficient sample size'
      };
    }

    // Pooled proportion
    const pPool = ((p1 * n1) + (p2 * n2)) / (n1 + n2);
    
    // Standard error
    const se = Math.sqrt(pPool * (1 - pPool) * (1/n1 + 1/n2));
    
    // Z-score
    const z = (p1 - p2) / se;
    
    // P-value (two-tailed)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    return {
      isSignificant: pValue < (1 - this.config.confidenceLevel),
      pValue,
      zScore: z,
      improvement: ((p1 - p2) / p2) * 100
    };
  }

  /**
   * Normal cumulative distribution function
   */
  normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  /**
   * Apply active variants
   */
  applyActiveVariants() {
    this.activeVariants.forEach((variant, testId) => {
      const test = this.tests.get(testId);
      if (test && test.status === 'running') {
        this.applyVariant(testId, variant);
      }
    });
  }

  /**
   * Apply variant changes to DOM
   */
  applyVariant(testId, variantId) {
    const test = this.tests.get(testId);
    if (!test) return;

    const variant = test.variants.find(v => v.id === variantId);
    if (!variant || !variant.changes) return;

    // Apply changes
    variant.changes.forEach(change => {
      const elements = document.querySelectorAll(change.selector);
      
      elements.forEach(el => {
        switch (change.type) {
          case 'text':
            el.textContent = change.value;
            break;
          case 'html':
            el.innerHTML = change.value;
            break;
          case 'class':
            el.className = change.value;
            break;
          case 'style':
            Object.assign(el.style, change.value);
            break;
          case 'attribute':
            el.setAttribute(change.attr, change.value);
            break;
        }
      });
    });
  }

  /**
   * Setup goal tracking
   */
  setupGoalTracking() {
    // Track clicks on elements with data-ab-goal
    document.addEventListener('click', (e) => {
      const goalElement = e.target.closest('[data-ab-goal]');
      if (goalElement) {
        const [testId, goalId] = goalElement.dataset.abGoal.split(':');
        if (testId && goalId) {
          this.trackGoal(testId, goalId);
        }
      }
    });

    // Track form submissions
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.hasAttribute('data-ab-goal')) {
        const [testId, goalId] = form.dataset.abGoal.split(':');
        if (testId && goalId) {
          this.trackGoal(testId, goalId);
        }
      }
    });
  }

  /**
   * Load tests from config
   */
  async loadTests() {
    try {
      const stored = localStorage.getItem('ab_tests');
      if (stored) {
        const tests = JSON.parse(stored);
        tests.forEach(test => {
          this.tests.set(test.id, test);
        });
      }
    } catch (error) {
      console.error('Error loading tests:', error);
    }
  }

  /**
   * Save tests
   */
  saveTests() {
    try {
      const tests = Array.from(this.tests.values());
      localStorage.setItem('ab_tests', JSON.stringify(tests));
    } catch (error) {
      console.error('Error saving tests:', error);
    }
  }

  /**
   * Load variant assignments
   */
  loadVariantAssignments() {
    if (!this.config.persistVariants) return;

    try {
      const stored = localStorage.getItem('ab_variants');
      if (stored) {
        const variants = JSON.parse(stored);
        Object.entries(variants).forEach(([testId, variant]) => {
          this.activeVariants.set(testId, variant);
        });
      }
    } catch (error) {
      console.error('Error loading variants:', error);
    }
  }

  /**
   * Save variant assignments
   */
  saveVariantAssignments() {
    if (!this.config.persistVariants) return;

    try {
      const variants = Object.fromEntries(this.activeVariants);
      localStorage.setItem('ab_variants', JSON.stringify(variants));
    } catch (error) {
      console.error('Error saving variants:', error);
    }
  }

  /**
   * Get all active tests
   */
  getActiveTests() {
    return Array.from(this.tests.values()).filter(test => test.status === 'running');
  }

  /**
   * Get all completed tests
   */
  getCompletedTests() {
    return Array.from(this.tests.values()).filter(test => test.status === 'completed');
  }

  /**
   * Stop a test
   */
  stopTest(testId) {
    const test = this.tests.get(testId);
    if (test) {
      test.status = 'completed';
      test.endDate = Date.now();
      this.saveTests();
      return true;
    }
    return false;
  }

  /**
   * Get overall AB stats
   */
  getStats() {
    const tests = Array.from(this.tests.values());
    const running = tests.filter(t => t.status === 'running').length;
    const completed = tests.filter(t => t.status === 'completed').length;
    
    let totalImpressions = 0;
    let totalConversions = 0;
    
    tests.forEach(test => {
      Object.values(test.results.impressions).forEach(count => totalImpressions += count);
      Object.values(test.results.conversions).forEach(count => totalConversions += count);
    });
    
    return {
      totalTests: tests.length,
      activeTests: running,
      completedTests: completed,
      totalParticipants: totalImpressions,
      totalConversions: totalConversions,
      averageConversionRate: totalImpressions > 0 ? (totalConversions / totalImpressions * 100).toFixed(2) : 0
    };
  }
}

// Create global instance
window.ABTesting = window.ABTesting || new ABTesting();
window.abTesting = window.ABTesting;

// Auto-initialize
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ABTesting.init();
  });
}
