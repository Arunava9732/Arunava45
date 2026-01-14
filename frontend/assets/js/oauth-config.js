// OAuth Configuration for BLACKONN
// Fetches OAuth credentials from server environment variables

(async function() {
    // Default to disabled
    window.GOOGLE_OAUTH_ENABLED = false;
    window.FACEBOOK_OAUTH_ENABLED = false;
    window.GOOGLE_CLIENT_ID = null;
    window.FACEBOOK_APP_ID = null;

    try {
        // Fetch OAuth config from backend
        const response = await fetch('/api/auth/oauth-config', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success) {
                // Google OAuth
                if (data.google && data.google.enabled && data.google.clientId) {
                    window.GOOGLE_OAUTH_ENABLED = true;
                    window.GOOGLE_CLIENT_ID = data.google.clientId;
                    console.log('Google OAuth enabled');
                    
                    // Load Google Identity Services SDK
                    loadGoogleSDK();
                }
                
                // Facebook OAuth
                if (data.facebook && data.facebook.enabled && data.facebook.appId) {
                    window.FACEBOOK_OAUTH_ENABLED = true;
                    window.FACEBOOK_APP_ID = data.facebook.appId;
                    console.log('Facebook OAuth enabled');
                    
                    // Load Facebook SDK
                    loadFacebookSDK(data.facebook.appId);
                }
            }
        }
    } catch (e) {
        console.log('OAuth config fetch failed, OAuth disabled:', e.message);
    }

    // Dispatch event so pages can update social login UI
    window.dispatchEvent(new CustomEvent('oauth-config-loaded'));
    
    // Load Google Identity Services SDK
    function loadGoogleSDK() {
        if (document.getElementById('google-gsi-sdk')) return;
        
        const script = document.createElement('script');
        script.id = 'google-gsi-sdk';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = function() {
            console.log('Google Identity Services SDK loaded');
            window.dispatchEvent(new CustomEvent('google-sdk-loaded'));
        };
        script.onerror = function() {
            console.error('Failed to load Google SDK');
        };
        document.head.appendChild(script);
    }
    
    // Load Facebook SDK helper
    function loadFacebookSDK(appId) {
        if (document.getElementById('facebook-jssdk')) return;
        
        window.fbAsyncInit = function() {
            FB.init({
                appId: appId,
                cookie: true,
                xfbml: true,
                version: 'v18.0'
            });
            console.log('Facebook SDK initialized');
            window.dispatchEvent(new CustomEvent('facebook-sdk-loaded'));
        };
        
        const script = document.createElement('script');
        script.id = 'facebook-jssdk';
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.onerror = function() {
            console.error('Failed to load Facebook SDK');
        };
        document.head.appendChild(script);
    }
})();

// ============ SETUP INSTRUCTIONS ============
// 
// To enable Google OAuth:
// 1. Go to https://console.cloud.google.com/apis/credentials
// 2. Create a new project (or select existing)
// 3. Click "Create Credentials" → "OAuth 2.0 Client ID"
// 4. Configure consent screen if prompted
// 5. Choose "Web application"
// 6. Add to "Authorized JavaScript origins":
//    - http://localhost:3000 (development)
//    - https://yourdomain.com (production)
// 7. Copy the Client ID
// 8. Add to backend/.env: GOOGLE_CLIENT_ID=your_client_id
//
// To enable Facebook OAuth:
// 1. Go to https://developers.facebook.com/apps/
// 2. Click "Create App" → Choose "Consumer"
// 3. Add "Facebook Login" product
// 4. Go to Facebook Login → Settings
// 5. Add to "Valid OAuth Redirect URIs":
//    - http://localhost:3000 (development)
//    - https://yourdomain.com (production)
// 6. Go to Settings → Basic, copy App ID
// 7. Add to backend/.env: FACEBOOK_APP_ID=your_app_id
//
// After setting up, restart the server for changes to take effect.
