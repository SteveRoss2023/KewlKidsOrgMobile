---
name: OAuth Sync Services Implementation
overview: Implement Outlook Sync, Microsoft OneDrive Sync, Google Drive Sync, and Google Photos sync services for the mobile app. This includes backend models, API endpoints, OAuth flows, and React Native screens with proper encryption for OAuth tokens.
todos:
  - id: backend-encryption-app
    content: Create encryption app with JWTOAuthTokenMixin and UserEncryptionKey models (copy from reference project)
    status: completed
  - id: backend-documents-app
    content: Create documents app with OneDriveSync, GoogleDriveSync, and GooglePhotosSync models
    status: completed
  - id: backend-events-app
    content: Create events app with CalendarSync model for Outlook sync
    status: completed
  - id: backend-oauth-views
    content: Create OAuth API views for all four services (initiate, callback, connection status, disconnect)
    status: completed
  - id: backend-oauth-urls
    content: Add OAuth routes to backend/api/urls.py
    status: completed
  - id: backend-oauth-settings
    content: Add OAuth client IDs, secrets, and redirect URIs to settings.py
    status: completed
  - id: backend-migrations
    content: Create and run migrations for new models
    status: completed
  - id: mobile-oauth-service
    content: Create mobile/services/oauthService.ts with methods for all OAuth flows
    status: completed
  - id: mobile-outlook-screen
    content: Create mobile/app/(tabs)/outlook-sync.tsx screen
    status: completed
  - id: mobile-onedrive-screen
    content: Create mobile/app/(tabs)/onedrive-connect.tsx screen
    status: completed
  - id: mobile-googledrive-screen
    content: Create mobile/app/(tabs)/googledrive-connect.tsx screen
    status: completed
  - id: mobile-googlephotos-screen
    content: Create mobile/app/(tabs)/googlephotos-connect.tsx screen
    status: completed
  - id: mobile-settings-menu-update
    content: Update SettingsMenu.tsx to check OAuth connection status from backend
    status: completed
  - id: env-configuration
    content: Add OAuth credentials to backend/.env and mobile/.env files
    status: completed
---

# OAuth Sync Services Implementation Plan

## Overview

Implement four OAuth sync services: Outlook Calendar Sync, Microsoft OneDrive, Google Drive, and Google Photos. All OAuth tokens must be encrypted using password-based encryption (JWTOAuthTokenMixin pattern from reference project).

## Reference Project Analysis

### Source Files

- **Outlook Sync**: `KewlKidsOrganizer/frontend/react/src/components/OutlookSyncPage.jsx`, `OutlookSync.jsx`
- **OneDrive**: `KewlKidsOrganizer/frontend/react/src/components/OneDrivePage.jsx`, `OneDriveConnect.jsx`
- **Google Drive**: `KewlKidsOrganizer/frontend/react/src/components/GoogleDrivePage.jsx`, `GoogleDriveConnect.jsx`
- **Backend Models**: 
  - `CalendarSync` (for Outlook) in `events/models.py`
  - `OneDriveSync` in `documents/models.py`
  - `GoogleDriveSync` in `documents/models.py`
- **Encryption**: `encryption/models.py` - `JWTOAuthTokenMixin` for password-based token encryption

### Backend API Endpoints (from reference)

- Outlook: `/calendar/outlook/oauth/initiate/`, `/calendar/outlook/oauth/callback/`, `/calendar/sync/outlook/`
- OneDrive: `/onedrive/oauth/initiate/`, `/onedrive/oauth/callback/`, `/onedrive/connection/`, `/onedrive/disconnect/`
- Google Drive: `/googledrive/oauth/initiate/`, `/googledrive/oauth/callback/`, `/googledrive/connection/`, `/googledrive/disconnect/`

## Implementation Steps

### Phase 1: Backend Setup

#### 1.1 Create Encryption App (if not exists)

- **Location**: `backend/encryption/`
- **Files to create**:
  - `__init__.py`
  - `models.py` - Copy `JWTOAuthTokenMixin` and `UserEncryptionKey` from reference
  - `utils.py` - Encryption utilities
  - `apps.py`
  - `migrations/__init__.py`
- **Reference**: `KewlKidsOrganizer/backend/encryption/models.py`

#### 1.2 Create Documents App (if not exists)

- **Location**: `backend/documents/`
- **Purpose**: Store OneDrive and Google Drive sync models
- **Files to create**:
  - `__init__.py`
  - `models.py` - `OneDriveSync`, `GoogleDriveSync`, `GooglePhotosSync` models
  - `apps.py`
  - `migrations/__init__.py`

#### 1.3 Create Events App (if not exists)

- **Location**: `backend/events/`
- **Purpose**: Store CalendarSync model for Outlook
- **Files to create**:
  - `__init__.py`
  - `models.py` - `CalendarSync` model
  - `apps.py`
  - `migrations/__init__.py`

#### 1.4 Update Backend Models

- **File**: `backend/documents/models.py`
  - Add `OneDriveSync` model (extends `JWTOAuthTokenMixin`)
  - Add `GoogleDriveSync` model
  - Add `GooglePhotosSync` model (new, similar to GoogleDriveSync)
