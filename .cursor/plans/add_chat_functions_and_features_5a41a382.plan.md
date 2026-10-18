---
name: Add Chat Functions and Features
overview: Expand the mobile app plan with comprehensive chat functionality including backend Django chat app, REST API endpoints, WebSocket real-time messaging, React Native screens, E2EE encryption, and all features from the source project.
todos: []
---

# Add

Chat Functions and Features to Mobile App Plan

## Overview

This plan expands section 4.3 of the mobile app plan with comprehensive chat functionality based on the source project implementation. The chat system includes end-to-end encryption, real-time messaging via WebSockets, room management, message reactions, and full mobile UI components.

## Backend Implementation

### 1. Create Django Chat App

**Location**: `backend/chat/`**Steps**:

1. Create chat app: `python manage.py startapp chat`
2. Add `chat` to `INSTALLED_APPS` in `backend/config/settings.py`
3. Create models, serializers, views, consumers, and routing

**Files to create**:

- `backend/chat/models.py` - ChatRoom, Message, MessageReaction models
- `backend/chat/serializers.py` - ChatRoomSerializer, MessageSerializer (if separate from api/serializers.py)
- `backend/chat/views.py` - Additional views if needed (currently empty in source)
- `backend/chat/consumers.py` - ChatConsumer, UserNotificationConsumer
- `backend/chat/routing.py` - WebSocket URL patterns
- `backend/chat/admin.py` - Admin registration
- `backend/chat/urls.py` - URL routing (if separate from api/urls.py)

### 2. Chat Models

**Location**: `backend/chat/models.py`**Models to implement**:

- **ChatRoom**: Family-based chat rooms with encrypted name field
- Fields: `family` (ForeignKey), `name` (EncryptedCharField), `members` (ManyToMany), `created_by`, `created_at`, `updated_at`
- **Message**: Encrypted messages with ciphertext storage
- Fields: `room` (ForeignKey), `sender` (Member ForeignKey), `body_ciphertext` (BinaryField), `iv` (BinaryField), `created_at`, `edited_at`, `is_edited`
- **MessageReaction**: Emoji reactions to messages
- Fields: `message` (ForeignKey), `member` (ForeignKey), `emoji` (CharField), `created_at`
- Unique constraint: `['message', 'member', 'emoji']`

**Migration**: Run `python manage.py makemigrations chat` and `python manage.py migrate`

### 3. REST API Endpoints

**Location**: `backend/api/views.py` and `backend/api/serializers.py`**ViewSets to add**:

- **ChatRoomViewSet**: CRUD operations for chat rooms
- List: GET `/api/chat-rooms/` - Returns rooms user is member of
- Create: POST `/api/chat-rooms/` - Create new room with member selection
- Retrieve: GET `/api/chat-rooms/{id}/` - Get room details
- Update: PATCH/PUT `/api/chat-rooms/{id}/` - Update room (name, members)
- Delete: DELETE `/api/chat-rooms/{id}/` - Delete room (admin/owner only)
- Custom fields: `last_message`, `member_count`, `member_ids_list`
- **MessageViewSet**: Message operations
- List: GET `/api/messages/?room={room_id}` - Get messages for a room
- Delete: DELETE `/api/messages/{id}/` - Delete own messages (or admin)
- No create via API (messages created via WebSocket)

**Serializers**:

- **ChatRoomSerializer**: Includes computed fields for last message, member info
- **MessageSerializer**: Returns ciphertext/iv (no decryption on server)

**URL Registration**: Add to `backend/api/urls.py`:

```python
router.register(r'chat-rooms', ChatRoomViewSet, basename='chatroom')
router.register(r'messages', MessageViewSet, basename='message')
```



### 4. WebSocket Implementation

**Location**: `backend/chat/consumers.py` and `backend/config/routing.py`**Consumers**:

- **ChatConsumer**: Real-time messaging for specific chat rooms
- Route: `ws/chat/{room_id}/`
- Handles: Message sending/receiving, room access verification
- Broadcasts: Messages to room group, notifications to user groups
- Authentication: JWT token in query string
- **UserNotificationConsumer**: User-level notifications across all rooms
- Route: `ws/chat/notifications/`
- Handles: Notifications for new messages in any room user is member of
- Use case: Update unread counts when not viewing specific room

**WebSocket Routing**: Update `backend/config/asgi.py`:

```python
from chat.routing import websocket_urlpatterns

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
```

**Files to create**:

- `backend/chat/routing.py` - WebSocket URL patterns
- Update `backend/config/asgi.py` - Enable WebSocket routing

### 5. Encryption Integration

**Location**: `backend/chat/models.py`**Encryption**:

