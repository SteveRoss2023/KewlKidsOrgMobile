---
name: Completed Grocery Items Feature
overview: Implement a feature where completed grocery list items are saved to a history table with user, family, list name, item, category, date, and recipe (if attached), then removed from the list. Add a history view to display past completed items.
todos:
  - id: backend-model
    content: Create CompletedGroceryItem model in backend/lists/models.py with user, family, list_name, item_name, category_name, quantity, recipe_name, completed_date fields
    status: completed
  - id: backend-migration
    content: Create and run migration for CompletedGroceryItem (activate virtual env, makemigrations, migrate)
    status: completed
    dependencies:
      - backend-model
  - id: backend-serializer
    content: Create CompletedGroceryItemSerializer in backend/lists/serializers.py
    status: completed
    dependencies:
      - backend-model
  - id: backend-viewset-update
    content: Update ListItemViewSet.update() to save completed grocery items and delete the item
    status: completed
    dependencies:
      - backend-model
      - backend-serializer
  - id: backend-viewset-history
    content: Create CompletedGroceryItemViewSet for viewing history with filtering
    status: completed
    dependencies:
      - backend-model
      - backend-serializer
  - id: backend-urls
    content: Add URL route for completed grocery items in backend/lists/urls.py
    status: completed
    dependencies:
      - backend-viewset-history
  - id: backend-admin
    content: Register CompletedGroceryItem in backend/lists/admin.py
    status: completed
    dependencies:
      - backend-model
  - id: frontend-types
    content: Add CompletedGroceryItem interface to mobile/types/lists.ts
    status: completed
  - id: frontend-service
    content: Add getCompletedGroceryItems method to mobile/services/listService.ts and update toggleItemComplete logic
    status: completed
    dependencies:
      - frontend-types
  - id: frontend-list-detail
    content: Update toggleItemComplete in mobile/app/(tabs)/lists/[id].tsx to handle grocery item deletion
    status: completed
    dependencies:
      - frontend-service
  - id: frontend-category-group
    content: Update CategoryGroup to show strikethrough when items.length === 0 in mobile/components/lists/CategoryGroup.tsx
    status: completed
  - id: frontend-history-screen
    content: Create completed items history screen at mobile/app/(tabs)/lists/completed.tsx
    status: completed
    dependencies:
      - frontend-service
      - frontend-types
  - id: frontend-navigation
    content: Add navigation to completed items history screen
    status: completed
    dependencies:
      - frontend-history-screen
---

# Completed Grocery Items Feature

## Overview

When a grocery list item is completed, save it to a history table with all relevant information (user, family, list name, item name, category, quantity, date, and recipe if attached), then remove it from the active list. Add a history view to display past completed items.

## Backend Changes

### 1. Create CompletedGroceryItem Model

**File:** `backend/lists/models.py`

Create a new model to store completed grocery items:

- `user` (ForeignKey to User)
- `family` (ForeignKey to Family)
- `list_name` (EncryptedCharField - from List.name)
- `item_name` (EncryptedCharField - from ListItem.name)
- `category_name` (CharField - from GroceryCategory.name, nullable)
- `quantity` (EncryptedCharField - from ListItem.quantity, nullable)
- `recipe_name` (EncryptedCharField - extracted from notes if "From recipe: " prefix exists, nullable)
- `completed_date` (DateTimeField - auto_now_add)
- Indexes on `user`, `family`, and `completed_date` for efficient queries

### 2. Create Migration

**File:** `backend/lists/migrations/XXXX_completedgroceryitem.py`

- Activate virtual environment
- Run `python manage.py makemigrations lists`
- Run `python manage.py migrate`

### 3. Create Serializer

**File:** `backend/lists/serializers.py`

Add `CompletedGroceryItemSerializer` with all fields, including computed fields for decrypted values.

### 4. Update ListItemViewSet

**File:** `backend/lists/views.py`

Modify the `update` method in `ListItemViewSet`:

- When `completed=True` and list type is 'grocery':
  - Extract recipe name from `notes` if it starts with "From recipe: "
  - Create `CompletedGroceryItem` with all required fields
  - Delete the `ListItem` (not just mark as completed)
  - Return appropriate response
- For non-grocery lists or `completed=False`, keep existing behavior

### 5. Create CompletedGroceryItemViewSet

**File:** `backend/lists/views.py`

Add a new ViewSet for viewing completed items:

- Filter by current user
- Filter by family (optional query param)
- Order by `completed_date` descending
- Support date range filtering (optional query params)

### 6. Update URLs

**File:** `backend/lists/urls.py`

Add route for completed grocery items:

- `completed-grocery-items/` - list and filter completed items

### 7. Update Admin

**File:** `backend/lists/admin.py`

Register `CompletedGroceryItem` in admin with appropriate fields.

## Frontend Changes

### 8. Update TypeScript Types

**File:** `mobile/types/lists.ts`

Add `CompletedGroceryItem` interface:

```typescript
export interface CompletedGroceryItem {
  id: number;
  user: number;
  family: number;
  list_name: string;
  item_name: string;
  category_name: string | null;
  quantity: string | null;
  recipe_name: string | null;
  completed_date: string;
}
```

### 9. Update ListService

**File:** `mobile/services/listService.ts`

Add methods:

- `getCompletedGroceryItems(familyId?: number, startDate?: string, endDate?: string): Promise<CompletedGroceryItem[]>`
- Update `toggleItemComplete` to handle grocery list items differently (item will be deleted, not just toggled)

### 10. Update List Detail Screen

**File:** `mobile/app/(tabs)/lists/[id].tsx`

Modify `toggleItemComplete`:

- For grocery lists, when completing an item:
  - Call API (which will save to history and delete item)
  - Remove item from local state immediately (optimistic update)
  - Refresh list items to ensure sync
- Handle empty categories - update `CategoryGroup` to show strikethrough when category has 0 items

### 11. Update CategoryGroup Component

**File:** `mobile/components/lists/CategoryGroup.tsx`

Update `allItemsCompleted` logic:

- Show strikethrough when `items.length === 0` OR all items are completed
- This handles both "all completed" and "empty category" cases

### 12. Create Completed Items History Screen

**File:** `mobile/app/(tabs)/lists/completed.tsx` (new file)

Create a new screen to display completed grocery items:

- Fetch completed items from API
- Display in a list grouped by date
- Show: item name, category, quantity, list name, recipe name (if present)
- Add filters: by family, date range
- Use theme-aware styling

### 13. Add Navigation to History

**File:** `mobile/app/(tabs)/lists.tsx` or appropriate navigation file

Add a button/link to navigate to the completed items history screen.

### 14. Update Tab Layout (if needed)

**File:** `mobile/app/(tabs)/_layout.tsx`

If history screen should be in tabs, add it (or keep it as a nested route).

## Data Flow

```
User completes grocery item
  ↓
Frontend: toggleItemComplete(item)
  ↓
Backend: ListItemViewSet.update()
  ↓
Check: list.list_type == 'grocery' && completed == True
  ↓
Extract recipe from notes if "From recipe: " prefix
  ↓
Create CompletedGroceryItem
  ↓
Delete ListItem
  ↓
Return success
  ↓
Frontend: Remove item from state
  ↓
Category header shows strikethrough if empty
```

## Testing Checklist

- [ ] Complete a grocery item → item removed from list
- [ ] Complete a grocery item with recipe → recipe saved in history
- [ ] Complete a grocery item without recipe → null recipe in history
- [ ] Complete a grocery item with category → category saved
- [ ] Complete a grocery item without category → null category saved
- [ ] Empty category shows strikethrough
- [ ] History view displays completed items
- [ ] History view filters work (family, date range)
- [ ] Non-grocery lists still work normally (toggle completion, don't delete)
- [ ] Migration runs successfully
- [ ] Virtual environment used for migrations