# 📸 Google Drive Image Gallery

A modern, responsive image gallery that seamlessly integrates with Google Drive for storage and management. Create beautiful, organized galleries with password protection, custom groups, and automatic thumbnail generation.

## ✨ Features

### 🎨 **Gallery Viewer**
- **Responsive grid layout** with smooth hover effects
- **Group-based organization** with custom categories
- **Password protection** with session management
- **Lightbox viewing** with keyboard navigation
- **Mobile-optimized** design
- **Direct Google Drive integration** for fast loading

### 🛠️ **Admin Panel**
- **Drag & drop image uploads** directly to Google Drive
- **Visual drag & drop reordering** for images and groups
- **Bulk import** from existing Google Drive folders
- **Image descriptions** and metadata management
- **Group management** with custom organization
- **Password protection setup** with secure hashing
- **Real-time preview** of gallery changes

### 🔒 **Security & Performance**
- **OAuth 2.0 authentication** with Google Drive
- **SHA-256 password hashing** for gallery protection
- **Session-based password management**
- **Optimized thumbnail loading** with multiple fallbacks
- **Image protection** against right-click and keyboard shortcuts
- **Token refresh management** for extended sessions

## 🚀 Quick Start

### Prerequisites
- A Google Cloud Console account
- A web server (local or hosted)
- Modern web browser with JavaScript enabled

### 1. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google Drive API**
4. Go to **APIs & Services → Credentials**
5. Create **OAuth 2.0 Client IDs** add it to viewer: const CLIENT_ID = ''; // Your OAuth Client ID
6. Add your domain to **Authorized JavaScript origins**
7. Copy your **Client ID**

### 2. Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/google-drive-gallery.git
   cd google-drive-gallery
   ```

2. **Deploy to your web server:**
   - Upload all files to your web hosting
   - Or serve locally: `python -m http.server 8000`

3. **Access the admin panel:**
   - Open `admin.html` in your browser
   - Enter your Google OAuth Client ID
   - Sign in with Google Drive

### 3. First-Time Setup

1. **Configure authentication** in admin panel
2. **Set gallery title** and optional password protection
3. **Upload images** or scan existing Google Drive folder
4. **Organize into groups** with drag & drop
5. **Save configuration** to Google Drive
6. **View your gallery** at `viewer.html`

## 📁 File Structure

```
google-drive-gallery/
├── 📄 admin.html              # Admin interface
├── 📄 viewer.html             # Gallery viewer  
├── 📄 admin-script.js         # Admin functionality
├── 📄 script.js               # Viewer functionality
├── 📄 admin-styles.css        # Admin styling
├── 📄 styles.css              # Viewer styling
└── 📄 README.md               # This file
```

## 🎯 Usage Guide

### Creating Your First Gallery

1. **Start with Admin Panel** (`admin.html`)
2. **Enter OAuth Client ID** from Google Cloud Console
3. **Sign in to Google Drive**
4. **Choose folder** (optional - uses root by default)
5. **Upload images** or scan existing folder
6. **Organize with groups** using drag & drop
7. **Add descriptions** to images
8. **Set password** (optional)
9. **Save to Google Drive**
10. **Share viewer link** (`viewer.html`) with others

### Managing Images

- **Upload:** Drag files to upload areas or use file picker
- **Reorder:** Drag images within and between groups
- **Edit:** Click images to add descriptions
- **Group:** Create custom categories for organization
- **Delete:** Remove images (deletes from Google Drive)

### Viewer Features

- **Browse:** Click through organized image groups
- **Search:** Use group navigation to jump to sections
- **View:** Click images for full-size lightbox view
- **Navigate:** Use arrow keys or buttons in lightbox
- **Mobile:** Fully responsive on all devices

## 🔧 Configuration Options

### Gallery Settings
```javascript
// In admin panel
projectTitle: "My Photo Gallery"        // Gallery display name
groups: [...]                          // Custom organization
passwordProtection: true/false         // Optional security
```

### Google Drive Integration
```javascript
CLIENT_ID: "your-oauth-client-id"      // From Google Cloud Console
SCOPES: "drive.readonly"               // Required permissions
folderUrl: "drive-folder-link"         // Optional specific folder
```

## 🔐 Security Features

### Password Protection
- **SHA-256 hashing** for secure password storage
- **Session management** remembers password during visit
- **No plaintext storage** of passwords
- **Gallery-wide protection** affects all images

### Image Protection
- **Right-click disabled** on images
- **Keyboard shortcuts blocked** (Ctrl+S, F12, etc.)
- **Print protection** with hidden images
- **Drag prevention** on all gallery images

### Authentication
- **OAuth 2.0** secure authentication with Google
- **Token refresh** automatic session management
- **Scope limitation** read-only Drive access
- **Session persistence** remembers authentication

## 🎨 Customization

### Styling
- Edit `styles.css` for viewer appearance
- Edit `admin-styles.css` for admin interface
- Fully responsive CSS Grid layout
- Modern design with smooth animations

### Functionality
- Modify `script.js` for viewer behavior
- Modify `admin-script.js` for admin features
- Add custom group types or metadata fields
- Extend with additional file type support

## 🐛 Troubleshooting

### Common Issues

**Images not loading:**
- Check OAuth Client ID is correct
- Verify Google Drive API is enabled
- Ensure proper folder permissions
- Try re-importing images for fresh thumbnails

**Authentication errors:**
- Confirm domain in Google Cloud Console
- Check OAuth consent screen setup
- Verify client ID matches exactly
- Clear browser cache and try again

**Thumbnail issues:**
- Use "Scan Folder" to refresh thumbnails
- Check Google Drive file permissions
- Verify images are properly uploaded
- Try saving and reloading gallery

**Performance issues:**
- Reduce image file sizes before upload
- Limit images per group (< 100 recommended)
- Use modern browser with good JavaScript support
- Check internet connection speed

### Debug Mode
Open browser console (F12) to see detailed logs:
- Authentication status
- Image loading attempts
- API response details
- Error messages with solutions

## 🤝 Contributing

We welcome contributions! Please feel free to submit issues and pull requests.

### Development Setup
1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Submit pull request with clear description

### Areas for Contribution
- 🌐 **Internationalization** - Multi-language support
- 📱 **Mobile enhancements** - Touch gestures, PWA features
- 🎨 **Themes** - Additional styling options
- 🔧 **Integrations** - Other cloud storage providers
- 📊 **Analytics** - View tracking and statistics

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Google Drive API** for seamless cloud storage
- **Google Identity Services** for secure authentication
- **Modern web standards** for responsive design
- **Open source community** for inspiration and tools

## 📞 Support

- **Documentation:** Check this README and inline code comments
- **Issues:** Use GitHub Issues for bug reports and feature requests
- **Discussions:** Use GitHub Discussions for questions and ideas

---

<p align="center">
  <strong>🌟 Star this repository if you find it helpful! 🌟</strong>
</p>

<p align="center">
  Made with ❤️ for photographers, families, and content creators
</p>

## 🔒 Security Setup

This app is designed to be secure with public Client ID when properly configured:

1. **OAuth Restrictions Required**: Set domain restrictions in Google Cloud Console
2. **HTTPS Only**: Use HTTPS in production
3. **Minimal Scope**: Only accesses files created by this app
4. **No Secrets**: No sensitive data in client-side code

Read SECURITY.md for additional informations.
