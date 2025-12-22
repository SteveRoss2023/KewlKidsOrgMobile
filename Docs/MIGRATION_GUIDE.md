# Project Location Migration Guide

## Overview
This guide covers the complete transition from the old project location (`C:\Users\steve_80f2z1j\Development\Cursor Projects\KewlKidsOrganizerMobile`) to the new location (`C:\dev\kewlkids`) to resolve Windows path length issues that were preventing Android builds.

## Current Status

### ✅ Completed Steps
- ✅ Project copied to `C:\dev\kewlkids`
- ✅ Android build successful in new location
- ✅ Git repository copied and configured
  - `origin`: `https://github.com/SteveRoss2023/KewlKidsOrgMobile.git` (new repository)
  - `backup`: `https://github.com/SteveRoss2023/KewlKidsOrganizerMobileNew.git` (old repository)
- ✅ Backend (Django) copied including `venv/`
- ✅ Dependencies verified (mobile npm packages, backend requirements)
- ✅ Android build configuration verified (gradle.properties, settings.gradle, build.gradle files)
  - All Windows autorun script suppressions in place
  - CMake path length optimizations configured
  - Build staging directory optimized for shorter paths
- ✅ Documentation files reviewed (most already correct or contain intentional historical references)
- ✅ Git repository synced with `origin/main`

### ⚠️ Pending Items
- ⚠️ Uncommitted changes present (worklets removal, drax addition) - May need to commit if not already done
- ⚠️ Final testing recommended (see Phase 5 below)

## Migration Steps

### Phase 1: Open New Project Location

1. **Close Current Cursor Window**
   - Close the current Cursor/VS Code window for the old location

2. **Open New Location**
   - Open Cursor/VS Code
   - File → Open Folder
   - Navigate to: `C:\dev\kewlkids`
   - Click "Select Folder"

3. **Verify Project Structure**
   - Confirm you see:
     - `mobile/` folder (React Native app)
     - `backend/` folder (Django backend)
     - `Docs/` folder
     - `.git/` folder (hidden)

### Phase 2: Verify Dependencies

1. **Mobile Dependencies**
   ```bash
   cd C:\dev\kewlkids\mobile
   npm install
   ```
   - This ensures `react-native-drax` and other dependencies are properly installed
   - ✅ **Status**: Verified - dependencies installed correctly

2. **Backend Virtual Environment**
   - The `venv/` was copied, but virtual environments often have absolute paths
   - **Option A (Recommended)**: Recreate the venv
     ```bash
     cd C:\dev\kewlkids\backend
     python -m venv venv
     .\venv\Scripts\activate
     pip install -r requirements.txt
     ```
   - **Option B**: Try using the copied venv (may work if paths are relative)
     ```bash
     cd C:\dev\kewlkids\backend
     .\venv\Scripts\activate
     python --version  # Verify it works
     ```

### Phase 2.5: Android Build Configuration Verification

✅ **Android Build Configuration Verified** - All files are correctly configured:

1. **`mobile/android/gradle.properties`** ✅
   - NO_AUTORUN=1 set to suppress Windows autorun scripts
   - CMake configuration optimized for shorter paths
   - `reactNativeArchitectures=arm64-v8a` to reduce path length
   - Build staging directory set to `.cxx` (shorter path)
   - All path length mitigations in place

2. **`mobile/android/settings.gradle`** ✅
   - NO_AUTORUN and CMDCMDLINE environment variables set in `providers.exec` blocks
   - Critical for Windows autorun script suppression
   - All Node command executions properly configured

3. **`mobile/android/app/build.gradle`** ✅
   - `executeNodeWithNoAutorun()` helper function implemented
   - All Node commands use the helper to suppress autorun scripts
   - Relative paths used via `projectRoot`

4. **`mobile/android/local.properties`** ✅
   - Contains user-specific Android SDK path
   - Path is absolute but user-specific (not project-specific)
   - No changes needed - works correctly in new location

5. **`mobile/android/build.gradle`** ✅
   - Standard root build configuration
   - No hardcoded paths found
   - All repositories configured correctly

**Result**: Android build configuration is fully compatible with the new project location. All path-related optimizations are in place and working correctly.

### Phase 3: Git Repository Management

