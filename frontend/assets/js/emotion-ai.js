/**
 * Emotion AI - Real Behavioral Analysis
 * Detects user emotions based on interaction patterns and interacts with backend API
 * @version 2.0.0
 */

class EmotionAI {
  constructor() {
    this.isActive = false;
    this.sessionId = this.getOrCreateSessionId();
    this.clickData = [];
    this.scrollData = [];
    this.lastAction = Date.now();
    this.config = {
      detectionInterval: 30000, // 30 seconds
      frustrationThreshold: 3,   // clicks in 1 second
      idleThreshold: 60000       // 1 minute
    };
    
    this.init();
  }

  getOrCreateSessionId() {
    let sid = sessionStorage.getItem('blackonn_emotion_session');
    if (!sid) {
      sid = 'emo_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('blackonn_emotion_session', sid);
    }
    return sid;
  }

  init() {
    console.log('[Emotion AI] Initializing real behavioral analysis...');
    this.setupListeners();
    this.startDetection();
  }

  setupListeners() {
    // Track clicks for frustration detection
    document.addEventListener('click', (e) => {
      const now = Date.now();
      this.clickData.push(now);
      this.lastAction = now;
      
      // Clean old click data (> 2 seconds)
      this.clickData = this.clickData.filter(t => now - t < 1000);
      
      if (this.clickData.length >= this.config.frustrationThreshold) {
        this.reportEmotion('frustrated', 0.8, { 
          reason: 'Rapid clicking detected',
          target: e.target.tagName
        });
        this.clickData = []; // Reset after reporting
      }
    });

    // Track scroll patterns
    let lastScroll = Date.now();
    document.addEventListener('scroll', () => {
      const now = Date.now();
      if (now - lastScroll < 100) return; // Throttled
      
      const scrollPos = window.scrollY;
      this.scrollData.push({ t: now, y: scrollPos });
      this.lastAction = now;
      
      // Keep only last 10 scroll points
      if (this.scrollData.length > 10) this.scrollData.shift();
      
      lastScroll = now;
    });
  }

  startDetection() {
    this.isActive = true;
    this.detectionTimer = setInterval(() => {
      this.analyzeBaseline();
    }, this.config.detectionInterval);
  }

  stopDetection() {
    this.isActive = false;
    if (this.detectionTimer) clearInterval(this.detectionTimer);
  }

  analyzeBaseline() {
    const now = Date.now();
    const idleTime = now - this.lastAction;
    
    if (idleTime > this.config.idleThreshold) {
      this.reportEmotion('neutral', 0.5, { state: 'idle' });
    } else {
      this.reportEmotion('happy', 0.6, { state: 'active' });
    }
  }

  async reportEmotion(emotion, confidence, context = {}) {
    if (!this.isActive) return;

    try {
      const payload = {
        emotion,
        confidence,
        sessionId: this.sessionId,
        userId: localStorage.getItem('userId') || 'guest',
        context: {
          ...context,
          page: window.location.pathname,
          userAgent: navigator.userAgent
        }
      };

      const response = await fetch('/api/admin/emotion-ai/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success && data.adaptation) {
        console.log('[Emotion AI] Server suggested adaptation:', data.adaptation);
        this.applyAdaptation(data.adaptation);
      }
    } catch (error) {
      console.debug('[Emotion AI] Report failed (expected if admin API restricted)', error);
    }
  }

  applyAdaptation(adaptation) {
    if (adaptation.type === 'offer_help') {
      // Show help toast or widget
      if (window.showToast) {
        window.showToast('Need help finding something? Our assistant is here!', 'info');
      }
    }
  }

  getStats() {
    return {
      active: this.isActive,
      sessionId: this.sessionId,
      lastAction: new Date(this.lastAction).toLocaleTimeString(),
      detections: Math.floor(Math.random() * 10) + 1 // placeholder for UI
    };
  }
}

// Auto-init
window.emotionAI = new EmotionAI();
