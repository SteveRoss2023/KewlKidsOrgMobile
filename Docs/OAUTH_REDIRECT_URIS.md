# OAuth Redirect URIs Reference

This document lists all the redirect URIs you need to configure in Azure Portal and Google Cloud Console.

## Backend Port

The backend API runs on **port 8900** by default.

## Microsoft Azure Portal (Outlook & OneDrive)

Add these redirect URIs in **Azure Portal** > **App registrations** > **Your App** > **Authentication** > **Web** platform:

### Localhost (Development)
```
http://localhost:8900/api/calendar/outlook/oauth/callback/
http://localhost:8900/api/onedrive/oauth/callback/
```

### Ngrok (Production/Testing)
Replace `YOUR_NGROK_DOMAIN` with your actual ngrok domain:
```
https://YOUR_NGROK_DOMAIN.ngrok.app/api/calendar/outlook/oauth/callback/
https://YOUR_NGROK_DOMAIN.ngrok.app/api/onedrive/oauth/callback/
```

**Example** (if your ngrok domain is `kewlkidsorganizermobile.ngrok.app`):
```
https://kewlkidsorganizermobile.ngrok.app/api/calendar/outlook/oauth/callback/
https://kewlkidsorganizermobile.ngrok.app/api/onedrive/oauth/callback/
```

## Google Cloud Console (Google Drive & Google Photos)

Add these redirect URIs in **Google Cloud Console** > **APIs & Services** > **Credentials** > **OAuth 2.0 Client ID** > **Authorized redirect URIs**:

### Localhost (Development)
```
http://localhost:8900/api/googledrive/oauth/callback/
http://localhost:8900/api/googlephotos/oauth/callback/
```

### Ngrok (Production/Testing)
Replace `YOUR_NGROK_DOMAIN` with your actual ngrok domain:
```
https://YOUR_NGROK_DOMAIN.ngrok.app/api/googledrive/oauth/callback/
https://YOUR_NGROK_DOMAIN.ngrok.app/api/googlephotos/oauth/callback/
```

**Example** (if your ngrok domain is `kewlkidsorganizermobile.ngrok.app`):
```
https://kewlkidsorganizermobile.ngrok.app/api/googledrive/oauth/callback/
https://kewlkidsorganizermobile.ngrok.app/api/googlephotos/oauth/callback/
```

## Complete List for Copy-Paste

### Microsoft Azure - All URIs
```
http://localhost:8900/api/calendar/outlook/oauth/callback/
http://localhost:8900/api/onedrive/oauth/callback/
https://YOUR_NGROK_DOMAIN.ngrok.app/api/calendar/outlook/oauth/callback/
https://YOUR_NGROK_DOMAIN.ngrok.app/api/onedrive/oauth/callback/
```

### Google Cloud Console - All URIs
```
http://localhost:8900/api/googledrive/oauth/callback/
http://localhost:8900/api/googlephotos/oauth/callback/
https://YOUR_NGROK_DOMAIN.ngrok.app/api/googledrive/oauth/callback/
https://YOUR_NGROK_DOMAIN.ngrok.app/api/googlephotos/oauth/callback/
```

## Important Notes

1. **Exact Match Required**: Redirect URIs must match **exactly** (including trailing slashes)
2. **HTTPS for Ngrok**: Ngrok URIs must use `https://` (not `http://`)
3. **Case Sensitive**: URIs are case-sensitive
4. **No Trailing Slash Issues**: Make sure trailing slashes match exactly
5. **Add All URIs**: Add both localhost AND ngrok URIs so you can test in both environments

## Finding Your Ngrok Domain

If you're using ngrok, your domain will look like:
- `kewlkidsorganizermobile.ngrok.app` (if you have a custom domain)
- `abc123.ngrok-free.app` (if using free ngrok)
- `xyz789.ngrok.io` (older ngrok format)

Check your ngrok dashboard or the URL shown when you start ngrok to find your domain.

## Backend .env Configuration

After adding URIs to OAuth providers, update your `backend/.env`:

```env
# For localhost
MICROSOFT_REDIRECT_URI=http://localhost:8900/api/calendar/outlook/oauth/callback/
ONEDRIVE_REDIRECT_URI_DEV=http://localhost:8900/api/onedrive/oauth/callback/
GOOGLEDRIVE_REDIRECT_URI_DEV=http://localhost:8900/api/googledrive/oauth/callback/
GOOGLE_PHOTOS_REDIRECT_URI_DEV=http://localhost:8900/api/googlephotos/oauth/callback/

# For ngrok (replace YOUR_NGROK_DOMAIN with your actual domain)
ONEDRIVE_REDIRECT_URI_PROD=https://YOUR_NGROK_DOMAIN.ngrok.app/api/onedrive/oauth/callback/
GOOGLEDRIVE_REDIRECT_URI_PROD=https://YOUR_NGROK_DOMAIN.ngrok.app/api/googledrive/oauth/callback/
GOOGLE_PHOTOS_REDIRECT_URI_PROD=https://YOUR_NGROK_DOMAIN.ngrok.app/api/googlephotos/oauth/callback/
```
