---
name: Fix Google Photos Error Handling (Frontend + Backend)
overview: "Fix Google Photos error handling to be consistent with OneDrive and Google Drive. Two issues: (1) Frontend parseError logic is different, (2) Backend exception handling order is wrong - ValueError handler comes AFTER Exception handler, so session/decryption errors are never properly detected."
todos:
  - id: fix-backend-exception-order
    content: Fix exception handling order in GooglePhotosListMediaItemsView - move ValueError handler BEFORE Exception handler to match OneDrive/Google Drive
    status: pending
  - id: fix-frontend-flag-checks
    content: Update Google Photos parseError to use loose flag checks (||) instead of strict equality (=== true) to match OneDrive/Google Drive
    status: pending
  - id: fix-frontend-reconnect-logic
    content: "Update requiresReconnect logic to match OneDrive/Google Drive pattern: hasReconnectFlag || (isOAuth401 && !hasRefreshFlag) || ..."
    status: pending
    dependencies:
      - fix-frontend-flag-checks
  - id: fix-frontend-logout-logic
    content: Ensure requiresLogout properly checks hasRefreshFlag and sets logout when session expired
    status: pending
    dependencies:
      - fix-frontend-flag-checks
  - id: fix-frontend-message-conditions
    content: "Update message conditions to match OneDrive/Google Drive: if (isOAuth401 && !hasReconnectFlag && !hasRefreshFlag) for default, else if (isOAuth401 && hasReconnectFlag) for explicit reconnect"
    status: pending
    dependencies:
      - fix-frontend-reconnect-logic
      - fix-frontend-logout-logic
---

# Fix Google Photos Error Handling Consistency

## Problem

Google Photos shows "connection has expired, reconnect" even when OneDrive and Google Drive work fine. This indicates:

1. **Session/encryption keys are shared** - All 3 services use the same `user_key` from cache (`oauth_user_key_{user_id}`)
2. **OAuth tokens are independent** - Each service has its own tokens (OneDriveSync, GoogleDriveSync, GooglePhotosSync)
3. **Google Photos error handling is broken** - It's not properly detecting session expiration vs OAuth expiration

## Root Causes

### Issue 1: Backend Exception Handling Order (CRITICAL BUG)

In [`backend/api/views.py`](backend/api/views.py) line 3479-3539, Google Photos has:

```python
except Exception as e:  # ← Catches EVERYTHING first
    # Returns generic 500 error
except ValueError as e:  # ← NEVER REACHED!
    # Properly sets requires_refresh or requires_reconnect
```

**OneDrive and Google Drive** (lines 2313-2343, 2886-2916) have the correct order:

```python
except ValueError as e:  # ← Catches session/decryption errors first
    # Properly sets requires_refresh or requires_reconnect
except Exception as e:  # ← Catches everything else
    # Generic error handling
```

**Impact**: When `get_user_key_from_request()` raises `ValueError("User encryption key not in session. Password required.")`, it gets caught by `Exception` handler and returns a 500 error instead of `requires_refresh: True`. The frontend then incorrectly interprets this as needing reconnect.

### Issue 2: Frontend parseError Logic

The `GooglePhotosBrowser.parseError` function in [`mobile/app/(tabs)/documents.tsx`](mobile/app/\(tabs)/documents.tsx) uses different logic than OneDrive/Google Drive:

- Uses strict equality checks (`=== true`) instead of loose checks
- Different condition for setting `requiresReconnect`
- Message condition doesn't match OneDrive/Google Drive pattern

## Solution

### Backend Fix (Priority 1)

Fix exception handling order in [`backend/api/views.py`](backend/api/views.py) `GooglePhotosListMediaItemsView`:

1. Move `except ValueError as e:` block BEFORE `except Exception as e:` block (lines 3509-3539 should come before 3479-3508)
2. Ensure it matches the exact pattern used by OneDrive and Google Drive

### Frontend Fix (Priority 2)

Update `GooglePhotosBrowser.parseError` in [`mobile/app/(tabs)/documents.tsx`](mobile/app/\(tabs)/documents.tsx) to match OneDrive/Google Drive:

1. Change flag checks from strict (`=== true`) to loose (`|| === true`)
2. Update `requiresReconnect` logic to: `hasReconnectFlag || (isOAuth401 && !hasRefreshFlag) || ...`
3. Update message conditions to match OneDrive/Google Drive pattern

## Files to Modify

- [`backend/api/views.py`](backend/api/views.py) - Fix exception handling order in `GooglePhotosListMediaItemsView` (lines ~3479-3539)
- [`mobile/app/(tabs)/documents.tsx`](mobile/app/\(tabs)/documents.tsx) - Update `GooglePhotosBrowser.parseError` function (lines ~2419-2470)

## Expected Behavior After Fix

- **Session expiration** (`requires_refresh: True`) → All 3 services show logout option
- **OAuth token expiration** (`requires_reconnect: True`) → Only affected service shows reconnect option