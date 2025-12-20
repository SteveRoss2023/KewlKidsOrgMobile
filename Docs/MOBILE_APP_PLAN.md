# React Native Mobile App Setup and Migration Plan

## Source Project Reference

**Source Web App Location**: `C:\Users\steve_80f2z1j\OneDrive\Documents\Development\Projects\Cursor Projects\KewlKidsOrganizer`

**Source Web Application 2 Location**:
`C:\Users\steve_80f2z1j\OneDrive\Documents\Development\Projects\Cursor Projects\KewlKidsOrganizerMobile`

**Key Source Directories**:
- React Components: `KewlKidsOrganizer/frontend/react/src/components/`
- React Utils: `KewlKidsOrganizer/frontend/react/src/utils/`
- React Hooks: `KewlKidsOrganizer/frontend/react/src/hooks/`
- React Contexts: `KewlKidsOrganizer/frontend/react/src/contexts/`
- Django Backend: `KewlKidsOrganizer/backend/`
- Django API: `KewlKidsOrganizer/backend/api/`
- Django Apps: `KewlKidsOrganizer/backend/families/`, `events/`, `lists/`, `chat/`, `meals/`, `documents/`, `finance/`

**Note**: When migrating features, reference the source files in the KewlKidsOrganizer project to understand the original implementation before converting to React Native.

## Technology Versions

### Backend Stack
- **Python**: 3.12.2 (installed)
- **Django**: 5.2.8 (installed)
- **Django REST Framework**: 3.16.1 (installed)
- **PostgreSQL**: 15+ (REQUIRED for development)
- **Redis**: 7.1.0 (installed, optional for development)
- **Django Channels**: 4.3.2 (installed)
- **Daphne**: 4.2.1 (installed, ASGI server)
- **Development Server Port**: 8900 (configured)

### Mobile Stack
- **Node.js**: 18+ (LTS recommended)
- **npm**: 9+ or **yarn**: 1.22+
- **Expo SDK**: 51+ (latest stable)
- **React Native**: 0.74+ (via Expo)
- **React**: 18.2.0+
- **Expo CLI**: Latest (install via `npm install -g expo-cli`)

### Development Tools
- **EAS CLI**: Latest (`npm install -g eas-cli`)
- **Expo Go App**: Latest from App Store/Play Store
- **Docker**: Latest (for Redis container)
- **Git**: Latest

### Key Dependencies Versions
- **axios**: ^1.6.0
- **@react-navigation/native**: ^6.1.0
- **expo-router**: ^3.5.0+
- **@react-native-async-storage/async-storage**: ^1.21.0
- **expo-secure-store**: ~12.8.0
- **react-native-calendars**: ^1.1301.0
- **react-native-maps**: ^1.14.0
- **expo-notifications**: ~0.28.0

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

#### Step 1: Create Virtual Environment

```bash
# Navigate to project root
cd KewlKidsOrganizerMobile

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

#### Step 2: Install Python Dependencies

Create `backend/requirements.txt`:
```
# Core Django
Django>=5.2.8,<6.0
djangorestframework>=3.14.0
django-cors-headers>=4.3.0

# Authentication
djangorestframework-simplejwt>=5.3.0

# WebSockets
channels>=4.0.0
channels-redis>=4.1.0
daphne>=4.0.0

# Database
psycopg2-binary>=2.9.9  # PostgreSQL
# Use SQLite for development (built-in, no install needed)

# Encryption
django-encrypted-model-fields>=0.7.0
cryptography>=41.0.0

# Utilities
python-dotenv>=1.0.0
Pillow>=10.0.0
requests>=2.31.0
beautifulsoup4>=4.12.0
recipe-scrapers>=14.0.0

# Background Tasks (optional)
celery>=5.3.0
redis>=5.0.0
```

Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

#### Step 3: Create Django Project

```bash
# From backend directory
django-admin startproject config .