**Set Up New Remote Repository** - You've created a new repository: `https://github.com/SteveRoss2023/KewlKidsOrgMobile`

✅ **Status**: Git repository configuration is already complete!

1. **Verify Current Remote** ✅
   ```bash
   cd C:\dev\kewlkids
   git remote -v
   ```
   - ✅ Current configuration:
     - `origin https://github.com/SteveRoss2023/KewlKidsOrgMobile.git` (new repository)
     - `backup https://github.com/SteveRoss2023/KewlKidsOrganizerMobileNew.git` (old repository as backup)

2. **Add New Remote (Keep Old One as Backup)** ✅
   - Already completed - remotes are correctly configured
   - New repository is set as `origin` (primary)
   - Old repository is set as `backup` for reference

3. **Check Current Status** ✅
   ```bash
   git status
   ```
   - ✅ Current status: On branch `main`, up to date with `origin/main`
   - Only uncommitted change: `Docs/MIGRATION_GUIDE.md` (this file)

4. **Stage and Commit Changes** (If needed)
   - If you have uncommitted changes from the worklets/drax migration, commit them:
   ```bash
   git add mobile/package.json mobile/package-lock.json mobile/babel.config.js
   git add mobile/app/(tabs)/lists/[id].tsx mobile/app/(tabs)/grocery-categories.tsx
   git commit -m "Fix Android build: Replace worklets/reanimated with react-native-drax

   - Remove react-native-reanimated and @mgcrea/react-native-dnd
   - Add react-native-drax for drag-and-drop (no worklets dependency)
   - Update babel.config.js to remove reanimated plugin
   - Update drag-and-drop implementations in lists and grocery-categories
   - Resolves CMake infinite loop issues on Windows
   - Migrated to new location: C:\dev\kewlkids"
   ```

5. **Push All History to New Remote** (If not already done)
   ```bash
   # Push all branches and history to new remote
   git push -u origin --all

   # Push all tags as well
   git push -u origin --tags
   ```
   - This pushes all commit history to the new repository
   - The `-u` flag sets the upstream tracking branch
   - `--all` pushes all branches
   - `--tags` pushes all tags
   - ✅ **Note**: Repository appears to already be synced with origin/main

### Phase 4: Update Scripts and Documentation

1. **Scripts Status** (These use relative paths, so work correctly):
   - ✅ `mobile/scripts/dev-android.js` - Uses `__dirname`, works correctly
   - ✅ `backend/activate.ps1` - Uses `$PSScriptRoot`, works correctly
   - ✅ `backend/runserver.bat` - Uses `%~dp0`, works correctly
   - ✅ `mobile/android/local.properties` - Contains Android SDK path (user-specific, correct)

2. **Files That Need Path Reference Updates**:
   - ✅ `FIX_POWERSHELL.md` - Already updated with new path (line 38)
   - `Docs/MOBILE_APP_PLAN.md` - Contains source project references (lines 5, 8) - These are intentional as they document source project locations, not current project
   - ✅ `Docs/CURSOR_CONNECTION_ROOT_CAUSE.md` - Already updated with current and previous locations (lines 86-87)
   - `backend/test_error.txt` - Log file, can be deleted or left as-is

3. **Files That Are Fine** (No changes needed):
   - ✅ `mobile/hooks/useVoiceRecognition.ts` - No hardcoded paths found
   - ✅ `mobile/DEV_BUILD_INSTRUCTIONS.md` - No hardcoded paths found
   - ✅ `Docs/STARTUP_PROCEDURE.md` - No hardcoded paths found

4. **Update Documentation Files**:
   Use your IDE's search/replace (Ctrl+Shift+H in VS Code/Cursor) to find:
   - Search for: `C:\Users\steve_80f2z1j\Development\Cursor Projects\KewlKidsOrganizerMobile`
   - Replace with: `C:\dev\kewlkids`
   - Or update to note these are historical references if they're documenting past issues

### Phase 5: Test Everything

1. **Test Mobile App**
   ```bash
   cd C:\dev\kewlkids\mobile
   npm start
   ```
   - Verify Expo starts without errors
   - Test drag-and-drop functionality in lists and grocery categories

