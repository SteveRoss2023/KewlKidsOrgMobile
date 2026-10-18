---
name: React Native Mobile App Setup and Migration
overview: Complete setup guide for creating a new React Native mobile app with Expo, Django backend, testing in browser/phone, and deployment to Google Play and Apple App Store. Includes migration strategy for all features from the existing web app.
todos:
  - id: setup-project-structure
    content: Create new project folder structure (KewlKidsOrganizerMobile/) with mobile/ and backend/ directories
    status: pending
  - id: setup-django-backend
    content: Initialize Django project, configure settings, set up authentication API endpoints, install dependencies
    status: pending
  - id: setup-expo-app
    content: Initialize Expo app, install core dependencies (navigation, storage, API client), configure app.json
    status: pending
  - id: create-api-service-layer
    content: Create API client with axios, token management, error handling, and base service classes
    status: pending
  - id: migrate-authentication
    content: Convert Login, Register, PasswordReset components to React Native, add biometric auth
    status: pending
  - id: setup-navigation
    content: Set up Expo Router with file-based routing, create auth stack and main tabs navigation
    status: pending
  - id: migrate-home-screen
    content: Convert Home component to React Native with card-based navigation
    status: pending
  - id: migrate-family-management
    content: Convert Families component to React Native, implement family CRUD operations
    status: pending
  - id: setup-browser-testing
    content: Configure Expo Web, test app in browser, verify API connections
    status: pending
  - id: setup-phone-testing
    content: Set up Expo Go testing, create development build with EAS, test on physical devices
    status: pending
  - id: migrate-calendar
    content: Convert Calendar and Events components, integrate react-native-calendars, add OAuth sync
    status: pending
  - id: migrate-lists
    content: Convert Lists and ListDetail components, add WebSocket real-time updates, offline support
    status: pending
  - id: migrate-chat
    content: Convert Chat component with E2EE, WebSocket integration, voice messages, attachments
    status: pending
  - id: migrate-meals
    content: Convert Meals component, recipe import, meal planning calendar, shopping list integration
    status: pending
  - id: migrate-documents
    content: Convert Documents component, file upload (camera/gallery), document preview, encryption
    status: pending
  - id: migrate-finance
    content: Convert Finance component, transaction management, budget tracking, charts
    status: pending
  - id: migrate-map
    content: Convert Map component, location sharing, react-native-maps integration
    status: pending
  - id: migrate-profile-settings
    content: Convert Profile and Settings components, OAuth service connections, dark mode
    status: pending
  - id: migrate-voice-commands
    content: Port voice recognition hooks and VoiceButton component to React Native
    status: pending
  - id: add-push-notifications
    content: Configure Expo Notifications, register for push tokens, handle foreground/background notifications
    status: pending
  - id: add-offline-support
    content: Implement SQLite for offline storage, sync queue, conflict resolution
    status: pending
  - id: port-encryption-utils
    content: Port Web Crypto API encryption to React Native, implement E2EE for chat
    status: pending
  - id: prepare-store-assets
    content: Create app icons (all sizes), splash screens, store screenshots, feature graphics
    status: pending
  - id: configure-eas-build
    content: Set up eas.json, configure Android and iOS build profiles, test builds
    status: pending
  - id: deploy-google-play
    content: Create Google Play Developer account, configure store listing, build and submit APK/AAB
    status: pending
  - id: deploy-apple-store
    content: Create Apple Developer account, configure App Store Connect, build and submit IPA
    status: pending
  - id: create-documentation
    content: Write SETUP.md, TESTING.md, DEPLOYMENT.md, MIGRATION.md, and README.md
    status: pending
---

# React Native Mobile App Setup and Migration Plan

## Source Project Reference

**Source Web App Location**: `C:\Users\steve_80f2z1j\OneDrive\Documents\Development\Projects\Cursor Projects\KewlKidsOrganizer`

**Key Source Directories**:

- React Components: `KewlKidsOrganizer/frontend/react/src/components/`
- React Utils: `KewlKidsOrganizer/frontend/react/src/utils/`
- React Hooks: `KewlKidsOrganizer/frontend/react/src/hooks/`
- React Contexts: `KewlKidsOrganizer/frontend/react/src/contexts/`
- Django Backend: `KewlKidsOrganizer/backend/`
- Django API: `KewlKidsOrganizer/backend/api/`
- Django Apps: `KewlKidsOrganizer/backend/families/`, `events/`, `lists/`, `chat/`, `meals/`, `documents/`, `finance/`

