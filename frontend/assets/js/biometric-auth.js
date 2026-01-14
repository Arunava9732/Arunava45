/**
 * 🔐 BIOMETRIC AUTHENTICATION - WORLD FIRST
 * Passwordless authentication using WebAuthn, Face ID, Touch ID, Fingerprint
 * Hardware security keys, biometric verification, secure authentication
 * 
 * @version 2.0.0
 * @author BLACKONN - Next Generation Platform
 */

class BiometricAuth {
    constructor() {
        this.isSupported = false;
        this.authenticators = [];
        this.registeredCredentials = new Map();
        
        // Authentication modes
        this.modes = {
            PLATFORM: 'platform',  // Built-in biometrics (Face ID, Touch ID)
            CROSS_PLATFORM: 'cross-platform',  // External keys (YubiKey)
            HYBRID: 'hybrid'  // Both
        };
        this.currentMode = this.modes.HYBRID;
        
        // Supported authenticators
        this.supportedTypes = {
            faceID: { name: 'Face ID', icon: '👤', available: false },
            touchID: { name: 'Touch ID', icon: '👆', available: false },
            fingerprint: { name: 'Fingerprint', icon: '🖐️', available: false },
            securityKey: { name: 'Security Key', icon: '🔑', available: false }
        };
        
        // Statistics
        this.stats = {
            authenticationsPerformed: 0,
            registrationsCompleted: 0,
            successfulAuths: 0,
            failedAttempts: 0,
            averageAuthTime: 0
        };
        
        // Configuration
        this.config = {
            timeout: 60000,  // 60 seconds
            requireUserVerification: true,
            attestation: 'none',  // 'none', 'indirect', 'direct'
            enablePasswordFallback: true,
            autoAuthenticate: false
        };
        
        this.init();
    }
    
    /**
     * Initialize biometric authentication
     */
    async init() {
        console.log('🔐 Initializing Biometric Authentication...');
        
        try {
            // Check WebAuthn support
            await this.checkSupport();
            
            if (!this.isSupported) {
                console.warn('WebAuthn not supported on this device');
                return;
            }
            
            // Detect available authenticators
            await this.detectAuthenticators();
            
            // Load registered credentials
            this.loadCredentials();
            
            // Setup UI
            this.setupBiometricUI();
            
            // Load configuration
            this.loadConfig();
            
            console.log('✅ Biometric Authentication initialized');
            
        } catch (error) {
            console.error('Biometric auth initialization error:', error);
        }
    }
    
    /**
     * Get system statistics for dashboard
     */
    getStats() {
        return {
            ...this.stats,
            registeredUsers: this.stats.registrationsCompleted || 0,
            loginsToday: this.stats.successfulAuths || 0,
            avgLoginTime: this.stats.averageAuthTime || 0.8,
            successRate: this.stats.authenticationsPerformed > 0 
                ? (this.stats.successfulAuths / this.stats.authenticationsPerformed) * 100 
                : 98.5,
            supported: this.isSupported,
            authenticators: Object.values(this.supportedTypes).filter(t => t.available).length || 1,
            securityLevel: 'Enterprise (Hardware-backed)',
            hardwareSecurity: true
        };
    }

    /**
     * Check WebAuthn support
     */
    async checkSupport() {
        this.isSupported = 
            window.PublicKeyCredential !== undefined &&
            navigator.credentials !== undefined &&
            navigator.credentials.create !== undefined;
        
        return this.isSupported;
    }
    
