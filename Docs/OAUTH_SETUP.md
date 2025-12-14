# OAuth Setup Guide

This document provides instructions for setting up OAuth credentials for the sync services (Outlook, OneDrive, Google Drive, Google Photos).

## Backend .env Configuration

Add the following variables to `backend/.env`:

```env
# Microsoft OAuth (for Outlook Calendar and OneDrive)
# Register app at: https://portal.azure.com/
# - Go to Azure Active Directory > App registrations > New registration
# - Set redirect URI: http://localhost:8900/api/calendar/outlook/oauth/callback/
# - For OneDrive: http://localhost:8900/api/onedrive/oauth/callback/
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_REDIRECT_URI=http://localhost:8900/api/calendar/outlook/oauth/callback/

# OneDrive OAuth (can reuse Microsoft settings if same app, or use separate)
ONEDRIVE_CLIENT_ID=your_onedrive_client_id
ONEDRIVE_CLIENT_SECRET=your_onedrive_client_secret
ONEDRIVE_REDIRECT_URI_DEV=http://localhost:8900/api/onedrive/oauth/callback/
ONEDRIVE_REDIRECT_URI_PROD=https://your-domain.com/api/onedrive/oauth/callback/

# Google OAuth (for Google Drive and Google Photos)
# Register app at: https://console.cloud.google.com/
# - Go to APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID
# - Set redirect URI: http://localhost:8900/api/googledrive/oauth/callback/
# - For Google Photos: http://localhost:8900/api/googlephotos/oauth/callback/
# - Enable APIs: Google Drive API, Google Photos Library API
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8900/api/googledrive/oauth/callback/

# Google Drive OAuth (can reuse Google settings if same app, or use separate)
GOOGLEDRIVE_CLIENT_ID=your_googledrive_client_id
GOOGLEDRIVE_CLIENT_SECRET=your_googledrive_client_secret
GOOGLEDRIVE_REDIRECT_URI_DEV=http://localhost:8900/api/googledrive/oauth/callback/
GOOGLEDRIVE_REDIRECT_URI_PROD=https://your-domain.com/api/googledrive/oauth/callback/

# Google Photos OAuth (can reuse Google settings if same app, or use separate)
# Note: Google Photos API requires additional setup in Google Cloud Console
GOOGLE_PHOTOS_CLIENT_ID=your_googlephotos_client_id
GOOGLE_PHOTOS_CLIENT_SECRET=your_googlephotos_client_secret
GOOGLE_PHOTOS_REDIRECT_URI_DEV=http://localhost:8900/api/googlephotos/oauth/callback/
GOOGLE_PHOTOS_REDIRECT_URI_PROD=https://your-domain.com/api/googlephotos/oauth/callback/

# OAuth Session Key Lifetime (for caching user encryption keys)
OAUTH_SESSION_KEY_LIFETIME=86400
```

## Mobile .env Configuration

Add the following variables to `mobile/.env`:

```env
# API Configuration
EXPO_PUBLIC_API_URL=http://localhost:8900/api

# OAuth Client IDs (public, safe to expose in mobile app)
# These are the same Client IDs used in backend/.env
# Note: Client secrets should NEVER be in mobile app - they're only used server-side

# Microsoft OAuth Client ID (for Outlook and OneDrive)
EXPO_PUBLIC_MICROSOFT_CLIENT_ID=your_microsoft_client_id

# Google OAuth Client ID (for Google Drive and Google Photos)
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
```

## Getting OAuth Credentials

### Microsoft Azure (Outlook & OneDrive)

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in:
   - **Name**: KewlKids Organizer Mobile
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
5. Click **Register**
6. Copy the **Application (client) ID** → `MICROSOFT_CLIENT_ID`
7. Go to **Certificates & secrets** > **New client secret**
8. Copy the secret value → `MICROSOFT_CLIENT_SECRET`
9. Go to **Authentication** > **Add a platform** > **Web**
10. Add the following **Redirect URIs** (add each one separately):

    **For Localhost (Development):**
    - `http://localhost:8900/api/calendar/outlook/oauth/callback/`
    - `http://localhost:8900/api/onedrive/oauth/callback/`

    **For Ngrok (Production/Testing):**
    - `https://YOUR_NGROK_DOMAIN.ngrok.app/api/calendar/outlook/oauth/callback/`
    - `https://YOUR_NGROK_DOMAIN.ngrok.app/api/onedrive/oauth/callback/`

    Replace `YOUR_NGROK_DOMAIN` with your actual ngrok domain (e.g., `kewlkidsorganizermobile.ngrok.app`)

### Google Cloud Console (Google Drive & Google Photos)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable APIs:
   - **Google Drive API**
   - **Google Photos Library API**
4. Go to **APIs & Services** > **Credentials**
5. Click **Create Credentials** > **OAuth 2.0 Client ID**
6. Configure consent screen if prompted
7. Create OAuth 2.0 Client ID:
   - **Application type**: Web application
   - **Name**: KewlKids Organizer Mobile
   - **Authorized redirect URIs** (add all of these):

     **For Localhost (Development):**
     - `http://localhost:8900/api/googledrive/oauth/callback/`
     - `http://localhost:8900/api/googlephotos/oauth/callback/`

     **For Ngrok (Production/Testing):**
     - `https://YOUR_NGROK_DOMAIN.ngrok.app/api/googledrive/oauth/callback/`
     - `https://YOUR_NGROK_DOMAIN.ngrok.app/api/googlephotos/oauth/callback/`

     Replace `YOUR_NGROK_DOMAIN` with your actual ngrok domain (e.g., `kewlkidsorganizermobile.ngrok.app`)
8. Copy the **Client ID** → `GOOGLE_CLIENT_ID`
9. Copy the **Client secret** → `GOOGLE_CLIENT_SECRET`

## Encryption

All OAuth tokens are encrypted using password-based encryption:
- User's password is used to derive an encryption key
- Each user has a unique encryption key stored encrypted in the database
- Tokens are encrypted with the user's key before storage
- Tokens are decrypted only when needed for API calls

**Important**: The `FERNET_KEY` in `backend/.env` must be set and must NEVER change after data is encrypted.

## Security Notes

- Client secrets should NEVER be exposed in the mobile app
- Client IDs are safe to expose (they're public)
- All OAuth tokens are encrypted at rest using password-based encryption
- Redirect URIs must match exactly in OAuth provider settings
- For production, use HTTPS redirect URIs

## Important: OAuth Connection Requirements

**Users must be logged in before connecting OAuth services.**

The OAuth token encryption requires the user's encryption key, which is cached during login. If you encounter an error about "User encryption key not found", ensure:

1. The user has logged in successfully (this caches their encryption key)
2. The login session is still active
3. Try logging out and logging back in, then reconnect the OAuth service

This is a security feature - OAuth tokens are encrypted with a key derived from the user's password, ensuring only the user can decrypt their tokens.
