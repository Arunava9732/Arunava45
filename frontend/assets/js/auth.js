// BLACKONN Authentication Utilities
// Full API-based authentication - Server only, httpOnly cookies
// Cloud-ready: Works on any hosting platform (AWS, Azure, Heroku, etc.)
// NO localStorage - all auth state managed via httpOnly cookies

class BlackonnAuth {
    constructor() {
        this.API_BASE = window.location.origin + '/api';
        this.apiAvailable = null;
        this._cachedUser = null;
        this._authChecked = false;
        this._pendingAuthPromise = null;
    }

    // Auto-check current user on initialization so page loads rehydrate auth state
    // (non-blocking)
    async _initAuth() {
        try {
            await this.getCurrentUser();
        } catch (e) {
            // ignore
        }
    }

    // Mark that user is logged in (persistent hint for page navigation)
    _setLoginMarker(user) {
        try {
            const payload = { id: user?.id || null, ts: Date.now() };
            localStorage.setItem('blackonn_logged_in', JSON.stringify(payload));
        } catch (e) {
            // ignore storage errors
        }
    }

    _clearLoginMarker() {
        try { localStorage.removeItem('blackonn_logged_in'); } catch (e) {}
    }

    // Check if API is available
    async checkApi() {
        // Reuse global API status if available from api.js
        if (typeof API !== 'undefined' && typeof API.checkApiAvailable === 'function') {
            return await API.checkApiAvailable();
        }

        if (this.apiAvailable !== null) return this.apiAvailable;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
            const res = await fetch(this.API_BASE + '/health', { 
                method: 'GET', 
                signal: controller.signal,
                credentials: 'include'
            });
            clearTimeout(timeoutId);
            this.apiAvailable = res.ok;
        } catch {
            this.apiAvailable = false;
        }
        return this.apiAvailable;
    }

    // API request helper - uses httpOnly cookies (no manual token needed)
    async apiRequest(endpoint, options = {}, retries = 1) {
        const headers = { 'Content-Type': 'application/json' };
        
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout (increased for slow VPS)
        
        try {
            const res = await fetch(this.API_BASE + endpoint, { 
                ...options, 
                headers,
                signal: controller.signal,
                credentials: 'include' // Include httpOnly cookies automatically
            });
            clearTimeout(timeoutId);
            
            const data = await res.json();
            
            if (!res.ok) {
                if (res.status === 401) {
                    // Session invalid
                    this._cachedUser = null;
                    this._authChecked = false;
                    // Clear persisted login hint
                    this._clearLoginMarker();
                    throw new Error('NOT_AUTHENTICATED');
                }
                throw new Error(data.error || 'Request failed');
            }
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            
            // Retry on network errors (not on auth errors)
            if (retries > 0 && (error.name === 'AbortError' || error.message.includes('network') || error.message.includes('fetch'))) {
                console.log(`[Auth] Retrying request to ${endpoint}...`);
                await new Promise(r => setTimeout(r, 1000)); // Wait 1 second before retry
                return this.apiRequest(endpoint, options, retries - 1);
            }
            
            throw error;
        }
    }

    // Get current user from API (with caching for performance)
    async getCurrentUser(forceRefresh = false) {
        // Return cached user if available and not forcing refresh
        if (this._cachedUser && !forceRefresh && this._authChecked) {
            return this._cachedUser;
        }

        // Use global API if available to avoid redundant requests on VPS
        if (typeof API !== 'undefined' && API.getCachedUser && !forceRefresh) {
            const user = await API.getCachedUser();
            this._cachedUser = user;
            this._authChecked = true;
            return user;
        }

        // Deduplicate requests
        if (this._pendingAuthPromise && !forceRefresh) {
            return this._pendingAuthPromise;
        }

        this._pendingAuthPromise = (async () => {
            try {
                const data = await this.apiRequest('/auth/me');
                this._authChecked = true;
                if (data.success && data.user) {
                    this._cachedUser = {
                        ...data.user,
                        loggedIn: true
                    };
                    // Persist a lightweight marker so other pages know we recently logged in
                    this._setLoginMarker(data.user);
                    return this._cachedUser;
                }
            } catch (error) {
                // Silently handle auth errors
                this._cachedUser = null;
                this._authChecked = true;
            } finally {
                this._pendingAuthPromise = null;
            }
            return null;
        })();

        return this._pendingAuthPromise;
    }

    // Check if user is authenticated (sync check - uses cache)
    hasToken() {
        // Since we use httpOnly cookies, we can't check token directly.
        // Return cached server-verified state when available. If not yet verified
        // (page just loaded), use a lightweight localStorage marker so pages
        // don't immediately treat the user as logged out during async rehydrate.
        if (this._cachedUser && this._authChecked) return true;
        try {
            const marker = localStorage.getItem('blackonn_logged_in');
            if (marker) return true;
        } catch (e) {
            // ignore storage errors
        }
        return false;
    }

    // Check if user is authenticated (async - verifies with server)
    async isAuthenticated() {
        const user = await this.getCurrentUser();
        if (user) {
            return { 
                authenticated: true, 
                role: user.role || 'customer', 
                user: user 
            };
        }
        return { authenticated: false };
    }

    // Login user via API
    async login(email, password) {
        try {
            const useApi = await this.checkApi();
            if (!useApi) {
                return { success: false, error: 'Server connection failed. Please try again later.' };
            }

            const data = await this.apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            
            if (data.success) {
                // Cookie is set by server automatically (httpOnly)
                this._cachedUser = {
                    ...data.user,
                    loggedIn: true
                };
                this._authChecked = true;
                // Persist lightweight marker for cross-page navigation
                this._setLoginMarker(this._cachedUser);
                
                // Sync cart with server after login
                if (typeof API !== 'undefined' && API.cart) {
                    API.cart.syncWithServer().catch(() => {});
                }
                
                // Sync any pending biometric credentials after successful login
                if (window.biometricAuth && typeof window.biometricAuth.syncPendingCredentials === 'function') {
                    window.biometricAuth.syncPendingCredentials().catch(e => {
                        console.warn('Failed to sync pending biometric credentials:', e);
                    });
                }
                
                // Check for biometric reset notification from admin
                if (data.notification && data.notification.type === 'biometric_reset') {
                    // Store notification for display after redirect
                    sessionStorage.setItem('biometricResetNotification', JSON.stringify(data.notification));
                }
                
                return { 
                    success: true, 
                    user: this._cachedUser, 
                    role: data.user.role || 'customer',
                    notification: data.notification
                };
            }
            
            return { success: false, error: data.error || 'Login failed' };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message || 'Login failed. Please check your connection.' };
        }
    }

    // Register user via API - user data stored on server only
    async register(userData) {
        try {
            const useApi = await this.checkApi();
            if (!useApi) {
                return { success: false, error: 'Server connection failed. Please try again later.' };
            }

            const data = await this.apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });

            if (data.success) {
                // Cookie is set by server automatically (httpOnly)
                this._cachedUser = {
                    ...data.user,
                    loggedIn: true
                };
                this._authChecked = true;
                // Persist lightweight marker for cross-page navigation
                this._setLoginMarker(this._cachedUser);
                return { success: true, user: this._cachedUser };
            }

            return { success: false, error: data.error || 'Registration failed' };
        } catch (error) {
            console.error('Register error:', error);
            return { success: false, error: error.message || 'Registration failed. Please check your connection.' };
        }
    }

    // Logout user via API
    async logout() {
        try {
            // Try API logout - server will clear httpOnly cookie
            const useApi = await this.checkApi();
            if (useApi) {
                try {
                    await this.apiRequest('/auth/logout', { method: 'POST' });
                } catch (e) {
                    // Continue even if API logout fails
                }
            }

            // Clear cached user
            this._cachedUser = null;
            this._authChecked = false;
            // Clear persisted login marker
            this._clearLoginMarker();

            // Clear session storage (for CSRF tokens etc.)
            sessionStorage.clear();

            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local cache
            this._cachedUser = null;
            this._authChecked = false;
            return { success: false, error: 'Logout failed' };
        }
    }

    // Request password reset via API
    async requestPasswordReset(email) {
        try {
            const useApi = await this.checkApi();
            if (!useApi) {
                return { success: false, error: 'Server connection failed. Please try again later.' };
            }

            const data = await this.apiRequest('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
            return data;
        } catch (error) {
            console.error('Password reset request error:', error);
            return { success: false, error: error.message || 'Failed to process reset request' };
        }
    }

    // Verify OTP for password reset
    async verifyOTP(email, otp) {
        try {
            const useApi = await this.checkApi();
            if (!useApi) {
                return { success: false, error: 'Server connection failed. Please try again later.' };
            }

            const data = await this.apiRequest('/auth/verify-otp', {
                method: 'POST',
                body: JSON.stringify({ email, otp })
            });
            return data;
        } catch (error) {
            console.error('OTP verification error:', error);
            return { success: false, error: error.message || 'Failed to verify OTP' };
        }
    }

    // Reset password with token via API
    async resetPassword(token, newPassword) {
        try {
            const useApi = await this.checkApi();
            if (!useApi) {
                return { success: false, error: 'Server connection failed. Please try again later.' };
            }

            const data = await this.apiRequest('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token, newPassword })
            });
            return data;
        } catch (error) {
            console.error('Password reset error:', error);
            return { success: false, error: error.message || 'Failed to reset password' };
        }
    }

    // Update user profile via API
    async updateProfile(userId, updates) {
        try {
            const data = await this.apiRequest(`/users/${userId}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            if (data.success && data.user) {
                // Update cached user
                this._cachedUser = {
                    ...this._cachedUser,
                    ...data.user,
                    loggedIn: true
                };
            }

            return data;
        } catch (error) {
            console.error('Profile update error:', error);
            return { success: false, error: error.message || 'Failed to update profile' };
        }
    }

    // Change password via API
    async changePassword(userId, currentPassword, newPassword) {
        try {
            const data = await this.apiRequest(`/users/${userId}/change-password`, {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword })
            });
            return data;
        } catch (error) {
            console.error('Change password error:', error);
            return { success: false, error: error.message || 'Failed to change password' };
        }
    }

    // ============ OAUTH METHODS ============

    // Google Login with ID Token
    async googleLogin(idToken) {
        try {
            const useApi = await this.checkApi();
            if (!useApi) {
                return { success: false, error: 'Server connection failed. Please try again later.' };
            }

            const data = await this.apiRequest('/auth/google', {
                method: 'POST',
                body: JSON.stringify({ idToken })
            });

            if (data.success) {
                // Cookie is set by server automatically (httpOnly)
                this._cachedUser = {
                    ...data.user,
                    loggedIn: true
                };
                this._authChecked = true;

                // Sync cart with server after login
                if (typeof API !== 'undefined' && API.cart) {
                    API.cart.syncWithServer().catch(() => {});
                }

                return { 
                    success: true, 
                    user: this._cachedUser, 
                    role: data.user.role || 'customer',
                    isNewUser: data.isNewUser 
                };
            }

            return { success: false, error: data.error || 'Google login failed' };
        } catch (error) {
            console.error('Google login error:', error);
            return { success: false, error: error.message || 'Google login failed. Please try again.' };
        }
    }

    // Google Login with authorization code (for popup flow)
    async googleLoginWithCode(code) {
        try {
            const useApi = await this.checkApi();
            if (!useApi) {
                return { success: false, error: 'Server connection failed. Please try again later.' };
            }

            const data = await this.apiRequest('/auth/google/code', {
                method: 'POST',
                body: JSON.stringify({ code })
            });

            if (data.success) {
                // Cookie is set by server automatically (httpOnly)
                this._cachedUser = {
                    ...data.user,
                    loggedIn: true
                };
                this._authChecked = true;

                if (typeof API !== 'undefined' && API.cart) {
                    API.cart.syncWithServer().catch(() => {});
                }

                return { 
                    success: true, 
                    user: this._cachedUser, 
                    role: data.user.role || 'customer',
                    isNewUser: data.isNewUser 
                };
            }

            return { success: false, error: data.error || 'Google login failed' };
        } catch (error) {
            console.error('Google code login error:', error);
            return { success: false, error: error.message || 'Google login failed. Please try again.' };
        }
    }

    // Facebook Login with access token
    async facebookLogin(accessToken) {
        try {
            const useApi = await this.checkApi();
            if (!useApi) {
                return { success: false, error: 'Server connection failed. Please try again later.' };
            }

            const data = await this.apiRequest('/auth/facebook', {
                method: 'POST',
                body: JSON.stringify({ accessToken })
            });

            if (data.success) {
                // Cookie is set by server automatically (httpOnly)
                this._cachedUser = {
                    ...data.user,
                    loggedIn: true
                };
                this._authChecked = true;

                // Sync cart with server after login
                if (typeof API !== 'undefined' && API.cart) {
                    API.cart.syncWithServer().catch(() => {});
                }

                return { 
                    success: true, 
                    user: this._cachedUser, 
                    role: data.user.role || 'customer',
                    isNewUser: data.isNewUser 
                };
            }

            return { success: false, error: data.error || 'Facebook login failed' };
        } catch (error) {
            console.error('Facebook login error:', error);
            return { success: false, error: error.message || 'Facebook login failed. Please try again.' };
        }
    }

    // Verify session is valid (via cookie)
    async verifyToken() {
        try {
            const data = await this.apiRequest('/auth/verify');
            return { valid: data.success, user: data.user };
        } catch (error) {
            return { valid: false };
        }
    }

    // Utility: Require authentication (redirects if not authenticated)
    async requireAuth(redirectTo = 'login.html') {
        const auth = await this.isAuthenticated();
        if (!auth.authenticated) {
            window.location.href = redirectTo + '?redirect=' + encodeURIComponent(window.location.pathname);
            return false;
        }
        return auth;
    }

    // Utility: Require admin authentication
    async requireAdminAuth(redirectTo = 'login.html') {
        const auth = await this.isAuthenticated();
        if (!auth.authenticated || auth.role !== 'admin') {
            window.location.href = redirectTo;
            return false;
        }
        return auth;
    }

    // Utility: Redirect if already authenticated
    async redirectIfAuthenticated(redirectTo = 'profile.html') {
        const auth = await this.isAuthenticated();
        if (auth.authenticated) {
            if (auth.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = redirectTo;
            }
            return true;
        }
        return false;
    }
}

// Create global instance
window.blackonnAuth = new BlackonnAuth();
// Kick off non-blocking auth rehydration
try { window.blackonnAuth._initAuth(); } catch (e) { /* ignore */ }