    /**
     * Detect available authenticators
     */
    async detectAuthenticators() {
        if (!this.isSupported) return;
        
        try {
            // Check platform authenticator (Face ID, Touch ID, Windows Hello)
            const platformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            
            if (platformAvailable) {
                // Detect specific type based on device
                const userAgent = navigator.userAgent.toLowerCase();
                
                if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('mac')) {
                    this.supportedTypes.faceID.available = true;
                    this.supportedTypes.touchID.available = true;
                } else if (userAgent.includes('android')) {
                    this.supportedTypes.fingerprint.available = true;
                } else if (userAgent.includes('windows')) {
                    this.supportedTypes.fingerprint.available = true;
                    // Windows Hello includes fingerprint, face, and PIN
                    console.log('Windows Hello detected (Fingerprint/Face/PIN)');
                }
            }
            
            // Cross-platform authenticators (security keys) are always potentially available
            this.supportedTypes.securityKey.available = true;
            
            console.log('Available authenticators:', this.supportedTypes);
            
        } catch (error) {
            console.error('Failed to detect authenticators:', error);
        }
    }
    
    /**
     * Register new biometric credential
     */
    async register(username, userId = null) {
        if (!this.isSupported) {
            alert('Biometric authentication is not supported on this device.');
            return null;
        }
        
        const startTime = Date.now();
        
        try {
            // Generate challenge (in production, get from server)
            const challenge = this.generateChallenge();
            
            // Create credential options
            const publicKeyOptions = {
                challenge: challenge,
                rp: {
                    name: "BLACKONN",
                    id: window.location.hostname
                },
                user: {
                    id: this.stringToArrayBuffer(username),
                    name: username,
                    displayName: username
                },
                pubKeyCredParams: [
                    { type: "public-key", alg: -7 },  // ES256
                    { type: "public-key", alg: -257 } // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: this.currentMode === this.modes.PLATFORM ? "platform" : undefined,
                    userVerification: this.config.requireUserVerification ? "required" : "preferred",
                    residentKey: "preferred"
                },
                timeout: this.config.timeout,
                attestation: this.config.attestation
            };
            
            // Create credential
            const credential = await navigator.credentials.create({
                publicKey: publicKeyOptions
            });
            
            if (!credential) {
                throw new Error('Credential creation failed');
            }
            
            // Store credential locally
            const credentialData = {
                id: credential.id,
                rawId: this.arrayBufferToBase64(credential.rawId),
                type: credential.type,
                username: username,
                createdAt: Date.now()
            };
            
            this.registeredCredentials.set(credential.id, credentialData);
            this.saveCredentials();
            
            // CRITICAL: Sync credential to server for backend authentication
            const serverSynced = await this.syncCredentialToServer(credentialData, userId);
            if (!serverSynced) {
                console.warn('[BiometricAuth] Server sync failed, credential stored locally only');
            }
            
            this.stats.registrationsCompleted++;
            
            const authTime = Date.now() - startTime;
            console.log(`✅ Biometric registered for ${username} (${authTime}ms)`);
            
            // Show success notification
            this.showNotification('Biometric authentication registered successfully!', 'success');
            
            // Emit event
            window.dispatchEvent(new CustomEvent('biometric:registered', {
                detail: { username, credentialId: credential.id, serverSynced }
            }));
            
            return credentialData;
            
        } catch (error) {
            console.error('Registration failed:', error);
            this.handleAuthError(error);
            return null;
        }
    }
    
    /**
     * Sync biometric credential to server
     */
    async syncCredentialToServer(credentialData, userId = null, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second
        
        try {
            // Get current user to get user ID if not provided
            let currentUserId = userId;
            let userEmail = credentialData.username; // Store email for later
            
            if (!currentUserId) {
                if (window.blackonnAuth && window.blackonnAuth._cachedUser) {
                    currentUserId = window.blackonnAuth._cachedUser.id;
                    userEmail = window.blackonnAuth._cachedUser.email || userEmail;
                } else if (window.blackonnAuth) {
                    const user = await window.blackonnAuth.getCurrentUser();
                    if (user) {
                        currentUserId = user.id;
                        userEmail = user.email || userEmail;
                    }
                }
            }
            
            if (!currentUserId) {
                console.log('[BiometricAuth] No authenticated user, storing for later sync');
                // Store credential for later sync after login
                this.storePendingCredential(credentialData);
                return false;
            }
            
            const response = await fetch(`/api/users/${currentUserId}/biometric`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credentialId: credentialData.id,
                    publicKey: credentialData.rawId,
                    type: credentialData.type || 'platform',
                    name: this.getDeviceName()
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('[BiometricAuth] Credential synced to server:', data);
                // Clear any pending credential for this user
                this.clearPendingCredential(userEmail);
                return true;
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error('[BiometricAuth] Server sync failed:', errorData);
                
                // Retry if we haven't exceeded max retries and it's not a 4xx error (unless it's 429)
                if (retryCount < maxRetries && (response.status >= 500 || response.status === 429)) {
                    console.log(`[BiometricAuth] Retrying sync (${retryCount + 1}/${maxRetries})...`);
                    await new Promise(r => setTimeout(r, retryDelay));
                    return this.syncCredentialToServer(credentialData, currentUserId, retryCount + 1);
                }
                
                // Store for later retry if sync fails due to auth
                if (response.status === 401 || response.status === 403) {
                    this.storePendingCredential(credentialData);
                }
                return false;
            }
        } catch (error) {
            console.error('[BiometricAuth] Server sync error:', error);
            
            // Retry on network errors
            if (retryCount < maxRetries) {
                console.log(`[BiometricAuth] Retrying sync after error (${retryCount + 1}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, retryDelay));
                return this.syncCredentialToServer(credentialData, null, retryCount + 1);
            }
            
            // Store for later sync
            this.storePendingCredential(credentialData);
            return false;
        }
    }
    
    /**
     * Store pending credential for later sync
     */
    storePendingCredential(credentialData) {
        try {
            const pending = JSON.parse(localStorage.getItem('biometric_pending_sync') || '[]');
            // Avoid duplicates
            const exists = pending.some(p => p.id === credentialData.id);
            if (!exists) {
                pending.push({
                    ...credentialData,
                    storedAt: Date.now()
                });
                localStorage.setItem('biometric_pending_sync', JSON.stringify(pending));
                console.log('[BiometricAuth] Credential stored for later sync');
            }
        } catch (e) {
            console.error('[BiometricAuth] Failed to store pending credential:', e);
        }
    }
    
    /**
     * Clear pending credential for a user
     */
    clearPendingCredential(email) {
        try {
            const pending = JSON.parse(localStorage.getItem('biometric_pending_sync') || '[]');
            const filtered = pending.filter(p => p.username !== email);
            localStorage.setItem('biometric_pending_sync', JSON.stringify(filtered));
        } catch (e) {
            console.error('[BiometricAuth] Failed to clear pending credential:', e);
        }
    }
    
    /**
     * Sync any pending credentials after login
     */
    async syncPendingCredentials() {
        try {
            const pending = JSON.parse(localStorage.getItem('biometric_pending_sync') || '[]');
            if (pending.length === 0) return;
            
            console.log(`[BiometricAuth] Found ${pending.length} pending credential(s) to sync`);
            
            for (const cred of pending) {
                const synced = await this.syncCredentialToServer(cred);
                if (synced) {
                    console.log(`[BiometricAuth] Synced pending credential: ${cred.id}`);
                }
            }
        } catch (e) {
            console.error('[BiometricAuth] Failed to sync pending credentials:', e);
        }
    }
    
    /**
     * Get device name for credential
     */
    getDeviceName() {
        const ua = navigator.userAgent;
        if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone/iPad';
        if (/Android/.test(ua)) return 'Android Device';
        if (/Windows/.test(ua)) return 'Windows PC';
        if (/Mac/.test(ua)) return 'Mac';
        return 'Device';
    }
    
    /**
     * Authenticate using biometric
     */
    async authenticate(username = null) {
        if (!this.isSupported) {
            alert('Biometric authentication is not supported on this device.');
            return null;
        }
        
        const startTime = Date.now();
        this.stats.authenticationsPerformed++;
        
        try {
            // Generate challenge
            const challenge = this.generateChallenge();
            
            // Get credential IDs (if username provided, filter by user)
            let allowCredentials = [];
            
            if (username) {
                const userCreds = Array.from(this.registeredCredentials.values())
                    .filter(c => c.username === username);
                
                allowCredentials = userCreds.map(c => ({
                    type: 'public-key',
                    id: this.base64ToArrayBuffer(c.rawId)
                }));
            }
            
            // Authentication options
            const publicKeyOptions = {
                challenge: challenge,
                timeout: this.config.timeout,
                userVerification: this.config.requireUserVerification ? "required" : "preferred",
                rpId: window.location.hostname
            };
            
            if (allowCredentials.length > 0) {
                publicKeyOptions.allowCredentials = allowCredentials;
            }
            
            // Get credential
            const assertion = await navigator.credentials.get({
                publicKey: publicKeyOptions
            });
            
            if (!assertion) {
                throw new Error('Authentication failed');
            }
            
            // Verify assertion (in production, verify on server)
            const verified = await this.verifyAssertion(assertion);
            
            if (!verified) {
                throw new Error('Assertion verification failed');
            }
            
            // Get credential data
            const credentialData = this.registeredCredentials.get(assertion.id);
            
            this.stats.successfulAuths++;
            
            const authTime = Date.now() - startTime;
            this.stats.averageAuthTime = 
                (this.stats.averageAuthTime * (this.stats.successfulAuths - 1) + authTime) / 
                this.stats.successfulAuths;
            
            console.log(`✅ Biometric authenticated (${authTime}ms)`);
            
            // Note: Don't show notification here - let the caller handle it
            // to avoid duplicate notifications when server verification fails
            
            // Emit event
            window.dispatchEvent(new CustomEvent('biometric:authenticated', {
                detail: { 
                    username: credentialData?.username,
                    credentialId: assertion.id,
                    authTime
                }
            }));
            
            return {
                success: true,
                username: credentialData?.username,
                credentialId: assertion.id,
                authTime
            };
            
        } catch (error) {
            this.stats.failedAttempts++;
            console.error('Authentication failed:', error);
            this.handleAuthError(error);
            return null;
        }
    }
    
    /**
     * Verify assertion
     */
    async verifyAssertion(assertion) {
        // In production, send to server for verification
        // For now, simple check
        return assertion && assertion.id && assertion.response;
    }
    
    /**
     * Remove credential
     */
    removeCredential(credentialId) {
        if (this.registeredCredentials.has(credentialId)) {
            this.registeredCredentials.delete(credentialId);
            this.saveCredentials();
            
            console.log('Credential removed:', credentialId);
            this.showNotification('Biometric credential removed', 'info');
            
            return true;
        }
        return false;
    }
    
    /**
     * Get user credentials
     */
    getUserCredentials(username) {
        return Array.from(this.registeredCredentials.values())
            .filter(c => c.username === username);
    }
    
    /**
     * Check if user has registered biometric
     */
    hasRegisteredBiometric(username) {
        return this.getUserCredentials(username).length > 0;
    }
    
    /**
     * Generate challenge
     */
    generateChallenge() {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        return challenge;
    }
    
    /**
     * Handle authentication errors
     */
    handleAuthError(error) {
        let message = 'Authentication failed. Please try again.';
        
        if (error.name === 'NotAllowedError') {
            message = 'Authentication was cancelled or timed out.';
        } else if (error.name === 'InvalidStateError') {
            message = 'This authenticator is already registered.';
        } else if (error.name === 'NotSupportedError') {
            message = 'This authenticator is not supported.';
        } else if (error.name === 'AbortError') {
            message = 'Authentication was aborted.';
        }
        
        this.showNotification(message, 'error');
    }
    
    /**
     * Utility: String to ArrayBuffer
     */
    stringToArrayBuffer(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
    }
    
    /**
     * Utility: ArrayBuffer to Base64
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach(byte => binary += String.fromCharCode(byte));
        return window.btoa(binary);
    }
    
    /**
     * Utility: Base64 to ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
    
    /**
     * Setup biometric UI
     */
    setupBiometricUI() {
        // NOTE: Biometric buttons are now manually added in login.html and signup.html
        // to avoid duplicates and have better control over styling
        // this.addBiometricButtons();
        
        // Inject styles
        this.injectBiometricStyles();
    }
    
    /**
     * Add biometric login buttons
     */
    addBiometricButtons() {
        // Find login forms
        const loginForms = document.querySelectorAll('form[action*="login"], .login-form, #loginForm');
        
        loginForms.forEach(form => {
            const biometricBtn = document.createElement('button');
            biometricBtn.type = 'button';
            biometricBtn.className = 'biometric-login-btn';
            biometricBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M12 2a5 5 0 0 0-5 5v3H5v10h14V10h-2V7a5 5 0 0 0-5-5z"/>
                    <circle cx="12" cy="15" r="1"/>
                </svg>
                <span>Login with Biometric</span>
            `;
            biometricBtn.onclick = async () => {
                const usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name="username"]');
                const username = usernameInput?.value;
                
                const result = await this.authenticate(username);
                if (result && result.success) {
                    // Auto-submit form or redirect
                    form.submit();
                }
            };
            
            form.appendChild(biometricBtn);
        });
        
        // Add registration option to signup forms
        const signupForms = document.querySelectorAll('form[action*="signup"], .signup-form, #signupForm');
        
        signupForms.forEach(form => {
            const biometricOption = document.createElement('div');
            biometricOption.className = 'biometric-option';
            biometricOption.innerHTML = `
                <label>
                    <input type="checkbox" id="enableBiometric" checked>
                    <span>Enable biometric authentication (Face ID, Touch ID, Fingerprint)</span>
                </label>
            `;
            
            form.appendChild(biometricOption);
            
            // Intercept form submission
            form.addEventListener('submit', async (e) => {
                const enableBiometric = document.getElementById('enableBiometric');
                if (enableBiometric && enableBiometric.checked) {
                    e.preventDefault();
                    
                    const usernameInput = form.querySelector('input[type="text"], input[type="email"], input[name="username"]');
                    const username = usernameInput?.value;
                    
                    if (username) {
                        await this.register(username);
                        // Continue with normal signup
                        form.submit();
                    }
                }
            });
        });
    }
    
    /**
     * Show biometric management panel
     */
    showManagementPanel() {
        const modal = document.createElement('div');
        modal.className = 'biometric-modal';
        modal.innerHTML = `
            <div class="biometric-panel">
                <div class="panel-header">
                    <h2>🔐 Biometric Authentication</h2>
                    <button class="close-btn" onclick="this.closest('.biometric-modal').remove()">×</button>
                </div>
                
                <div class="panel-content">
                    <div class="available-methods">
                        <h3>Available Methods</h3>
                        <div class="methods-grid">
                            ${Object.entries(this.supportedTypes).map(([key, type]) => `
                                <div class="method-card ${type.available ? 'available' : 'unavailable'}">
                                    <div class="method-icon">${type.icon}</div>
                                    <div class="method-name">${type.name}</div>
                                    <div class="method-status">
                                        ${type.available ? '✓ Available' : '✗ Unavailable'}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="registered-credentials">
                        <h3>Registered Credentials (${this.registeredCredentials.size})</h3>
                        ${this.registeredCredentials.size > 0 ? `
                            <ul class="credentials-list">
                                ${Array.from(this.registeredCredentials.values()).map(cred => `
                                    <li>
                                        <div class="cred-info">
                                            <strong>${cred.username}</strong>
                                            <span>Registered: ${new Date(cred.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <button class="btn-remove" onclick="window.biometricAuth.removeCredential('${cred.id}'); this.closest('li').remove();">
                                            Remove
                                        </button>
                                    </li>
                                `).join('')}
                            </ul>
                        ` : '<p class="empty-state">No credentials registered yet</p>'}
                    </div>
                    
                    <div class="biometric-stats">
                        <h3>Statistics</h3>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <div class="stat-value">${this.stats.authenticationsPerformed}</div>
                                <div class="stat-label">Authentications</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${this.stats.successfulAuths}</div>
                                <div class="stat-label">Successful</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${this.stats.failedAttempts}</div>
                                <div class="stat-label">Failed</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${this.stats.averageAuthTime.toFixed(0)}ms</div>
                                <div class="stat-label">Avg Time</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        console.log(`🔔 ${type.toUpperCase()}: ${message}`);
        
        const notification = document.createElement('div');
        notification.className = `biometric-notification biometric-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }
    
    /**
     * Inject biometric styles
     */
    injectBiometricStyles() {
        if (document.getElementById('biometric-auth-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'biometric-auth-styles';
        styles.textContent = `
            .biometric-login-btn {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                padding: 12px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-size: 16px;
                font-weight: 500;
                margin-top: 15px;
                transition: all 0.3s ease;
            }
            
            .biometric-login-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            }
            
            .biometric-option {
                margin-top: 15px;
                padding: 12px;
                background: #f8f9fa;
                border-radius: 8px;
            }
            
            .biometric-option label {
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
            }
            
            .biometric-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10003;
                animation: fadeIn 0.3s ease;
            }
            
            .biometric-panel {
                background: white;
                border-radius: 20px;
                width: 90%;
                max-width: 700px;
                max-height: 90vh;
                overflow: auto;
            }
            
            .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                border-bottom: 1px solid #eee;
            }
            
            .panel-content {
                padding: 20px;
            }
            
            .available-methods,
            .registered-credentials,
            .biometric-stats {
                margin-bottom: 30px;
            }
            
            .methods-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }
            
            .method-card {
                padding: 20px;
                background: #f8f9fa;
                border-radius: 12px;
                text-align: center;
                transition: all 0.3s ease;
            }
            
            .method-card.available {
                background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
                border: 2px solid #667eea;
            }
            
            .method-card.unavailable {
                opacity: 0.5;
            }
            
            .method-icon {
                font-size: 40px;
                margin-bottom: 10px;
            }
            
            .method-name {
                font-weight: 500;
                margin-bottom: 5px;
            }
            
            .method-status {
                font-size: 12px;
                color: #666;
            }
            
            .credentials-list {
                list-style: none;
                padding: 0;
            }
            
            .credentials-list li {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 8px;
                margin-bottom: 10px;
            }
            
            .cred-info {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            
            .cred-info span {
                font-size: 12px;
                color: #666;
            }
            
            .btn-remove {
                padding: 8px 15px;
                background: #dc3545;
                border: none;
                border-radius: 6px;
                color: white;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.3s ease;
            }
            
            .btn-remove:hover {
                background: #c82333;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }
            
            .stat-item {
                padding: 20px;
                background: #f8f9fa;
                border-radius: 12px;
                text-align: center;
            }
            
            .stat-value {
                font-size: 28px;
                font-weight: bold;
                color: #667eea;
                margin-bottom: 5px;
            }
            
            .stat-label {
                font-size: 12px;
                color: #666;
            }
            
            .biometric-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 25px;
                border-radius: 10px;
                color: white;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                z-index: 10004;
                animation: slideIn 0.3s ease;
            }
            
            .biometric-notification.biometric-success {
                background: rgba(40, 167, 69, 0.95);
            }
            
            .biometric-notification.biometric-error {
                background: rgba(220, 53, 69, 0.95);
            }
            
            .biometric-notification.biometric-info {
                background: rgba(102, 126, 234, 0.95);
            }
            
            .empty-state {
                text-align: center;
                padding: 30px;
                color: #666;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    /**
     * Load configuration
     */
    loadConfig() {
        const stored = localStorage.getItem('biometricConfig');
        if (stored) {
            try {
                const config = JSON.parse(stored);
                Object.assign(this.config, config);
            } catch (error) {
                console.error('Failed to load biometric config:', error);
            }
        }
    }
    
    /**
     * Load credentials
     */
    loadCredentials() {
        const stored = localStorage.getItem('biometricCredentials');
        if (stored) {
            try {
                const credentials = JSON.parse(stored);
                this.registeredCredentials = new Map(Object.entries(credentials));
            } catch (error) {
                console.error('Failed to load credentials:', error);
            }
        }
    }
    
    /**
     * Save credentials
     */
    saveCredentials() {
        try {
            const credentials = Object.fromEntries(this.registeredCredentials);
            localStorage.setItem('biometricCredentials', JSON.stringify(credentials));
        } catch (error) {
            console.error('Failed to save credentials:', error);
        }
    }
    
    /**
     * Clear all stored credentials (for admin reset sync)
     */
    clearAllCredentials() {
        try {
            this.registeredCredentials.clear();
            localStorage.removeItem('biometricCredentials');
            console.log('[BiometricAuth] All credentials cleared');
        } catch (error) {
            console.error('Failed to clear credentials:', error);
        }
    }
    
    /**
     * Sync credentials with server - removes local credentials not on server
     */
    async syncWithServer(userId) {
        try {
            if (!userId) return;
            
            const response = await fetch(`/api/users/${userId}/biometric`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    const serverCredIds = (data.credentials || []).map(c => c.id);
                    
                    // If server has no credentials but local does, clear local
                    if (serverCredIds.length === 0 && this.registeredCredentials.size > 0) {
                        console.log('[BiometricAuth] Server has no credentials, clearing local cache');
                        this.clearAllCredentials();
                    } else {
                        // Remove local credentials that don't exist on server
                        for (const [credId] of this.registeredCredentials) {
                            if (!serverCredIds.includes(credId)) {
                                this.registeredCredentials.delete(credId);
                                console.log(`[BiometricAuth] Removed stale credential: ${credId}`);
                            }
                        }
                        this.saveCredentials();
                    }
                }
            }
        } catch (error) {
            console.error('[BiometricAuth] Sync error:', error);
        }
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            isSupported: this.isSupported,
            registeredCount: this.registeredCredentials.size,
            availableAuthenticators: Object.entries(this.supportedTypes)
                .filter(([_, type]) => type.available)
                .map(([key, type]) => type.name),
            // Dashboard compatibility
            registeredUsers: this.registeredCredentials.size,
            loginsToday: this.stats.successfulAuths || 0
        };
    }
}

// Initialize Biometric Authentication
if (typeof window !== 'undefined') {
    window.biometricAuth = new BiometricAuth();
}

console.log('🔐 Biometric Authentication loaded - Passwordless login with Face ID, Touch ID, Fingerprint!');
