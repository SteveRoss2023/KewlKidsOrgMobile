# Android Build Fixes - Windows Autorun Script Issue

## Problem
Windows autorun scripts interfere with Gradle's Node command execution, causing JSON parsing errors like:
```
Unexpected JSON token at offset 0: Expected start of the object '{', but had 'S' instead
JSON input: Starting autorun script...
```

## Solution
We've added fixes in three places to suppress Windows autorun scripts:

### 1. `gradle.properties`
```properties
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m -DNO_AUTORUN=1
```

### 2. `app/build.gradle`
Uses `executeNodeWithNoAutorun()` helper function that sets:
- `NO_AUTORUN=1`
- `CMDCMDLINE=""`

### 3. `settings.gradle` ⚠️ **IMPORTANT**
Must set environment variables in `providers.exec` blocks:
```groovy
providers.exec {
    workingDir(rootDir)
    commandLine("node", "--print", "...")
    // Suppress Windows autorun scripts
    environment("NO_AUTORUN", "1")
    environment("CMDCMDLINE", "")
}
```

## Why This Gets Lost

### Common Causes:
1. **Expo Prebuild** - Running `npx expo prebuild` regenerates native files and can overwrite `settings.gradle`
2. **Expo Updates** - Updating Expo SDK can regenerate native files
3. **Not Committed to Git** - If fixes aren't in version control, they can be lost
4. **System Reboot** - Environment variables set only in session are lost

## Prevention

### 1. Commit These Files to Git
Make sure these files with fixes are committed:
- `mobile/android/settings.gradle`
- `mobile/android/app/build.gradle`
- `mobile/android/gradle.properties`

### 2. After Running Expo Prebuild
If you run `npx expo prebuild`, you'll need to re-apply the `settings.gradle` fix:
```groovy
// Add to each providers.exec block in settings.gradle:
environment("NO_AUTORUN", "1")
environment("CMDCMDLINE", "")
```

### 3. Use the Dev Script
The `npm run dev:android` script now automatically sets these environment variables, but the `settings.gradle` fix is still needed for Gradle's internal Node commands.

## Quick Fix Script
If you lose the fix, run:
```powershell
# The fix is already in settings.gradle, but if it gets overwritten:
# 1. Open mobile/android/settings.gradle
# 2. Find each providers.exec { ... } block
# 3. Add these two lines inside each block:
#    environment("NO_AUTORUN", "1")
#    environment("CMDCMDLINE", "")
```

## Verification
After applying fixes, the build should work without the "Starting autorun script..." error.


