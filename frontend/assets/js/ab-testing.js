/**
 * A/B Testing Engine - Real Server Integration
 * Fetches variants from backend and tracks conversions
 * @version 2.0.0
 */

class ABTesting {
  constructor() {
    this.assignments = new Map();
    this.init();
  }

  async init() {
    console.log('[A/B Testing] Initializing real experiment engine...');
    // In a real scenario, we might pre-fetch multiple tests
  }

  /**
   * Get variant for a specific test
   * @param {string} testId 
   * @param {string} defaultVariant 
   * @returns {Promise<string>}
   */
  async getVariant(testId, defaultVariant = 'control') {
    if (this.assignments.has(testId)) return this.assignments.get(testId);

    try {
      const response = await fetch(`/api/admin/ab-testing/${testId}/variant`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success && data.variant) {
        this.assignments.set(testId, data.variant);
        console.log(`[A/B Testing] Test ${testId} variant: ${data.variant}`);
        return data.variant;
      }
    } catch (error) {
      console.debug(`[A/B Testing] Failed to fetch variant for ${testId}, using default`);
    }

    return defaultVariant;
  }

  /**
   * Track conversion for a test
   * @param {string} testId 
   */
  async trackConversion(testId) {
    try {
      await fetch(`/api/admin/ab-testing/${testId}/convert`, {
        method: 'POST',
        credentials: 'include'
      });
      console.log(`[A/B Testing] Conversion tracked for ${testId}`);
    } catch (error) {
      console.debug(`[A/B Testing] Conversion track failed for ${testId}`);
    }
  }

  getActiveTests() {
    return Array.from(this.assignments.keys()).map(id => ({
      id,
      variant: this.assignments.get(id)
    }));
  }
}

// Auto-init
window.abTesting = new ABTesting();