# This creates:
# backend/
#   config/
#     __init__.py
#     settings.py
#     urls.py
#     wsgi.py
#     asgi.py
#   manage.py
```

#### Step 4: Configure Database

**PostgreSQL is REQUIRED for development** - SQLite is not used in this project.

**PostgreSQL Setup** (REQUIRED):

1. **Install PostgreSQL 15+ on your system**
   - Windows: Download from https://www.postgresql.org/download/windows/
   - Mac: `brew install postgresql@15` or download from https://www.postgresql.org/download/macosx/
   - Linux: `sudo apt-get install postgresql-15` (Ubuntu/Debian)

2. **Start PostgreSQL service**
   - Windows: PostgreSQL service should start automatically, or use Services app
   - Mac/Linux: `sudo service postgresql start` or `brew services start postgresql@15`

3. **Create database and user**:
   ```sql
   -- Connect to PostgreSQL as superuser (usually 'postgres')
   psql -U postgres

   -- Create database
   CREATE DATABASE kewlkidsorganizer_mobile;

   -- Create user
   CREATE USER kewlkids_user WITH PASSWORD 'your_password';

   -- Grant privileges
   GRANT ALL PRIVILEGES ON DATABASE kewlkidsorganizer_mobile TO kewlkids_user;
   ALTER DATABASE kewlkidsorganizer_mobile OWNER TO kewlkids_user;
   ```

4. **Enable pgcrypto extension**:
   ```sql
   -- Connect to the new database
   \c kewlkidsorganizer_mobile

   -- Enable extension
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```

5. **Configure environment variables** in `backend/.env`:
   ```
   DATABASE_NAME=kewlkidsorganizer_mobile
   DATABASE_USER=kewlkids_user
   DATABASE_PASSWORD=your_password
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   ```

**See `backend/setup_postgres.md` for detailed setup instructions.**

#### Step 5: Configure Settings

Update `backend/config/settings.py` with CORS, JWT, Channels, and database configuration (see full plan for complete settings.py code).

#### Step 6: Create Environment File

Create `backend/.env.example` and `backend/.env` with all required environment variables.

#### Step 7: Create Base API App

```bash
cd backend
python manage.py startapp api
```

Create authentication endpoints in `backend/api/views.py`.

#### Step 8: Run Migrations

```bash
cd backend
python manage.py migrate
python manage.py createsuperuser
admin
GitterDone
```

#### Step 9: Start Development Server

```bash
# Regular Django server (for REST API)
python manage.py runserver

# ASGI server (for WebSockets)
daphne config.asgi:application --port 8000
```

**Files to create**:
- `backend/requirements.txt`
- `backend/.env.example`
- `backend/.env`
- `backend/config/settings.py` (configured)
- `backend/config/urls.py`
- `backend/api/views.py`
- `backend/api/urls.py`

### 1.3 React Native App Setup with Expo

**Location**: `mobile/`

#### Step 1: Prerequisites

**Install Node.js**:
- Download and install Node.js 18+ LTS from https://nodejs.org/
- Verify installation:
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

**Install Expo CLI** (optional, but recommended):
```bash
npm install -g expo-cli
```

#### Step 2: Initialize Expo Project

```bash
# From project root
cd KewlKidsOrganizerMobile

# Create Expo app
npx create-expo-app@latest mobile --template blank

# This creates:
# mobile/
#   app/
#     _layout.tsx
#   assets/
#   package.json
#   app.json
#   .gitignore
```

#### Step 3: Install Core Dependencies

```bash
cd mobile

# Navigation
npx expo install @react-navigation/native
npx expo install react-native-screens react-native-safe-area-context
npx expo install @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install expo-router@~3.5.0

# API and Storage
npm install axios@^1.6.0
npx expo install @react-native-async-storage/async-storage@^1.21.0
npx expo install expo-secure-store@~12.8.0

# OAuth
npx expo install expo-web-browser@~13.0.0
npx expo install expo-auth-session@~5.5.0

# UI Library (choose one)
# Option 1: React Native Paper (Material Design)
npm install react-native-paper@^5.11.0
npx expo install react-native-vector-icons

# Web Support (for browser testing)
npx expo install react-native-web@~0.19.0 react-dom@18.2.0 @expo/metro-runtime

# Environment Variables
npm install react-native-dotenv@^3.4.0

# Utilities
npx expo install expo-constants@~16.0.0
npx expo install expo-linking@~6.3.0
```

#### Step 4: Configure app.json

Update `mobile/app.json` with app name, bundle ID, permissions, and all required configuration.

#### Step 5: Set Up Environment Configuration

Create `mobile/.env.example` and `mobile/.env` with API URLs and OAuth client IDs.

Create `mobile/babel.config.js` for environment variable support.

#### Step 6: Create Project Structure

```bash
cd mobile

