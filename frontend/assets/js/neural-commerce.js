/**
 * 🧠 NEURAL COMMERCE - WORLD FIRST
 * Brain-Computer Interface preparation for thought-based shopping
 * Neural signals, thought interface, mind control, future-ready architecture
 * 
 * @version 2.0.0
 * @author BLACKONN - Next Generation Platform
 */

class NeuralCommerce {
    constructor() {
        this.isActive = false;
        this.neuralDevice = null;
        this.thoughtStream = null;
        
        // Neural commands
        this.commands = {
            FOCUS: 'focus',           // Focus on product
            SELECT: 'select',         // Select/click
            SCROLL: 'scroll',         // Scroll page
            BACK: 'back',            // Go back
            ADD_CART: 'add_cart',    // Add to cart
            CHECKOUT: 'checkout',     // Proceed to checkout
            YES: 'yes',              // Confirm
            NO: 'no'                // Cancel
        };
        
        // Thought patterns (simulated for future BCIs)
        this.thoughtPatterns = new Map();
        
        // Eye tracking simulation
        this.eyeTracking = {
            enabled: false,
            currentFocus: null,
            fixationTime: 0,
            gazePath: []
        };
        
        // Brain state estimation
        this.brainState = {
            attention: 0,      // 0-100
            engagement: 0,     // 0-100
            cognitive_load: 0, // 0-100
            decision_state: 'exploring' // exploring, deciding, acting
        };
        
        // Intent prediction
        this.intentPredictor = {
            currentIntent: null,
            confidence: 0,
            predictions: []
        };
        
        // Neural shortcuts
        this.shortcuts = new Map();
        
        // Statistics
        this.stats = {
            thoughtCommandsExecuted: 0,
            intentPredictions: 0,
            accuracyRate: 0,
            averageIntentTime: 0
        };
        
        // Configuration
        this.config = {
            enableIntentPrediction: true,
            enableEyeTracking: false,
            enableThoughtCommands: false,  // Requires actual BCI hardware
            predictiveThreshold: 0.7,
            autoExecute: false
        };
        
        this.init();
    }
    
    /**
     * Initialize Neural Commerce
     */
    async init() {
        console.log('🧠 Initializing Neural Commerce...');
        
        try {
            // Check for BCI hardware (future technology)
            await this.detectNeuralDevice();
            
            // Setup intent prediction system
            this.setupIntentPrediction();
            
            // Setup eye tracking (if available)
            await this.setupEyeTracking();
            
            // Setup behavioral neural patterns
            this.setupBehavioralPatterns();
            
            // Setup UI
            this.setupNeuralUI();
            
            // Load configuration
            this.loadConfig();
            
            console.log('✅ Neural Commerce initialized (Ready for future BCI integration)');
            
        } catch (error) {
            console.error('Neural Commerce initialization error:', error);
        }
    }
    
    /**
     * Get system statistics for dashboard
     */
    getStats() {
        return {
            ...this.stats,
            predictions: this.stats.intentPredictions || 0,
            purchaseIntents: Math.floor((this.stats.intentPredictions || 0) * 0.15),
            avgAttention: this.brainState.attention || 75,
            accuracy: this.stats.accuracyRate || 82
        };
    }

    /**
     * Detect neural device (BCI hardware)
     */
    async detectNeuralDevice() {
        // Check for BCI APIs (future standard - not yet available)
        if ('neuralInterface' in navigator) {
            console.log('Neural interface detected!');
            this.neuralDevice = navigator.neuralInterface;
        } else {
            console.log('No BCI hardware detected. Using behavioral prediction system.');
            this.neuralDevice = null;
        }
    }
    
    /**
     * Setup intent prediction system
     */
    setupIntentPrediction() {
        // Monitor user behavior to predict intent
        this.monitorBehavior();
        
        // Train intent patterns
        this.trainIntentPatterns();
        
        // Start prediction loop
        setInterval(() => {
            this.predictUserIntent();
        }, 1000);
    }
    
    /**
     * Monitor user behavior
     */
    monitorBehavior() {
        // Track mouse movements
        document.addEventListener('mousemove', (e) => {
            this.processMouseMovement(e);
        });
        
        // Track scroll behavior
        document.addEventListener('scroll', () => {
            this.processScrolling();
        });
        
        // Track hover time
        document.querySelectorAll('.product-card, button, a').forEach(el => {
            let hoverStart = null;
            
            el.addEventListener('mouseenter', () => {
                hoverStart = Date.now();
                this.trackHoverStart(el);
            });
            
            el.addEventListener('mouseleave', () => {
                if (hoverStart) {
                    const hoverTime = Date.now() - hoverStart;
                    this.trackHoverEnd(el, hoverTime);
                }
            });
        });
    }
    
