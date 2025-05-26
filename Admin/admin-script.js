// Global variables
let imageData = [];
let groupData = [];
let isSignedIn = false;
let accessToken = null;
let tokenClient = null;
let projectTitle = 'My Gallery';
let tokenExpiryTime = null;
let refreshTimer = null;

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const metadataFileName = 'image-data.json';

// Storage keys for persistent authentication
const STORAGE_KEYS = {
    ACCESS_TOKEN: 'admin_access_token',
    EXPIRY_TIME: 'admin_token_expiry',
    SIGNED_IN: 'admin_signed_in',
    LAST_FOLDER: 'admin_last_folder',
    CLIENT_ID: 'admin_client_id'
};

// ========== HELPER FUNCTIONS ==========

// Improved thumbnail URL generation with better fallback chain (same as viewer)
function getThumbnailUrl(image) {
    // Priority order for thumbnail sources - prioritize the API-provided thumbnailLink
    if (image.thumbnailLink && image.thumbnailLink.includes('googleusercontent.com')) {
        return image.thumbnailLink;
    }
    
    if (image.thumbnailUrl && image.thumbnailUrl.includes('googleusercontent.com')) {
        return image.thumbnailUrl;
    }
    
    // If we have dataUrl (for newly uploaded images), use that
    if (image.dataUrl) {
        return image.dataUrl;
    }
    
    if (image.thumbnailLink && image.thumbnailLink.includes('drive.google.com')) {
        return image.thumbnailLink;
    }
    
    if (image.thumbnailUrl && image.thumbnailUrl.includes('drive.google.com')) {
        return image.thumbnailUrl;
    }
    
    // Only use the Drive thumbnail API as a last resort for Drive files
    if (image.driveFileId) {
        // Use Google Drive's thumbnail API with proper size
        return `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w300-h300`;
    }
    
    // Final fallback to placeholder
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjUwIiBoZWlnaHQ9IjIyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIiBzdHJva2U9IiNkZGQiIHN0cm9rZS13aWR0aD0iMiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
} // Test edit pages

// Improved image error handling with multiple retry attempts (same as viewer)
function setupImageErrorHandling(imgElement, image) {
    let attemptCount = 0;
    const maxAttempts = 4;
    
    imgElement.onerror = function() {
        attemptCount++;
        console.log(`Image load attempt ${attemptCount} failed for ${image.name}`);
        
        if (attemptCount === 1 && image.thumbnailLink && this.src !== image.thumbnailLink) {
            // Try original thumbnailLink from API
            console.log('Trying thumbnailLink:', image.thumbnailLink);
            this.src = image.thumbnailLink;
        } else if (attemptCount === 2 && image.driveFileId && !this.src.includes('sz=w150')) {
            // Try smaller thumbnail size
            const smallThumb = `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w150-h150`;
            console.log('Trying smaller thumbnail:', smallThumb);
            this.src = smallThumb;
        } else if (attemptCount === 3 && image.dataUrl && this.src !== image.dataUrl) {
            // Try dataUrl if available
            console.log('Trying dataUrl');
            this.src = image.dataUrl;
        } else if (attemptCount >= maxAttempts) {
            // Final fallback to placeholder
            console.log('Using fallback placeholder');
            this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjUwIiBoZWlnaHQ9IjIyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIiBzdHJva2U9IiNkZGQiIHN0cm9rZS13aWR0aD0iMiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
            this.style.backgroundColor = '#eee';
            this.style.padding = '20px';
            this.style.minHeight = '200px';
            this.style.display = 'flex';
            this.style.alignItems = 'center';
            this.style.justifyContent = 'center';
        }
    };
}

// Simple SHA-256 hash function
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Store authentication data
function storeAuthData(token, expiresInSeconds) {
    const expiryTime = Date.now() + (expiresInSeconds * 1000);
    
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.EXPIRY_TIME, expiryTime.toString());
    localStorage.setItem(STORAGE_KEYS.SIGNED_IN, 'true');
    
    tokenExpiryTime = expiryTime;
    
    // Set up automatic token refresh 5 minutes before expiry
    scheduleTokenRefresh(expiresInSeconds);
}

// Clear stored authentication data
function clearAuthData() {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.EXPIRY_TIME);
    localStorage.removeItem(STORAGE_KEYS.SIGNED_IN);
    
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
    
    tokenExpiryTime = null;
}

// Check for existing authentication
function checkExistingAuth() {
    const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const storedExpiry = localStorage.getItem(STORAGE_KEYS.EXPIRY_TIME);
    const wasSignedIn = localStorage.getItem(STORAGE_KEYS.SIGNED_IN) === 'true';
    
    if (storedToken && storedExpiry && wasSignedIn) {
        const expiryTime = parseInt(storedExpiry);
        const now = Date.now();
        
        // Check if token is still valid (with 5 minute buffer)
        if (expiryTime > now + (5 * 60 * 1000)) {
            accessToken = storedToken;
            tokenExpiryTime = expiryTime;
            isSignedIn = true;
            
            updateAuthStatus();
            showMessage('Welcome back! You are already signed in.', 'success');
            
            // Schedule refresh for remaining time
            const remainingSeconds = Math.floor((expiryTime - now) / 1000);
            scheduleTokenRefresh(remainingSeconds);
            
            // Auto-load existing data
            setTimeout(() => {
                loadFromGoogleDrive();
            }, 1000);
            
            return true;
        } else {
            // Token expired, clear stored data
            clearAuthData();
            showMessage('Your previous session has expired. Please sign in again.', 'info');
        }
    }
    
    return false;
}

// Schedule automatic token refresh
function scheduleTokenRefresh(expiresInSeconds) {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }
    
    // Refresh 5 minutes before expiry (or half the remaining time if less than 10 minutes)
    const refreshInSeconds = Math.max(expiresInSeconds - 300, expiresInSeconds / 2);
    
    if (refreshInSeconds > 0) {
        refreshTimer = setTimeout(() => {
            refreshToken();
        }, refreshInSeconds * 1000);
        
        console.log(`Token refresh scheduled in ${Math.floor(refreshInSeconds / 60)} minutes`);
    }
}

