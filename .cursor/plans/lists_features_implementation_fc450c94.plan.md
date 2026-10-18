---
name: Lists Features Implementation
overview: Implement all Lists features from the reference project, including backend Django app with models, viewsets, and serializers, plus React Native mobile screens for Lists, ListDetail, and GroceryCategories management.
todos:
  - id: backend-models
    content: Create backend/lists/models.py with List, ListItem, and GroceryCategory models (with encrypted fields)
    status: completed
  - id: backend-serializers
    content: Create backend/lists/serializers.py with serializers for all models
    status: completed
    dependencies:
      - backend-models
  - id: backend-views
    content: Create backend/lists/views.py with ViewSets for List, ListItem, and GroceryCategory
    status: completed
    dependencies:
      - backend-serializers
  - id: backend-urls
    content: Create backend/lists/urls.py and register routes in config/urls.py
    status: completed
    dependencies:
      - backend-views
  - id: backend-utils
    content: Create backend/lists/utils.py with category auto-assignment and default category creation
    status: completed
    dependencies:
      - backend-models
  - id: backend-migrations
    content: Create and run Django migrations for lists app
    status: completed
    dependencies:
      - backend-models
  - id: backend-config
    content: Update backend/config/settings.py to add 'lists' to INSTALLED_APPS
    status: completed
  - id: mobile-types
    content: Create mobile/types/lists.ts with TypeScript interfaces
    status: completed
  - id: mobile-service
    content: Create mobile/services/listService.ts with all API methods
    status: completed
    dependencies:
      - mobile-types
  - id: mobile-lists-screen
    content: Create mobile/app/(tabs)/lists.tsx with list display, create/edit forms, and tabs
    status: completed
    dependencies:
      - mobile-service
  - id: mobile-list-detail
    content: Create mobile/app/(tabs)/lists/[id].tsx with items, categories, drag-and-drop, and voice commands
    status: completed
    dependencies:
      - mobile-service
  - id: mobile-components
    content: Create mobile/components/lists/ components (ListCard, ListItem, CategoryGroup, forms)
    status: completed
    dependencies:
      - mobile-types
  - id: mobile-navigation
    content: Update mobile/app/(tabs)/_layout.tsx to add Lists tab to navigation
    status: completed
    dependencies:
      - mobile-lists-screen
  - id: mobile-dependencies
    content: Install react-native-draggable-flatlist and other required packages
    status: completed
---

# Lists Features Implementation Plan

## Overview

Replicate all Lists functionality from the reference project (`KewlKidsOrganizer`) into the mobile app project. This includes:

- Shopping lists, Grocery lists, To-Do lists, and Other lists
- List items with categories, quantities, notes, due dates, and completion status
- Grocery categories with keywords for auto-categorization
- Drag-and-drop reordering for To-Do lists
- Real-time updates (via WebSocket in future)

## Backend Implementation

### 1. Create Lists Django App

**Location**: `backend/lists/`

**Files to create**:

- `backend/lists/__init__.py`
- `backend/lists/apps.py`
- `backend/lists/models.py` - List, ListItem, GroceryCategory models with encrypted fields
- `backend/lists/serializers.py` - Serializers for all models
- `backend/lists/views.py` - ViewSets for REST API
- `backend/lists/urls.py` - URL routing
- `backend/lists/utils.py` - Category auto-assignment utilities
- `backend/lists/admin.py` - Admin interface
- `backend/lists/migrations/0001_initial.py` - Initial migration

**Key Models**:

- `List`: name (encrypted), description (encrypted), list_type (encrypted), color, family, created_by
- `ListItem`: name (encrypted), notes (encrypted), quantity (encrypted), category, completed, order, due_date
- `GroceryCategory`: name, description, icon, order, keywords (JSON), is_default

### 2. Update Django Configuration

**Files to modify**:

- `backend/config/settings.py` - Add 'lists' to INSTALLED_APPS
- `backend/config/urls.py` - Include lists URLs in API routes

### 3. Create Management Command

**Location**: `backend/lists/management/commands/ensure_grocery_categories.py`

- Command to ensure default categories exist for families with grocery lists

## Mobile App Implementation

### 4. Create TypeScript Types

**Location**: `mobile/types/lists.ts`

- Define interfaces: `List`, `ListItem`, `GroceryCategory`, `ListType`

### 5. Create Lists Service

**Location**: `mobile/services/listService.ts`

- API methods: `getLists()`, `createList()`, `updateList()`, `deleteList()`
- API methods: `getListItems()`, `createListItem()`, `updateListItem()`, `deleteListItem()`, `toggleItemComplete()`
- API methods: `getGroceryCategories()`, `createCategory()`, `updateCategory()`, `deleteCategory()`

### 6. Create Lists Screen

**Location**: `mobile/app/(tabs)/lists.tsx`

- Display lists grouped by type (To-Do, Grocery, Shopping, Other) with tabs
- Create/Edit list form with name, description, type, color picker
- List cards showing name, type, item count, color indicator
- Delete list with confirmation modal
- Voice commands support (create list)
- Family selector integration

**Key Features**:

- Tab navigation (To-Do, Grocery, Shopping, Other)
- Color-coded list cards
- Create/Edit list modal/form
- Delete confirmation
- Loading and error states

### 7. Create List Detail Screen

**Location**: `mobile/app/(tabs)/lists/[id].tsx`

- Display list items with completion checkboxes
- Add/Edit item form
- For Grocery lists: Group items by category with collapsible sections
- For To-Do lists: Drag-and-drop reordering, due date display
- Item actions: Edit, Delete, Toggle complete, Change category
- Recipe filter (for grocery lists with recipe items)
- Voice commands support (add/delete/update items)

**Key Features**:

- Item list with checkboxes
- Category grouping for grocery lists
- Drag-and-drop for To-Do lists (using `react-native-draggable-flatlist` or similar)
- Due date display with overdue highlighting
- Category assignment dropdown
- Recipe filtering
- Pagination support for large lists

### 8. Create Grocery Categories Screen

**Location**: `mobile/app/(tabs)/lists/categories.tsx` (or as modal/section)

- Display all categories with drag-and-drop reordering
- Create/Edit category form with name, description, icon, order, keywords
- Keyword management (add/remove keywords)
- Delete category with confirmation
- Default category indicators

**Key Features**:

- Category list with icons
- Drag-and-drop reordering
- Keyword tag management
- Icon picker integration
- Default category badges

### 9. Create Supporting Components

**Location**: `mobile/components/lists/`

**Components to create**:

- `ListCard.tsx` - List card component with color indicator
- `ListItem.tsx` - Individual list item with checkbox and actions
- `CategoryGroup.tsx` - Collapsible category group for grocery lists
- `AddItemForm.tsx` - Form for adding/editing items
- `AddListForm.tsx` - Form for adding/editing lists
- `CategoryForm.tsx` - Form for adding/editing categories
- `IconPicker.tsx` - Icon selection component (if not exists)

### 10. Update Navigation

**Files to modify**:

- `mobile/app/(tabs)/_layout.tsx` - Add Lists tab to bottom navigation
- Update tab icons and labels

### 11. Install Dependencies

**Packages needed**:

- `react-native-draggable-flatlist` - For drag-and-drop reordering
- `@react-native-community/datetimepicker` - For due date picker (if not already installed)
- `react-native-vector-icons` - For category icons (if not already installed)

## Implementation Details

### Backend API Endpoints

- `GET /api/lists/` - List all lists (filter by family, type)
- `POST /api/lists/` - Create list
- `GET /api/lists/{id}/` - Get list details
- `PATCH /api/lists/{id}/` - Update list
- `DELETE /api/lists/{id}/` - Delete list
- `GET /api/list-items/` - List items (filter by list)
- `POST /api/list-items/` - Create item
- `PATCH /api/list-items/{id}/` - Update item
- `DELETE /api/list-items/{id}/` - Delete item
- `GET /api/grocery-categories/` - List categories (filter by family)
- `POST /api/grocery-categories/` - Create category
- `PATCH /api/grocery-categories/{id}/` - Update category
- `DELETE /api/grocery-categories/{id}/` - Delete category

### Data Flow

1. User selects family → Fetch lists for that family
2. User creates list → POST to API → Refresh lists
3. User opens list → Fetch list details and items
4. User adds item → POST item → Auto-assign category (if grocery) → Refresh items
5. User toggles item → PATCH item → Optimistic UI update
6. User reorders items (To-Do) → PATCH all affected items with new order

### Key Conversions (React → React Native)

- `<div>` → `<View>`
- `<input>` → `<TextInput>`
- `<button>` → `<Pressable>` or `<TouchableOpacity>`
- `<select>` → `<Picker>` or custom dropdown
- CSS classes → `StyleSheet.create()`
- `onClick` → `onPress`
- `onChange` → `onChangeText` (for TextInput)
- Drag-and-drop: HTML5 → `react-native-draggable-flatlist`

## Testing Checklist

- [ ] Create shopping list
- [ ] Create grocery list (verify default categories created)
- [ ] Create to-do list
- [ ] Add items to each list type
- [ ] Edit list name/description/color
- [ ] Delete list with items
- [ ] Toggle item completion
- [ ] Reorder to-do items (drag-and-drop)
- [ ] Assign category to grocery item
- [ ] Create custom category
- [ ] Edit category with keywords
- [ ] Delete category
- [ ] Filter grocery items by recipe
- [ ] Set due date on to-do item
- [ ] Voice commands (if implemented)
- [ ] Family switching updates lists
- [ ] Pagination for large lists

## Files Summary

### Backend (New)

- `backend/lists/` - Complete Django app
- Updates to `backend/config/settings.py` and `backend/config/urls.py`

### Mobile (New)

- `mobile/types/lists.ts`
- `mobile/services/listService.ts`
- `mobile/app/(tabs)/lists.tsx`
- `mobile/app/(tabs)/lists/[id].tsx`
- `mobile/app/(tabs)/lists/categories.tsx` (optional separate screen)
- `mobile/components/lists/` - Multiple components

### Mobile (Modified)

- `mobile/app/(tabs)/_layout.tsx` - Add Lists tab
- `mobile/package.json` - Add dependencies