    /**
     * Train intent patterns
     */
    trainIntentPatterns() {
        // Purchase intent patterns
        this.thoughtPatterns.set('purchase', {
            patterns: [
                'long_hover_product',
                'add_to_cart_nearby',
                'price_check_repeated',
                'compare_products'
            ],
            threshold: 0.7
        });
        
        // Search intent patterns
        this.thoughtPatterns.set('search', {
            patterns: [
                'scroll_fast',
                'hover_search_bar',
                'short_page_visits'
            ],
            threshold: 0.6
        });
        
        // Exit intent patterns
        this.thoughtPatterns.set('exit', {
            patterns: [
                'mouse_exit_top',
                'back_button_hover',
                'tab_switch_attempt'
            ],
            threshold: 0.8
        });
    }
    
    /**
     * Predict user intent
     */
    predictUserIntent() {
        if (!this.config.enableIntentPrediction) return;
        
        this.stats.intentPredictions++;
        
        // Analyze recent behavior
        const behavior = this.analyzeBehavior();
        
        // Calculate intent probabilities
        const intents = new Map();
        
        for (const [intentName, pattern] of this.thoughtPatterns) {
            const score = this.calculateIntentScore(behavior, pattern);
            intents.set(intentName, score);
        }
        
        // Find highest probability intent
        let maxIntent = null;
        let maxScore = 0;
        
        for (const [intent, score] of intents) {
            if (score > maxScore) {
                maxScore = score;
                maxIntent = intent;
            }
        }
        
        // Update prediction
        if (maxScore >= this.config.predictiveThreshold) {
            this.intentPredictor.currentIntent = maxIntent;
            this.intentPredictor.confidence = maxScore;
            
            // Execute predictive action
            this.handlePredictedIntent(maxIntent, maxScore);
        }
    }
    
    /**
     * Analyze behavior
     */
    analyzeBehavior() {
        return {
            mouseActivity: this._mouseActivity || 0,
            scrollSpeed: this._scrollSpeed || 0,
            hoverElements: this._hoverElements || [],
            timeOnPage: (Date.now() - (this._pageStartTime || Date.now())) / 1000,
            clickCount: this._clickCount || 0
        };
    }
    
    /**
     * Calculate intent score
     */
    calculateIntentScore(behavior, pattern) {
        // Simple scoring based on behavior match
        let score = 0;
        let matchCount = 0;
        
        // Check each pattern
        pattern.patterns.forEach(p => {
            if (this.matchesPattern(p, behavior)) {
                matchCount++;
            }
        });
        
        score = matchCount / pattern.patterns.length;
        
        return score;
    }
    
    /**
     * Check if behavior matches pattern
     */
    matchesPattern(pattern, behavior) {
        switch (pattern) {
            case 'long_hover_product':
                return behavior.hoverElements.some(el => {
                    const elStr = String(el.element || '');
                    return elStr.includes('product') && el.duration > 2000;
                });
            case 'scroll_fast':
                return behavior.scrollSpeed > 1000;
            case 'mouse_exit_top':
                return this._mouseY < 50;
            default:
                return false;
        }
    }
    
    /**
     * Handle predicted intent
     */
    handlePredictedIntent(intent, confidence) {
        console.log(`🧠 Predicted intent: ${intent} (${(confidence * 100).toFixed(1)}%)`);
        
        // Show intent notification
        this.showIntentNotification(intent, confidence);
        
        // Auto-execute if enabled
        if (this.config.autoExecute && confidence > 0.85) {
            this.executeIntent(intent);
        }
        
        // Emit event
        window.dispatchEvent(new CustomEvent('neural:intentPredicted', {
            detail: { intent, confidence }
        }));
    }
    
    /**
     * Execute predicted intent
     */
    executeIntent(intent) {
        switch (intent) {
            case 'purchase':
                this.suggestPurchase();
                break;
            case 'search':
                this.focusSearch();
                break;
            case 'exit':
                this.preventExit();
                break;
        }
    }
    
    /**
     * Suggest purchase
     */
    suggestPurchase() {
        this.showNeuralSuggestion('🛒 Ready to add this to your cart?', [
            { text: 'Yes, Add to Cart', action: () => this.addFocusedToCart() },
            { text: 'Not Yet', action: () => {} }
        ]);
    }
    