**Note**: When migrating features, reference the source files in the KewlKidsOrganizer project to understand the original implementation before converting to React Native.

## Project Structure

```
KewlKidsOrganizerMobile/
├── mobile/                    # React Native app (Expo)
│   ├── app/                   # App router (Expo Router)
│   ├── components/            # React Native components
│   ├── screens/               # Screen components
│   ├── services/              # API services
│   ├── utils/                 # Utilities (encryption, API, etc.)
│   ├── contexts/              # React contexts
│   ├── hooks/                 # Custom hooks
│   ├── navigation/            # Navigation setup
│   └── app.json               # Expo configuration
├── backend/                   # Django backend
│   ├── config/                # Django settings
│   ├── api/                   # API endpoints
│   ├── families/              # Family management
│   ├── events/                # Calendar events
│   ├── lists/                 # Lists & shopping
│   ├── chat/                  # Chat with E2EE
│   ├── meals/                 # Meal planning
│   ├── documents/             # Document sharing
│   ├── finance/               # Finance tracking
│   └── manage.py
├── docs/                      # Documentation
│   ├── SETUP.md               # Setup instructions
│   ├── TESTING.md              # Testing guide
│   ├── DEPLOYMENT.md           # Store deployment guide
│   └── MIGRATION.md            # Feature migration guide
└── README.md
```

## Phase 1: Project Setup and Foundation

### 1.1 Create New Project Structure

**Location**: Root directory `KewlKidsOrganizerMobile/`

- Create new folder structure
- Initialize Git repository
- Set up `.gitignore` for both React Native and Django

### 1.2 Django Backend Setup

**Location**: `backend/`

- Create new Django project: `django-admin startproject config .`
- Install dependencies: Django, DRF, JWT, CORS, Channels, encryption libraries
- Configure `settings.py`:
  - CORS settings for mobile app
  - JWT authentication
  - Database (PostgreSQL or SQLite for dev)
  - Redis for WebSockets
- Create base API structure with authentication endpoints
- Set up environment variables (`.env` file)

**Files to create**:

- `backend/requirements.txt`
- `backend/.env.example`
- `backend/config/settings.py` (configured)
- `backend/config/urls.py`
- `backend/api/views.py` (auth endpoints)

### 1.3 React Native App Setup with Expo

**Location**: `mobile/`

- Initialize Expo project: `npx create-expo-app@latest mobile --template blank`
- Install core dependencies:
  - `@react-navigation/native` and stack/bottom-tabs
  - `expo-router` (for file-based routing)
  - `axios` (API calls)
  - `@react-native-async-storage/async-storage` (storage)
  - `expo-secure-store` (secure token storage)
  - `expo-web-browser` (OAuth)
  - `react-native-paper` or `native-base` (UI library)
- Configure `app.json`:
  - App name, bundle ID, package name
  - Icons and splash screen
  - Permissions (camera, location, notifications, etc.)
- Set up environment configuration for API URLs

**Files to create**:

- `mobile/package.json`
- `mobile/app.json`
- `mobile/.env.example`
- `mobile/app/_layout.tsx` (root layout with navigation)
- `mobile/app/(auth)/login.tsx` (login screen)
- `mobile/app/(tabs)/index.tsx` (home screen)

### 1.4 API Service Layer

**Location**: `mobile/services/`

- Create API client with axios
- Implement token management (store/refresh)
- Create base service classes
- Set up error handling

**Files to create**:

- `mobile/services/api.ts` (API client)
- `mobile/services/authService.ts`
- `mobile/utils/storage.ts` (AsyncStorage wrapper)

## Phase 2: Core Features (Initial Migration)

### 2.1 Authentication System

**Location**: `mobile/app/(auth)/` and `mobile/screens/auth/`

- Login screen (React Native components)
- Register screen
- Password reset flow
- Token storage and refresh logic
- Biometric authentication (Face ID/Touch ID) using `expo-local-authentication`

**Migration from**: `frontend/react/src/components/Login.jsx`, `Register.jsx`, `PasswordReset.jsx`

**React Native components**:

- Replace `<div>` → `<View>`
- Replace `<input>` → `<TextInput>`
- Replace `<button>` → `<TouchableOpacity>` or `<Pressable>`
- Replace CSS → `StyleSheet`

### 2.2 Navigation Setup

**Location**: `mobile/navigation/` and `mobile/app/`

- Set up Expo Router with file-based routing
- Create navigation structure:
  - Auth stack (login, register)
  - Main tabs (home, calendar, lists, chat, etc.)
  - Modal screens
- Implement deep linking

