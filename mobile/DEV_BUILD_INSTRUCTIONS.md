# Development Build Instructions for Voice Recognition

## Why You Need a Development Build

The `@react-native-voice/voice` package requires native code that is not available in Expo Go. To test voice recognition features, you need to create a **development build**.

## Option 1: EAS Build (Recommended - Cloud Build)

### Prerequisites
1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```

2. Login to your Expo account:
   ```bash
   eas login
   ```

### Create EAS Build Configuration

1. Initialize EAS (if not already done):
   ```bash
   cd mobile
   eas build:configure
   ```

2. This will create an `eas.json` file. Edit it to add a development profile:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      },
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

### Build for Android

```bash
cd mobile
eas build --profile development --platform android
```

This will:
- Build the app in the cloud
- Take about 10-15 minutes
- Provide a download link when complete
- Install the APK on your device

### Build for iOS

```bash
cd mobile
eas build --profile development --platform ios
```

**Note**: iOS builds require an Apple Developer account ($99/year).

## Option 2: Local Development Build

### For Android

1. Install Android Studio and set up Android SDK
2. Connect an Android device or start an emulator
3. Run:
   ```bash
   cd mobile
   npx expo run:android
   ```

This will:
- Build the native Android app locally
- Install it on your device/emulator
- Start the development server

### For iOS (macOS only)

1. Install Xcode from the App Store
2. Install CocoaPods:
   ```bash
   sudo gem install cocoapods
   ```
3. Run:
   ```bash
   cd mobile
   npx expo run:ios
   ```

This will:
- Build the native iOS app locally
- Install it on your device/simulator
- Start the development server

## After Building

Once you have a development build installed:

1. Start the development server:
   ```bash
   cd mobile
   npx expo start --dev-client
   ```

2. Open the development build app on your device

3. The app will connect to the development server automatically

4. Voice recognition should now work!

## Testing Voice Recognition

1. Navigate to the Calendar screen
2. Click the microphone button
3. You should hear: "Say 'add to calendar' to start creating an event..."
4. Voice recognition should now be active

## Troubleshooting

### Voice Recognition Still Not Working

1. **Check Permissions**:
   - Android: Settings → Apps → Your App → Permissions → Microphone
   - iOS: Settings → Privacy → Microphone → Your App

2. **Rebuild**: Sometimes you need to rebuild after adding native modules:
   ```bash
   # For EAS
   eas build --profile development --platform android --clear-cache

   # For local
   npx expo run:android --clear
   ```

3. **Check Logs**: Look for voice recognition errors in the console

### Build Errors

- Make sure all dependencies are installed: `npm install`
- Clear cache: `npx expo start --clear`
- Check that `@react-native-voice/voice` is in `package.json`

## Current Status

- ✅ Voice recognition code is implemented
- ✅ Error handling prevents crashes in Expo Go
- ⏳ Waiting for development build to test native functionality

The app will work in Expo Go, but voice recognition will be disabled (no crashes, just won't work).



