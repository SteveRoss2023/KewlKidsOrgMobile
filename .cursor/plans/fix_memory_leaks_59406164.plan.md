---
name: Fix Memory Leaks
overview: "Fix memory leaks causing unbounded growth when the app is left idle: cap message arrays, fix blob URL cleanup, limit notification tracking, and ensure proper cleanup of intervals/timeouts."
todos:
  - id: cap-messages
    content: Add MAX_MESSAGES limit to Chat.jsx and cap messages array in both WebSocket handler and fetchMessages
    status: pending
  - id: fix-blob-leak
    content: Fix blob URL leak in Families.jsx setInterval - revoke old URLs before creating new ones
    status: pending
  - id: limit-notifications
    content: Reduce processedNotifications Set size limits and add periodic cleanup in App.jsx and Chat.jsx
    status: pending
  - id: limit-queues
    content: Add max size limits to notificationQueue arrays (max 20 items)
    status: pending
  - id: visibility-cleanup
    content: Add Page Visibility API handlers to pause operations and clean up when tab is hidden
    status: pending
---

# Fix Memory Leaks in React Frontend

## Issues Found

1. **Unbounded message arrays** - `messages` state in `Chat.jsx` grows indefinitely as new messages arrive
2. **Blob URL leaks in Families.jsx** - `setInterval` creates new blob URLs every 30s without revoking old ones
3. **Notification tracking sets** - `processedNotifications` Set in `App.jsx` and `Chat.jsx` could grow large
4. **Notification queues** - Arrays that could accumulate if email loading is delayed
5. **Missing message limits** - No cap on how many messages are kept in memory

## Files to Modify

- [`frontend/react/src/components/Chat.jsx`](frontend/react/src/components/Chat.jsx) - Cap messages array, improve notification cleanup
- [`frontend/react/src/components/Families.jsx`](frontend/react/src/components/Families.jsx) - Fix blob URL cleanup in setInterval
- [`frontend/react/src/App.jsx`](frontend/react/src/App.jsx) - Limit notification tracking Set size more aggressively

## Implementation Details

### 1. Cap Messages Array in Chat.jsx

- Add `MAX_MESSAGES = 500` constant
- When adding new messages, keep only the most recent N messages
- Apply limit in both WebSocket `onmessage` handler and `fetchMessages`

### 2. Fix Blob URL Leak in Families.jsx

- Before creating new blob URLs in the interval, revoke old ones from previous interval
- Store previous blob URLs and clean them up before creating new ones

### 3. More Aggressive Notification Cleanup

- Reduce `processedNotifications` Set cleanup threshold from 100 to 50
- Add periodic cleanup (every 100 notifications) instead of only when threshold is reached
- Limit `notificationQueue` arrays to max 20 items

### 4. Add Visibility-Based Cleanup

- When tab becomes hidden (Page Visibility API), pause non-essential operations
- Clear old messages when tab is hidden for extended period
- Resume when tab becomes visible again