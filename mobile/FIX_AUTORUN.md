# Fix Windows Autorun Script Issue - ONE TIME SETUP

## The Problem
Windows autorun scripts are interfering with Gradle's Node command execution, causing:
```
Unexpected JSON token at offset 0: Expected start of the object '{', but had 'S' instead
JSON input: Starting autorun script...
```

## The Solution (Run Once)

**Run this PowerShell script ONE TIME:**

```powershell
cd mobile
.\scripts\setup-android-build.ps1
```

This will:
1. ✅ Stop the Gradle daemon (so it picks up new environment)
2. ✅ Set `NO_AUTORUN=1` and `CMDCMDLINE=""` at Windows USER level (persists across reboots)
3. ✅ Set them for your current session

## After Running the Script

1. **Close and reopen your terminal/PowerShell** (important - so environment variables load)
2. **Try the build:**
   ```bash
   npm run dev:android
   ```

## If It Still Fails

The Gradle daemon might be cached. Stop it manually:
```powershell
cd mobile/android
.\gradlew.bat --stop
cd ..
npm run dev:android
```

## Why This Works

- Setting environment variables at USER level makes them permanent
- They'll be available to all processes, including Gradle's internal Node commands
- The `gradlew.bat` script also sets them as a backup
- The dev script sets them for the current session

## Files Modified

All these files now have the fix:
- ✅ `mobile/android/gradlew.bat` - Sets env vars before Gradle starts
- ✅ `mobile/android/settings.gradle` - Sets env vars in providers.exec blocks
- ✅ `mobile/android/app/build.gradle` - Uses executeNodeWithNoAutorun helper
- ✅ `mobile/android/gradle.properties` - Has -DNO_AUTORUN=1 in JVM args
- ✅ `mobile/scripts/dev-android.js` - Sets env vars before running build

**Once you run the setup script, this should work permanently.**