# Create directories
mkdir -p app/(auth)
mkdir -p app/(tabs)
mkdir -p components
mkdir -p screens
mkdir -p services
mkdir -p utils
mkdir -p contexts
mkdir -p hooks
mkdir -p navigation
mkdir -p types
```

#### Step 7: Verify Installation

```bash
cd mobile
npm install
npx expo start
```

**Files to create**:
- `mobile/package.json` (auto-generated, verify dependencies)
- `mobile/app.json` (configured)
- `mobile/.env.example`
- `mobile/.env`
- `mobile/babel.config.js`
- `mobile/app/_layout.tsx` (root layout)
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

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Login.jsx`, `Register.jsx`, `PasswordReset.jsx`

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

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Home.jsx`

### 2.4 Family Management

**Location**: `mobile/screens/families/`

- Family list screen
- Create/join family
- Family member management
- Role-based permissions UI

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Families.jsx`

## Phase 3: Testing Setup

### 3.1 Browser Testing (Expo Web) - Detailed Instructions

**Location**: `mobile/`

#### Step 1: Install Web Dependencies

```bash
cd mobile
npx expo install react-native-web react-dom @expo/metro-runtime
```

#### Step 2: Configure Web Support

Ensure `app.json` has web configuration:
```json
{
  "expo": {
    "web": {
      "bundler": "metro",
      "output": "static"
    }
  }
}
```

#### Step 3: Start Web Development Server

```bash
cd mobile
npx expo start --web
```

**What happens**:
- Metro bundler starts
- Webpack builds for web
- Browser automatically opens to `http://localhost:8081`
- Hot reload enabled

**Alternative Commands**:
```bash
# Start web on specific port
npx expo start --web --port 3000

# Start web without opening browser
npx expo start --web --no-open
```

#### Step 4: Test in Browser

**Initial Load**:
- Browser should open automatically
- App should render similar to mobile version
- Check browser console for errors (F12 → Console)

**Navigation Testing**:
- Test all navigation routes
- Verify deep linking works
- Test browser back/forward buttons
- Test refresh (F5)

**Responsive Design**:
- Resize browser window to test different screen sizes
- Test mobile viewport (Chrome DevTools → Toggle device toolbar)
- Verify layouts adapt correctly
- Test touch interactions (if using touchscreen)

**API Connection**:
- Ensure Django backend is running on `http://localhost:8000`
- Update API base URL in `mobile/services/api.ts`:
  ```typescript
  const API_BASE_URL = __DEV__
    ? 'http://localhost:8000'  // For web browser
    : 'https://your-production-api.com';
  ```
- Test API calls from browser
- Check Network tab (F12 → Network) for API requests
- Verify CORS is configured correctly in Django

#### Step 5: Browser Developer Tools

**Chrome DevTools (Recommended)**:
- Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- **Console Tab**: View logs, errors, warnings
- **Network Tab**: Monitor API calls, check response times
- **Elements Tab**: Inspect DOM, test CSS
- **Application Tab**: Check localStorage, cookies
- **React DevTools**: Install extension for React component inspection

**Mobile Emulation**:
- Open DevTools (F12)
- Click device toolbar icon (Ctrl+Shift+M)
- Select device preset (iPhone, iPad, Android)
- Test touch interactions
- Test different screen orientations

**Performance Testing**:
- Open DevTools → Performance tab
- Record performance profile
- Identify bottlenecks
- Check render times
- Monitor memory usage

#### Step 6: Web-Specific Considerations

**Platform Detection**:
```typescript
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  // Web-specific code
  console.log('Running on web');
}
```

**Web-Specific Features**:
- Test file uploads (drag & drop)
- Test keyboard shortcuts
- Test copy/paste functionality
- Test right-click context menus (if implemented)

**Limitations on Web**:
- Some native features won't work (camera, location may have limited support)
- Push notifications require service worker setup
- File system access is limited
- Some native modules may not have web equivalents

#### Step 7: Debugging Web Issues

**Common Issues**:
- **"Module not found"**: Run `npx expo install [package-name]`
- **Styling issues**: Check if styles work on web (some RN styles differ)
- **API CORS errors**: Verify Django CORS settings allow localhost
- **Routing issues**: Check Expo Router web configuration

**Debug Commands**:
```bash
# Clear cache and restart
npx expo start --web --clear

# Check for dependency issues
npm ls

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### Step 8: Production Web Build

**Build for Production**:
```bash
npx expo export:web
```

**Output**:
- Creates `web-build/` directory
- Static HTML, CSS, JS files
- Can be deployed to any static hosting (Netlify, Vercel, etc.)

**Test Production Build Locally**:
```bash
# After building
npx serve web-build

