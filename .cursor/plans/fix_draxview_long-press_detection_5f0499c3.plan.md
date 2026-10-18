---
name: Fix DraxView Long-Press Detection
overview: Investigate and fix why DraxView's long-press detection isn't working for to-do, ideas, and other lists on mobile. The issue is that DraxView's onDragStart callback never fires, suggesting gesture detection is blocked by nested TouchableOpacity components in ListItemComponent.
todos:
  - id: test-minimal
    content: Create minimal test case with DraxView and simple View to verify basic functionality works
    status: completed
  - id: investigate-touch-conflicts
    content: Investigate which TouchableOpacity components in ListItemComponent are blocking gestures
    status: completed
    dependencies:
      - test-minimal
  - id: add-simultaneous-handlers
    content: Add simultaneousHandlers prop to TouchableOpacity components to allow DraxView gestures
    status: completed
    dependencies:
      - investigate-touch-conflicts
  - id: test-drax-structure
    content: Test different DraxView wrapper structures (with/without inner DraxView, View wrappers)
    status: completed
    dependencies:
      - investigate-touch-conflicts
  - id: verify-solution
    content: Test long-press drag-and-drop on to-do, ideas, and other lists to verify it works
    status: completed
    dependencies:
      - add-simultaneous-handlers
      - test-drax-structure
---

# Fix DraxView Long-Press Detection for Mobile Lists

## Problem

DraxView's long-press gesture detection isn't working for to-do, ideas, and other lists on mobile. The `onDragStart` callback never fires, indicating the gesture is being blocked. The structure matches the grocery-categories pattern, but `ListItemComponent` has many TouchableOpacity components (checkbox, edit, delete, move buttons) that may be intercepting touch events.

## Investigation Steps

### 1. Test DraxView Configuration

- Verify DraxView props are correct (draggable, payload, onReceiveDragDrop)
- Check if `onDragStart` fires when long-pressing on empty areas
- Test with a minimal component to isolate the issue

### 2. Investigate Touch Handler Conflicts

- Review how TouchableOpacity components in `ListItemComponent` interact with DraxView
- Check if `simultaneousHandlers` or gesture handler configuration is needed
- Test if `pointerEvents` or `collapsable` props help

### 3. Test Alternative DraxView Structures

- Try wrapping content differently (with/without View wrapper)
- Test if removing the inner DraxView (drop zone) helps detection
- Experiment with `delayLongPress` or other DraxView props

### 4. Check Gesture Handler Setup

- Verify `GestureHandlerRootView` is properly configured
- Check if ScrollView conflicts with gesture detection
- Test if `simultaneousHandlers` prop on TouchableOpacity helps

## Implementation Plan

### File: `mobile/app/(tabs)/lists/[id].tsx`

- Test different DraxView wrapper structures
- Add `simultaneousHandlers` to allow DraxView to work alongside TouchableOpacity
- Experiment with removing the inner DraxView wrapper
- Test with minimal content to isolate the issue

### File: `mobile/components/lists/ListItemComponent.tsx`

- Add `simultaneousHandlers` prop to TouchableOpacity components when `showDragHandle` is true
- Test if `delayLongPress` or gesture handler props help
- Consider using `Pressable` instead of `TouchableOpacity` for better gesture compatibility

### Testing Strategy

1. Create a minimal test item with no buttons to verify DraxView works
2. Gradually add touch handlers to identify which one blocks the gesture
3. Test on physical Android device (not just emulator)
4. Add console logs to track gesture detection

## Expected Outcome

DraxView should detect long-press gestures on to-do, ideas, and other list items, allowing drag-and-drop to work on mobile. The solution should maintain all existing functionality (buttons,