2. **Test Backend**
   ```bash
   cd C:\dev\kewlkids\backend
   .\venv\Scripts\activate
   python manage.py runserver 8900
   ```
   - Verify Django starts on port 8900
   - Test API endpoints if possible

3. **Test Android Build** (Already successful, but verify again)
   ```bash
   cd C:\dev\kewlkids\mobile\android
   .\gradlew.bat app:assembleDebug
   ```

### Phase 6: Cleanup (After Verification)

**Wait at least a few days of successful development before:**

1. **Archive Old Location** (Don't delete yet)
   - Rename: `C:\Users\steve_80f2z1j\Development\Cursor Projects\KewlKidsOrganizerMobile`
   - To: `C:\Users\steve_80f2z1j\Development\Cursor Projects\KewlKidsOrganizerMobile_OLD_BACKUP`
   - Or move to a backup drive

2. **Remove subst mapping** (if you created one)
   ```bash
   subst R: /D
   ```

## Important Notes

### Git Strategy
- **New Remote**: Using new repository `https://github.com/SteveRoss2023/KewlKidsOrgMobile`
- **Old Remote as Backup**: Old remote kept as `backup` for reference
- **All History Preserved**: The copied `.git` folder preserves all commit history
- **Push All Branches**: Use `git push -u origin --all` to push everything

### Django Virtual Environment
- Virtual environments often contain absolute paths
- **Best Practice**: Recreate the venv in the new location
- The `requirements.txt` will ensure all packages are reinstalled correctly

### Script Compatibility
- Most scripts use relative paths (`__dirname`, `$PSScriptRoot`, `%~dp0`)
- These should work without modification
- Only update if you find hardcoded absolute paths

### Path Length Issue Resolution
- Old path: ~95 characters to `mobile/android`
- New path: ~25 characters to `mobile/android`
- This resolves the Windows 260-character path limit issues

## Troubleshooting

### If Git Shows "Different Roots" Error
- This shouldn't happen since `.git` was copied
- If it does: `git remote set-url origin https://github.com/SteveRoss2023/KewlKidsOrgMobile.git`

### If Push Fails (Repository Empty)
- The new repository is empty, so first push might need `--force` (but try without first)
- If needed: `git push -u origin main --force` (only if regular push fails)
- **Warning**: Only use `--force` if you're sure - it overwrites remote history

### If Django Venv Doesn't Work
- Recreate it: `python -m venv venv` then `pip install -r requirements.txt`

### If Scripts Fail
- Check for hardcoded paths in scripts
- Update any absolute path references to use relative paths

## Success Criteria

- ✅ Cursor opens project from `C:\dev\kewlkids`
- ✅ `npm install` completes without errors
- ✅ Django venv activates and runs
- ✅ Git commits and pushes successfully
- ✅ Android build completes successfully
- ✅ Mobile app runs and drag-and-drop works
- ✅ Backend API responds correctly

## Next Steps After Migration

1. Update any CI/CD pipelines with new path (if applicable)
2. Update team documentation (if working with others)
3. Update any deployment scripts
4. Consider adding a `.cursorrules` or workspace settings file with the new path

## What Changed in This Migration

### Removed Dependencies
- `react-native-reanimated` (v3.16.1) - Caused CMake infinite loop on Windows
- `@mgcrea/react-native-dnd` - Required reanimated/worklets
- `react-native-worklets` - Required by reanimated v4, caused build issues

### Added Dependencies
- `react-native-drax` - Drag-and-drop library that doesn't require worklets

### Code Changes
- `mobile/babel.config.js` - Removed reanimated plugin
- `mobile/app/(tabs)/lists/[id].tsx` - Updated to use DraxView instead of DndProvider
- `mobile/app/(tabs)/grocery-categories.tsx` - Updated to use DraxView instead of DndProvider

### Build Configuration
- No changes needed to `gradle.properties` - existing CMake settings remain
- Build now works from shorter path location

### Documentation Updates Needed
- `Docs/MOBILE_APP_PLAN.md` - Update path references (optional, can note as historical)
- `Docs/CURSOR_CONNECTION_ROOT_CAUSE.md` - Update path reference (optional, can note as historical)
- `FIX_POWERSHELL.md` - Update path in command example to `C:\dev\kewlkids`

### Scripts (No Changes Needed)
- All scripts use relative paths and work correctly in new location