// Refresh the access token
function refreshToken() {
    if (!tokenClient) {
        showMessage('Authentication client not available for token refresh', 'error');
        return;
    }
    
    console.log('Refreshing access token...');
    
    try {
        tokenClient.requestAccessToken({
            prompt: '', // Don't show consent screen for refresh
            hint: localStorage.getItem('google_user_hint') // If we stored user hint
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        showMessage('Session expired. Please sign in again.', 'info');
        signOut();
    }
}

// Store last used folder and client ID
function storeUserPreferences() {
    const folderUrl = document.getElementById('driveFolder').value.trim();
    const clientId = document.getElementById('clientId').value.trim();
    
    if (folderUrl) {
        localStorage.setItem(STORAGE_KEYS.LAST_FOLDER, folderUrl);
    }
    
    if (clientId) {
        localStorage.setItem(STORAGE_KEYS.CLIENT_ID, clientId);
    }
}

// Restore user preferences
function restoreUserPreferences() {
    const lastFolder = localStorage.getItem(STORAGE_KEYS.LAST_FOLDER);
    const lastClientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
    
    if (lastFolder) {
        document.getElementById('driveFolder').value = lastFolder;
        const folderInfo = getCurrentFolderInfo();
        document.getElementById('selectedFolder').textContent = `Selected: ${folderInfo.name}`;
    }
    
    if (lastClientId) {
        document.getElementById('clientId').value = lastClientId;
    }
}

// On page load
document.addEventListener('DOMContentLoaded', function () {
    // Restore user preferences first
    restoreUserPreferences();
    
    initializeDefaultData();
    setupEventListeners();
    initPasswordProtection();
    initTitleSettings();

    // Check for existing authentication
    const wasSignedIn = checkExistingAuth();
    
    // If not already signed in, try to auto-initialize with stored client ID
    if (!wasSignedIn) {
        const storedClientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
        if (storedClientId) {
            // Auto-initialize with stored client ID
            setTimeout(() => {
                initializeAuth();
            }, 500);
        }
    }

    // Toggle navigation visibility
    document.getElementById('toggle-nav').addEventListener('click', function () {
        const nav = document.getElementById('group-navigation');
        nav.style.display = nav.style.display === 'none' ? 'block' : 'none';
    });

    // Group search functionality
    document.getElementById('group-search').addEventListener('input', function () {
        const searchTerm = this.value.toLowerCase();
        const items = document.querySelectorAll('.group-nav-item');

        items.forEach(item => {
            const groupName = item.textContent.toLowerCase();
            if (groupName.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });

    // Update folder display when URL changes
    document.getElementById('driveFolder').addEventListener('input', function() {
        const folderInfo = getCurrentFolderInfo();
        document.getElementById('selectedFolder').textContent = `Selected: ${folderInfo.name}`;
        
        // Hide previous scan results when folder changes
        document.getElementById('folder-scan-results').style.display = 'none';
        
        // Store preference
        storeUserPreferences();
    });

    // Store client ID when it changes
    document.getElementById('clientId').addEventListener('input', function() {
        storeUserPreferences();
    });
});

// Initialize Google Identity Services
function initializeAuth() {
    const clientId = document.getElementById('clientId').value.trim();
    
    if (!clientId) {
        showMessage('Please enter your OAuth Client ID', 'error');
        return;
    }
    
    // Store the client ID for future use
    storeUserPreferences();
    
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: (response) => {
                if (response.error !== undefined) {
                    console.error('Token error:', response);
                    showMessage('Authentication error: ' + response.error, 'error');
                    clearAuthData();
                    return;
                }
                
                accessToken = response.access_token;
                isSignedIn = true;
                
                // Store authentication data for persistence
                const expiresIn = response.expires_in || 3600; // Default to 1 hour if not provided
                storeAuthData(accessToken, expiresIn);
                
                updateAuthStatus();
                showMessage('Successfully authenticated with Google Drive!', 'success');
                
                // Store folder preference
                storeUserPreferences();
                
                // Try to load existing data from Google Drive
                loadFromGoogleDrive();
            },
        });
        
        const signInDiv = document.getElementById('signInDiv');
        signInDiv.innerHTML = '<button onclick="requestAuth()" style="background: #4285f4; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 16px;">🔐 Sign in with Google</button>';
        
        updateAuthStatus();
        showMessage('Authentication initialized! Click "Sign in with Google" to continue.', 'success');
        
    } catch (error) {
        console.error('Error initializing authentication:', error);
        showMessage('Error initializing authentication: ' + error.message, 'error');
    }
}

// Request authentication
function requestAuth() {
    if (tokenClient) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        showMessage('Please initialize authentication first', 'error');
    }
}

// Sign out function
function signOut() {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken, () => {
            console.log('Access token revoked');
        });
    }
    
    // Clear all stored authentication data
    clearAuthData();
    
    accessToken = null;
    isSignedIn = false;
    updateAuthStatus();
    showMessage('Signed out successfully! Your session has been cleared.', 'info');
    
    // Clear the gallery data but keep user preferences
    imageData = [];
    groupData = [];
    renderGroups();
    updateGroupNavigationBar();
}

// Update authentication status
function updateAuthStatus() {
    const statusText = document.getElementById('statusText');
    const authStatus = document.getElementById('authStatus');
    const signOutBtn = document.getElementById('signOutBtn');
    const fileUpload = document.getElementById('file-upload');
    
    authStatus.style.display = 'block';
    
    if (isSignedIn) {
        statusText.textContent = 'Signed in ✓';
        statusText.style.color = 'green';
        signOutBtn.style.display = 'inline-block';
        fileUpload.disabled = false;
        
        // Show token expiry info
        if (tokenExpiryTime) {
            const remainingMinutes = Math.floor((tokenExpiryTime - Date.now()) / (1000 * 60));
            if (remainingMinutes > 0) {
                statusText.textContent += ` (expires in ${remainingMinutes}m)`;
            }
        }
        
        // Enable folder operation buttons
        document.getElementById('load-folder-btn').disabled = false;
        document.getElementById('scan-images-btn').disabled = false;
    } else {
        statusText.textContent = tokenClient ? 'Ready to sign in' : 'Not initialized';
        statusText.style.color = tokenClient ? 'orange' : 'red';
        signOutBtn.style.display = 'none';
        fileUpload.disabled = true;
        
        // Disable folder operation buttons
        document.getElementById('load-folder-btn').disabled = true;
        document.getElementById('scan-images-btn').disabled = true;
    }
}