**Files to create**:

- `mobile/app/_layout.tsx` (root layout)
- `mobile/app/(auth)/_layout.tsx`
- `mobile/app/(tabs)/_layout.tsx`

### 2.3 Home Screen

**Location**: `mobile/app/(tabs)/index.tsx`

- Convert Home component to React Native
- Card-based navigation to features
- Unread count badges
- Family selector integration

**Migration from**: `frontend/react/src/components/Home.jsx`

### 2.4 Family Management

**Location**: `mobile/screens/families/`

- Family list screen
- Create/join family
- Family member management
- Role-based permissions UI

**Migration from**: `frontend/react/src/components/Families.jsx`

## Phase 3: Testing Setup

### 3.1 Browser Testing (Expo Web)

**Location**: `mobile/`

- Configure Expo for web: `npx expo install react-native-web react-dom @expo/metro-runtime`
- Test in browser: `npx expo start --web`
- Verify responsive design
- Test API connections

**Commands**:

```bash
cd mobile
npx expo start --web
```

### 3.2 Phone Testing (Expo Go)

**Location**: `mobile/`

- Install Expo Go app on phone (iOS/Android)
- Start development server: `npx expo start`
- Scan QR code with Expo Go
- Test on real device

**Commands**:

```bash
cd mobile
npx expo start
# Scan QR code with Expo Go app
```

### 3.3 Development Build (EAS Build)

**Location**: `mobile/`

- Install EAS CLI: `npm install -g eas-cli`
- Configure `eas.json` for development builds
- Create development build for testing native features
- Test on physical devices

**Files to create**:

- `mobile/eas.json`

## Phase 4: Feature Migration (Complete List)

### 4.1 Calendar System

**Location**: `mobile/screens/calendar/`

- Calendar view (month/week/day) using `react-native-calendars`
- Event creation/editing
- Event details screen
- Google Calendar OAuth integration
- Outlook Calendar OAuth integration
- Calendar sync settings

**Migration from**: `frontend/react/src/components/CalendarNew.jsx`, `Events.jsx`

**Dependencies**: `react-native-calendars`, `@react-native-community/datetimepicker`

### 4.2 Lists & Shopping

**Location**: `mobile/screens/lists/`

- Shopping lists screen
- To-do lists screen
- List detail with items
- Real-time updates via WebSocket
- Grocery categories
- Offline support

**Migration from**: `frontend/react/src/components/Lists.jsx`, `ListDetail.jsx`, `GroceryCategories.jsx`

**Dependencies**: `@react-native-community/netinfo` (offline detection)

### 4.3 Secure Messaging (E2EE Chat)

**Location**: `mobile/screens/chat/`

- Chat room list
- Chat conversation screen
- Message input with attachments
- End-to-end encryption (React Native Crypto)
- WebSocket connection for real-time
- Typing indicators
- Voice messages

**Migration from**: `frontend/react/src/components/Chat.jsx`

**Dependencies**: `react-native-crypto`, `react-native-websocket` or native WebSocket

### 4.4 Meal Planning & Recipes

**Location**: `mobile/screens/meals/`

- Recipe list
- Recipe detail
- Recipe creation/editing
- Recipe URL import
- Meal planning calendar
- Shopping list integration

**Migration from**: `frontend/react/src/components/Meals.jsx`

### 4.5 Documents & Media Sharing

**Location**: `mobile/screens/documents/`

- Document list
- File upload (camera/gallery/picker)
- Document preview
- Encrypted file storage
- Media gallery

**Migration from**: `frontend/react/src/components/Documents.jsx`

**Dependencies**: `expo-document-picker`, `expo-image-picker`, `expo-file-system`

### 4.6 Finance Tracking

**Location**: `mobile/screens/finance/`

- Transaction list
- Add/edit transactions
- Budget tracking
- Financial reports
- Charts/graphs

**Migration from**: `frontend/react/src/components/Finance.jsx`

**Dependencies**: `react-native-chart-kit` or `victory-native`

### 4.7 Map/Location Sharing

**Location**: `mobile/screens/map/`

- Map view with family locations
- Location sharing settings
- Location history

**Migration from**: `frontend/react/src/components/Map.jsx`

**Dependencies**: `react-native-maps`, `expo-location`

### 4.8 Profile & Settings

**Location**: `mobile/screens/profile/` and `mobile/screens/settings/`

- User profile screen
- Edit profile (name, photo)
- Settings screen
- Dark mode toggle
- Voice preferences
- OAuth service connections (OneDrive, Google Drive, Outlook)

