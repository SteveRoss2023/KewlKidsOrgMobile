---
name: Settings Modal to Slide-In Page
overview: Convert the settings modal to a full page that slides in from the right, while keeping it accessible from the bottom tab bar. Remove all modal logic and render the settings content directly as a page.
todos:
  - id: create-settings-layout
    content: Create nested Stack layout for settings at mobile/app/(tabs)/settings/_layout.tsx
    status: pending
  - id: move-settings-screen
    content: Move settings.tsx to settings/index.tsx and update to render content directly
    status: pending
    dependencies:
      - create-settings-layout
  - id: convert-settings-component
    content: Convert SettingsMenu component from modal to page component (remove Modal, add header with back button)
    status: pending
  - id: update-settings-screen-usage
    content: Update settings/index.tsx to use converted component without modal logic
    status: pending
    dependencies:
      - convert-settings-component
      - move-settings-screen
  - id: verify-tab-config
    content: Verify settings tab configuration in _layout.tsx works with nested stack
    status: pending
    dependencies:
      - create-settings-layout
  - id: cleanup-old-files
    content: Delete old settings.tsx file and clean up unused modal code
    status: pending
    dependencies:
      - move-settings-screen
      - update-settings-screen-usage
---

#

Convert Settings Modal to Slide-In Page

## Overview

Convert the settings from a modal overlay to a full page that slides in from the right when accessed from the bottom tab bar. The settings will remain in the tab bar but will use stack navigation for the slide-in animation effect.

## Current Architecture

- `mobile/app/(tabs)/settings.tsx` - Opens a modal using `SettingsMenu` component

- `mobile/components/SettingsMenu.tsx` - Modal component with all settings options

- Settings tab is configured in `mobile/app/(tabs)/_layout.tsx`

## Implementation Steps

### 1. Create Nested Stack for Settings

**File**: `mobile/app/(tabs)/settings/_layout.tsx` (NEW)Create a Stack navigator for settings to enable slide-in animation:

```typescript
import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
```

### 2. Move Settings Screen to Nested Route

**File**: `mobile/app/(tabs)/settings/index.tsx` (NEW - move from `settings.tsx`)

Move the current `settings.tsx` to `settings/index.tsx` and update it to render settings content directly (no modal).

### 3. Convert SettingsMenu to SettingsContent Component

**File**: `mobile/components/SettingsMenu.tsx` (MODIFY)

Convert the modal-based component to a regular page component:

- Remove `Modal` wrapper and overlay

- Remove `modalVisible` state and related logic

- Remove `SettingsMenuRef` interface and `useImperativeHandle` (no longer needed)

- Remove `autoOpen` prop and related `useEffect`

- Remove `showButton` prop (button functionality not needed in page context)

- **PRESERVE ALL FUNCTIONALITY**:
  - All menu items (Families, Profile, Voice Settings, Grocery Categories) with navigation
  - Services submenu with expand/collapse functionality
  - OAuth connection status checks (Outlook, OneDrive, Google Drive) - update to run on component mount instead of modal visibility
  - Connection status indicators (check-circle for connected, times-circle for disconnected)
  - Logout functionality with proper error handling
  - All navigation routes remain unchanged
- Add a header with back button that calls `router.back()` (replaces close button)
- Update styles to work as a full page instead of modal content
- Update OAuth check `useEffect` to run on mount instead of when `modalVisible` changes

### 4. Update Settings Screen

**File**: `mobile/app/(tabs)/settings/index.tsx` (MODIFY)

Update to use the converted component:

- Remove modal ref and `useFocusEffect` logic

- Render `SettingsContent` (renamed from `SettingsMenu`) directly

- Remove `onClose` callback (navigation handled by back button)

### 5. Update Tab Configuration

**File**: `mobile/app/(tabs)/_layout.tsx` (MODIFY)

Update the settings tab configuration to work with nested stack:

- Keep settings tab visible in tab bar

- Ensure it navigates to the nested stack properly

### 6. Clean Up Unused Code

- Remove modal-related styles from `SettingsMenu.tsx`

- Remove `SettingsMenuRef` export if no longer used elsewhere

- Check if `SettingsMenu` is used elsewhere and update those usages

## Files to Modify

1. `mobile/app/(tabs)/settings/_layout.tsx` - NEW - Stack navigator for settings

2. `mobile/app/(tabs)/settings/index.tsx` - NEW - Move from `settings.tsx`

3. `mobile/app/(tabs)/settings.tsx` - DELETE - Replaced by nested structure

4. `mobile/components/SettingsMenu.tsx` - MODIFY - Convert modal to page component

5. `mobile/app/(tabs)/_layout.tsx` - MODIFY - Ensure settings tab works with nested stack

## Key Changes

- Settings content will be a full page instead of modal overlay
- Page will slide in from right when accessed from tab bar
- Back button in header will navigate back (replaces modal close button)
- Settings remains accessible from bottom tab bar

## Functionality Preserved

All existing functionality will be maintained:

1. **Menu Items Navigation** (unchanged):

   - Families → `/(tabs)/families`
   - Profile → `/(tabs)/profile`
   - Voice Settings → `/(tabs)/settings`
   - Grocery Categories → `/(tabs)/grocery-categories`

2. **Services Submenu** (unchanged):

   - Expandable/collapsible Services section
   - Outlook Sync → `/(tabs)/outlook-sync`
   - Microsoft OneDrive Connect → `/(tabs)/onedrive-connect`
   - Google Drive/Photos Connect → `/(tabs)/googledrive-connect`
   - Connection status indicators (green check for connected, red X for disconnected)

3. **OAuth Connection Checks** (preserved, timing updated):

   - Checks Outlook, OneDrive, and Google Drive connection status
   - Will run on page mount instead of modal visibility change
   - Updates connection state to show correct indicators

4. **Logout Functionality** (unchanged):

   - Calls `AuthService.logout()`
   - Navigates to login screen on success or error
   - Error handling preserved

5. **Visual Design** (preserved):

   - Same menu item styling and layout
   - Same icons and colors
   - Same submenu indentation and styling
   - Same scrollable list behavior

## Testing Considerations

- Verify settings page slides in from right when tab is pressed
- Verify back button navigates correctly
- Verify all menu items navigate to correct routes
- Verify Services submenu expands and collapses correctly
- Verify OAuth connection status checks run on page load and show correct indicators
- Verify logout functionality works
- Verify all visual styling matches the original modal appearance