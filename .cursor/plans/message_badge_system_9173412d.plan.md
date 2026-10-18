---
name: Message Badge System
overview: Implement unread message badges for the Chat card on the home page and for each room in the chat list. Messages are marked as seen when the user opens a room, and badges display the count of unread messages.
todos:
  - id: create-message-tracking
    content: Create messageTracking.ts utility with functions to get/set last_seen timestamps and calculate unread counts
    status: pending
  - id: create-badge-component
    content: Create MessageBadge.tsx component for displaying unread message counts
    status: pending
  - id: update-room-screen
    content: Update chat/[roomId].tsx to mark messages as seen when room opens and when new messages arrive
    status: pending
    dependencies:
      - create-message-tracking
  - id: update-chat-list
    content: Update chat.tsx to calculate and display unread badges for each room item
    status: pending
    dependencies:
      - create-message-tracking
      - create-badge-component
  - id: update-home-screen
    content: Update index.tsx to calculate and display total unread count badge on Chat card
    status: pending
    dependencies:
      - create-message-tracking
      - create-badge-component
  - id: websocket-updates
    content: Add real-time badge updates when new messages arrive via WebSocket
    status: pending
    dependencies:
      - update-room-screen
      - update-chat-list
      - update-home-screen
---

# Message Badg

e System Implementation

## Overview

Add unread message badges to:

1. **Home page Chat card** - Shows total unread messages across all rooms

2. **Chat rooms list** - Shows unread count for each individual room

Messages are marked as "seen" when the user opens a room, and badges display the numeric count of unread messages.

## Architecture

### Data Flow

```javascript
User opens room → Mark messages as seen → Update last_seen timestamp
New message arrives → Compare with last_seen → Update badge count
User views home/chat list → Calculate unread counts → Display badges
```

### Storage Strategy

- Use `secureStorage` to persist `last_seen` timestamps per room

- Key format: `room_last_seen_${roomId}`

- Store timestamp as ISO string

- Update timestamp when user opens/views a room

## Implementation Steps

### 1. Backend Changes

#### 1.1 Add unread count to ChatRoom serializer

**File**: `backend/api/serializers.py`

- Add `unread_count` field to `ChatRoomSerializer`

- Calculate count of messages where `created_at > user's last_seen` for that room

- Use `SerializerMethodField` to compute dynamically

- Consider: May need to track `last_seen` on backend or pass from frontend

**Alternative**: Calculate unread count on frontend using stored `last_seen` timestamps

### 2. Frontend Changes

#### 2.1 Create unread message tracking utility

**File**: `mobile/utils/messageTracking.ts` (new file)

- Functions:

- `getRoomLastSeen(roomId: number): Promise<Date | null>`

- `setRoomLastSeen(roomId: number, timestamp: Date): Promise<void>`

- `getUnreadCount(roomId: number, messages: Message[], userMemberId: number | null): Promise<number>`
  - Filter out messages where `message.sender === userMemberId` (user's own messages)
  - Count only messages where `created_at > last_seen` AND `sender !== userMemberId`

- `getTotalUnreadCount(rooms: ChatRoom[], userMemberIds: {[familyId: number]: number}): Promise<number>`
  - For each room, get messages and filter by user's member ID for that family
  - Sum unread counts across all rooms

- Use `secureStorage` for persistence

- Compare message `created_at` with stored `last_seen` timestamp

- **Important**: Only count messages from other users, not the current user's own messages

#### 2.2 Update Chat Room Screen

**File**: `mobile/app/(tabs)/chat/[roomId].tsx`

- When room opens (in `useEffect` or `loadRoom`), call `setRoomLastSeen(roomId, new Date())`

- When messages load, update last_seen to the latest message timestamp

- Listen for new WebSocket messages and update last_seen when user is viewing the room

- Use `useFocusEffect` to update last_seen when screen comes into focus

#### 2.3 Update Chat Rooms List

**File**: `mobile/app/(tabs)/chat.tsx`

- Add state: `const [unreadCounts, setUnreadCounts] = useState<{[roomId: number]: number}>({})`

- In `loadRooms`, calculate unread count for each room:

- Get `last_seen` timestamp for each room

- Fetch messages for each room (or use `last_message` if available)

- Filter out messages where sender matches user's member ID for that room's family

- Count only messages from other users where `created_at > last_seen`

- Store counts in state

- Update `renderRoomItem` to display badge:

- Add badge component showing count if > 0

- Position badge on room item (top-right corner)

- Listen for WebSocket messages (if connected globally) to update counts in real-time

#### 2.4 Update Home Screen

**File**: `mobile/app/(tabs)/index.tsx`

- Add state: `const [chatUnreadCount, setChatUnreadCount] = useState<number>(0)`

- Create function `loadChatUnreadCount()`:

- Fetch all chat rooms via `chatService.getChatRooms()`

- Calculate total unread count using `getTotalUnreadCount()`

- Update state

- Call `loadChatUnreadCount()` in `useEffect` and `handleRefresh`

- Use `useFocusEffect` to refresh count when screen comes into focus

- Update Chat card rendering to show badge:

- Add badge component with count if > 0

- Position badge on card icon or title area

#### 2.5 Create Badge Component

**File**: `mobile/components/MessageBadge.tsx` (new file)

- Reusable badge component

- Props: `count: number`, `style?: ViewStyle`

- Display:

- If count === 0: render nothing

- If count > 0: show red circular badge with white text

- If count > 99: show "99+"

- Styling: red background, white text, rounded, positioned absolutely

### 3. Real-time Updates

#### 3.1 WebSocket Integration

- When new message arrives via WebSocket:

- Check if `message.sender === userMemberId` (user's own message)

- If it's the user's own message: do NOT increment unread count (user doesn't need badge for their own messages)

- If it's from another user:
  - If user is viewing that room: update `last_seen` immediately
  - If user is NOT viewing that room: increment unread count

- Update badge counts in real-time on chat list and home screen

#### 3.2 Polling Alternative (if WebSocket not available globally)

- Poll for new messages periodically when on home/chat list screens

- Update unread counts accordingly

## Files to Modify

1. `mobile/utils/messageTracking.ts` (new) - Unread tracking utilities

2. `mobile/components/MessageBadge.tsx` (new) - Badge component

3. `mobile/app/(tabs)/chat/[roomId].tsx` - Mark messages as seen when room opens

4. `mobile/app/(tabs)/chat.tsx` - Display badges on room items

5. `mobile/app/(tabs)/index.tsx` - Display badge on Chat card

## Considerations

- **Performance**: Cache unread counts to avoid recalculating on every render

- **Edge Cases**: Handle rooms with no messages, deleted messages, etc.

- **Persistence**: Ensure `last_seen` timestamps survive app restarts

- **Multi-device**: Each device tracks its own `last_seen` (expected behavior)

- **Initial State**: New rooms or first-time users should show all messages as unread initially

- **User's Own Messages**: **CRITICAL** - Never count the user's own messages toward unread badges. Only count messages from other users. This requires identifying the user's member ID per room/family and filtering messages accordingly.

## Testing Checklist

- [ ] Badge appears on home Chat card when unread messages exist

- [ ] Badge count updates when new messages arrive

- [ ] Badge disappears when user opens room

- [ ] Badge appears on room items in chat list

- [ ] Badge counts are correct after app restart

- [ ] Badge handles 99+ messages correctly