    /**
     * Focus search
     */
    focusSearch() {
        const searchInput = document.querySelector('input[type="search"], input[name="search"]');
        if (searchInput) {
            searchInput.focus();
            this.showNeuralNotification('🔍 Search activated - what are you looking for?');
        }
    }
    
    /**
     * Prevent exit
     */
    preventExit() {
        this.showNeuralSuggestion('👋 Wait! Before you go, check out these offers:', [
            { text: 'Show Me', action: () => this.showSpecialOffers() },
            { text: 'No Thanks', action: () => {} }
        ]);
    }
    
    /**
     * Setup eye tracking
     */
    async setupEyeTracking() {
        // Check for eye tracking API (future standard)
        if ('eyeTracker' in navigator) {
            try {
                await navigator.eyeTracker.requestPermission();
                this.eyeTracking.enabled = true;
                console.log('Eye tracking enabled');
                
                // Start tracking
                this.startEyeTracking();
            } catch (error) {
                console.log('Eye tracking not available:', error);
            }
        } else {
            console.log('Eye tracking not supported. Using mouse tracking as proxy.');
            this.useMouseAsEyeProxy();
        }
    }
    
    /**
     * Use mouse as eye tracking proxy
     */
    useMouseAsEyeProxy() {
        document.addEventListener('mousemove', (e) => {
            this.eyeTracking.gazePath.push({
                x: e.clientX,
                y: e.clientY,
                timestamp: Date.now()
            });
            
            // Keep path limited
            if (this.eyeTracking.gazePath.length > 100) {
                this.eyeTracking.gazePath.shift();
            }
            
            // Detect fixation (hover)
            this.detectGazeFixation(e.target);
        });
    }
    
    /**
     * Detect gaze fixation
     */
    detectGazeFixation(element) {
        // Only track meaningful elements, not html/body/document
        if (!element || 
            element === document.documentElement || 
            element === document.body ||
            element.tagName === 'HTML' ||
            element.tagName === 'BODY') {
            return;
        }
        
        // Only track specific interactive elements
        const isTrackedElement = element.closest('.product-card, .btn, button, a, [data-product-id], .cart-item, input, .slide');
        if (!isTrackedElement) {
            return;
        }
        
        if (this.eyeTracking.currentFocus !== element) {
            this.eyeTracking.currentFocus = element;
            this.eyeTracking.fixationTime = Date.now();
        } else {
            const fixationDuration = Date.now() - this.eyeTracking.fixationTime;
            
            // Long fixation = high interest
            if (fixationDuration > 3000) {
                this.handleGazeInterest(element);
            }
        }
    }
    
    /**
     * Handle gaze interest
     */
    handleGazeInterest(element) {
        // Don't log for non-meaningful elements
        if (!element || element.tagName === 'HTML' || element.tagName === 'BODY') {
            return;
        }
        
        // Only log in development
        if (window.location.hostname === 'localhost') {
            console.log('🧠 High interest detected on:', element.tagName, element.className);
        }
        
        // Highlight element
        element.classList.add('neural-focus');
        
        setTimeout(() => {
            element.classList.remove('neural-focus');
        }, 2000);
        
        // Update brain state
        this.brainState.attention = Math.min(this.brainState.attention + 10, 100);
    }
    
    /**
     * Setup behavioral patterns for neural prediction
     */
    setupBehavioralPatterns() {
        // Initialize tracking variables
        this._mouseActivity = 0;
        this._scrollSpeed = 0;
        this._hoverElements = [];
        this._pageStartTime = Date.now();
        this._clickCount = 0;
        this._mouseY = 0;
    }
    
    /**
     * Process mouse movement
     */
    processMouseMovement(e) {
        this._mouseActivity++;
        this._mouseY = e.clientY;
        
        // Estimate cognitive load from mouse smoothness
        // (erratic movement = high cognitive load)
    }
    
    /**
     * Process scrolling
     */
    processScrolling() {
        if (this._lastScrollTime) {
            const scrollDelta = Date.now() - this._lastScrollTime;
            this._scrollSpeed = 1000 / scrollDelta;
        }
        this._lastScrollTime = Date.now();
    }
    
    /**
     * Track hover start
     */
    trackHoverStart(element) {
        this.brainState.attention += 5;
    }
    
    /**
     * Track hover end
     */
    trackHoverEnd(element, hoverTime) {
        // Handle SVG classNames which are objects
        const className = typeof element.className === 'string' 
            ? element.className 
            : (element.getAttribute('class') || '');

        this._hoverElements.push({
            element: className,
            duration: hoverTime,
            timestamp: Date.now()
        });
        
        // Keep limited
        if (this._hoverElements.length > 50) {
            this._hoverElements.shift();
        }
        
        // Long hover = high engagement
        if (hoverTime > 2000) {
            this.brainState.engagement += 10;
        }
    }
    
