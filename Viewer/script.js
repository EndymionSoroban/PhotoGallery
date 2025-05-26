// Global variables
let imageData = [];
let groupData = [];
let allImages = [];
let currentImageIndex = 0;
let isSignedIn = false;
let accessToken = null;
let tokenClient = null;
let projectTitle = 'Image Gallery';
let tokenExpiryTime = null;
let refreshTimer = null;

// Configuration - Edit these values for your gallery
const CLIENT_ID = ''; // Your OAuth Client ID
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const metadataFileName = 'image-data.json';

// Storage keys for persistent authentication and password session
const STORAGE_KEYS = {
    ACCESS_TOKEN: 'gallery_access_token',
    EXPIRY_TIME: 'gallery_token_expiry',
    SIGNED_IN: 'gallery_signed_in',
    LAST_FOLDER: 'gallery_last_folder',
    PASSWORD_SESSION: 'gallery_password_session',
    PASSWORD_HASH: 'gallery_password_hash'
};

// ========== HELPER FUNCTIONS ==========

// Improved thumbnail URL generation with better fallback chain
function getThumbnailUrl(image) {
    // Priority order for thumbnail sources
    if (image.thumbnailLink && image.thumbnailLink.includes('googleusercontent.com')) {
        return image.thumbnailLink;
    }
    
    if (image.thumbnailUrl && image.thumbnailUrl.includes('googleusercontent.com')) {
        return image.thumbnailUrl;
    }
    
    if (image.thumbnailLink && image.thumbnailLink.includes('drive.google.com')) {
        return image.thumbnailLink;
    }
    
    if (image.thumbnailUrl && image.thumbnailUrl.includes('drive.google.com')) {
        return image.thumbnailUrl;
    }
    
    if (image.driveFileId) {
        // Use Google Drive's thumbnail API with proper size
        return `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w300-h300`;
    }
    
    // Fallback for non-Drive images
    return image.dataUrl || image.path || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjUwIiBoZWlnaHQ9IjIyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIiBzdHJva2U9IiNkZGQiIHN0cm9rZS13aWR0aD0iMiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
}

// Improved image error handling with multiple retry attempts
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