**Migration from**: `frontend/react/src/components/Profile.jsx`, `Settings.jsx`, `OutlookSyncPage.jsx`, `OneDrivePage.jsx`, `GoogleDrivePage.jsx`

### 4.9 Today/Dashboard

**Location**: `mobile/screens/today/`

- Today's events
- Upcoming tasks
- Quick actions

**Migration from**: `frontend/react/src/components/Today.jsx`

### 4.10 Voice Commands

**Location**: `mobile/hooks/` and `mobile/components/`

- Voice recognition hook
- Voice command processing
- Voice feedback

**Migration from**: `frontend/react/src/hooks/useVoiceRecognition.js`, `useCalendarVoiceCommands.js`, `VoiceButton.jsx`

**Dependencies**: `expo-speech`, `expo-av` (for voice input)

## Phase 5: Advanced Features

### 5.1 Push Notifications

**Location**: `mobile/services/notifications.ts`

- Configure Expo Notifications
- Register for push tokens
- Handle notifications (foreground/background)
- Deep linking from notifications

**Dependencies**: `expo-notifications`

**Backend**: Django endpoint to send push notifications via FCM/APNs

### 5.2 Offline Support

**Location**: `mobile/services/offline.ts`

- SQLite database for offline storage
- Sync queue for offline actions
- Conflict resolution

**Dependencies**: `react-native-sqlite-storage` or `@react-native-async-storage/async-storage`

### 5.3 Encryption Utilities

**Location**: `mobile/utils/encryption.ts`

- Port Web Crypto API encryption to React Native
- Key management
- E2EE chat encryption

**Migration from**: `frontend/react/src/utils/encryption.js`

**Dependencies**: `react-native-crypto` or `expo-crypto`

## Phase 6: Store Deployment Preparation

### 6.1 App Configuration

**Location**: `mobile/app.json` and `mobile/app.config.js`

- App name, description
- Bundle ID (iOS) and Package Name (Android)
- Version and build numbers
- Icons (all sizes)
- Splash screen
- Privacy policy URL
- App Store categories

### 6.2 Assets Preparation

**Location**: `mobile/assets/`

- App icon (1024x1024 for iOS, various sizes for Android)
- Splash screen images
- Store screenshots (required sizes for both stores)
- Feature graphics (Android)
- App preview videos (optional)

### 6.3 Google Play Store Setup

**Location**: `docs/DEPLOYMENT.md`

**Prerequisites**:

- Google Play Developer account ($25 one-time)
- App signing key

**Steps**:

1. Create app in Google Play Console
2. Set up app signing
3. Configure store listing:

   - App name, description, screenshots
   - Content rating questionnaire
   - Privacy policy URL
   - Target audience

4. Build production APK/AAB using EAS Build
5. Upload to Play Console
6. Submit for review

**EAS Build Configuration** (`mobile/eas.json`):