- **File**: `backend/events/models.py`
  - Add `CalendarSync` model (for Outlook sync)
- **All models must**:
  - Use `EncryptedCharField` for email addresses
  - Use `JWTOAuthTokenMixin` for token encryption
  - Link to `Member` model via ForeignKey
  - Store `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`

#### 1.5 Create Backend API Views

- **File**: `backend/api/views.py`
  - **Outlook Endpoints**:
    - `OutlookOAuthInitiateView` - GET `/calendar/outlook/oauth/initiate/`
    - `OutlookOAuthCallbackView` - GET `/calendar/outlook/oauth/callback/`
    - `OutlookCalendarSyncView` - POST `/calendar/sync/outlook/`
  - **OneDrive Endpoints**:
    - `OneDriveOAuthInitiateView` - GET `/onedrive/oauth/initiate/`
    - `OneDriveOAuthCallbackView` - GET `/onedrive/oauth/callback/`
    - `OneDriveConnectionView` - GET `/onedrive/connection/`
    - `OneDriveDisconnectView` - DELETE `/onedrive/disconnect/`
  - **Google Drive Endpoints**:
    - `GoogleDriveOAuthInitiateView` - GET `/googledrive/oauth/initiate/`
    - `GoogleDriveOAuthCallbackView` - GET `/googledrive/oauth/callback/`
    - `GoogleDriveConnectionView` - GET `/googledrive/connection/`
    - `GoogleDriveDisconnectView` - DELETE `/googledrive/disconnect/`
  - **Google Photos Endpoints** (new):
    - `GooglePhotosOAuthInitiateView` - GET `/googlephotos/oauth/initiate/`
    - `GooglePhotosOAuthCallbackView` - GET `/googlephotos/oauth/callback/`
    - `GooglePhotosConnectionView` - GET `/googlephotos/connection/`
    - `GooglePhotosDisconnectView` - DELETE `/googlephotos/disconnect/`

#### 1.6 Update Backend URLs

- **File**: `backend/api/urls.py`
  - Add routes for all OAuth endpoints
  - Add routes for connection status and disconnect

#### 1.7 Update Backend Settings

- **File**: `backend/config/settings.py`
  - Add OAuth client IDs and secrets:
    - `MICROSOFT_CLIENT_ID`
    - `MICROSOFT_CLIENT_SECRET`
    - `ONEDRIVE_CLIENT_ID` (can reuse Microsoft)
    - `ONEDRIVE_CLIENT_SECRET` (can reuse Microsoft)
    - `GOOGLE_CLIENT_ID`
    - `GOOGLE_CLIENT_SECRET`
    - `GOOGLEDRIVE_CLIENT_ID` (can reuse Google)
    - `GOOGLEDRIVE_CLIENT_SECRET` (can reuse Google)
    - `GOOGLE_PHOTOS_CLIENT_ID` (can reuse Google)
    - `GOOGLE_PHOTOS_CLIENT_SECRET` (can reuse Google)
  - Add redirect URIs for each service (dev and prod)

#### 1.8 Create Migrations

- Run `python manage.py makemigrations` for new models
- Run `python manage.py migrate` to apply migrations

### Phase 2: Mobile App Implementation

#### 2.1 Create OAuth Service

- **File**: `mobile/services/oauthService.ts`
  - Methods for each service:
    - `initiateOutlookOAuth()`
    - `initiateOneDriveOAuth()`
    - `initiateGoogleDriveOAuth()`
    - `initiateGooglePhotosOAuth()`
    - `checkConnection(service)` - Check connection status
    - `disconnect(service)` - Disconnect service

#### 2.2 Create React Native Screens

- **File**: `mobile/app/(tabs)/outlook-sync.tsx`
  - Convert `OutlookSync.jsx` to React Native
  - Use `expo-auth-session` for OAuth flow
  - Handle OAuth callback
  - Show sync status and controls
- **File**: `mobile/app/(tabs)/onedrive-connect.tsx`
  - Convert `OneDriveConnect.jsx` to React Native
  - OAuth connection UI
  - Connection status display
- **File**: `mobile/app/(tabs)/googledrive-connect.tsx`
  - Convert `GoogleDriveConnect.jsx` to React Native
  - OAuth connection UI
  - Connection status display
- **File**: `mobile/app/(tabs)/googlephotos-connect.tsx`
  - New screen (similar to Google Drive)
  - OAuth connection UI
  - Connection status display

#### 2.3 Update Settings Menu

- **File**: `mobile/components/SettingsMenu.tsx`
  - Update `checkOAuthConnections()` to call backend endpoints
  - Check connection status for all services

#### 2.4 Install Required Dependencies

- `expo-auth-session` - OAuth flows
- `expo-web-browser` - Open OAuth URLs
- Already installed per plan

### Phase 3: Environment Configuration

#### 3.1 Backend .env File

- **File**: `backend/.env`
  - Add all OAuth client IDs and secrets
  - Add redirect URIs
  - Document encryption key requirements

#### 3.2 Mobile .env File

- **File**: `mobile/.env`
  - Add OAuth client IDs (public, for mobile)
  - Add API base URL