// Extract folder ID from Google Drive URL
function extractFolderIdFromUrl(url) {
    if (!url || url.trim() === '') {
        return null;
    }
    
    const patterns = [
        /\/folders\/([a-zA-Z0-9-_]+)/,
        /[?&]id=([a-zA-Z0-9-_]+)/,
        /\/drive\/([a-zA-Z0-9-_]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    
    return url.trim();
}

// Get current folder info
function getCurrentFolderInfo() {
    const folderUrl = document.getElementById('driveFolder').value.trim();
    
    if (!folderUrl) {
        return {
            id: null,
            name: 'Root Folder (My Drive)'
        };
    }
    
    const folderId = extractFolderIdFromUrl(folderUrl);
    return {
        id: folderId,
        name: `Custom Folder (${folderId?.substring(0, 8)}...)`
    };
}

// Load from Google Drive
async function loadFromGoogleDrive() {
    if (!isSignedIn || !accessToken) {
        return;
    }

    try {
        showMessage('Looking for existing image-data.json in Google Drive...', 'info');

        const folderInfo = getCurrentFolderInfo();
        
        // First, check if there's a JSON configuration file
        let jsonConfig = null;
        try {
            let searchQuery = `name='${metadataFileName}' and trashed=false`;
            if (folderInfo.id) {
                searchQuery += ` and '${folderInfo.id}' in parents`;
            } else {
                searchQuery += ` and parents in 'root'`;
            }

            const jsonResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (jsonResponse.ok) {
                const jsonSearchResult = await jsonResponse.json();
                
                if (jsonSearchResult.files && jsonSearchResult.files.length > 0) {
                    const jsonFileId = jsonSearchResult.files[0].id;
                    
                    // Download the JSON file content
                    const contentResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${jsonFileId}?alt=media`, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });

                    if (contentResponse.ok) {
                        jsonConfig = await contentResponse.json();
                        showMessage('Found gallery configuration! Loading with fresh thumbnails...', 'info');
                    }
                }
            }
        } catch (error) {
            console.warn('Could not load JSON config:', error);
        }

        if (jsonConfig) {
            // We have JSON config, now get fresh thumbnail data from Drive API
            let query = "(mimeType contains 'image/' or name contains '.jpg' or name contains '.jpeg' or name contains '.png' or name contains '.gif' or name contains '.webp' or name contains '.bmp') and trashed=false and not name contains '.json'";
            if (folderInfo.id) {
                query += ` and '${folderInfo.id}' in parents`;
            } else {
                query += " and 'root' in parents";
            }

            const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
                q: query,
                fields: 'files(id, name, size, mimeType, thumbnailLink, createdTime, webViewLink)',
                orderBy: 'name',
                pageSize: '1000'
            });

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                }
            });

            if (response.ok) {
                const data = await response.json();
                const driveImages = data.files || [];

                console.log(`Found ${driveImages.length} files in Google Drive`);

                // Create a mapping of driveFileId to fresh Drive data
                const driveImageMap = new Map();
                driveImages.forEach(file => {
                    driveImageMap.set(file.id, file);
                });

                // Merge JSON config with fresh thumbnail data
                imageData = jsonConfig.images.map(img => {
                    const freshDriveData = driveImageMap.get(img.driveFileId);
                    
                    if (freshDriveData) {
                        // Use fresh thumbnail data from Drive API
                        return {
                            ...img,
                            thumbnailUrl: freshDriveData.thumbnailLink,
                            thumbnailLink: freshDriveData.thumbnailLink,
                            // Keep other metadata from JSON
                        };
                    } else {
                        // Keep original if not found in current Drive scan
                        return img;
                    }
                });

                groupData = jsonConfig.groups || [{ id: 'default', name: 'Default Group', order: 0 }];
                projectTitle = jsonConfig.projectTitle || 'My Gallery';
                
                // Update UI with loaded project title
                updateTitleStatus();
                
                renderGroups();
                updateGroupNavigationBar();
                updatePasswordStatus();
                showMessage('Data loaded from Google Drive with fresh thumbnails!', 'success');
                return;
            }
        }
        
        // If no file found or error, start fresh
        showMessage('No existing data found in Google Drive. Starting fresh.', 'info');
        initializeDefaultData();
        
    } catch (error) {
        console.error('Error loading from Google Drive:', error);
        showMessage('Error loading from Google Drive: ' + error.message, 'error');
        initializeDefaultData();
    }
}

// Initialize with default data
function initializeDefaultData() {
    imageData = [];
    groupData = [{ id: 'default', name: 'Default Group', order: 0 }];
    projectTitle = 'My Gallery';
    updateTitleStatus();
    renderGroups();
    updateGroupNavigationBar();
    updatePasswordStatus();
}

// Load existing gallery from current folder
async function loadExistingGallery() {
    if (!isSignedIn || !accessToken) {
        showMessage('Please sign in to Google Drive first', 'error');
        return;
    }

    try {
        showMessage('Loading existing gallery from folder...', 'info');
        await loadFromGoogleDrive();
    } catch (error) {
        console.error('Error loading existing gallery:', error);
        showMessage('Error loading existing gallery: ' + error.message, 'error');
    }
}

// Scan folder for images
async function scanFolderForImages() {
    if (!isSignedIn || !accessToken) {
        showMessage('Please sign in to Google Drive first', 'error');
        return;
    }

    try {
        showMessage('Scanning folder for images...', 'info');
        
        const folderInfo = getCurrentFolderInfo();
        let searchQuery = "trashed=false and (mimeType contains 'image/' or name contains '.jpg' or name contains '.jpeg' or name contains '.png' or name contains '.gif' or name contains '.webp')";
        
        if (folderInfo.id) {
            searchQuery += ` and '${folderInfo.id}' in parents`;
        } else {
            searchQuery += ` and parents in 'root'`;
        }

        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,mimeType,size,createdTime,webViewLink,thumbnailLink)`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            const foundImages = result.files || [];
            
            displayFoundImages(foundImages);
            
            if (foundImages.length > 0) {
                showMessage(`Found ${foundImages.length} image(s) in the folder!`, 'success');
            } else {
                showMessage('No images found in the selected folder.', 'info');
            }
        } else {
            throw new Error('Failed to scan folder');
        }

    } catch (error) {
        console.error('Error scanning folder:', error);
        showMessage('Error scanning folder: ' + error.message, 'error');
    }
}

// Display found images with import options
function displayFoundImages(foundImages) {
    const resultsDiv = document.getElementById('folder-scan-results');
    const summaryDiv = document.getElementById('scan-summary');
    const imagesDiv = document.getElementById('found-images');
    
    resultsDiv.style.display = 'block';
    
    // Update summary
    summaryDiv.innerHTML = `
        <p><strong>${foundImages.length}</strong> image(s) found in folder</p>
        <button onclick="importAllImages()" style="background-color: #28a745; margin-right: 10px;">Import All Images</button>
        <button onclick="clearScanResults()" style="background-color: #6c757d;">Clear Results</button>
    `;
    
    // Clear previous results
    imagesDiv.innerHTML = '';
    
    // Store found images globally for import functions
    window.foundImages = foundImages;
    
    // Display each image
    foundImages.forEach((image, index) => {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'found-image-item';
        imageDiv.setAttribute('data-image-index', index);
        
        // Use the same thumbnail pattern as viewer: thumbnailLink from API or fallback
        const thumbnailSrc = image.thumbnailLink || `https://drive.google.com/thumbnail?id=${image.id}&sz=w60-h60`;
        
        imageDiv.innerHTML = `
            <img src="${thumbnailSrc}" 
                 class="found-image-thumbnail" 
                 alt="${image.name}"
                 onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;60&quot; height=&quot;60&quot; viewBox=&quot;0 0 24 24&quot;><rect fill=&quot;%23f8f9fa&quot; width=&quot;24&quot; height=&quot;24&quot;/><text fill=&quot;%23343a40&quot; font-family=&quot;Arial&quot; font-size=&quot;3&quot; x=&quot;12&quot; y=&quot;12&quot; text-anchor=&quot;middle&quot;>IMG</text></svg>'">
            <div class="found-image-info">
                <div class="found-image-name">${image.name}</div>
                <div class="found-image-details">
                    Size: ${formatFileSize(image.size || 0)} | 
                    Created: ${new Date(image.createdTime).toLocaleDateString()}
                </div>
            </div>
            <div class="import-controls">
                <select id="group-select-${index}">
                    ${groupData.filter(g => g.id !== 'password-settings').map(group => 
                        `<option value="${group.id}"${group.id === 'default' ? ' selected' : ''}>${group.name}</option>`
                    ).join('')}
                </select>
                <button onclick="importSingleImage(${index})" style="background-color: #007bff;">Import</button>
            </div>
        `;
        
        imagesDiv.appendChild(imageDiv);
    });
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Import all found images
async function importAllImages() {
    if (!window.foundImages || window.foundImages.length === 0) {
        showMessage('No images to import', 'error');
        return;
    }
    
    try {
        showMessage(`Importing ${window.foundImages.length} image(s)...`, 'info');
        showProgress(0);
        
        for (let i = 0; i < window.foundImages.length; i++) {
            const image = window.foundImages[i];
            const groupSelect = document.getElementById(`group-select-${i}`);
            const targetGroupId = groupSelect ? groupSelect.value : 'default';
            
            await importImageFromDrive(image, targetGroupId);
            
            // Update progress
            const percentComplete = ((i + 1) / window.foundImages.length) * 100;
            showProgress(percentComplete);
        }
        
        hideProgress();
        renderGroups();
        updateGroupNavigationBar();
        clearScanResults();
        
        showMessage(`Successfully imported ${window.foundImages.length} image(s)!`, 'success');
        
    } catch (error) {
        hideProgress();
        showMessage('Error importing images: ' + error.message, 'error');
    }
}

// Import single image
async function importSingleImage(index) {
    if (!window.foundImages || !window.foundImages[index]) {
        showMessage('Image not found', 'error');
        return;
    }
    
    try {
        const image = window.foundImages[index];
        const groupSelect = document.getElementById(`group-select-${index}`);
        const targetGroupId = groupSelect ? groupSelect.value : 'default';
        
        showMessage(`Importing ${image.name}...`, 'info');
        
        await importImageFromDrive(image, targetGroupId);
        
        renderGroups();
        updateGroupNavigationBar();
        
        // Remove the imported image from the scan results
        const imageDiv = document.querySelector(`[data-image-index="${index}"]`);
        if (imageDiv) {
            imageDiv.style.opacity = '0.5';
            imageDiv.innerHTML += '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(40, 167, 69, 0.9); color: white; padding: 5px; border-radius: 3px; font-size: 12px;">✓ Imported</div>';
        }
        
        showMessage(`Successfully imported ${image.name}!`, 'success');
        
    } catch (error) {
        showMessage('Error importing image: ' + error.message, 'error');
    }
}

// Import image from Google Drive (already existing in Drive)
async function importImageFromDrive(driveImage, targetGroupId = 'default') {
    const uniqueId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    
    // Create image object for existing Drive file
    const newImage = {
        id: uniqueId,
        name: driveImage.name,
        path: `https://drive.google.com/uc?id=${driveImage.id}`,
        driveFileId: driveImage.id,
        originalName: driveImage.name,
        dateAdded: new Date().toISOString(),
        order: getNextOrderForGroup(targetGroupId),
        groupId: targetGroupId,
        size: parseInt(driveImage.size) || 0,
        description: '',
        // Use the same thumbnailLink as the API provides
        thumbnailUrl: driveImage.thumbnailLink,
        thumbnailLink: driveImage.thumbnailLink
    };
    
    imageData.push(newImage);
}

// Clear scan results
function clearScanResults() {
    document.getElementById('folder-scan-results').style.display = 'none';
    window.foundImages = null;
}

// Save to Google Drive
async function saveImageData() {
    if (!isSignedIn || !accessToken) {
        showMessage('Please sign in to Google Drive first', 'error');
        return;
    }

    try {
        showMessage('Saving to Google Drive...', 'info');

        // Prepare data
        const completeData = {
            projectTitle: projectTitle,
            images: imageData.map(img => {
                const { dataUrl, tempUrl, ...cleanImg } = img;
                return cleanImg;
            }),
            groups: groupData
        };

        const jsonContent = JSON.stringify(completeData, null, 2);
        const folderInfo = getCurrentFolderInfo();

        // Check if file already exists
        let searchQuery = `name='${metadataFileName}' and trashed=false`;
        if (folderInfo.id) {
            searchQuery += ` and '${folderInfo.id}' in parents`;
        } else {
            searchQuery += ` and parents in 'root'`;
        }

        const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        let fileId = null;
        if (searchResponse.ok) {
            const searchResult = await searchResponse.json();
            if (searchResult.files && searchResult.files.length > 0) {
                fileId = searchResult.files[0].id;
            }
        }

        if (fileId) {
            // Update existing file
            const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: jsonContent
            });

            if (response.ok) {
                showMessage('Data updated successfully in Google Drive!', 'success');
            } else {
                throw new Error('Failed to update file');
            }
        } else {
            // Create new file
            const metadata = {
                name: metadataFileName,
                parents: folderInfo.id ? [folderInfo.id] : undefined
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
            form.append('file', new Blob([jsonContent], {type: 'application/json'}));

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                body: form
            });

            if (response.ok) {
                showMessage('Data saved successfully to Google Drive!', 'success');
            } else {
                throw new Error('Failed to create file');
            }
        }

    } catch (error) {
        console.error('Error saving to Google Drive:', error);
        showMessage('Error saving to Google Drive: ' + error.message, 'error');
    }
}

// Upload image to Google Drive
async function uploadImageToGoogleDrive(file, targetGroupId = 'default') {
    if (!isSignedIn || !accessToken) {
        showMessage('Please sign in to Google Drive first', 'error');
        return null;
    }

    try {
        const folderInfo = getCurrentFolderInfo();
        
        // Prepare metadata
        const metadata = {
            name: file.name,
            parents: folderInfo.id ? [folderInfo.id] : undefined
        };

        // Create form data
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
        form.append('file', file);

        // Upload with progress
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: form
        });

        if (response.ok) {
            const result = await response.json();
            return result.id; // Return the Google Drive file ID
        } else {
            throw new Error('Upload failed');
        }

    } catch (error) {
        console.error('Error uploading to Google Drive:', error);
        throw error;
    }
}

