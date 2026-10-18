---
name: Mobile Drag and Drop with DraxView for Lists
overview: ""
todos: []
---

# Mobile Drag and Drop with DraxView for Lists

## Overview

Enable proper drag-and-drop on mobile for To-Do, Ideas, and Other lists using DraxView. Replace up/down arrow buttons with drag handle bars icon and ensure long-press drag works correctly.

## Current State

- DraxView is already implemented for mobile (lines 1261-1315 in `mobile/app/(tabs)/lists/[id].tsx`)
- `renderItem` function passes `onMoveUp`/`onMoveDown` props, causing arrows to show instead of drag handles
- `ListItemComponent` supports `showDragHandle` prop but it's not being used for DraxView
- Grocery categories screen shows the correct pattern with manual drag handles

## Changes Required

### 1. Update `renderItem` function signature

**File:** `mobile/app/(tabs)/lists/[id].tsx` (around line 915)Modify `renderItem` to accept an optional parameter indicating DraxView usage:

```typescript
const renderItem = ({ item, index, useDraxView = false }: { 
  item: ListItem; 
  index: number; 
  useDraxView?: boolean 
}) => {
```



### 2. Conditionally pass props based on DraxView usage

**File:** `mobile/app/(tabs)/lists/[id].tsx` (around line 935-952)Update the `ListItemComponent` props:

- When `useDraxView` is `true`: Pass `showDragHandle={true}` and don't pass `onMoveUp`/`onMoveDown`
- When `useDraxView` is `false`: Keep current behavior with `onMoveUp`/`onMoveDown` for fallback
```typescript
return (
  <ListItemComponent
    item={item}
    onToggleComplete={() => toggleItemComplete(item)}
    onEdit={() => setEditingItem(item)}
    onDelete={() => handleDeleteItem(item)}
    onMove={() => handleOpenMoveModal(item)}
    isGroceryList={isGroceryList}
    isTodoList={isTodoList}
    showDragHandle={useDraxView}
    onMoveUp={!useDraxView && Platform.OS !== 'web' && supportsDragAndDrop ? () => {
      handleMoveItem(item.id, 'up');
    } : undefined}
    onMoveDown={!useDraxView && Platform.OS !== 'web' && supportsDragAndDrop ? () => {
      handleMoveItem(item.id, 'down');
    } : undefined}
  />
);
```




### 3. Update DraxView section to pass useDraxView flag

**File:** `mobile/app/(tabs)/lists/[id].tsx` (around line 1307)Modify the DraxView renderItem call:

```typescript
{renderItem({ item, index, useDraxView: true })}
```



### 4. Update non-DraxView FlatList section

**File:** `mobile/app/(tabs)/lists/[id].tsx` (around line 1353)Ensure the regular FlatList (fallback) doesn't pass `useDraxView` (defaults to false):

```typescript
renderItem={({ item, index }) => {
  return renderItem({ item, index }); // useDraxView defaults to false
}}
```



## Expected Behavior After Changes

1. **Mobile with DraxView**: Shows bars icon drag handle, supports long-press drag-and-drop
2. **Mobile without DraxView (fallback)**: Shows up/down arrows for manual reordering
3. **Web**: Continues to use `DraggableListItem` with `showDragHandle={true}` (already working)

## Testing Checklist

- [ ] To-Do lists show drag handles on mobile
- [ ] Ideas lists show drag handles on mobile  
- [ ] Other lists show drag handles on mobile
- [ ] Long-press on item initiates drag
- [ ] Dragging items reorders them correctly
- [ ] Up/down arrows don't appear when using DraxView