# Or use any static server
cd web-build
python -m http.server 8000
```

#### Step 9: Cross-Browser Testing

**Test in Multiple Browsers**:
- **Chrome**: Primary development browser
- **Firefox**: Test compatibility
- **Safari**: Test macOS/iOS compatibility
- **Edge**: Test Windows compatibility

**Browser-Specific Issues**:
- Safari may have different behavior with dates, flexbox
- Firefox may render some styles differently
- Check browser console for warnings/errors

### 3.2 Phone Testing (Expo Go) - Detailed Instructions

**Location**: `mobile/`

#### Step 1: Install Expo Go App

**For iOS (iPhone/iPad)**:
1. Open App Store on your iPhone/iPad
2. Search for "Expo Go"
3. Install the official Expo Go app by Expo
4. Ensure your device is running iOS 13.0 or later

**For Android**:
1. Open Google Play Store on your Android device
2. Search for "Expo Go"
3. Install the official Expo Go app by Expo
4. Ensure your device is running Android 6.0 (API level 23) or later

#### Step 2: Ensure Phone and Computer are on Same Network

- Both your development computer and phone must be on the same Wi-Fi network
- If using a corporate/school network, ensure it allows device-to-device communication
- Alternative: Use USB connection with `npx expo start --tunnel` (requires Expo account)

#### Step 3: Start Development Server

**Basic Command**:
```bash
cd mobile
npx expo start
```

**What you'll see**:
- Metro bundler starts
- QR code appears in terminal
- Development server URL (e.g., `exp://192.168.1.100:8081`)
- Options menu with commands (press `?` for help)

**Alternative Start Options**:
```bash
# Start with tunnel (works across networks, requires Expo account)
npx expo start --tunnel

# Start and automatically open in Expo Go (if configured)
npx expo start --go

# Start with specific port
npx expo start --port 8082
```

#### Step 4: Connect Phone to Development Server

**For iOS**:
1. Open Camera app on iPhone/iPad
2. Point camera at the QR code in terminal
3. Tap the notification banner that appears
4. Expo Go app will open automatically
5. App will load and connect to development server

**For Android**:
1. Open Expo Go app on Android device
2. Tap "Scan QR code" button
3. Point camera at QR code in terminal
4. App will load and connect to development server

**Alternative Method (Manual Connection)**:
1. Open Expo Go app
2. Tap "Enter URL manually"
3. Enter the development server URL from terminal (e.g., `exp://192.168.1.100:8081`)
4. Tap "Connect"

#### Step 5: Verify Connection

**Signs of successful connection**:
- Expo Go app shows "Connected" status
- Your app loads in Expo Go
- Terminal shows "Metro waiting on exp://..."
- Any console.log statements appear in terminal

**Troubleshooting Connection Issues**:
- **Can't see QR code**: Use `npx expo start --tunnel` or manually enter URL
- **Connection timeout**: Check firewall settings, ensure same network
- **"Unable to resolve host"**: Verify Wi-Fi connection, try tunnel mode
- **App won't load**: Check terminal for errors, restart Metro bundler

#### Step 6: Development Workflow

**Hot Reload**:
- Save any file in `mobile/` directory
- App automatically reloads in Expo Go
- No need to manually refresh

**Reload Manually**:
- Shake device (or press `Cmd+D` on iOS simulator, `Cmd+M` on Android emulator)
- Select "Reload" from developer menu
- Or press `r` in terminal to reload

**Open Developer Menu**:
- **iOS**: Shake device or press `Cmd+Ctrl+Z` in simulator
- **Android**: Shake device or press `Cmd+M` in emulator
- Menu options: Reload, Debug Remote JS, Show Element Inspector, etc.

**View Logs**:
- Console logs appear in terminal where `expo start` is running
- Use `console.log()`, `console.error()`, etc. in your code
- Errors are highlighted in red in terminal

#### Step 7: Testing Native Features

**Camera**:
- Test camera access: `expo-image-picker`
- Grant camera permissions when prompted
- Test photo capture and selection

**Location**:
- Test location access: `expo-location`
- Grant location permissions when prompted
- Verify GPS coordinates are retrieved

**Notifications**:
- Test push notifications: `expo-notifications`
- Grant notification permissions
- Test foreground and background notifications

**File System**:
- Test file operations: `expo-file-system`
- Test document picker: `expo-document-picker`

#### Step 8: Network Testing