// Handle image upload
async function handleImageUpload(files, targetGroupId = 'default') {
    if (!files || files.length === 0) return;

    if (!isSignedIn || !accessToken) {
        showMessage('Please sign in to Google Drive first', 'error');
        return;
    }

    showMessage(`Uploading ${files.length} image(s) to Google Drive...`, 'info');
    showProgress(0);

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const uniqueId = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

            // Show progress
            const percentComplete = ((i + 1) / files.length) * 100;
            showProgress(percentComplete);

            // Upload to Google Drive
            const driveFileId = await uploadImageToGoogleDrive(file, targetGroupId);
            
            // Create data URL for preview
            const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            });

            // Create image object
            const newImage = {
                id: uniqueId,
                name: file.name,
                path: `https://drive.google.com/uc?id=${driveFileId}`, // Google Drive direct link
                driveFileId: driveFileId,
                originalName: file.name,
                dateAdded: new Date().toISOString(),
                order: getNextOrderForGroup(targetGroupId),
                groupId: targetGroupId,
                size: file.size,
                description: '',
                dataUrl: dataUrl // Keep for preview
            };

            imageData.push(newImage);
        }

        hideProgress();
        renderGroups();
        updateGroupNavigationBar();
        showMessage(`${files.length} image(s) uploaded successfully!`, 'success');

        // Scroll to the target group
        const targetGroupElement = document.getElementById(`group-${targetGroupId}`);
        if (targetGroupElement) {
            targetGroupElement.scrollIntoView({ behavior: 'smooth' });
        }

    } catch (error) {
        hideProgress();
        showMessage('Error uploading images: ' + error.message, 'error');
    }
}

// Show/hide progress bar
function showProgress(percent) {
    const progressBar = document.getElementById('progressBar');
    const progressBarFill = document.getElementById('progressBarFill');
    
    progressBar.style.display = 'block';
    progressBarFill.style.width = `${percent}%`;
}

function hideProgress() {
    document.getElementById('progressBar').style.display = 'none';
}

