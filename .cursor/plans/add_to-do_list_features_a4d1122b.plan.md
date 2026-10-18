---
name: Add To-Do List Features
overview: Add due date and priority/order fields for To-Do list items, implement drag-and-drop reordering, and set default due date to creation date.
todos:
  - id: backend-due-date-field
    content: Add due_date field to ListItem model and create migration
    status: pending
  - id: backend-serializer-update
    content: Update ListItemSerializer to include due_date field
    status: pending
  - id: backend-default-due-date
    content: Set default due_date to creation date in perform_create for todo lists
    status: pending
  - id: frontend-todo-detection
    content: Add isTodoList constant in ListDetail component
    status: pending
  - id: frontend-drag-state
    content: Add drag-and-drop state variables (draggedItemId, dragOverItemId, reordering)
    status: pending
  - id: frontend-drag-handlers
    content: Implement drag-and-drop event handlers (handleDragStart, handleDragOver, handleDrop, etc.)
    status: pending
  - id: frontend-create-form
    content: Add due_date input to item creation form for To-Do lists
    status: pending
  - id: frontend-edit-form
    content: Add due_date input to item edit form for To-Do lists
    status: pending
  - id: frontend-display-due-date
    content: Display due_date in item list view for To-Do lists
    status: pending
  - id: frontend-drag-ui
    content: Add drag handle icon and visual indicators for dragging
    status: pending
  - id: frontend-todo-sorting
    content: Update item rendering to sort by order for To-Do lists
    status: pending
  - id: frontend-css-styling
    content: Add CSS styles for drag-and-drop and due_date display
    status: pending
---

# Add To-Do List Features: Due Date, Priority, and Drag-and-Drop

## Backend Changes

### 1. Add `due_date` field to ListItem model

- **File**: `backend/lists/models.py`
- Add `due_date = models.DateField(null=True, blank=True)` to ListItem model
- Create migration: `python manage.py makemigrations`

### 2. Update ListItem serializer

- **File**: `backend/api/serializers.py`
- Add `due_date` to ListItemSerializer fields
- Ensure it's included in read/write operations

### 3. Set default due_date on item creation

- **File**: `backend/api/views.py` (ListItemViewSet)
- In `perform_create`, if list_type is 'todo' and no due_date provided, set `due_date` to `timezone.now().date()`
- This sets default to current date when item is created

### 4. Add API endpoint for bulk order update (optional optimization)

- Consider adding endpoint to update multiple items' order at once for drag-and-drop
- Or use existing PATCH endpoint for individual updates

## Frontend Changes

### 5. Add To-Do list detection

- **File**: `frontend/react/src/components/ListDetail.jsx`
- Add `const isTodoList = list?.list_type === 'todo'` similar to `isGroceryList`

### 6. Add state for drag-and-drop

- **File**: `frontend/react/src/components/ListDetail.jsx`
- Add state: `draggedItemId`, `dragOverItemId`, `reordering`
- Reference drag-and-drop implementation from `GroceryCategories.jsx`

### 7. Implement drag-and-drop handlers

- **File**: `frontend/react/src/components/ListDetail.jsx`
- Add handlers: `handleDragStart`, `handleDragOver`, `handleDragLeave`, `handleDrop`, `handleDragEnd`
- Update `order` field for all affected items when reordering
- Only enable for To-Do lists (`isTodoList`)

### 8. Update item creation form

- **File**: `frontend/react/src/components/ListDetail.jsx`
- Add due_date input field (date picker) when `isTodoList` is true
- In `addItem` function, include `due_date` in POST request
- If no due_date provided, backend will set default to creation date

### 9. Update item edit form

- **File**: `frontend/react/src/components/ListDetail.jsx`
- Add due_date field to `itemFormData` state
- Add date input in edit form when `isTodoList` is true
- Include `due_date` in PATCH request in `handleUpdateItem`

### 10. Display due_date in item list

- **File**: `frontend/react/src/components/ListDetail.jsx`
- Show due_date in item display for To-Do lists
- Format date nicely (e.g., "Due: Jan 15, 2024")
- Consider color coding for overdue/past due items

### 11. Add drag handle and visual indicators

- **File**: `frontend/react/src/components/ListDetail.jsx`
- Add drag handle icon (similar to GroceryCategories)
- Add CSS classes for dragging state: `dragging`, `drag-over`
- Make items draggable only for To-Do lists

### 12. Update item rendering for To-Do lists

- **File**: `frontend/react/src/components/ListDetail.jsx`
- For To-Do lists, don't group by category (like grocery lists)
- Sort by `order` field, then by `created_at`
- Show priority/order number if desired

### 13. Add CSS for drag-and-drop

- **File**: `frontend/react/src/components/Lists.css`
- Add styles for drag handle
- Add styles for dragging states (dragging, drag-over)
- Style due_date display
- Ensure drag handle is visible and accessible

### 14. Update item form state initialization

- **File**: `frontend/react/src/components/ListDetail.jsx`
- Update `itemFormData` to include `due_date: null`
- Update `handleEditItem` to include `due_date` from item
- Update `handleCancelEditItem` to reset `due_date`

## Testing Considerations

- Test creating To-Do items with and without due_date
- Test drag-and-drop reordering updates order correctly
- Test that due_date defaults to creation date when not provided
- Test that grocery/shopping lists don't show To-Do specific fields
- Test editing due_date on existing items
- Test that order persists after page refresh