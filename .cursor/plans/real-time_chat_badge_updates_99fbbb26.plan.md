---
name: Real-time Chat Badge Updates
overview: Connect to the user notification WebSocket on the home screen and chat list screen to update badge counts in real-time when new messages arrive, without requiring page refreshes.
todos: []
---

# Rea

l-time Chat Badge Updates

## Problem

Chat badge counts on the home screen and chat list screen only update on page refresh or focus. They don't update in real-time when new messages arrive via WebSocket.

## Solution

The backend already sends user-level notifications via `UserNotificationConsumer` when messages are sent. We need to:

1. Connect to the notification WebSocket from home and chat list screens

2. Listen for `room_message` notifications

3. Update badge counts when notifications arrive (without infinite loops)

## Implementation

### 1. Home Screen (`mobile/app/(tabs)/index.tsx`)

- Connect to notification WebSocket on mount

- Set up notification handler to update `chatUnreadCount` when `room_message` notifications arrive

- Disconnect on unmount

- Only update if notification is for a room the user is a member of

- Use `setRoomLastSeen` to mark room as seen if user is currently viewing that room

### 2. Chat List Screen (`mobile/app/(tabs)/chat.tsx`)

- Connect to notification WebSocket on mount

- Set up notification handler to update `unreadCounts` for the specific room

- Disconnect on unmount

- Update the room's unread count in the `unreadCounts` state when notification arrives

- Only increment if the message is from another user (not the current user)

### 3. Chat Room Screen (`mobile/app/(tabs)/chat/[roomId].tsx`)

- When a new message arrives via WebSocket in the current room, mark it as seen immediately

- This already happens, but ensure it doesn't conflict with badge updates

## Key Considerations

### Avoiding Infinite Loops

- **Notification handler should NOT trigger room list refreshes** - only update badge counts

- Use stable references for handlers (useCallback with proper dependencies)

- Only update state if the notification is actually new (check message_id or timestamp)

- Don't connect/disconnect WebSocket on every render - use useEffect with proper cleanup

### Performance

- Badge updates should be lightweight (just increment/decrement counts)

- Don't refetch room lists or recalculate all badges on every notification

- Use `getUnreadCountFromLastMessage` for quick badge updates

### WebSocket Connection Management

- Connect once per screen, not on every render

- Use `useEffect` with cleanup to disconnect

- Handle reconnection on errors

- Share WebSocket connection if possible (or manage multiple connections properly)

## Files to Modify

1. `mobile/app/(tabs)/index.tsx` - Add notification WebSocket connection and handler

2. `mobile/app/(tabs)/chat.tsx` - Add notification WebSocket connection and handler

3. `mobile/utils/messageTracking.ts` - May need helper to update badge count from notification

## Notification Payload Structure

Based on backend code, notifications include:

```typescript
{
  type: 'room_message',
  room_id: number,
  message_id: number,
  sender: number, // member ID
  sender_email: string,
  sender_username: string,
  created_at: string // ISO timestamp
}
```



## Implementation Details

### Home Screen Handler

```typescript
const handleNotification = useCallback(async (notification: any) => {
  if (notification.type === 'room_message') {
    // Only update if message is from another user
    // Get user member ID for the room's family
    // Update chatUnreadCount by recalculating or incrementing
    await loadChatUnreadCount(); // Or increment smartly
  }
}, [loadChatUnreadCount]);
```



### Chat List Handler

```typescript
const handleNotification = useCallback(async (notification: any) => {
  if (notification.type === 'room_message') {
    const { room_id, sender, created_at } = notification;
    // Get user member ID for this room
    // If sender !== userMemberId, increment badge
    setUnreadCounts(prev => {
      const current = prev[room_id] || 0;
      // Check if this is a new unread message
      return { ...prev, [room_id]: current + 1 };
    });
  }
}, [userMemberIds]);

```