// Update the group navigation bar
function updateGroupNavigationBar() {
    const navContainer = document.getElementById('group-nav-items');
    navContainer.innerHTML = '';

    const sortedGroups = [...groupData]
        .filter(group => group.id !== 'password-settings')
        .sort((a, b) => a.order - b.order);

    sortedGroups.forEach((group, index) => {
        // Create drop indicator for before this group
        const dropIndicator = document.createElement('div');
        dropIndicator.className = 'group-drop-indicator';
        dropIndicator.setAttribute('data-drop-position', 'before');
        dropIndicator.setAttribute('data-group-order', group.order);
        navContainer.appendChild(dropIndicator);

        const groupItem = document.createElement('div');
        groupItem.className = 'group-nav-item';
        groupItem.textContent = group.name;
        groupItem.setAttribute('data-group-id', group.id);
        groupItem.setAttribute('data-group-order', group.order);
        groupItem.draggable = true;

        // Click to scroll to group
        groupItem.addEventListener('click', function (e) {
            if (!e.target.closest('.group-nav-item').classList.contains('dragging')) {
                const targetGroup = document.getElementById(`group-${group.id}`);
                if (targetGroup) {
                    targetGroup.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });

        // Drag and drop for group reordering
        groupItem.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('text/plain', group.id);
            e.dataTransfer.setData('application/x-group-order', group.order.toString());
            setTimeout(() => {
                this.classList.add('dragging');
            }, 0);
        });

        groupItem.addEventListener('dragend', function () {
            this.classList.remove('dragging');
            // Hide all drop indicators
            document.querySelectorAll('.group-drop-indicator').forEach(indicator => {
                indicator.classList.remove('active');
            });
        });

        groupItem.addEventListener('dragover', function (e) {
            e.preventDefault();
            const rect = this.getBoundingClientRect();
            const y = e.clientY;
            const relativeY = y - rect.top;
            const isInTopHalf = relativeY < rect.height / 2;

            // Hide all indicators first
            document.querySelectorAll('.group-drop-indicator').forEach(indicator => {
                indicator.classList.remove('active');
            });

            // Show appropriate indicator
            if (isInTopHalf) {
                const beforeIndicator = this.previousElementSibling;
                if (beforeIndicator && beforeIndicator.classList.contains('group-drop-indicator')) {
                    beforeIndicator.classList.add('active');
                }
            } else {
                const afterIndicator = this.nextElementSibling;
                if (afterIndicator && afterIndicator.classList.contains('group-drop-indicator')) {
                    afterIndicator.classList.add('active');
                }
            }
        });

        groupItem.addEventListener('drop', function (e) {
            e.preventDefault();
            const draggedGroupId = e.dataTransfer.getData('text/plain');
            
            if (draggedGroupId === group.id) return; // Can't drop on itself

            const rect = this.getBoundingClientRect();
            const y = e.clientY;
            const relativeY = y - rect.top;
            const isInTopHalf = relativeY < rect.height / 2;

            reorderGroup(draggedGroupId, group.id, isInTopHalf ? 'before' : 'after');

            // Hide all drop indicators
            document.querySelectorAll('.group-drop-indicator').forEach(indicator => {
                indicator.classList.remove('active');
            });
        });

        navContainer.appendChild(groupItem);

        // Add drop indicator after the last group
        if (index === sortedGroups.length - 1) {
            const lastDropIndicator = document.createElement('div');
            lastDropIndicator.className = 'group-drop-indicator';
            lastDropIndicator.setAttribute('data-drop-position', 'after');
            lastDropIndicator.setAttribute('data-group-order', (group.order + 1).toString());
            navContainer.appendChild(lastDropIndicator);
        }
    });

    // Add event listeners to drop indicators
    document.querySelectorAll('.group-drop-indicator').forEach(indicator => {
        indicator.addEventListener('dragover', function (e) {
            e.preventDefault();
            this.classList.add('active');
        });

        indicator.addEventListener('dragleave', function () {
            this.classList.remove('active');
        });

        indicator.addEventListener('drop', function (e) {
            e.preventDefault();
            const draggedGroupId = e.dataTransfer.getData('text/plain');
            const position = this.getAttribute('data-drop-position');
            const targetOrder = parseInt(this.getAttribute('data-group-order'));

            reorderGroupByOrder(draggedGroupId, targetOrder, position);
            
            this.classList.remove('active');
        });
    });
}

// Reorder group relative to another group
function reorderGroup(draggedGroupId, targetGroupId, position) {
    const draggedGroupIndex = groupData.findIndex(g => g.id === draggedGroupId);
    const targetGroupIndex = groupData.findIndex(g => g.id === targetGroupId);

    if (draggedGroupIndex === -1 || targetGroupIndex === -1) return;

    const draggedGroup = groupData[draggedGroupIndex];
    const targetGroup = groupData[targetGroupIndex];

    // Remove dragged group
    groupData.splice(draggedGroupIndex, 1);

    // Find new target index (may have shifted)
    const newTargetIndex = groupData.findIndex(g => g.id === targetGroupId);

    // Insert at new position
    if (position === 'before') {
        groupData.splice(newTargetIndex, 0, draggedGroup);
    } else {
        groupData.splice(newTargetIndex + 1, 0, draggedGroup);
    }

    // Update order values
    updateGroupOrders();
    
    // Re-render
    renderGroups();
    updateGroupNavigationBar();
    
    showMessage(`Group "${draggedGroup.name}" moved ${position} "${targetGroup.name}"`, 'success');
}

// Reorder group by absolute order position
function reorderGroupByOrder(draggedGroupId, targetOrder, position) {
    const draggedGroupIndex = groupData.findIndex(g => g.id === draggedGroupId);
    if (draggedGroupIndex === -1) return;

    const draggedGroup = groupData[draggedGroupIndex];
    
    // Remove dragged group
    groupData.splice(draggedGroupIndex, 1);

    // Filter out password settings and sort by order
    const visibleGroups = groupData.filter(g => g.id !== 'password-settings').sort((a, b) => a.order - b.order);
    
    // Find insertion point
    let insertIndex = 0;
    if (position === 'before') {
        insertIndex = visibleGroups.findIndex(g => g.order >= targetOrder);
        if (insertIndex === -1) insertIndex = visibleGroups.length;
    } else {
        insertIndex = visibleGroups.findIndex(g => g.order > targetOrder);
        if (insertIndex === -1) insertIndex = visibleGroups.length;
    }

    // Insert back into full array at correct position
    const fullInsertIndex = groupData.findIndex(g => g.id === (visibleGroups[insertIndex] ? visibleGroups[insertIndex].id : null));
    if (fullInsertIndex !== -1) {
        groupData.splice(fullInsertIndex, 0, draggedGroup);
    } else {
        groupData.push(draggedGroup);
    }

    // Update order values
    updateGroupOrders();
    
    // Re-render
    renderGroups();
    updateGroupNavigationBar();
    
    showMessage(`Group "${draggedGroup.name}" reordered`, 'success');
}

// Update group order values
function updateGroupOrders() {
    const visibleGroups = groupData.filter(g => g.id !== 'password-settings');
    visibleGroups.forEach((group, index) => {
        group.order = index;
    });
}