// Enhanced function to load from Drive while checking for JSON configuration
async function loadImagesFromDriveWithMerge() {
    if (!isSignedIn || !accessToken) {
        showMessage('Please sign in to Google Drive first', 'error');
        return;
    }

    const folderInfo = getCurrentFolderInfo();
    
    try {
        showLoadingSpinner();
        showMessage(`Loading images from ${folderInfo.name}...`, 'info');

        // First, check if there's a JSON configuration file
        let jsonConfig = null;
        try {
            showMessage('Checking for gallery configuration...', 'info');
            
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
                        showMessage('Found gallery configuration! Loading with proper groups...', 'info');
                    }
                }
            }
        } catch (error) {
            console.warn('Could not load JSON config:', error);
            // Continue without JSON config
        }

        // Now load images using the working Drive API call
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

        if (!response.ok) {
            throw new Error(`Failed to load images: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const driveImages = data.files || [];

        console.log(`Found ${driveImages.length} files in Google Drive`);

        // If we have JSON config, create a mapping of driveFileId to image metadata
        const jsonImageMap = new Map();
        if (jsonConfig && jsonConfig.images) {
            jsonConfig.images.forEach(img => {
                if (img.driveFileId) {
                    jsonImageMap.set(img.driveFileId, img);
                }
            });
        }

        // Convert Google Drive files to our image format, using JSON metadata when available
        const newImageData = driveImages.map((file, index) => {
            const jsonImageData = jsonImageMap.get(file.id);
            
            // DEBUG: Log what we're getting from the API
            console.log(`File: ${file.name}`);
            console.log(`thumbnailLink from API:`, file.thumbnailLink);
            
            return {
                id: jsonImageData?.id || 'drive_' + file.id,
                name: file.name,
                path: `https://drive.google.com/uc?id=${file.id}`,
                driveFileId: file.id,
                thumbnailUrl: file.thumbnailLink,    // Use the actual thumbnailLink from API!
                thumbnailLink: file.thumbnailLink,   // Use the actual thumbnailLink from API!
                webViewLink: file.webViewLink,
                dateAdded: jsonImageData?.dateAdded || new Date(file.createdTime).toISOString(),
                order: jsonImageData?.order ?? index,
                groupId: jsonImageData?.groupId || 'default',
                size: parseInt(file.size) || 0,
                description: jsonImageData?.description || '',
                mimeType: file.mimeType,
                fromGoogleDrive: true
            };
        });

        imageData = newImageData;

        // Set up groups - use JSON groups if available, otherwise create default
        if (jsonConfig && jsonConfig.groups) {
            groupData = jsonConfig.groups;
            projectTitle = jsonConfig.projectTitle || 'Image Gallery';
            
            // Update gallery title
            document.getElementById('gallery-title').textContent = projectTitle;
        } else {
            // Create simple default group structure
            groupData = [{ id: 'default', name: 'Google Drive Images', order: 0 }];
        }

        // Store the current folder for next visit
        storeLastFolder();

        hideLoadingSpinner();
        
        // Check for password protection if we loaded from JSON
        if (jsonConfig && jsonConfig.groups) {
            const passwordSettings = groupData.find(g => g.id === 'password-settings');
            if (passwordSettings && passwordSettings.hashedPassword) {
                // Check if user already has a valid password session
                if (checkPasswordSession(passwordSettings.hashedPassword)) {
                    // User already authenticated this session, show gallery directly
                    displayGalleries();
                    updateGroupNavigationBar();
                    updatePasswordSessionStatus();
                    showMessage('Gallery loaded with proper groups! (Password session active)', 'success');
                    return;
                } else {
                    // Show password prompt
                    document.getElementById('password-overlay').style.display = 'flex';
                    setupPasswordSubmit(passwordSettings.hashedPassword);
                    return;
                }
            }
        }
        
        displayGalleries();
        updateGroupNavigationBar();
        
        if (jsonConfig) {
            showMessage(`Loaded ${imageData.length} images with proper groups from ${folderInfo.name}`, 'success');
        } else {
            showMessage(`Loaded ${imageData.length} images from ${folderInfo.name}`, 'success');
        }

    } catch (error) {
        console.error('Error loading from Google Drive:', error);
        hideLoadingSpinner();
        showMessage('Error loading from Google Drive: ' + error.message, 'error');
    }
}

// Simple SHA-256 hash function for password checking
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Password session management functions
function storePasswordSession(passwordHash) {
    const sessionData = {
        hash: passwordHash,
        timestamp: Date.now(),
        // Session expires after 24 hours
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };
    localStorage.setItem(STORAGE_KEYS.PASSWORD_SESSION, JSON.stringify(sessionData));
    localStorage.setItem(STORAGE_KEYS.PASSWORD_HASH, passwordHash);
}

