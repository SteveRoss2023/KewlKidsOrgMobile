---
name: Replace react-native-drax with react-native-draggable-flatlist for Mobile Drag-and-Drop
overview: ""
todos:
  - id: install-draggable-flatlist
    content: Install react-native-draggable-flatlist package in mobile directory
    status: in_progress
  - id: add-gesture-root-wrapper
    content: Wrap app root with GestureHandlerRootView in _layout.tsx for Android gesture support
    status: pending
  - id: update-imports
    content: "Update imports in [id].tsx: remove DraxView imports, add DraggableFlatList imports"
    status: pending
    dependencies:
      - install-draggable-flatlist
  - id: add-mobile-drag-handler
    content: Add handleMobileDragEnd function to process reordered items from DraggableFlatList
    status: pending
    dependencies:
      - update-imports
  - id: replace-flatlist
    content: "Replace FlatList with conditional rendering: DraggableFlatList for mobile drag-and-drop, keep web unchanged"
    status: pending
    dependencies:
      - add-mobile-drag-handler
  - id: test-mobile-drag
    content: Test drag-and-drop on Android for To-Do, Ideas, and Other lists
    status: pending
    dependencies:
      - replace-flatlist
---

# Replace react-native-drax with react-native-draggable-flatlist for Mobile Drag-and-Drop

## Overview

Replace the non-functional react-native-drax implementation with react-native-draggable-flatlist for mobile drag-and-drop on To-Do, Ideas, and Other lists. This library has better Android support and works with FlatList. Web functionality will remain unchanged (using DraggableListItem with HTML5 drag-and-drop).

## Implementation Steps

### 1. Install react-native-draggable-flatlist

- Add `react-native-draggable-flatlist` to `mobile/package.json` dependencies
- Run `npm install` in the mobile directory

### 2. Update Root Layout with GestureHandlerRootView

- In [`mobile/app/_layout.tsx`](mobile/app/_layout.tsx), wrap the entire app with `GestureHandlerRootView` from `react-native-gesture-handler`
- This is required for proper gesture handling on Android
- Import `GestureHandlerRootView` at the top
- Wrap the return statement's root View with `GestureHandlerRootView style={{ flex: 1 }}`

### 3. Update Lists Screen Imports

- In `[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)/lists/[id].tsx)`:
- Remove unused DraxView imports (lines 16-17): `GestureHandlerRootView, ScrollView as GestureScrollView` and `DraxProvider, DraxView`
- Add import: `import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';`
- Keep `GestureHandlerRootView` import from `react-native-gesture-handler` (needed for the library)

### 4. Add Mobile Drag End Handler

- In `[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)/lists/[id].tsx)`, add a new function `handleMobileDragEnd` after the existing `handleDragEnd` function (around line 752)
- This function receives reordered data from DraggableFlatList and updates item order values via API
- Use the same pattern as `handleMoveItem` - update order values based on new positions and call `fetchListItems()` to refresh

### 5. Replace FlatList with Conditional Rendering

- In `[mobile/app/(tabs)/lists/[id].tsx](mobile/app/(tabs)/lists/[id].tsx)`, replace the FlatList section (starting around line 1260) with conditional rendering:
- **Web + supportsDragAndDrop**: Keep existing FlatList with DraggableListItem (unchanged)
- **Mobile + supportsDragAndDrop**: Use DraggableFlatList with drag functionality
- **Mobile without drag-and-drop**: Use regular FlatList (for Grocery/Shopping lists)
- For DraggableFlatList:
- Use `onDragEnd={({ data }) => handleMobileDragEnd(data)}`
- Wrap each item in `ScaleDecorator` for visual feedback
- Pass `drag` function from `RenderItemParams` to `ListItemComponent` via `onDrag` prop
- Set `showDragHandle={true}` to show drag handle bars
- Remove `onMoveUp` and `onMoveDown` props (no longer needed with drag-and-drop)

### 6. Update ListItemComponent (Already Supports onDrag)

- [`mobile/components/lists/ListItemComponent.tsx`](mobile/components/lists/ListItemComponent.tsx) already has `onDrag` prop support (line 18)
- The component already handles drag handle display correctly (lines 95-134)
- No changes needed to this component

### 7. Clean Up Unused Code

- Remove the unused `renderItem` function if it's not being used elsewhere (around line 915)
- Remove any remaining DraxView-related state or handlers that are no longer needed
- Keep `handleMoveItem` function as it may be used as fallback or for other purposes

## Files to Modify

1. `mobile/package.json` - Add dependency
2. `mobile/app/_layout.tsx` - Add GestureHandlerRootView wrapper
3. `mobile/app/(tabs)/lists/[id].tsx` - Replace FlatList with DraggableFlatList for mobile drag-and-drop

## Testing Checklist

- [ ] Drag-and-drop works on Android for To-Do lists
- [ ] Drag-and-drop works on Android for Ideas lists  
- [ ] Drag-and-drop works on Android for Other lists
- [ ] Web drag-and-drop still works (unchanged)
- [ ] Grocery and Shopping lists still use regular FlatList (no drag-and-drop)
- [ ] Item order persists after drag-and-drop
- [ ] All item actions (edit, delete, move, toggle complete) still work
- [ ] Drag handle (bars icon) is visible on mobile
- [ ] Long-press triggers drag on mobile
- [ ] Visual feedback during drag (ScaleDecorator animation)

## Notes

- react-native-drax will remain in package.json as it's still used in `grocery-categories.tsx`
- Web functionality is completely unchanged - still uses HTML5 drag-and-drop via DraggableListItem