// Render groups and their images
function renderGroups() {
    const container = document.getElementById('image-groups-container');
    container.innerHTML = '';

    const sortedGroups = [...groupData]
        .filter(group => group.id !== 'password-settings')
        .sort((a, b) => a.order - b.order);

    sortedGroups.forEach(group => {
        // Create group header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';
        groupHeader.id = `group-${group.id}`;

        const groupTitle = document.createElement('h3');
        groupTitle.textContent = group.name;

        const groupActions = document.createElement('div');
        groupActions.className = 'group-actions';

        if (group.id !== 'default') {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete';
            deleteBtn.textContent = 'Delete Group';
            deleteBtn.onclick = () => deleteGroup(group.id);
            groupActions.appendChild(deleteBtn);
        }

        groupHeader.appendChild(groupTitle);
        groupHeader.appendChild(groupActions);

        // Add group-specific upload area
        const groupUploadArea = document.createElement('div');
        groupUploadArea.className = 'upload-container';
        groupUploadArea.style.marginTop = '10px';
        groupUploadArea.style.marginBottom = '15px';
        groupUploadArea.style.padding = '10px';

        const uploadText = document.createElement('p');
        uploadText.innerHTML = `<strong>Upload to ${group.name}:</strong> Drop images here or`;

        const uploadInput = document.createElement('input');
        uploadInput.type = 'file';
        uploadInput.accept = 'image/*';
        uploadInput.multiple = true;
        uploadInput.id = `file-upload-${group.id}`;
        uploadInput.style.display = 'inline-block';
        uploadInput.style.marginLeft = '5px';
        uploadInput.disabled = !isSignedIn;

        // Event listener for file selection
        uploadInput.addEventListener('change', function (e) {
            handleImageUpload(e.target.files, group.id);
        });

        // Drag and drop for this specific group
        groupUploadArea.addEventListener('dragover', function (e) {
            e.preventDefault();
            if (isSignedIn) {
                this.style.backgroundColor = '#f0f0f0';
            }
        });

        groupUploadArea.addEventListener('dragleave', function () {
            this.style.backgroundColor = '';
        });

        groupUploadArea.addEventListener('drop', function (e) {
            e.preventDefault();
            this.style.backgroundColor = '';
            if (isSignedIn) {
                handleImageUpload(e.dataTransfer.files, group.id);
            } else {
                showMessage('Please sign in to Google Drive first', 'error');
            }
        });

        uploadText.appendChild(uploadInput);
        groupUploadArea.appendChild(uploadText);

        // Create image grid for this group
        const groupGrid = document.createElement('div');
        groupGrid.className = 'image-grid';
        groupGrid.setAttribute('data-group-id', group.id);

        // Filter images for this group
        const groupImages = imageData.filter(image => image.groupId === group.id);

        // Sort by order if available, otherwise by date
        groupImages.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
            }
            return new Date(b.dateAdded || Date.now()) - new Date(a.dateAdded || Date.now());
        });

        // Update order property based on current array position
        groupImages.forEach((image, index) => {
            image.order = index;
        });

        // Add drop zone for empty groups
        if (groupImages.length === 0) {
            const emptyDropZone = document.createElement('div');
            emptyDropZone.className = 'empty-group-drop-zone';
            emptyDropZone.style.cssText = `
                min-height: 100px;
                border: 2px dashed #ccc;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #666;
                font-style: italic;
                margin: 10px 0;
            `;
            emptyDropZone.textContent = 'Drop images here';
            groupGrid.appendChild(emptyDropZone);
        }

        // Create HTML elements for each image
        groupImages.forEach((image, index) => {
            const container = document.createElement('div');
            container.className = 'image-container';
            container.setAttribute('data-id', image.id);
            container.draggable = true;

            const img = document.createElement('img');
            // Use the improved thumbnail URL function
            img.src = getThumbnailUrl(image);
            img.alt = image.name || 'Image';

            // Set up improved error handling
            setupImageErrorHandling(img, image);

            const actions = document.createElement('div');
            actions.className = 'image-actions';

            const handle = document.createElement('span');
            handle.className = 'drag-handle';
            handle.textContent = '☰';

            // Group selector
            const groupSelect = document.createElement('select');
            groupSelect.className = 'image-group-select';

            // Add options for each group (excluding password settings)
            groupData.forEach(g => {
                if (g.id !== 'password-settings') {
                    const option = document.createElement('option');
                    option.value = g.id;
                    option.textContent = g.name;
                    option.selected = g.id === image.groupId;
                    groupSelect.appendChild(option);
                }
            });

            // Event listener to change group
            groupSelect.addEventListener('change', function () {
                image.groupId = this.value;
                renderGroups(); // Re-render to move image to new group
            });

            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download';
            downloadBtn.style.backgroundColor = '#2196F3';
            downloadBtn.style.marginRight = '5px';
            downloadBtn.onclick = () => downloadImage(image);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete';
            deleteBtn.textContent = 'Delete';
            deleteBtn.onclick = () => deleteImage(image.id);

            actions.appendChild(handle);

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '5px';
            buttonContainer.appendChild(downloadBtn);
            buttonContainer.appendChild(deleteBtn);

            actions.appendChild(buttonContainer);

            // Add description textarea
            const descriptionArea = document.createElement('textarea');
            descriptionArea.className = 'image-description';
            descriptionArea.placeholder = 'Add image description...';
            descriptionArea.value = image.description || '';
            descriptionArea.addEventListener('change', function () {
                image.description = this.value;
                showMessage('Description updated. Remember to save your changes.', 'success');
            });

            container.appendChild(img);
            container.appendChild(document.createElement('br'));
            container.appendChild(descriptionArea);
            container.appendChild(groupSelect);
            container.appendChild(actions);

            // Add drop indicators for precise positioning
            const topDropIndicator = document.createElement('div');
            topDropIndicator.className = 'drop-indicator';
            topDropIndicator.dataset.position = 'before';
            topDropIndicator.dataset.imageId = image.id;

            // Insert container with indicators
            const wrapperDiv = document.createElement('div');
            wrapperDiv.style.position = 'relative';
            wrapperDiv.appendChild(topDropIndicator);
            wrapperDiv.appendChild(container);

            groupGrid.appendChild(wrapperDiv);
        });

        // Add group header and grid to main container
        container.appendChild(groupHeader);
        container.appendChild(groupUploadArea);
        container.appendChild(groupGrid);
    });

    setupDragAndDrop();
}

// Setup drag and drop for reordering
function setupDragAndDrop() {
    const containers = document.querySelectorAll('.image-container');
    const imageGrids = document.querySelectorAll('.image-grid');
    const dropIndicators = document.querySelectorAll('.drop-indicator');

    // Hide all drop indicators initially
    dropIndicators.forEach(indicator => {
        indicator.classList.remove('active');
    });

    containers.forEach(container => {
        container.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('text/plain', container.getAttribute('data-id'));
            setTimeout(() => container.classList.add('dragging'), 0);
        });

        container.addEventListener('dragend', function () {
            container.classList.remove('dragging');
            // Hide all drop indicators when drag ends
            dropIndicators.forEach(indicator => {
                indicator.classList.remove('active');
            });
        });

        container.addEventListener('dragover', function (e) {
            e.preventDefault();

            // Determine if we're in the top or bottom half of the container
            const rect = container.getBoundingClientRect();
            const y = e.clientY;
            const relativeY = y - rect.top;
            const isInTopHalf = relativeY < rect.height / 2;

            // Find the corresponding drop indicators
            const parentElement = container.parentElement;
            const topIndicator = parentElement.querySelector('.drop-indicator[data-position="before"]');

            // Hide all indicators first
            dropIndicators.forEach(ind => ind.classList.remove('active'));

            // Show the appropriate indicator
            if (isInTopHalf && topIndicator) {
                topIndicator.classList.add('active');
            }
        });

        container.addEventListener('dragleave', function () {
            // When leaving a container, hide its indicators
            const parentElement = container.parentElement;
            const indicators = parentElement.querySelectorAll('.drop-indicator');
            indicators.forEach(ind => ind.classList.remove('active'));
        });

        container.addEventListener('drop', function (e) {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            const targetId = container.getAttribute('data-id');
            const targetGroupId = container.closest('.image-grid').getAttribute('data-group-id');

            // Determine drop position (before or after)
            const rect = container.getBoundingClientRect();
            const y = e.clientY;
            const relativeY = y - rect.top;
            const dropPosition = relativeY < rect.height / 2 ? 'before' : 'after';

            // Move image with position information
            moveImage(draggedId, targetId, targetGroupId, dropPosition);

            // Hide all drop indicators
            dropIndicators.forEach(indicator => {
                indicator.classList.remove('active');
            });
        });
    });

    // Allow dropping directly into empty groups
    imageGrids.forEach(grid => {
        grid.addEventListener('dragover', function (e) {
            e.preventDefault();
        });

        grid.addEventListener('drop', function (e) {
            // Only handle if we're not dropping onto an image container
            if (!e.target.closest('.image-container')) {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData('text/plain');
                const targetGroupId = grid.getAttribute('data-group-id');

                // Move to end of the group
                moveImage(draggedId, null, targetGroupId);

                // Hide all drop indicators
                dropIndicators.forEach(indicator => {
                    indicator.classList.remove('active');
                });
            }
        });
    });

    // Setup event listeners for drop indicators
    dropIndicators.forEach(indicator => {
        indicator.addEventListener('dragover', function (e) {
            e.preventDefault();
            this.classList.add('active');
        });

        indicator.addEventListener('dragleave', function () {
            this.classList.remove('active');
        });

        indicator.addEventListener('drop', function (e) {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            const targetId = this.dataset.imageId;
            const targetGroupId = this.closest('.image-grid').getAttribute('data-group-id');
            const position = this.dataset.position;

            moveImage(draggedId, targetId, targetGroupId, position);

            // Hide all drop indicators
            dropIndicators.forEach(ind => ind.classList.remove('active'));
        });
    });
}