function checkPasswordSession(requiredPasswordHash) {
    try {
        const sessionData = localStorage.getItem(STORAGE_KEYS.PASSWORD_SESSION);
        if (!sessionData) return false;

        const session = JSON.parse(sessionData);
        const now = Date.now();

        // Check if session is expired
        if (now > session.expiresAt) {
            clearPasswordSession();
            return false;
        }

        // Check if the password hash matches
        if (session.hash === requiredPasswordHash) {
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error checking password session:', error);
        clearPasswordSession();
        return false;
    }
}

function clearPasswordSession() {
    localStorage.removeItem(STORAGE_KEYS.PASSWORD_SESSION);
    localStorage.removeItem(STORAGE_KEYS.PASSWORD_HASH);
    
    // Hide session status if visible
    const sessionStatus = document.getElementById('password-session-status');
    if (sessionStatus) {
        sessionStatus.style.display = 'none';
    }
    
    showMessage('Password session cleared. You will need to enter the password again next time.', 'info');
}

function updatePasswordSessionStatus() {
    const sessionData = localStorage.getItem(STORAGE_KEYS.PASSWORD_SESSION);
    const sessionStatus = document.getElementById('password-session-status');
    
    if (sessionData && sessionStatus) {
        try {
            const session = JSON.parse(sessionData);
            const now = Date.now();
            
            if (now <= session.expiresAt) {
                const hoursLeft = Math.ceil((session.expiresAt - now) / (60 * 60 * 1000));
                sessionStatus.textContent = `Password remembered (expires in ${hoursLeft}h)`;
                sessionStatus.style.display = 'block';
            } else {
                clearPasswordSession();
            }
        } catch (error) {
            clearPasswordSession();
        }
    }
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

// Store last used folder
function storeLastFolder() {
    const folderUrl = document.getElementById('driveFolder').value.trim();
    if (folderUrl) {
        localStorage.setItem(STORAGE_KEYS.LAST_FOLDER, folderUrl);
    }
}

// Restore last used folder
function restoreLastFolder() {
    const lastFolder = localStorage.getItem(STORAGE_KEYS.LAST_FOLDER);
    if (lastFolder) {
        document.getElementById('driveFolder').value = lastFolder;
        const folderInfo = getCurrentFolderInfo();
        document.getElementById('selectedFolder').textContent = `Selected: ${folderInfo.name}`;
    }
}

// Initialize Google Identity Services
function initializeAuth() {
    if (!CLIENT_ID) {
        showMessage('OAuth Client ID not configured', 'error');
        return;
    }
    
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
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
                showMessage('Successfully authenticated! Loading your gallery...', 'success');
                
                // Store folder preference
                storeLastFolder();
            },
        });
        
        updateAuthStatus();
        
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
        showMessage('Authentication not initialized', 'error');
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
    clearGallery();
    showMessage('Signed out successfully! Your session has been cleared.', 'info');
}

