---
name: Mobile-first chat redesign
overview: Redesign the chat interface to be mobile-first with an initial chat list view showing unread badges and message previews, and a full conversation view with back button when a chat is selected. Also redesign the input area to have a single attachment/plus icon that opens a tabbed interface (Emoji and GIF tabs) like modern chat apps.
todos:
  - id: add-view-state
    content: Add viewMode state and lastMessages tracking state to Chat.jsx
    status: pending
  - id: update-room-click
    content: Update room click handler to set viewMode to conversation
    status: pending
  - id: add-back-button
    content: Add back button handler and UI in conversation view
    status: pending
  - id: track-last-messages
    content: Track last message per room when messages are loaded/received
    status: pending
  - id: update-chat-list
    content: Update chat list items to show preview, timestamp, and unread badge
    status: pending
  - id: create-attachment-picker
    content: Create new AttachmentPicker component with Emoji and GIF tabs
    status: pending
  - id: update-input-buttons
    content: Replace separate emoji/GIF buttons with single attachment/plus icon button
    status: pending
  - id: integrate-attachment-picker
    content: Integrate AttachmentPicker into Chat component with show/hide logic
    status: pending
  - id: mobile-css-base
    content: Create mobile-first base CSS styles for chat list and items
    status: pending
  - id: conversation-css
    content: Add CSS for full-screen conversation view with back button
    status: pending
  - id: input-inline-css
    content: Style inline input area with voice and attachment buttons on same line
    status: pending
  - id: attachment-picker-css
    content: Create CSS for tabbed attachment picker overlay/modal
    status: pending
  - id: responsive-breakpoints
    content: Add responsive breakpoints for tablet/desktop views
    status: pending
  - id: unread-badge-styles
    content: Style unread badges on chat list items
    status: pending
---

# Mobile-First Chat Redesign

## Overview

Transform the chat interface from a desktop split-view (sidebar + conversation) to a mobile-first design with:

1. **Initial view**: Chat list showing all rooms with unread badges, last message preview, and timestamp
2. **Conversation view**: Full-screen conversation with back button when a room is selected
3. **Mobile-first responsive**: Optimized for mobile with desktop enhancements
4. **Single attachment button**: One icon button (plus/attachment) that opens a tabbed picker with Emoji and GIF tabs

## Files to Modify

### 1. `frontend/react/src/components/Chat.jsx`

- Add state for view mode: `viewMode` ('list' | 'conversation')
- Add state to track last message per room: `lastMessages` object
- Update room click handler to set view mode to 'conversation'
- Add back button handler to return to 'list' view
- Modify render logic:
  - When `viewMode === 'list'`: Show only chat list
  - When `viewMode === 'conversation'`: Show full conversation with back button
- Update chat list items to display:
  - Room name
  - Last message preview (truncate to ~50 chars)
  - Timestamp (relative time like "2m ago" or absolute if >24h)
  - Unread badge (show count if `unreadCounts[room.id] > 0`)
- Track last message per room when messages are received/loaded
- Update unread badge display in chat list items
- **Redesign input area**: 
  - Single attachment/plus icon button (left side of input)
  - When clicked, opens tabbed picker overlay
  - Replace separate emoji/GIF buttons with one button
  - Keep voice button separate (or integrate into picker)
- **Create/Update tabbed picker component**:
  - Single component that shows tabs: "Emoji" and "GIFs"
  - Reuse existing EmojiPicker and GifPicker components as tab content
  - Handle tab switching
  - Close picker when item is selected

### 2. Create `frontend/react/src/components/AttachmentPicker.jsx` (NEW)

- New component that combines Emoji and GIF pickers in tabs
- Props: `onEmojiSelect`, `onGifSelect`, `onClose`
- State: `activeTab` ('emoji' | 'gifs')
- Render:
  - Tab buttons: "Emoji" and "GIFs"
  - Tab content: EmojiPicker or GifPicker based on active tab
  - Close button/overlay

### 3. `frontend/react/src/components/Chat.css`

- Remove desktop split-view layout (`.chat-sidebar` and `.chat-main` side-by-side)
- Create mobile-first base styles:
  - Chat list: Full-width, stacked items
  - Chat items: Card-style with padding, hover states
  - Unread badge: Circular badge with count, positioned top-right
  - Last message preview: Truncated with ellipsis
  - Timestamp: Small, muted text
- Add conversation view styles:
  - Full-screen conversation area
  - Back button in header (arrow icon, left-aligned)
  - Header with room name and back button
- **Redesign input area**:
  - Single horizontal row: [Voice Icon] [Attachment/Plus Icon] [Input Field] [Send Button]
  - Small icon buttons (24-32px) on left side
  - Input field takes remaining space
  - Send button on right
  - All elements aligned on same baseline
- **Attachment picker styles**:
  - Overlay/modal that appears above input
  - Tab navigation at top
  - Tab content area below
  - Mobile-friendly sizing and positioning
- Add responsive breakpoints:
  - Mobile (< 768px): Single column, full-width
  - Tablet/Desktop (>= 768px): Can show split view or maintain single view

### 4. `frontend/react/src/components/AttachmentPicker.css` (NEW)

- Styles for tabbed picker interface
- Tab button styles
- Tab content container
- Overlay/modal positioning

## Implementation Details

### State Management

```javascript
const [viewMode, setViewMode] = useState('list') // 'list' | 'conversation'
const [lastMessages, setLastMessages] = useState({}) // { roomId: { text, timestamp, sender } }
const [showAttachmentPicker, setShowAttachmentPicker] = useState(false) // New state
```

### Chat List Item Structure

- Room name (bold, primary text)
- Last message preview (truncated, secondary text)
- Timestamp (small, muted)
- Unread badge (if count > 0)
- Delete button (on hover/long-press)

### Back Button

- Arrow icon (←) or "Back" text
- Positioned in conversation header
- Returns to list view and clears selected room

### Unread Badge

- Circular badge with count
- Red/primary color
- Positioned top-right of chat item
- Only visible when `unreadCounts[room.id] > 0`

### Input Area Layout (New)

```
[🎤] [➕] [Type a message...                    ] [Send]
```

- Voice button (microphone icon)
- Attachment/Plus button (opens tabbed picker)
- Input field (flex-grows)
- Send button

### Attachment Picker Component

- Single button opens picker
- Tabs: "Emoji" | "GIFs"
- Each tab shows respective picker component
- Selecting an item closes picker and inserts into input
- Overlay/modal positioning above input area

## Key Changes

1. **Conditional Rendering**: Replace split-view with conditional rendering based on `viewMode`
2. **Last Message Tracking**: Update `lastMessages` when messages are loaded or received via WebSocket
3. **Mobile-First CSS**: Start with mobile styles, add desktop enhancements via media queries
4. **Navigation**: Add back button to conversation view header
5. **Badge Display**: Show unread counts as badges on chat list items
6. **Single Attachment Button**: Replace separate emoji/GIF buttons with one plus/attachment icon
7. **Tabbed Picker**: Create AttachmentPicker component with Emoji and GIF tabs
8. **Voice Button**: Keep separate or integrate (user preference - keeping separate for now)