// Move and reorder images
function moveImage(draggedId, targetId, targetGroupId, position = 'after') {
    const draggedIndex = imageData.findIndex(img => img.id === draggedId);

    if (draggedIndex === -1) return;

    const draggedItem = imageData[draggedIndex];
    const originalGroupId = draggedItem.groupId;

    // Remove dragged item
    imageData.splice(draggedIndex, 1);

    if (targetId) {
        // Moving to a specific position relative to a target
        const targetIndex = imageData.findIndex(img => img.id === targetId);

        if (targetIndex !== -1) {
            // Update group ID if changed
            draggedItem.groupId = targetGroupId;

            // Insert at position based on before/after
            if (position === 'before') {
                // Insert before the target
                imageData.splice(targetIndex, 0, draggedItem);
            } else {
                // Insert after the target
                imageData.splice(targetIndex + 1, 0, draggedItem);
            }
        }
    } else {
        // Moving to the end of a group
        draggedItem.groupId = targetGroupId;

        // Find the last item in the target group
        const lastItemIndex = imageData.map(item => item.groupId).lastIndexOf(targetGroupId);

        if (lastItemIndex === -1) {
            // No items in the group yet
            imageData.push(draggedItem);
        } else {
            // Insert after the last item
            imageData.splice(lastItemIndex + 1, 0, draggedItem);
        }
    }

    // Update the order property for all images in the affected groups
    updateImageOrders();

    // Re-render the groups
    renderGroups();

    // Show appropriate message
    if (originalGroupId !== targetGroupId) {
        const targetGroup = groupData.find(g => g.id === targetGroupId);
        showMessage(`Image moved to group: ${targetGroup.name}`, 'success');
    } else if (position === 'before' || position === 'after') {
        showMessage('Image reordered successfully', 'success');
    }
}

// Update the order property for all images
function updateImageOrders() {
    // Group images by groupId
    const groupedImages = {};

    // Initialize with empty arrays for each group
    groupData.forEach(group => {
        if (group.id !== 'password-settings') {
            groupedImages[group.id] = [];
        }
    });

    // Group images by their groupId
    imageData.forEach(image => {
        if (groupedImages[image.groupId]) {
            groupedImages[image.groupId].push(image);
        } else {
            // Fallback in case of orphaned images
            groupedImages['default'] = groupedImages['default'] || [];
            groupedImages['default'].push(image);
        }
    });

    // Update order within each group
    Object.keys(groupedImages).forEach(groupId => {
        groupedImages[groupId].forEach((image, index) => {
            image.order = index;
        });
    });
}

// Add a new group
function addGroup() {
    const nameInput = document.getElementById('new-group-name');
    const groupName = nameInput.value.trim();

    if (!groupName) {
        showMessage('Please enter a group name', 'error');
        return;
    }

    // Check if a group with this name already exists
    if (groupData.some(g => g.name === groupName)) {
        showMessage('A group with this name already exists', 'error');
        return;
    }

    // Create a unique ID
    const uniqueId = 'group_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    // Create new group
    const newGroup = {
        id: uniqueId,
        name: groupName,
        order: groupData.filter(g => g.id !== 'password-settings').length // Add at the end, excluding password settings
    };

    // Add to groups array
    groupData.push(newGroup);

    // Clear input
    nameInput.value = '';

    // Re-render
    renderGroups();
    updateGroupNavigationBar();

    showMessage(`Group "${groupName}" added. Don't forget to save your changes.`, 'success');
}

// Delete a group
function deleteGroup(groupId) {
    // Prevent deleting the default group or password settings
    if (groupId === 'default' || groupId === 'password-settings') {
        showMessage('Cannot delete this group', 'error');
        return;
    }

    if (confirm('Are you sure you want to delete this group? All images will be moved to the Default Group.')) {
        // Find the group to delete
        const groupIndex = groupData.findIndex(g => g.id === groupId);

        if (groupIndex !== -1) {
            const groupName = groupData[groupIndex].name;

            // Move all images in this group to the default group
            imageData.forEach(image => {
                if (image.groupId === groupId) {
                    image.groupId = 'default';
                }
            });

            // Remove the group
            groupData.splice(groupIndex, 1);

            // Update order values for remaining groups
            updateGroupOrders();

            // Re-render
            renderGroups();
            updateGroupNavigationBar();

            showMessage(`Group "${groupName}" deleted. All images moved to Default Group.`, 'success');
        }
    }
}

// Get the next order value for a specific group
function getNextOrderForGroup(groupId) {
    const groupImages = imageData.filter(img => img.groupId === groupId);
    if (groupImages.length === 0) return 0;

    return Math.max(...groupImages.map(img => img.order)) + 1;
}