// Update authentication status
function updateAuthStatus() {
    const statusText = document.getElementById('statusText');
    const authStatus = document.getElementById('authStatus');
    const signOutBtn = document.getElementById('signOutBtn');
    const loadFromDriveBtn = document.getElementById('loadFromDriveBtn');
    const signInDiv = document.getElementById('signInDiv');
    
    authStatus.style.display = 'block';
    
    if (isSignedIn) {
        statusText.textContent = 'Signed in ✓';
        statusText.style.color = 'green';
        signOutBtn.style.display = 'inline-block';
        signInDiv.style.display = 'none';
        loadFromDriveBtn.disabled = false;
        
        // Show token expiry info
        if (tokenExpiryTime) {
            const remainingMinutes = Math.floor((tokenExpiryTime - Date.now()) / (1000 * 60));
            if (remainingMinutes > 0) {
                statusText.textContent += ` (expires in ${remainingMinutes}m)`;
            }
        }
    } else {
        statusText.textContent = 'Ready to sign in';
        statusText.style.color = 'orange';
        signOutBtn.style.display = 'none';
        signInDiv.style.display = 'block';
        loadFromDriveBtn.disabled = true;
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

// Clear gallery
function clearGallery() {
    const container = document.getElementById('galleries-container');
    const imageCounter = document.getElementById('imageCounter');
    
    container.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <div>Ready to load images...</div>
        </div>
    `;
    imageCounter.style.display = 'none';
    imageData = [];
    groupData = [];
    allImages = [];
}

// Show/hide loading spinner
function showLoadingSpinner() {
    const container = document.getElementById('galleries-container');
    container.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <div>Loading images...</div>
        </div>
    `;
}

function hideLoadingSpinner() {
    // Loading will be replaced by content
}

// Update the group navigation bar
function updateGroupNavigationBar() {
    const navContainer = document.getElementById('group-nav-items');
    navContainer.innerHTML = '';

    const groupsWithImages = groupData.filter(group =>
        group.id !== 'password-settings' && imageData.some(image => image.groupId === group.id)
    );

    const sortedGroups = [...groupsWithImages].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedGroups.forEach(group => {
        const groupItem = document.createElement('div');
        groupItem.className = 'group-nav-item';
        groupItem.textContent = group.name;
        groupItem.setAttribute('data-group-id', group.id);

        groupItem.addEventListener('click', function () {
            const targetGroup = document.getElementById(`group-${group.id}`);
            if (targetGroup) {
                targetGroup.scrollIntoView({ behavior: 'smooth' });
            }
        });

        navContainer.appendChild(groupItem);
    });
}

// Enhanced display galleries function with improved thumbnail loading
function displayGalleries() {
    const container = document.getElementById('galleries-container');
    const imageCounter = document.getElementById('imageCounter');
    container.innerHTML = '';
    allImages = [];

    if (!imageData || imageData.length === 0) {
        container.innerHTML = `
            <div class="empty-gallery">
                <div style="font-size: 64px; margin-bottom: 20px;">📷</div>
                <div>No images available</div>
                <div style="margin-top: 10px; font-size: 14px; color: #999;">
                    Try loading from Google Drive or check your configuration
                </div>
            </div>
        `;
        imageCounter.style.display = 'none';
        return;
    }

    // Update image counter
    imageCounter.textContent = `${imageData.length} image${imageData.length !== 1 ? 's' : ''} found`;
    imageCounter.style.display = 'block';

    const sortedGroups = [...groupData]
        .filter(group => group.id !== 'password-settings')
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedGroups.forEach(group => {
        const groupImages = imageData.filter(image => image.groupId === group.id);

        if (groupImages.length === 0) return;

        groupImages.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
            }
            return new Date(b.dateAdded) - new Date(a.dateAdded);
        });

        allImages = allImages.concat(groupImages);

        const galleryContainer = document.createElement('div');
        galleryContainer.className = 'gallery';
        galleryContainer.id = `group-${group.id}`;

        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';

        const groupTitle = document.createElement('h2');
        groupTitle.textContent = group.name;
        groupHeader.appendChild(groupTitle);

        const galleryGrid = document.createElement('div');
        galleryGrid.className = 'gallery-grid';

        groupImages.forEach((image) => {
            const item = document.createElement('div');
            item.className = 'gallery-item';

            const img = document.createElement('img');
            img.setAttribute('draggable', false);
            img.alt = image.name || 'Image';
            img.loading = 'lazy';

            // Use the improved thumbnail URL function
            img.src = getThumbnailUrl(image);
            
            // Set up improved error handling
            setupImageErrorHandling(img, image);

            img.addEventListener('click', () => {
                const globalIndex = allImages.findIndex(i => i.id === image.id);
                if (globalIndex !== -1) {
                    openLightbox(globalIndex);
                }
            });

            const caption = document.createElement('div');
            caption.className = 'caption';

            const imageName = image.name || image.path.split('/').pop() || 'Image';
            caption.textContent = imageName;

            item.appendChild(img);
            item.appendChild(caption);

            // Add description if available
            if (image.description && image.description.trim() !== '') {
                const description = document.createElement('div');
                description.className = 'description';
                description.textContent = image.description;
                item.appendChild(description);
            }

            galleryGrid.appendChild(item);
        });

        galleryContainer.appendChild(groupHeader);
        galleryContainer.appendChild(galleryGrid);
        container.appendChild(galleryContainer);
    });
}

// Lightbox functionality
function openLightbox(index) {
    currentImageIndex = index;
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const image = allImages[index];

    // For Google Drive images, open in new tab for full view
    if (image.fromGoogleDrive || image.driveFileId) {
        window.open(`https://drive.google.com/file/d/${image.driveFileId}/view`, '_blank');
        return;
    }

    // For other images, use lightbox
    lightboxImage.src = image.dataUrl || image.path;

    lightboxImage.onerror = function () {
        if (image.dataUrl && this.src !== image.dataUrl) {
            this.src = image.dataUrl;
        } else if (image.path && this.src !== image.path) {
            this.src = image.path;
        } else {
            this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIiBzdHJva2U9IiM1NTUiIHN0cm9rZS13aWR0aD0iMiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiNjY2MiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
            this.style.backgroundColor = '#333';
            this.style.padding = '40px';
        }
    };

    updateLightboxCaption();
}

