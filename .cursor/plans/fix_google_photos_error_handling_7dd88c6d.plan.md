---
name: Fix Google Photos Error Handling
overview: Align Google Photos error parsing logic with OneDrive and Google Drive to properly distinguish between session expiration (requires_refresh/logout) and OAuth token expiration (requires_reconnect).
todos:
  - id: fix-flag-checks
    content: Update Google Photos parseError to use loose flag checks (||) instead of strict equality (=== true) to match OneDrive/Google Drive
    status: pending
  - id: fix-reconnect-logic
    content: "Update requiresReconnect logic to match OneDrive/Google Drive pattern: hasReconnectFlag || (isOAuth401 && !hasRefreshFlag) || ..."
    status: pending
    dependencies:
      - fix-flag-checks
  - id: fix-logout-logic
    content: Ensure requiresLogout properly checks hasRefreshFlag and sets logout when session expired
    status: pending
    dependencies:
      - fix-flag-checks
  - id: fix-message-conditions
    content: "Update message conditions to match OneDrive/Google Drive: if (isOAuth401 && !hasReconnectFlag && !hasRefreshFlag) for default, else if (isOAuth401 && hasReconnectFlag) for explicit reconnect"
    status: pending
    dependencies:
      - fix-reconnect-logic
      - fix-logout-logic
---

# Fix Goog

le Photos Error Handling Consistency

## Problem

Google Photos is showing "Your Google Photos connection has expired. Please reconnect your account in Settings" even when the backend returns `requires_refresh: True` (session expired, not OAuth expired). This is inconsistent with OneDrive and Google Drive, which properly distinguish between:

- **Session expiration** (`requires_refresh: True`) → User needs to logout/login
- **OAuth token expiration** (`requires_reconnect: True`) → User needs to reconnect the service

## Root Cause

The `parseError` function in `GooglePhotosBrowser` has different logic than `OneDriveBrowser` and `GoogleDriveBrowser`:

1. **Strict equality checks**: Google Photos uses `errorData.requires_reconnect === true` while OneDrive/Google Drive use `errorData.requires_reconnect || errorData.requires_reconnect === true`
2. **Incorrect condition logic**: Google Photos sets `requiresReconnect = true` for any 401 when `!hasRefreshFlag`, but then the message condition `if (isOAuth401 && requiresReconnect && !hasReconnectFlag)` triggers even when refresh is needed
3. **Message condition mismatch**: The condition doesn't match OneDrive/Google Drive pattern

## Solution

Update `GooglePhotosBrowser.parseError` in [`mobile/app/(tabs)/documents.tsx`](mobile/app/\\(tabs)/documents.tsx) to match the exact logic used by `OneDriveBrowser` and `GoogleDriveBrowser`:

### Changes Needed:

1. **Fix flag checks** (lines 2425-2427):

- Change from strict equality (`=== true`) to loose checks like OneDrive/Google Drive
- Match the pattern: `errorData.requires_reconnect || errorData.requires_reconnect === true`

2. **Fix requiresReconnect logic** (lines 2448-2455):

- Use the same pattern as OneDrive/Google Drive: `hasReconnectFlag || (isOAuth401 && !hasRefreshFlag) || ...`
- Remove the separate block that sets `requiresReconnect = true` for all 401s

3. **Fix requiresLogout logic** (line 2449):

- Ensure `hasRefreshFlag` is properly checked and sets `requiresLogout = true`

4. **Fix message condition** (lines 2459-2463):

- Change from `if (isOAuth401 && requiresReconnect && !hasReconnectFlag)` 
- To: `if (isOAuth401 && !hasReconnectFlag && !hasRefreshFlag)` (matches OneDrive/Google Drive)
- Add the `else if (isOAuth401 && hasReconnectFlag)` branch for explicit reconnect cases

### Files to Modify:

- [`mobile/app/(tabs)/documents.tsx`](mobile/app/\\(tabs)/documents.tsx) - Update `GooglePhotosBrowser.parseError` function (lines ~2419-2470)

### Expected Behavior After Fix:

- When backend returns `requires_refresh: True` → Shows logout option, not reconnect
- When backend returns `requires_reconnect: True` → Shows reconnect option