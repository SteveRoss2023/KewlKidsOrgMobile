---
name: Fix Chat Badge Issues
overview: Fix all identified issues with chat badge system to ensure badges correctly track unread messages for receivers while never counting sender's own messages as unread.
todos:
  - id: remove-debug-alerts
    content: Remove debug alert() calls in Chat.jsx lines 1052-1061, replace with console.log()
    status: pending
  - id: add-sender-check-fetchrooms
    content: Add sender check in fetchRooms to prevent counting own messages as unread (Chat.jsx lines 236-262)
    status: pending
  - id: fix-email-race-condition
    content: Fix race condition with currentUserEmail - add notification queue and ensure email is loaded before processing (Chat.jsx and App.jsx)
    status: pending
  - id: add-sender-info-api
    content: Add sender email to last_message in ChatRoomSerializer API response (serializers.py lines 332-340)
    status: pending
  - id: normalize-sender-format
    content: Create helper function to normalize sender format (Member ID vs email) and use consistently throughout Chat.jsx
    status: pending
  - id: prevent-double-counting
    content: Add deduplication logic to prevent both App.jsx and Chat.jsx from processing same notification
    status: pending
---

# Fix Chat Badge Issues

## Overview

Fix 6 identified issues preventing chat badges from working correctly for senders and receivers. The main problems are: debug alerts disrupting UX, race conditions with user email loading, missing sender checks, and potential double counting.

## Implementation Plan

### Phase 1: Critical Fixes (Immediate)

#### 1.1 Remove Debug Alerts

**File:** `frontend/react/src/components/Chat.jsx`
**Lines:** 1052-1061
**Change:** Replace all `alert()` calls with `console.log()` statements

- Remove the three alert() calls in the notification handler
- Keep the debug information but output to console instead
- This fixes the critical UX disruption

#### 1.2 Add Sender Check in fetchRooms

**File:** `frontend/react/src/components/Chat.jsx`
**Lines:** 236-262
**Change:** Check if last_message is from current user before incrementing unread count

- Need to get current user's member ID
- Compare `room.last_message.sender_id` with current user's member ID
- Only increment unread count if sender is NOT the current user
- This prevents own messages from being counted as unread after page refresh

### Phase 2: High Priority Fixes

#### 2.1 Fix Race Condition with currentUserEmail

**File:** `frontend/react/src/components/Chat.jsx`
**Lines:** 970-1154 (notification WebSocket handler)
**Change:** Ensure currentUserEmail is loaded before processing notifications

- Add a notification queue for messages that arrive before email is loaded
- Process queued notifications once email is available
- Default to safe behavior: if email unavailable, don't increment badge (better to miss than show incorrect count)
- Also update App.jsx global notification handler (lines 119-166) with same logic

#### 2.2 Add Sender Info to API Response

**File:** `backend/api/serializers.py`
**Lines:** 332-340 (get_last_message method)
**Change:** Include sender email in last_message response

- Add `sender_email` field to the last_message dict
- This makes it easier for frontend to check if message is from current user
- Alternative: Add `sender_user_id` if email is not easily accessible

### Phase 3: Medium Priority Improvements

#### 3.1 Normalize Sender Format

**File:** `frontend/react/src/components/Chat.jsx`
**Lines:** Multiple locations handling sender comparison
**Change:** Create helper function to normalize sender format

- Create `isMessageFromCurrentUser(message, currentUserEmail, currentUserMemberId)` helper
- Handle both API format (Member ID number) and WebSocket format (email string)
- Use this helper consistently throughout the component
- Update message rendering logic (line 1831-1833) to use normalized comparison

#### 3.2 Prevent Double Counting

**File:** `frontend/react/src/components/Chat.jsx` and `frontend/react/src/App.jsx`
**Change:** Ensure only one handler processes each notification

- Add deduplication logic using message ID and timestamp
- Or disable Chat.jsx notification handler when Chat component is active (since App.jsx global handler is sufficient)
- Add check to skip if notification was already processed

## Files to Modify

1. `frontend/react/src/components/Chat.jsx` - Main chat component (calculates per-room unread counts)
2. `frontend/react/src/App.jsx` - Global notification handler (calculates total unread count)
3. `backend/api/serializers.py` - ChatRoom serializer (adds sender info to API)

## Badge Display Locations

The fixes will update badges in **both** locations:

1. **Home Chat Card Badge** (`Home.jsx` line 112-114)

- Displays total unread count across all rooms (`chatUnreadCount`)
- Updated via `App.jsx` → `setChatUnreadCount` → passed to `Home.jsx` as prop
- This badge shows the sum of all room unread counts

2. **Chat Room Badges** (`Chat.jsx` line 1755-1757)

- Displays per-room unread counts (`unreadCounts[room.id]`)
- Updated directly in `Chat.jsx` component state
- Each room shows its individual unread count

**Data Flow:**

- `Chat.jsx` calculates per-room counts → calls `updateUnreadTotal()` → updates total via `onUnreadCountChange()`
- `App.jsx` maintains `chatUnreadCount` (total) and `chatUnreadCounts` (per-room)
- Both badges use the same underlying calculation logic, so fixing the core issues will fix both displays

## Testing Requirements

After implementation, verify:

- No alert popups appear when receiving messages
- Sender's own messages never increment badge count
- Receiver's badge increments correctly when receiving messages
- Badge clears when opening a room
- Badge persists across page refresh
- Badge works when notifications arrive before email is loaded
- No double counting occurs
- Badge calculation works correctly after page refresh (API-based)

## Implementation Notes

- Start with Phase 1 (critical fixes) as they have immediate impact
- Phase 2 fixes the root causes of incorrect badge counts
- Phase 3 improves reliability and maintainability
- Test each phase before moving to the next
- Keep console.log statements for debugging but remove before production if desired