function updateLightboxCaption() {
    const lightboxCaption = document.getElementById('lightbox-caption');
    if (lightboxCaption) {
        const image = allImages[currentImageIndex];
        let captionText = image.name || image.path.split('/').pop() || 'Image';

        if (image.description && image.description.trim() !== '') {
            captionText += `<br><span class="description" style="font-style: italic; color: #ccc;">${image.description}</span>`;
        }

        lightboxCaption.innerHTML = captionText;
    }
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
    lightbox.style.display = 'none';
}

function nextImage() {
    if (currentImageIndex < allImages.length - 1) {
        currentImageIndex++;
        openLightbox(currentImageIndex);
    }
}

function prevImage() {
    if (currentImageIndex > 0) {
        currentImageIndex--;
        openLightbox(currentImageIndex);
    }
}

// Setup password submission for hashed passwords
function setupPasswordSubmit(correctHashedPassword) {
    const submitButton = document.getElementById('password-submit');
    const passwordInput = document.getElementById('access-password');
    const errorMessage = document.getElementById('password-error');

    passwordInput.addEventListener('keyup', function (event) {
        if (event.key === 'Enter') {
            submitPassword(correctHashedPassword);
        }
    });

    submitButton.addEventListener('click', function () {
        submitPassword(correctHashedPassword);
    });
}

// Submit and validate password (with hash comparison)
async function submitPassword(correctHashedPassword) {
    const passwordInput = document.getElementById('access-password');
    const errorMessage = document.getElementById('password-error');
    const rememberCheckbox = document.getElementById('remember-password');
    const enteredPassword = passwordInput.value.trim();

    if (!enteredPassword) {
        errorMessage.textContent = 'Please enter a password';
        errorMessage.style.display = 'block';
        return;
    }

    try {
        // Hash the entered password and compare
        const enteredHash = await hashPassword(enteredPassword);
        
        if (enteredHash === correctHashedPassword) {
            // Store password session if remember option is checked
            if (rememberCheckbox.checked) {
                storePasswordSession(correctHashedPassword);
            }
            
            document.getElementById('password-overlay').style.display = 'none';
            
            // After password is correct, display the gallery that was already loaded
            displayGalleries();
            updateGroupNavigationBar();
            
            if (rememberCheckbox.checked) {
                updatePasswordSessionStatus();
                showMessage('Gallery unlocked! Password will be remembered for this session.', 'success');
            } else {
                showMessage('Gallery unlocked!', 'success');
            }
        } else {
            errorMessage.textContent = 'Incorrect password. Please try again.';
            errorMessage.style.display = 'block';
            passwordInput.value = '';
            passwordInput.focus();
        }
    } catch (error) {
        console.error('Error checking password:', error);
        errorMessage.textContent = 'Error validating password. Please try again.';
        errorMessage.style.display = 'block';
    }
}

// Show status message
function showMessage(message, type) {
    const msgElement = document.getElementById('status-message');
    msgElement.textContent = message;
    msgElement.className = 'status-message ' + type;
    msgElement.style.display = 'block';

    setTimeout(() => {
        msgElement.style.display = 'none';
    }, 5000);
}

// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', function () {
    // Disable right-click context menu
    document.addEventListener('contextmenu', function (e) {
        if (e.target.tagName === 'IMG' || e.target.className === 'image-protector') {
            e.preventDefault();
            return false;
        }
    });

    // Disable keyboard shortcuts that could be used to save images
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'u' || e.key === 'U')) ||
            e.key === 'F12' || e.key === 'PrintScreen') {
            e.preventDefault();
            return false;
        }
    });

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
    });

    // Set initial folder display
    document.getElementById('selectedFolder').textContent = 'Selected: Root Folder (My Drive)';

    // Restore last used folder from storage
    restoreLastFolder();

    // Initialize authentication and check for existing session
    initializeAuth();
    
    // Check for existing authentication
    checkExistingAuth();
});

// Keyboard navigation for lightbox
document.addEventListener('keydown', function (e) {
    if (!document.getElementById('lightbox').classList.contains('active')) return;

    if (e.key === 'Escape') {
        closeLightbox();
    } else if (e.key === 'ArrowRight') {
        nextImage();
    } else if (e.key === 'ArrowLeft') {
        prevImage();
    }
});

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
