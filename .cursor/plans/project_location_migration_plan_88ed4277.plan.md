---
name: Project Location Migration Plan
overview: Complete transition plan for moving from the old project location to the new shorter path location (C:\dev\kewlkids), including git management, Django environment setup, script updates, and verification steps.
todos:
  - id: open-new-project
    content: Close current Cursor window and open C:\dev\kewlkids in Cursor
    status: pending
  - id: verify-structure
    content: Verify project structure (mobile/, backend/, Docs/, .git/) exists in new location
    status: pending
    dependencies:
      - open-new-project
  - id: install-mobile-deps
    content: Run npm install in mobile/ folder to ensure react-native-drax is installed
    status: pending
    dependencies:
      - verify-structure
  - id: setup-django-venv
    content: Recreate Django virtual environment in backend/ (venv may have absolute paths)
    status: pending
    dependencies:
      - verify-structure
  - id: verify-git-remote
    content: Verify git remote and set up new remote (https://github.com/SteveRoss2023/KewlKidsOrgMobile) as origin, keep old as backup
    status: pending
    dependencies:
      - open-new-project
  - id: update-doc-path-references
    content: Update path references in Docs/MOBILE_APP_PLAN.md, Docs/CURSOR_CONNECTION_ROOT_CAUSE.md, and FIX_POWERSHELL.md
    status: pending
    dependencies:
      - open-new-project
  - id: commit-changes
    content: Stage and commit all changes (worklets removal, drax addition, babel config, doc updates)
    status: pending
    dependencies:
      - verify-git-remote
      - install-mobile-deps
      - update-doc-path-references
  - id: push-to-remote
    content: Push all history (branches and tags) to new GitHub remote repository
    status: pending
    dependencies:
      - commit-changes
  - id: test-mobile-app
    content: Test mobile app starts and drag-and-drop functionality works
    status: pending
    dependencies:
      - install-mobile-deps
  - id: test-backend
    content: Test Django backend starts and API responds correctly
    status: pending
    dependencies:
      - setup-django-venv
  - id: verify-android-build
    content: Run Android build one more time to confirm everything works
    status: pending
    dependencies:
      - test-mobile-app
---

# Project Location Migration Plan

## Overview
This plan covers the complete transition from the old project location (`C:\Users\steve_80f2z1j\Development\Cursor Projects\KewlKidsOrganizerMobile`) to the new location (`C:\dev\kewlkids`) to resolve Windows path length issues that were preventing Android builds.

## Current Status
- ✅ Project copied to `C:\dev\kewlkids`
- ✅ Android build successful in new location
- ✅ Git repository copied (remote: `https://github.com/SteveRoss2023/KewlKidsOrganizerMobileNew.git`)
- ✅ Backend (Django) copied including `venv/`
- ⚠️ Uncommitted changes present (worklets removal, drax addition)
- ⚠️ Documentation files need path reference updates

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

### Phase 3: Git Repository Management

**Set Up New Remote Repository** - You've created a new repository: `https://github.com/SteveRoss2023/KewlKidsOrgMobile`

1. **Verify Current Remote**
   ```bash
   cd C:\dev\kewlkids
   git remote -v
   ```
   - Should show: `origin https://github.com/SteveRoss2023/KewlKidsOrganizerMobileNew.git`

2. **Add New Remote (Keep Old One as Backup)**
   ```bash
   # Add new remote as 'origin' (primary)
   git remote set-url origin https://github.com/SteveRoss2023/KewlKidsOrgMobile.git

   # Add old remote as 'backup' (optional, for reference)
   git remote add backup https://github.com/SteveRoss2023/KewlKidsOrganizerMobileNew.git

   # Verify both remotes
   git remote -v
   ```
   - Should show:
     - `origin https://github.com/SteveRoss2023/KewlKidsOrgMobile.git`
     - `backup https://github.com/SteveRoss2023/KewlKidsOrganizerMobileNew.git`

3. **Check Current Status**
   ```bash
   git status
   ```
   - You should see modified files from the worklets/drax migration

4. **Stage and Commit Changes**
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

5. **Push All History to New Remote**
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

### Phase 4: Update Scripts and Documentation

1. **Scripts Status** (These use relative paths, so should work as-is):
   - ✅ `mobile/scripts/dev-android.js` - Uses `__dirname`, works correctly
   - ✅ `backend/activate.ps1` - Uses `$PSScriptRoot`, works correctly
   - ✅ `backend/runserver.bat` - Uses `%~dp0`, works correctly
   - ✅ `mobile/android/local.properties` - Contains Android SDK path (user-specific, correct)

2. **Files That Need Path Reference Updates**:
   - `Docs/MOBILE_APP_PLAN.md` - Update old path references (lines 5, 8)
   - `Docs/CURSOR_CONNECTION_ROOT_CAUSE.md` - Update old path reference (line 86)
   - `FIX_POWERSHELL.md` - Update old path reference (line 38)
   - `backend/test_error.txt` - Log file, can be deleted or left as-is

3. **Update Documentation Files**:
   ```bash
   # These files need manual updates or search/replace:
   # - Docs/MOBILE_APP_PLAN.md
   # - Docs/CURSOR_CONNECTION_ROOT_CAUSE.md
   # - FIX_POWERSHELL.md
   ```
   - Search for: `C:\Users\steve_80f2z1j\Development\Cursor Projects\KewlKidsOrganizerMobile`
   - Replace with: `C:\dev\kewlkids`
   - Or update to note these are historical references

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

## Files That Need Updates

### Documentation Files (Update Path References):
1. **Docs/MOBILE_APP_PLAN.md**
   - Line 5: Old source path reference
   - Line 8: Old source path reference
   - Action: Update or add note that these are historical references

2. **Docs/CURSOR_CONNECTION_ROOT_CAUSE.md**
   - Line 86: Old project path reference
   - Action: Update to new location or note as historical

3. **FIX_POWERSHELL.md**
   - Line 38: Old project path in command example
   - Action: Update to `C:\dev\kewlkids`

### Files That Are Fine (No Changes Needed):
- ✅ `mobile/scripts/dev-android.js` - Uses relative paths
- ✅ `backend/activate.ps1` - Uses relative paths
- ✅ `backend/runserver.bat` - Uses relative paths
- ✅ `mobile/android/local.properties` - Contains user-specific Android SDK path (correct)
- ✅ `mobile/hooks/useVoiceRecognition.ts` - No hardcoded paths found
- ✅ `mobile/DEV_BUILD_INSTRUCTIONS.md` - No hardcoded paths found
- ✅ `Docs/STARTUP_PROCEDURE.md` - No hardcoded paths found

### Optional Cleanup:
- `backend/test_error.txt` - Log file, can be deleted if desired

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
- ✅ Git commits and pushes successfully to new remote
- ✅ Android build completes successfully
- ✅ Mobile app runs and drag-and-drop works
- ✅ Backend API responds correctly
- ✅ Documentation files updated with new path references

## Next Steps After Migration

1. Update any CI/CD pipelines with new path (if applicable)
2. Update team documentation (if working with others)
3. Update any deployment scripts
4. Consider adding a `.cursorrules` or workspace settings file with the new path