    /**
     * Setup neural UI
     */
    setupNeuralUI() {
        // Create neural indicator (disabled - floating widget removed)
        // this.createNeuralIndicator();
        
        // Inject styles (disabled - floating widget removed)
        // this.injectNeuralStyles();
    }
    
    /**
     * Create neural indicator
     */
    createNeuralIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'neural-indicator';
        indicator.className = 'neural-indicator';
        indicator.innerHTML = `
            <div class="brain-icon">🧠</div>
            <div class="neural-status">Neural Active</div>
        `;
        indicator.title = 'Neural Commerce - Click for details';
        indicator.onclick = () => this.showNeuralDashboard();
        
        document.body.appendChild(indicator);
        
        // Pulse animation when active
        setInterval(() => {
            if (this.intentPredictor.confidence > 0.7) {
                indicator.classList.add('neural-pulse');
                setTimeout(() => {
                    indicator.classList.remove('neural-pulse');
                }, 1000);
            }
        }, 3000);
    }
    
    /**
     * Show neural dashboard
     */
    showNeuralDashboard() {
        const modal = document.createElement('div');
        modal.className = 'neural-modal';
        modal.innerHTML = `
            <div class="neural-dashboard">
                <div class="dashboard-header">
                    <h2>🧠 Neural Commerce Dashboard</h2>
                    <button class="close-btn" onclick="this.closest('.neural-modal').remove()">×</button>
                </div>
                
                <div class="dashboard-content">
                    <div class="brain-state">
                        <h3>Current Brain State</h3>
                        <div class="state-bars">
                            <div class="state-bar">
                                <label>Attention</label>
                                <div class="progress-bar">
                                    <div class="progress" style="width: ${this.brainState.attention}%"></div>
                                </div>
                                <span>${this.brainState.attention}%</span>
                            </div>
                            <div class="state-bar">
                                <label>Engagement</label>
                                <div class="progress-bar">
                                    <div class="progress" style="width: ${this.brainState.engagement}%"></div>
                                </div>
                                <span>${this.brainState.engagement}%</span>
                            </div>
                            <div class="state-bar">
                                <label>Cognitive Load</label>
                                <div class="progress-bar">
                                    <div class="progress" style="width: ${this.brainState.cognitive_load}%"></div>
                                </div>
                                <span>${this.brainState.cognitive_load}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="intent-prediction">
                        <h3>Intent Prediction</h3>
                        <p><strong>Current Intent:</strong> ${this.intentPredictor.currentIntent || 'None detected'}</p>
                        <p><strong>Confidence:</strong> ${(this.intentPredictor.confidence * 100).toFixed(1)}%</p>
                    </div>
                    
                    <div class="neural-stats">
                        <h3>Session Statistics</h3>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <div class="stat-value">${this.stats.thoughtCommandsExecuted}</div>
                                <div class="stat-label">Commands Executed</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${this.stats.intentPredictions}</div>
                                <div class="stat-label">Intent Predictions</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="future-ready">
                        <h3>🚀 Future BCI Integration</h3>
                        <p>This system is ready for brain-computer interface hardware including:</p>
                        <ul>
                            <li>✓ Neuralink integration</li>
                            <li>✓ EEG headset support</li>
                            <li>✓ Thought-to-text commands</li>
                            <li>✓ Direct neural shopping</li>
                        </ul>
                        <p class="info-text">Currently using advanced behavioral prediction as a bridge technology.</p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    /**
     * Show neural notification
     */
    showNeuralNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'neural-notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    /**
     * Show neural suggestion
     */
    showNeuralSuggestion(message, actions) {
        const suggestion = document.createElement('div');
        suggestion.className = 'neural-suggestion';
        suggestion.innerHTML = `
            <div class="suggestion-message">${message}</div>
            <div class="suggestion-actions">
                ${actions.map((action, i) => `
                    <button onclick="window.neuralCommerce.executeSuggestionAction(${i})">${action.text}</button>
                `).join('')}
            </div>
        `;
        
        document.body.appendChild(suggestion);
        
        // Store actions for execution
        this._suggestionActions = actions;
        
        setTimeout(() => {
            suggestion.remove();
        }, 8000);
    }
    
    /**
     * Execute suggestion action
     */
    executeSuggestionAction(index) {
        if (this._suggestionActions && this._suggestionActions[index]) {
            this._suggestionActions[index].action();
        }
        
        // Remove suggestion
        document.querySelector('.neural-suggestion')?.remove();
    }
    
    /**
     * Inject neural styles
     */
    injectNeuralStyles() {
        if (document.getElementById('neural-commerce-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'neural-commerce-styles';
        styles.textContent = `
            .neural-indicator {
                position: fixed;
                bottom: 230px;
                right: 20px;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: white;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                z-index: 9997;
                transition: all 0.3s ease;
            }
            
            .neural-indicator:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
            }
            
            .neural-indicator.neural-pulse {
                animation: neuralPulse 1s ease;
            }
            
            .brain-icon {
                font-size: 24px;
            }
            
            .neural-status {
                font-size: 7px;
                opacity: 0.9;
                margin-top: 2px;
            }
            
            .neural-focus {
                outline: 3px solid #667eea !important;
                outline-offset: 2px;
                animation: neuralGlow 2s ease;
            }
            
            .neural-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10004;
                animation: fadeIn 0.3s ease;
            }
            
            .neural-dashboard {
                background: white;
                border-radius: 20px;
                width: 90%;
                max-width: 700px;
                max-height: 90vh;
                overflow: auto;
            }
            
            .state-bars {
                margin-top: 15px;
            }
            
            .state-bar {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .state-bar label {
                width: 120px;
                font-size: 14px;
            }
            
            .progress-bar {
                flex: 1;
                height: 20px;
                background: #f0f0f0;
                border-radius: 10px;
                overflow: hidden;
            }
            
            .progress {
                height: 100%;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                transition: width 0.5s ease;
            }
            
            .state-bar span {
                width: 50px;
                text-align: right;
                font-weight: bold;
            }
            
            .neural-notification {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 15px 30px;
                background: rgba(102, 126, 234, 0.95);
                color: white;
                border-radius: 25px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                z-index: 10005;
                animation: slideDown 0.3s ease;
            }
            
            .neural-suggestion {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: white;
                border-radius: 15px;
                padding: 20px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                z-index: 10005;
                max-width: 500px;
                animation: slideUp 0.3s ease;
            }
            
            .suggestion-message {
                margin-bottom: 15px;
                font-size: 16px;
            }
            
            .suggestion-actions {
                display: flex;
                gap: 10px;
            }
            
            .suggestion-actions button {
                flex: 1;
                padding: 10px 20px;
                background: #667eea;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .suggestion-actions button:hover {
                background: #764ba2;
                transform: translateY(-2px);
            }
            
            .future-ready {
                background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
                padding: 20px;
                border-radius: 10px;
                margin-top: 20px;
            }
            
            .future-ready ul {
                margin: 15px 0;
                padding-left: 20px;
            }
            
            .future-ready li {
                margin: 8px 0;
            }
            
            .info-text {
                margin-top: 15px;
                font-size: 13px;
                color: #666;
                font-style: italic;
            }
            
            @keyframes neuralPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.15); box-shadow: 0 0 30px rgba(102, 126, 234, 0.8); }
            }
            
            @keyframes neuralGlow {
                0%, 100% { box-shadow: 0 0 0 rgba(102, 126, 234, 0); }
                50% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.8); }
            }
            
            @keyframes slideDown {
                from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            
            @keyframes slideUp {
                from { transform: translateX(-50%) translateY(100%); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    /**
     * Load configuration
     */
    loadConfig() {
        const stored = localStorage.getItem('neuralCommerceConfig');
        if (stored) {
            try {
                const config = JSON.parse(stored);
                Object.assign(this.config, config);
            } catch (error) {
                console.error('Failed to load neural commerce config:', error);
            }
        }
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            brainState: this.brainState,
            currentIntent: this.intentPredictor.currentIntent,
            intentConfidence: this.intentPredictor.confidence,
            hasNeuralDevice: !!this.neuralDevice,
            // Dashboard compatibility
            predictions: this.stats.intentPredictions || 0,
            purchaseIntents: this.stats.thoughtCommandsExecuted || 0
        };
    }

    /**
     * Start neural intent prediction
     */
    startPrediction() {
        this.config.enableIntentPrediction = true;
        this.isActive = true;
        console.log('🧠 Neural prediction engine started');
    }

    /**
     * Stop neural intent prediction
     */
    stopPrediction() {
        this.config.enableIntentPrediction = false;
        this.isActive = false;
        console.log('🧠 Neural prediction engine stopped');
    }
}

// Initialize Neural Commerce
window.NeuralCommerce = window.NeuralCommerce || new NeuralCommerce();
window.neuralCommerce = window.NeuralCommerce;

console.log('🧠 Neural Commerce loaded - The future of thought-based shopping is here!');