// Delete an image
async function deleteImage(id) {
    const imageIndex = imageData.findIndex(img => img.id === id);
    if (imageIndex !== -1) {
        const image = imageData[imageIndex];
        
        // Delete from Google Drive if we have a file ID
        if (image.driveFileId && isSignedIn && accessToken) {
            try {
                const response = await fetch(`https://www.googleapis.com/drive/v3/files/${image.driveFileId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (response.ok) {
                    showMessage('Image deleted from Google Drive', 'success');
                } else {
                    showMessage('Warning: Failed to delete image from Google Drive', 'error');
                }
            } catch (error) {
                console.error('Error deleting from Google Drive:', error);
                showMessage('Warning: Failed to delete image from Google Drive', 'error');
            }
        }
        
        // Remove from local data
        imageData.splice(imageIndex, 1);
        renderGroups();
        updateGroupNavigationBar();
        showMessage('Image deleted. Remember to save your changes.', 'success');
    }
}

// Download image
function downloadImage(image) {
    if (image.dataUrl) {
        // Create a link element to download the image
        const link = document.createElement('a');
        link.href = image.dataUrl;
        link.download = image.originalName || image.name || 'image.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else if (image.path && image.path.includes('drive.google.com')) {
        // For Google Drive images, open in new tab
        window.open(image.path, '_blank');
        showMessage('Image opened in new tab. Right-click to save.', 'info');
    } else {
        showMessage('No download data available for this image', 'error');
    }
}

// Show status message
function showMessage(message, type) {
    const msgElement = document.getElementById('status-message');
    msgElement.textContent = message;
    msgElement.className = 'status-message ' + type;

    // Auto hide after 5 seconds
    setTimeout(() => {
        msgElement.textContent = '';
        msgElement.className = 'status-message';
    }, 5000);
}

// Setup all event listeners
function setupEventListeners() {
    // Load folder button
    document.getElementById('load-folder-btn').addEventListener('click', loadExistingGallery);

    // Scan images button
    document.getElementById('scan-images-btn').addEventListener('click', scanFolderForImages);

    // View Gallery button
    document.getElementById('view-gallery').addEventListener('click', function () {
        window.open('../Viewer/viewer.html', '_blank');
    });

    // File upload
    document.getElementById('file-upload').addEventListener('change', function (e) {
        handleImageUpload(e.target.files);
    });

    // Add group button
    document.getElementById('add-group-btn').addEventListener('click', addGroup);

    // Drag and drop for file upload
    const uploadContainer = document.querySelector('.upload-container');

    uploadContainer.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (isSignedIn) {
            this.style.backgroundColor = '#f0f0f0';
        }
    });

    uploadContainer.addEventListener('dragleave', function () {
        this.style.backgroundColor = '';
    });

    uploadContainer.addEventListener('drop', function (e) {
        e.preventDefault();
        this.style.backgroundColor = '';
        if (isSignedIn) {
            handleImageUpload(e.dataTransfer.files);
        } else {
            showMessage('Please sign in to Google Drive first', 'error');
        }
    });
}

// Initialize title settings
function initTitleSettings() {
    updateTitleStatus();

    // Set up change title button
    document.getElementById('change-title-btn').addEventListener('click', function() {
        const titleFields = document.getElementById('title-fields');
        const changeSection = document.getElementById('change-title-section');
        
        titleFields.style.display = 'block';
        changeSection.style.display = 'none';
        
        // Set current title in input and focus it
        const titleInput = document.getElementById('gallery-title');
        titleInput.value = projectTitle;
        titleInput.focus();
        titleInput.select();
    });

    // Set up save title button
    document.getElementById('save-title-btn').addEventListener('click', saveProjectTitle);

    // Set up enter key handling for title input
    document.getElementById('gallery-title').addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            saveProjectTitle();
        }
    });
}

// Update title status display
function updateTitleStatus() {
    const titleFields = document.getElementById('title-fields');
    const changeSection = document.getElementById('change-title-section');
    const statusElement = document.getElementById('titleStatus');
    const statusText = document.getElementById('titleStatusText');

    // Update status display
    statusElement.className = 'title-status';
    statusText.textContent = `📝 Current Title: "${projectTitle}"`;
    titleFields.style.display = 'none';
    changeSection.style.display = 'block';
}

// Save project title
function saveProjectTitle() {
    const titleInput = document.getElementById('gallery-title');
    const title = titleInput.value.trim();
    
    if (!title) {
        showMessage('Please enter a project title', 'error');
        return;
    }
    
    projectTitle = title;
    
    // Update UI
    updateTitleStatus();
    
    showMessage('Gallery title updated successfully! ✅', 'success');
}

// Initialize password protection settings
function initPasswordProtection() {
    updatePasswordStatus();

    const passwordCheckbox = document.getElementById('enable-password');
    const passwordFields = document.getElementById('password-fields');

    // Set up event listeners for password protection
    passwordCheckbox.addEventListener('change', function () {
        passwordFields.style.display = this.checked ? 'block' : 'none';
        document.getElementById('change-password-section').style.display = 'none';

        if (!this.checked) {
            // If disabling password protection, remove password settings
            const passwordIndex = groupData.findIndex(g => g.id === 'password-settings');
            if (passwordIndex !== -1) {
                groupData.splice(passwordIndex, 1);
                updatePasswordStatus();
                showMessage('Password protection disabled', 'success');
            }
        }
    });

    // Set up save password button
    document.getElementById('save-password-btn').addEventListener('click', savePassword);

    // Set up change password button
    document.getElementById('change-password-btn').addEventListener('click', function() {
        const passwordFields = document.getElementById('password-fields');
        const changeSection = document.getElementById('change-password-section');
        
        passwordFields.style.display = 'block';
        changeSection.style.display = 'none';
        
        // Clear the password field and focus it
        const passwordInput = document.getElementById('gallery-password');
        passwordInput.value = '';
        passwordInput.focus();
        
        // Update button text
        document.getElementById('save-password-btn').textContent = 'Update Password';
    });
}

// Update password protection status display
function updatePasswordStatus() {
    const passwordSettings = groupData.find(group => group.id === 'password-settings');
    const passwordEnabled = passwordSettings !== undefined;
    
    const passwordCheckbox = document.getElementById('enable-password');
    const passwordFields = document.getElementById('password-fields');
    const changeSection = document.getElementById('change-password-section');
    const statusElement = document.getElementById('passwordStatus');
    const statusText = document.getElementById('passwordStatusText');

    // Update checkbox state
    passwordCheckbox.checked = passwordEnabled;
    
    // Update status display
    if (passwordEnabled) {
        statusElement.className = 'password-status protected';
        statusText.textContent = '🔒 Password protection is ENABLED';
        passwordFields.style.display = 'none';
        changeSection.style.display = 'block';
    } else {
        statusElement.className = 'password-status unprotected';
        statusText.textContent = '🔓 Password protection is DISABLED';
        passwordFields.style.display = passwordEnabled ? 'none' : 'none';
        changeSection.style.display = 'none';
    }
}

// Save password settings
async function savePassword() {
    const passwordInput = document.getElementById('gallery-password');
    const password = passwordInput.value.trim();

    if (!password) {
        showMessage('Please enter a password', 'error');
        return;
    }

    if (password.length < 4) {
        showMessage('Password must be at least 4 characters long', 'error');
        return;
    }

    try {
        // Hash the password
        const hashedPassword = await hashPassword(password);

        // Find or create password settings in groupData
        let passwordSettings = groupData.find(g => g.id === 'password-settings');

        if (!passwordSettings) {
            // Create password settings object
            passwordSettings = {
                id: 'password-settings',
                name: 'Password Settings',
                hashedPassword: hashedPassword,
                hidden: true // This helps identify it as a special group, not for display
            };
            groupData.push(passwordSettings);
        } else {
            // Update existing password
            passwordSettings.hashedPassword = hashedPassword;
        }

        // Clear password field
        passwordInput.value = '';
        
        // Update UI
        updatePasswordStatus();
        
        // Reset button text
        document.getElementById('save-password-btn').textContent = 'Set Password';

        showMessage('Password protection enabled and password set successfully! ✅', 'success');

    } catch (error) {
        console.error('Error hashing password:', error);
        showMessage('Error setting password: ' + error.message, 'error');
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }
});

// Handle visibility change (tab switching) to manage token refresh
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && isSignedIn && tokenExpiryTime) {
        // Check if token needs refresh when user returns to tab
        const now = Date.now();
        const timeUntilExpiry = tokenExpiryTime - now;
        
        if (timeUntilExpiry < (5 * 60 * 1000) && timeUntilExpiry > 0) {
            // Token expires in less than 5 minutes, refresh it
            refreshToken();
        } else if (timeUntilExpiry <= 0) {
            // Token has expired
            showMessage('Your session has expired. Please sign in again.', 'info');
            signOut();
        }
    }
});