- Use `encrypted_model_fields` for ChatRoom.name
- Messages stored as binary ciphertext (encrypted client-side)
- Server never sees plaintext messages

## Mobile App Implementation

### 6. Chat Service Layer

**Location**: `mobile/services/chatService.ts`**Functions to implement**:

- `getChatRooms()` - Fetch all rooms user is member of
- `getChatRoom(roomId)` - Get room details
- `createChatRoom(familyId, name, memberIds)` - Create new room
- `deleteChatRoom(roomId)` - Delete room
- `getMessages(roomId)` - Fetch messages for room
- `deleteMessage(messageId)` - Delete message
- `getRoomMembers(roomId)` - Get room members

**Files to create**:

- `mobile/services/chatService.ts`

### 7. WebSocket Service

**Location**: `mobile/services/websocketService.ts`**Functions to implement**:

- `connectToRoom(roomId, token)` - Connect to room WebSocket
- `disconnectFromRoom()` - Disconnect from room
- `sendMessage(roomId, ciphertext, iv)` - Send encrypted message
- `connectToNotifications(token)` - Connect to user notification WebSocket
- `disconnectFromNotifications()` - Disconnect from notifications
- Message event handlers for real-time updates

**Files to create**:

- `mobile/services/websocketService.ts`

### 8. Encryption Utilities

**Location**: `mobile/utils/encryption.ts`**Functions to implement**:

- `encryptMessage(plaintext, key)` - Encrypt message with AES-GCM
- `decryptMessage(ciphertext, iv, key)` - Decrypt message
- `deriveRoomKey(roomId, familyId, familySecret)` - Derive deterministic room key
- `getOrCreateFamilySecret(familyId)` - Get/create family encryption secret

**Migration from**: `KewlKidsOrganizer/frontend/react/src/utils/encryption.js`**Dependencies**: `expo-crypto` or `react-native-crypto`

### 9. Chat Screens

**Location**: `mobile/app/(tabs)/chat.tsx` and `mobile/screens/chat/`**Screens to create**:

#### Chat List Screen (`mobile/app/(tabs)/chat.tsx`)

- Room list grouped by family (accordion UI)
- Unread message badges per room and per family
- Create room button per family
- Room preview with last message and timestamp
- Navigation to conversation screen
- Pull-to-refresh

#### Conversation Screen (`mobile/screens/chat/[roomId].tsx`)

- Message list with sender avatars
- Message bubbles (sent vs received styling)
- Message input with send button
- Attachment picker (emojis, GIFs)
- Voice input button
- WebSocket connection status indicator
- Auto-scroll to latest message
- Message deletion (own messages)
- Loading states

**Files to create**:

- `mobile/app/(tabs)/chat.tsx` - Main chat tab (list view)
- `mobile/screens/chat/[roomId].tsx` - Conversation screen
- `mobile/screens/chat/CreateRoomScreen.tsx` - Room creation modal/screen

### 10. Chat Components

**Location**: `mobile/components/chat/`**Components to create**:

- **MessageBubble** (`MessageBubble.tsx`): Individual message display
- Sent vs received styling
- Sender avatar and name
- Timestamp
- Delete button (own messages)
- GIF/image rendering
- **ChatInput** (`ChatInput.tsx`): Message input area
- Text input
- Send button
- Attachment button
- Voice input button
- Disabled state when WebSocket not connected
- **AttachmentPicker** (`AttachmentPicker.tsx`): Emoji and GIF picker
- Emoji selection
- GIF search/selection (Giphy API or similar)
- Modal overlay
- **RoomListItem** (`RoomListItem.tsx`): Room item in list
- Room name
- Last message preview
- Timestamp
- Unread badge
- Tap to navigate
- **CreateRoomForm** (`CreateRoomForm.tsx`): Room creation form
- Family selection
- Member selection (checkboxes)
- Room name input
- Create/Cancel buttons

**Files to create**:

- `mobile/components/chat/MessageBubble.tsx`
- `mobile/components/chat/ChatInput.tsx`
- `mobile/components/chat/AttachmentPicker.tsx`
- `mobile/components/chat/RoomListItem.tsx`
- `mobile/components/chat/CreateRoomForm.tsx`

### 11. Chat Context/Hooks

**Location**: `mobile/contexts/ChatContext.tsx` and `mobile/hooks/useChat.ts`**Context to create**:

- **ChatContext**: Global chat state management
- Current room
- Unread counts per room
- WebSocket connections
- Message cache
- Last seen message IDs

**Hook to create**:

- **useChat**: Hook for chat operations
- `sendMessage(roomId, text)`
- `createRoom(familyId, name, memberIds)`
- `deleteRoom(roomId)`
- `markRoomAsRead(roomId)`
- `getUnreadCount(roomId)`

