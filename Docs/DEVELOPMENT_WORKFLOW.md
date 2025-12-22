# Development Workflow Guide

This guide explains how to develop, make changes, and redeploy the app to your Android phone.

## Prerequisites

- Android device connected via USB with USB debugging enabled
- Development build already installed on your phone (see `DEV_BUILD_INSTRUCTIONS.md`)
- Backend server running (if testing API features)

## Quick Start: Making Changes and Redeploying

### Step 1: Make Your Code Changes

Edit any files in the `mobile/` directory:
- React Native components: `mobile/app/`, `mobile/components/`
- Hooks: `mobile/hooks/`
- Services: `mobile/services/`
- Utils: `mobile/utils/`

**Note:** Most JavaScript/TypeScript changes don't require a rebuild - they hot reload automatically!

### Step 2: Start the Development Server

If not already running, start the Metro bundler:

```bash
cd C:\dev\kewlkids\mobile
npm start
```

Or use the dev client mode:

```bash
npx expo start --dev-client
```

The app on your phone will automatically reload when you save changes.

## When You Need to Rebuild

You only need to rebuild and reinstall when you change:

### Native Code Changes (Requires Rebuild)
- ✅ Android manifest (`mobile/android/app/src/main/AndroidManifest.xml`)
- ✅ Gradle configuration (`mobile/android/app/build.gradle`)
- ✅ Native modules (adding/removing packages with native code)
- ✅ Package name or app configuration (`mobile/app.json`)
- ✅ Permissions (adding new permissions)

### JavaScript/TypeScript Changes (No Rebuild Needed)
- ✅ React components
- ✅ Hooks
- ✅ Services
- ✅ Utils
- ✅ Styles
- ✅ Most app logic

## Rebuilding and Reinstalling

### Option 1: Full Rebuild and Install (Recommended)

This builds the app and installs it automatically:

```bash
cd C:\dev\kewlkids\mobile
npm run dev:android
```

**What this does:**
1. Builds the Android app
2. Installs the APK on your connected device
3. Starts the development server

**Time:** ~1-2 minutes for incremental builds, ~5-10 minutes for clean builds

### Option 2: Uninstall Old App First

If you want to ensure a clean install:

```bash
# Uninstall the old app
cd C:\dev\kewlkids\mobile
adb uninstall com.kewlkids.organizer

# Build and install new version
npm run dev:android
```

### Option 3: Manual Build and Install

If you want more control:

```bash
cd C:\dev\kewlkids\mobile\android

# Clean build (optional, removes old build artifacts)
.\gradlew.bat clean

# Build the APK
.\gradlew.bat :app:assembleDebug

# Install on device
adb install app\build\outputs\apk\debug\app-debug.apk

# Start the app
adb shell am start -n com.kewlkids.organizer/.MainActivity
```

## Development Workflow Examples

### Example 1: Changing a React Component

1. Edit `mobile/app/(tabs)/lists/[id].tsx`
2. Save the file
3. **No rebuild needed!** The app will hot reload automatically
4. See changes immediately on your phone

### Example 2: Adding a New Permission

1. Edit `mobile/android/app/src/main/AndroidManifest.xml`
2. Add the permission:
   ```xml
   <uses-permission android:name="android.permission.CAMERA"/>
   ```
3. Rebuild and reinstall:
   ```bash
   cd C:\dev\kewlkids\mobile
   npm run dev:android
   ```

### Example 3: Adding a New Native Module

1. Install the package:
   ```bash
   cd C:\dev\kewlkids\mobile
   npm install some-native-package
   ```
2. Rebuild and reinstall:
   ```bash
   npm run dev:android
   ```

### Example 4: Changing App Configuration

1. Edit `mobile/app.json` (e.g., change app name, package name, etc.)
2. Rebuild and reinstall:
   ```bash
   cd C:\dev\kewlkids\mobile
   npm run dev:android
   ```

## Daily Development Routine

### Starting Your Development Session

1. **Start the backend** (if needed):
   ```bash
   cd C:\dev\kewlkids\backend
   python manage.py runserver
   ```

2. **Start the Metro bundler:**
   ```bash
   cd C:\dev\kewlkids\mobile
   npm start
   ```
   Or:
   ```bash
   npx expo start --dev-client
   ```

3. **Open the app on your phone** - it should connect automatically

4. **Make changes** - most changes will hot reload automatically!

### Ending Your Development Session

Just stop the Metro bundler (Ctrl+C). The app will still work on your phone, but won't receive updates.

## Troubleshooting

### App Not Updating After Changes

1. **Check if Metro bundler is running:**
   ```bash
   cd C:\dev\kewlkids\mobile
   npm start
   ```

2. **Reload the app manually:**
   - Shake your phone to open the developer menu
   - Tap "Reload"
   - Or press `r` in the Metro bundler terminal

### Accessing React Native DevTools