**API Connection**:
- Ensure Django backend is running
- Update API base URL in `mobile/services/api.ts`:
  ```typescript
  // For local development
  const API_BASE_URL = __DEV__
    ? 'http://YOUR_COMPUTER_IP:8000'  // Replace with your computer's local IP
    : 'https://your-production-api.com';
  ```
- Find your computer's IP:
  - **Windows**: `ipconfig` (look for IPv4 Address)
  - **Mac/Linux**: `ifconfig` or `ip addr`
- Test API calls from phone
- Check CORS settings in Django if requests fail

**WebSocket Connection**:
- Update WebSocket URL in chat/real-time features:
  ```typescript
  const WS_URL = __DEV__
    ? 'ws://YOUR_COMPUTER_IP:8000/ws/chat/'
    : 'wss://your-production-api.com/ws/chat/';
  ```

#### Step 9: Performance Testing

**Monitor Performance**:
- Watch for lag or stuttering during navigation
- Test with slow network (enable airplane mode, then Wi-Fi)
- Test with many items in lists (performance under load)
- Monitor memory usage in developer menu

**Optimization Tips**:
- Use `FlatList` for long lists instead of `ScrollView`
- Implement pagination for large datasets
- Optimize images (compress, use appropriate sizes)
- Use `React.memo` for expensive components

#### Step 10: Device-Specific Testing

**Test on Multiple Devices**:
- Test on different screen sizes (phone, tablet)
- Test on different OS versions (if possible)
- Test on both iOS and Android
- Test in portrait and landscape orientations

**Device-Specific Considerations**:
- **iOS**: Test Safe Area insets (notch, home indicator)
- **Android**: Test with different navigation styles (gesture, buttons)
- **Tablets**: Test responsive layouts, multi-column views

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

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/CalendarNew.jsx`, `Events.jsx`

**Dependencies**: `react-native-calendars`, `@react-native-community/datetimepicker`

### 4.2 Lists & Shopping

**Location**: `mobile/screens/lists/`

- Shopping lists screen
- To-do lists screen
- List detail with items
- Real-time updates via WebSocket
- Grocery categories
- Offline support

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Lists.jsx`, `ListDetail.jsx`, `GroceryCategories.jsx`

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

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Chat.jsx`

**Dependencies**: `react-native-crypto`, `react-native-websocket` or native WebSocket

### 4.4 Meal Planning & Recipes

**Location**: `mobile/screens/meals/`

- Recipe list
- Recipe detail
- Recipe creation/editing
- Recipe URL import
- Meal planning calendar
- Shopping list integration

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Meals.jsx`

### 4.5 Documents & Media Sharing

**Location**: `mobile/screens/documents/`

- Document list
- File upload (camera/gallery/picker)
- Document preview
- Encrypted file storage
- Media gallery

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Documents.jsx`

**Dependencies**: `expo-document-picker`, `expo-image-picker`, `expo-file-system`

### 4.6 Finance Tracking

**Location**: `mobile/screens/finance/`

- Transaction list
- Add/edit transactions
- Budget tracking
- Financial reports
- Charts/graphs

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Finance.jsx`

**Dependencies**: `react-native-chart-kit` or `victory-native`

### 4.7 Map/Location Sharing

**Location**: `mobile/screens/map/`

- Map view with family locations
- Location sharing settings
- Location history

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Map.jsx`

**Dependencies**: `react-native-maps`, `expo-location`

### 4.8 Profile & Settings

**Location**: `mobile/screens/profile/` and `mobile/screens/settings/`

- User profile screen
- Edit profile (name, photo)
- Settings screen
- Dark mode toggle
- Voice preferences
- OAuth service connections (OneDrive, Google Drive, Outlook)

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Profile.jsx`, `Settings.jsx`, `OutlookSyncPage.jsx`, `OneDrivePage.jsx`, `GoogleDrivePage.jsx`

### 4.9 Today/Dashboard

**Location**: `mobile/screens/today/`

- Today's events
- Upcoming tasks
- Quick actions

**Migration from**: `KewlKidsOrganizer/frontend/react/src/components/Today.jsx`

### 4.10 Voice Commands

**Location**: `mobile/hooks/` and `mobile/components/`

- Voice recognition hook
- Voice command processing
- Voice feedback

**Migration from**: `KewlKidsOrganizer/frontend/react/src/hooks/useVoiceRecognition.js`, `useCalendarVoiceCommands.js`, `VoiceButton.jsx`

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

**Migration from**: `KewlKidsOrganizer/frontend/react/src/utils/encryption.js`

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