**Files to create**:

- `mobile/contexts/ChatContext.tsx`
- `mobile/hooks/useChat.ts`

### 12. Features to Implement

**Core Features**:

- ✅ Room list with family grouping
- ✅ Create/delete chat rooms
- ✅ Real-time messaging via WebSocket
- ✅ End-to-end encryption (E2EE)
- ✅ Unread message counts
- ✅ Last message preview
- ✅ Message deletion
- ✅ Room deletion
- ✅ Member selection for room creation
- ✅ User avatars in messages
- ✅ Timestamp formatting
- ✅ Connection status indicators

**Advanced Features**:

- ✅ Message reactions (emoji)
- ✅ Voice input for messages
- ✅ GIF/emoji attachments
- ✅ Photo caching and optimization
- ✅ User-level notifications (cross-room)
- ✅ Message editing (if `is_edited` flag used)
- ✅ Typing indicators (future enhancement)
- ✅ Read receipts (future enhancement)

### 13. Dependencies

**Mobile dependencies to add**:

```json
{
  "expo-crypto": "~12.8.0",
  "expo-av": "~14.0.0",
  "expo-speech": "~12.0.0",
  "@react-native-async-storage/async-storage": "^1.21.0"
}
```

**Backend dependencies** (already in requirements.txt):

- `channels` - WebSocket support
- `channels-redis` - Redis channel layer
- `daphne` - ASGI server
- `django-encrypted-model-fields` - Encrypted fields
- `cryptography` - Encryption library

### 14. Testing Considerations

**Backend Testing**:

- Test WebSocket authentication
- Test room access permissions
- Test message encryption/decryption flow
- Test notification broadcasting

**Mobile Testing**:

- Test WebSocket connection/reconnection
- Test encryption/decryption
- Test unread count updates
- Test offline message queuing (if implemented)
- Test photo loading and caching
- Test voice input
- Test attachment picker

## Implementation Order

1. **Backend Setup** (Phase 1 or early Phase 2):

- Create chat app
- Add models and migrations
- Create serializers and viewsets
- Set up WebSocket routing

2. **Backend WebSocket** (Phase 2):

- Implement ChatConsumer
- Implement UserNotificationConsumer
- Test WebSocket connections

3. **Mobile Services** (Phase 2):

- Create chatService.ts
- Create websocketService.ts
- Port encryption utilities

4. **Mobile UI** (Phase 4.3):

- Create chat list screen
- Create conversation screen
- Create chat components
- Implement ChatContext

5. **Integration** (Phase 4.3):

- Connect WebSocket to UI
- Test end-to-end flow
- Add error handling
- Optimize performance

## Migration Notes

**From React to React Native**:

- Replace `<div>` → `<View>`
- Replace `<input>` → `<TextInput>`
- Replace `<button>` → `<TouchableOpacity>` or `<Pressable>`
- Replace CSS → `StyleSheet`
- Replace `window.location` → Use Expo constants for URLs
- Replace `localStorage` → `AsyncStorage` or `SecureStore`
- Replace browser WebSocket → React Native WebSocket (built-in)
- Replace `document.hidden` → `AppState` API
- Replace blob URLs → Use `expo-file-system` for file handling

**Key Differences**:

- Mobile WebSocket may need different URL handling (use device IP in dev)
- Photo caching strategy differs (use `expo-file-system` cache)
- Voice input uses `expo-speech` and `expo-av`
- Navigation uses Expo Router instead of React Router

## Files Summary

**Backend** (8 files):

- `backend/chat/models.py`
- `backend/chat/consumers.py`
- `backend/chat/routing.py`
- `backend/chat/admin.py`
- `backend/chat/urls.py` (optional)
- Update `backend/api/views.py` (add ChatRoomViewSet, MessageViewSet)
- Update `backend/api/serializers.py` (add ChatRoomSerializer, MessageSerializer)
- Update `backend/config/asgi.py` (enable WebSocket routing)

**Mobile** (15+ files):

- `mobile/services/chatService.ts`
- `mobile/services/websocketService.ts`
- `mobile/utils/encryption.ts` (port from source)
- `mobile/app/(tabs)/chat.tsx`
- `mobile/screens/chat/[roomId].tsx`
- `mobile/screens/chat/CreateRoomScreen.tsx`
- `mobile/components/chat/MessageBubble.tsx`
- `mobile/components/chat/ChatInput.tsx`
- `mobile/components/chat/AttachmentPicker.tsx`
- `mobile/components/chat/RoomListItem.tsx`
- `mobile/components/chat/CreateRoomForm.tsx`