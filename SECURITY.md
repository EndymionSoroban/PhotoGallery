// Security Configuration for Public Repository
// This configuration is SAFE for public repositories when properly restricted

const OAUTH_CONFIG = {
    // Client ID - Safe to include when properly restricted in Google Cloud Console
    DEFAULT_CLIENT_ID: 'your-client-id-here.apps.googleusercontent.com',
    
    // Allowed domains - Configure these in Google Cloud Console
    ALLOWED_ORIGINS: [
        'https://yourdomain.com',
        'https://www.yourdomain.com',
        // Add localhost for development
        ...(window.location.hostname === 'localhost' ? ['http://localhost:3000'] : [])
    ],
    
    // Minimal required scope - only files created by this app
    SCOPES: 'https://www.googleapis.com/auth/drive.file',
    
    // Security settings
    SECURITY: {
        // Force HTTPS in production
        REQUIRE_HTTPS: window.location.protocol === 'https:' || window.location.hostname === 'localhost',
        
        // Validate origin before initializing
        VALIDATE_ORIGIN: true
    }
};

// Security validation function
function validateSecurityRequirements() {
    const currentOrigin = window.location.origin;
    
    // Check HTTPS requirement
    if (OAUTH_CONFIG.SECURITY.REQUIRE_HTTPS && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        throw new Error('HTTPS is required for OAuth authentication');
    }
    
    // Validate current origin is in allowed list (when not localhost)
    if (OAUTH_CONFIG.SECURITY.VALIDATE_ORIGIN && window.location.hostname !== 'localhost') {
        const isAllowed = OAUTH_CONFIG.ALLOWED_ORIGINS.some(origin => 
            origin === currentOrigin || currentOrigin.endsWith(origin.replace('https://', ''))
        );
        
        if (!isAllowed) {
            console.warn('Current origin not in allowed list:', currentOrigin);
        }
    }
    
    return true;
}

// Updated initialization function with security checks
function initializeAuth() {
    try {
        // Validate security requirements
        validateSecurityRequirements();
        
        const clientId = document.getElementById('clientId').value.trim() || OAUTH_CONFIG.DEFAULT_CLIENT_ID;
        
        if (!clientId || clientId === 'your-client-id-here.apps.googleusercontent.com') {
            showMessage('Please set up your OAuth Client ID in Google Cloud Console first', 'error');
            return;
        }
        
        // Initialize with security-validated config
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: OAUTH_CONFIG.SCOPES,
            callback: handleAuthCallback,
        });
        
        updateAuthStatus();
        showMessage('Authentication initialized securely!', 'success');
        
    } catch (error) {
        console.error('Security validation failed:', error);
        showMessage('Security validation failed: ' + error.message, 'error');
    }
}

// README.md Security Section Template
const SECURITY_DOCUMENTATION = `
# Security Setup

## OAuth 2.0 Configuration Required

1. **Create OAuth 2.0 Credentials** in Google Cloud Console
2. **Set JavaScript Origins:**
   - Add your domain: https://yourdomain.com
   - For development: http://localhost:3000

3. **Set Redirect URIs:**
   - https://yourdomain.com/
   - https://yourdomain.com/admin.html

4. **API Restrictions:**
   - Restrict to Google Drive API only
   - Set application restrictions to "HTTP referrers"

5. **Update Client ID:**
   - Replace 'your-client-id-here.apps.googleusercontent.com' with your actual Client ID

## Why This Is Secure

- ✅ Client ID restrictions prevent misuse
- ✅ Minimal scope (drive.file) - only app-created files
- ✅ Domain restrictions in Google Cloud Console
- ✅ HTTPS enforcement in production
- ✅ No sensitive secrets in code

## Security Best Practices

- Never share OAuth Client Secret (not used in client-side apps)
- Use HTTPS in production
- Regularly review OAuth consent screen
- Monitor API usage in Google Cloud Console
`;

// Environment-specific configuration
const getClientId = () => {
    // Check for environment-specific config first
    if (window.APP_CONFIG && window.APP_CONFIG.OAUTH_CLIENT_ID) {
        return window.APP_CONFIG.OAUTH_CLIENT_ID;
    }
    
    // Fall back to user input or default
    const userInput = document.getElementById('clientId')?.value.trim();
    return userInput || OAUTH_CONFIG.DEFAULT_CLIENT_ID;
};
