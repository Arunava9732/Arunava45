/**
 * BLACKONN Analytics Tracker
 * Tracks page visits and sends data to backend
 */

const Analytics = (() => {
  const API_URL = '/api/analytics';
  let tracked = false;

  // Track page visit
  const trackPageView = async () => {
    if (tracked) return; // Prevent duplicate tracking
    tracked = true;

    try {
      await fetch(`${API_URL}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          page: window.location.pathname,
          referrer: document.referrer,
          userAgent: navigator.userAgent
        })
      });
    } catch (error) {
      console.debug('Analytics tracking failed:', error);
    }
  };

  // Initialize tracking on page load
  const init = () => {
    if (document.readyState === 'complete') {
      trackPageView();
    } else {
      window.addEventListener('load', trackPageView);
    }
  };

  // Get stats (admin only)
  const getStats = async (days = 7) => {
    try {
      const response = await fetch(`${API_URL}/stats?days=${days}`, {
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to get stats:', error);
      return null;
    }
  };

  // Get realtime data (admin only)
  const getRealtime = async () => {
    try {
      const response = await fetch(`${API_URL}/realtime`, {
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to get realtime data:', error);
      return null;
    }
  };

  return {
    init,
    trackPageView,
    getStats,
    getRealtime
  };
})();

// Auto-initialize
Analytics.init();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Analytics;
}

window.Analytics = Analytics;