**Method 1: Developer Menu (On Device)**
- **Shake your phone** to open the developer menu
- Tap **"Debug"** or **"Open Debugger"** to open DevTools in your browser
- This opens Chrome DevTools connected to your React Native app

**Method 2: Metro Bundler Terminal**
- While Metro bundler is running, press **`j`** to open DevTools
- This opens the React Native DevTools in your default browser

**Method 3: Direct Browser Access**
- Make sure Metro bundler is running
- Open your browser and go to: `http://localhost:8081/debugger-ui/`
- Or use the URL shown in the Metro bundler terminal

**Method 4: Chrome DevTools (Remote Debugging)**
1. Shake your phone → Tap "Debug"
2. Chrome will open automatically to `http://localhost:8081/debugger-ui/`
3. You'll see:
   - Console tab (for logs and errors)
   - Network tab (for API calls)
   - React DevTools (if extension installed)
   - Performance profiling

**Note:** The "Welcome to React Native DevTools" message you saw earlier appears in the browser console when DevTools is connected. If you don't see it, make sure:
- Metro bundler is running
- You've opened the debugger from the developer menu or pressed `j`
- Your phone and computer are on the same network (or using tunnel mode)

3. **Clear Metro cache:**
   ```bash
   cd C:\dev\kewlkids\mobile
   npx expo start --clear
   ```

### Build Errors

1. **Clean and rebuild:**
   ```bash
   cd C:\dev\kewlkids\mobile\android
   .\gradlew.bat clean
   cd ..
   npm run dev:android
   ```

2. **Check for syntax errors** in your code

3. **Verify all dependencies are installed:**
   ```bash
   cd C:\dev\kewlkids\mobile
   npm install
   ```

### App Crashes on Launch

1. **Check device logs:**
   ```bash
   adb logcat | grep -i "kewlkids\|react\|error"
   ```

2. **Uninstall and reinstall:**
   ```bash
   adb uninstall com.kewlkids.organizer
   cd C:\dev\kewlkids\mobile
   npm run dev:android
   ```

### Device Not Detected

1. **Check USB connection:**
   ```bash
   adb devices
   ```
   Should show your device. If not:
   - Enable USB debugging on your phone
   - Accept the USB debugging prompt on your phone
   - Try a different USB cable/port

2. **Restart ADB:**
   ```bash
   adb kill-server
   adb start-server
   adb devices
   ```

## Useful Commands Reference

### ADB Commands

```bash
# List connected devices
adb devices

# Uninstall app
adb uninstall com.kewlkids.organizer

# Install APK
adb install path\to\app-debug.apk

# View logs
adb logcat

# Clear app data
adb shell pm clear com.kewlkids.organizer

# Start the app
adb shell am start -n com.kewlkids.organizer/.MainActivity
```

### Gradle Commands

```bash
cd C:\dev\kewlkids\mobile\android

# Clean build
.\gradlew.bat clean

# Build debug APK
.\gradlew.bat :app:assembleDebug

# Build and install
.\gradlew.bat :app:installDebug
```

### Expo/React Native Commands

```bash
cd C:\dev\kewlkids\mobile

# Start Metro bundler
npm start

# Start with dev client
npx expo start --dev-client

# Clear cache and start
npx expo start --clear

# Build and install (custom script)
npm run dev:android
```

## File Locations Reference

### Important Files

- **App entry point:** `mobile/app/_layout.tsx`
- **Android manifest:** `mobile/android/app/src/main/AndroidManifest.xml`
- **Gradle config:** `mobile/android/app/build.gradle`
- **App config:** `mobile/app.json`
- **Package config:** `mobile/package.json`

### Build Outputs

- **APK location:** `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- **Build logs:** Check terminal output

## Tips for Faster Development

1. **Use hot reload** - Most changes don't need a rebuild
2. **Keep Metro bundler running** - Start it once and leave it running
3. **Use Fast Refresh** - React Native automatically reloads components when you save
4. **Incremental builds** - Gradle caches builds, so rebuilds are faster
5. **Only rebuild when necessary** - Native changes require rebuilds, JS/TS changes don't

## Common Development Scenarios

### Scenario: "I changed a button color"

1. Edit the component file
2. Save
3. **Done!** - Hot reload will update it automatically

### Scenario: "I added a new screen"

1. Create the new screen file
2. Add route in `app/` directory
3. Save
4. **Done!** - Hot reload will update it automatically

### Scenario: "I need to add camera access"

1. Add permission to `AndroidManifest.xml`
2. Rebuild: `npm run dev:android`
3. Grant permission when prompted on phone

### Scenario: "I installed a new npm package"

1. `npm install package-name`
2. If it has native code, rebuild: `npm run dev:android`
3. If it's JS-only, just save and hot reload will work

## Next Steps

- See `mobile/DEV_BUILD_INSTRUCTIONS.md` for creating development builds
- See `mobile/EXPO_GO_TESTING.md` for testing without native modules
- Check the main `README.md` for project overview