```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

**Commands**:

```bash
cd mobile
eas build --platform android --profile production
```

### 6.4 Apple App Store Setup

**Location**: `docs/DEPLOYMENT.md`

**Prerequisites**:

- Apple Developer Program membership ($99/year)
- App Store Connect account
- Mac computer (for building, or use EAS Build)

**Steps**:

1. Create app in App Store Connect
2. Configure app information:

   - App name, description, keywords
   - Screenshots (all required sizes)
   - Privacy policy URL
   - App category

3. Set up App Store Connect API key (for EAS)
4. Build production IPA using EAS Build
5. Submit to App Store Connect
6. Submit for App Review

**EAS Build Configuration** (`mobile/eas.json`):

```json
{
  "build": {
    "production": {
      "ios": {
        "bundleIdentifier": "com.yourcompany.kewlkidsorganizer"
      }
    }
  }
}
```

**Commands**:

```bash
cd mobile
eas build --platform ios --profile production
eas submit --platform ios
```

### 6.5 Continuous Deployment

**Location**: `mobile/` and `.github/workflows/`

- Set up GitHub Actions for automated builds
- Configure EAS Update for OTA updates
- Set up staging/production environments

**Files to create**:

- `.github/workflows/build-android.yml`
- `.github/workflows/build-ios.yml`

## Phase 7: Documentation

### 7.1 Setup Documentation

**Location**: `docs/SETUP.md`

- Prerequisites (Node.js, Python, Expo CLI)
- Installation steps
- Environment setup
- Running locally
- Testing instructions

### 7.2 Testing Documentation

**Location**: `docs/TESTING.md`

- Browser testing with Expo Web
- Phone testing with Expo Go
- Development builds
- Testing on physical devices
- Debugging tips

### 7.3 Deployment Documentation

**Location**: `docs/DEPLOYMENT.md`

- Google Play Store deployment (step-by-step)
- Apple App Store deployment (step-by-step)
- EAS Build configuration
- Store asset requirements
- Submission checklist

### 7.4 Migration Documentation

**Location**: `docs/MIGRATION.md`

- Component migration guide (React → React Native)
- Feature-by-feature migration checklist
- Common patterns and conversions
- Testing checklist for each feature

## Migration Strategy

### Component Conversion Pattern

For each web component, follow this pattern:

1. **Analyze the component**:

   - Identify HTML elements → React Native components
   - Identify CSS → StyleSheet conversion
   - Identify event handlers (onClick → onPress, onChange → onChangeText)

2. **Create React Native version**:

   - Create new file in `mobile/screens/` or `mobile/components/`
   - Convert JSX structure
   - Convert styles
   - Update imports

3. **Test**:

   - Test in Expo Web (browser)
   - Test in Expo Go (phone)
   - Test on physical device

4. **Integrate**:

   - Add to navigation
   - Connect to API
   - Test end-to-end

### Feature Migration Priority

1. **Phase 1** (Foundation): Auth, Home, Navigation, Family Management
2. **Phase 2** (Core): Calendar, Lists, Chat
3. **Phase 3** (Extended): Meals, Documents, Finance
4. **Phase 4** (Advanced): Map, Voice, OAuth integrations
5. **Phase 5** (Polish): Notifications, Offline, Performance

## Testing Checklist

### Browser Testing (Expo Web)

- [ ] App loads in browser
- [ ] Navigation works
- [ ] API calls succeed
- [ ] Forms submit correctly
- [ ] Responsive design works

### Phone Testing (Expo Go)

- [ ] App installs via Expo Go
- [ ] All screens render correctly
- [ ] Touch interactions work
- [ ] Native features (camera, location) work
- [ ] Performance is acceptable

### Store Submission Testing

- [ ] App builds successfully (EAS Build)
- [ ] App installs on clean device
- [ ] All features work without Expo Go
- [ ] No crashes or errors
- [ ] Privacy policy accessible
- [ ] App meets store guidelines

## Key Files to Create

### Mobile App

- `mobile/app.json` - Expo configuration
- `mobile/app/_layout.tsx` - Root layout
- `mobile/app/(auth)/login.tsx` - Login screen
- `mobile/app/(tabs)/index.tsx` - Home screen
- `mobile/services/api.ts` - API client
- `mobile/utils/storage.ts` - Storage utilities
- `mobile/utils/encryption.ts` - Encryption utilities
- `mobile/eas.json` - EAS Build configuration

### Backend

- `backend/requirements.txt` - Python dependencies
- `backend/config/settings.py` - Django settings
- `backend/api/views.py` - API endpoints
- `backend/.env.example` - Environment template

### Documentation

- `docs/SETUP.md` - Setup instructions
- `docs/TESTING.md` - Testing guide
- `docs/DEPLOYMENT.md` - Store deployment guide
- `docs/MIGRATION.md` - Feature migration guide
- `README.md` - Project overview

## Dependencies Summary

### Mobile (React Native/Expo)

- Core: `expo`, `expo-router`, `react-native`
- Navigation: `@react-navigation/native`, `expo-router`
- API: `axios`
- Storage: `@react-native-async-storage/async-storage`, `expo-secure-store`
- UI: `react-native-paper` or `native-base`
- Features: `react-native-calendars`, `react-native-maps`, `expo-notifications`, `expo-camera`, `expo-location`
- Encryption: `expo-crypto` or `react-native-crypto`

### Backend (Django)

- Core: `Django`, `djangorestframework`
- Auth: `djangorestframework-simplejwt`
- CORS: `django-cors-headers`
- WebSockets: `channels`, `channels-redis`
- Encryption: `django-fernet-fields`, `cryptography`
- Database: `psycopg2-binary` (PostgreSQL) or SQLite for dev

## Timeline Estimate

- **Phase 1** (Setup): 1-2 weeks
- **Phase 2** (Core Features): 2-3 weeks
- **Phase 3** (Testing Setup): 1 week
- **Phase 4** (Feature Migration): 8-12 weeks (depending on features)
- **Phase 5** (Advanced Features): 2-3 weeks
- **Phase 6** (Store Deployment): 2-3 weeks
- **Phase 7** (Documentation): 1 week

**Total**: ~4-6 months for complete migration and deployment