---
name: Group Chat Rooms by Family with Accordions and Per-Family Create Button
overview: Update chat list to show families as accordions with their rooms. Each accordion has its own "Create new chat room" button that automatically uses that family, eliminating the need for family selection during room creation.
todos:
  - id: "1"
    content: Add family_name field to ChatRoomSerializer in backend/api/serializers.py
    status: completed
  - id: "2"
    content: Remove family filter from fetchRooms() in Chat.jsx - fetch all rooms
    status: completed
  - id: "3"
    content: Add room grouping logic to group rooms by family_id
    status: completed
  - id: "4"
    content: Create accordion UI structure with family headers
    status: completed
  - id: "5"
    content: Add expand/collapse state management for accordions
    status: completed
  - id: "6"
    content: Move create button into each family accordion header
    status: completed
  - id: "7"
    content: Update create room form to accept family as prop (from accordion context)
    status: completed
  - id: "8"
    content: Update member selection to filter by the accordion family
    status: completed
  - id: "9"
    content: Add CSS styles for accordions, headers, and per-family create buttons
    status: completed
  - id: "10"
    content: Update notification handler to refresh all rooms without family filter
    status: completed
  - id: "11"
    content: Test room creation from different family accordions
    status: completed
---

# Group Chat Rooms by Family with Accordions and Per-Family Create Button

## Current State

- ChatRoom has ForeignKey to Family
- Encryption uses family-based keys
- Backend filters rooms by user membership
- Frontend filters rooms by selectedFamily
- Room creation requires family selection in a separate form

## Changes Required

### 1. Backend Serializer (`backend/api/serializers.py`)

- Add `family_name` field to ChatRoomSerializer for display
- Ensure `family` or `family_id` is included in response

### 2. Frontend Chat Component - Fetch All Rooms (`frontend/react/src/components/Chat.jsx`)

- Remove family filter from `fetchRooms()` - fetch all rooms user is member of
- Group rooms by family_id after fetching
- Remove `selectedFamily` dependency from room fetching useEffect

### 3. Frontend Chat Component - Room Grouping Logic (`frontend/react/src/components/Chat.jsx`)

- Create `roomsByFamily` object that groups rooms by family
- Structure: `{ familyId: { familyId, familyName, rooms: [...] } }`
- Sort families alphabetically or by most recent activity

### 4. Frontend Chat Component - Accordion UI (`frontend/react/src/components/Chat.jsx`)

- Replace flat room list with accordion structure
- Each accordion section = one family
- Accordion header shows: family name + room count + expand/collapse icon
- Rooms listed inside expanded accordion
- Add expand/collapse state management (useState for expanded families)

### 5. Frontend Chat Component - Per-Family Create Button (`frontend/react/src/components/Chat.jsx`)

- Remove global "Create new chat room" button from header
- Add "+ Create room" button inside each family accordion header
- Button click opens create form with family pre-selected
- Create form shows: room name input + member selection (from that family only)
- No family selector needed - automatically uses accordion's family

### 6. Frontend Chat Component - Create Room Form Updates (`frontend/react/src/components/Chat.jsx`)

- Update `createChatRoom()` to use family from form context (not selectedFamily)
- Update member selection to only show members from the selected family
- Remove family selection UI from form
- Update form validation to not require selectedFamily prop

### 7. CSS Styling (`frontend/react/src/components/Chat.css`)

- Add accordion container styles
- Style family accordion headers (with create button and family badge)
- Style expanded/collapsed states
- Add expand/collapse icon animations
- Ensure mobile responsiveness
- Style create button within accordion header
- Style family badge (similar to room badge but for family header)

### 8. Notification Handler Updates (`frontend/react/src/components/Chat.jsx`)

- Remove family filter from notification refresh
- Update all rooms when notification arrives
- Maintain room grouping by family after refresh

### 9. Badge System Updates (`frontend/react/src/components/Chat.jsx`)

- Keep existing room-level badges (no changes needed - they work as-is)
- Add family-level badge calculation: sum unread counts for all rooms in each family
- Display family badge on accordion header showing total unread for that family
- Badge format: Show count if > 0, hide if 0
- Both room badges and family badges update when notifications arrive
- Calculation: `familyUnreadCount = roomsInFamily.reduce((sum, room) => sum + (unreadCounts[room.id] || 0), 0)`

## Implementation Details

**Room Grouping:**

```javascript
const roomsByFamily = allRooms.reduce((acc, room) => {
  const familyId = room.family?.id || room.family || 'unknown'
  if (!acc[familyId]) {
    acc[familyId] = {
      familyId,
      familyName: room.family_name || room.family?.name || `Family ${familyId}`,
      rooms: []
    }
  }
  acc[familyId].rooms.push(room)
  return acc
}, {})
```

**Accordion State:**

- Track expanded families: `const [expandedFamilies, setExpandedFamilies] = useState(new Set())`
- Toggle function to expand/collapse
- Optional: Persist state in localStorage

**Create Button in Accordion:**

- Each accordion header contains: [Family Name] [Room Count] [+ Create] [Expand Icon]
- Clicking "+ Create" sets `creatingForFamily` state and opens form
- Form automatically uses that family for room creation

**Create Form:**

- Receives family as prop/context (from accordion button click)
- Fetches members for that specific family
- Creates room with that family automatically
- No family dropdown needed

**Badge Display:**

- Room badges: Show on individual room items (existing behavior)
- Family badges: Show on accordion header next to family name
- Family badge = sum of all room badges in that family
- Example: "Family Name (3)" if 3 total unread messages across all rooms in family
- Both badges update in real-time via WebSocket notifications

## Benefits

- Better UX: Create button is contextually placed with relevant family
- No family selection needed - determined by which accordion button is clicked
- Maintains existing encryption system (no changes needed)
- Maintains database structure (no migrations)
- Clear visual organization by family
- Simpler user flow for room creation