## Key Implementation Details

### OAuth Flow Pattern

1. Mobile app calls backend `/oauth/initiate/` endpoint
2. Backend generates OAuth URL with state parameter
3. Mobile app opens OAuth URL in browser (expo-web-browser)
4. User authorizes in browser
5. OAuth provider redirects to backend callback URL
6. Backend exchanges code for tokens
7. Backend encrypts tokens using `JWTOAuthTokenMixin`
8. Backend redirects to mobile app deep link with success/error
9. Mobile app handles callback and updates UI

### Token Encryption

- All OAuth tokens stored encrypted using `JWTOAuthTokenMixin`
- Uses password-based encryption (user's password)
- Tokens decrypted only when needed for API calls
- Reference: `KewlKidsOrganizer/backend/encryption/models.py`

### Deep Linking

- Configure deep links in `mobile/app.json`
- Handle OAuth callbacks via deep links
- Parse success/error from URL parameters

## Files to Create/Modify

### Backend

- `backend/encryption/models.py` (create if needed)
- `backend/documents/models.py` (create if needed)
- `backend/events/models.py` (create if needed)
- `backend/api/views.py` (add OAuth views)
- `backend/api/urls.py` (add OAuth routes)
- `backend/api/serializers.py` (add sync serializers)
- `backend/config/settings.py` (add OAuth config)
- `backend/.env` (add OAuth credentials)

### Mobile

- `mobile/services/oauthService.ts` (new)
- `mobile/app/(tabs)/outlook-sync.tsx` (new)
- `mobile/app/(tabs)/onedrive-connect.tsx` (new)
- `mobile/app/(tabs)/googledrive-connect.tsx` (new)
- `mobile/app/(tabs)/googlephotos-connect.tsx` (new)
- `mobile/components/SettingsMenu.tsx` (update)
- `mobile/.env` (add OAuth config)

## Environment Variables Required

### Backend .env

```
# Microsoft OAuth (for Outlook and OneDrive)
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_REDIRECT_URI=http://localhost:8900/api/calendar/outlook/oauth/callback/

# OneDrive OAuth (can reuse Microsoft or separate)
ONEDRIVE_CLIENT_ID=your_onedrive_client_id  # or reuse MICROSOFT_CLIENT_ID
ONEDRIVE_CLIENT_SECRET=your_onedrive_client_secret  # or reuse MICROSOFT_CLIENT_SECRET
ONEDRIVE_REDIRECT_URI_DEV=http://localhost:8900/api/onedrive/oauth/callback/
ONEDRIVE_REDIRECT_URI_PROD=https://your-domain.com/api/onedrive/oauth/callback/

# Google OAuth (for Google Drive and Google Photos)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8900/api/googledrive/oauth/callback/

# Google Drive OAuth (can reuse Google or separate)
GOOGLEDRIVE_CLIENT_ID=your_googledrive_client_id  # or reuse GOOGLE_CLIENT_ID
GOOGLEDRIVE_CLIENT_SECRET=your_googledrive_client_secret  # or reuse GOOGLE_CLIENT_SECRET
GOOGLEDRIVE_REDIRECT_URI_DEV=http://localhost:8900/api/googledrive/oauth/callback/
GOOGLEDRIVE_REDIRECT_URI_PROD=https://your-domain.com/api/googledrive/oauth/callback/

# Google Photos OAuth (can reuse Google or separate)
GOOGLE_PHOTOS_CLIENT_ID=your_googlephotos_client_id  # or reuse GOOGLE_CLIENT_ID
GOOGLE_PHOTOS_CLIENT_SECRET=your_googlephotos_client_secret  # or reuse GOOGLE_CLIENT_SECRET
GOOGLE_PHOTOS_REDIRECT_URI_DEV=http://localhost:8900/api/googlephotos/oauth/callback/
GOOGLE_PHOTOS_REDIRECT_URI_PROD=https://your-domain.com/api/googlephotos/oauth/callback/
```

### Mobile .env

```
# OAuth Client IDs (public, safe to expose)
EXPO_PUBLIC_MICROSOFT_CLIENT_ID=your_microsoft_client_id
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id

# API Base URL
EXPO_PUBLIC_API_BASE_URL=http://localhost:8900
```

## Testing Checklist

- [ ] Backend migrations run successfully
- [ ] OAuth initiate endpoints return correct URLs
- [ ] OAuth callback endpoints handle tokens correctly
- [ ] Tokens are encrypted in database
- [ ] Connection status endpoints work
- [ ] Disconnect endpoints work
- [ ] Mobile OAuth flows complete successfully
- [ ] Deep linking handles callbacks
- [ ] Settings menu shows correct connection status
- [ ] All four services can connect/disconnect independently

## Notes

- Google Photos may need additional API setup in Google Cloud Console
- Redirect URIs must match exactly in OAuth provider settings
- For mobile, use custom URL schemes for deep linking (e.g., `kewlkidsorganizer://oauth/callback`)
- Encryption key must be set in backend `.env` as `FERNET_KEY`
- All OAuth tokens require user password for encryption/decryption (handled server-side)