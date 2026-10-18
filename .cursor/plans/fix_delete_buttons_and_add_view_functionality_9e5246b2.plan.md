---
name: Fix Delete Buttons and Add View Functionality
overview: Fix delete button visibility in OneDrive/Google Drive and add view functionality for documents in both services.
todos:
  - id: fix-delete-buttons
    content: Fix delete button visibility in FileItem component - ensure buttons are properly aligned and visible in OneDrive and Google Drive browsers
    status: completed
  - id: add-view-onedrive
    content: Add view functionality to OneDriveBrowser component - implement handleView function using webViewLink
    status: completed
  - id: add-view-googledrive
    content: Add view functionality to GoogleDriveBrowser component - implement handleView function using webViewLink
    status: completed
  - id: update-fileitem-view
    content: Update FileItem component to support onView prop and add view button (eye icon) for files with webViewLink
    status: completed
    dependencies:
      - add-view-onedrive
      - add-view-googledrive
---

# Fix Delete Buttons and Add View Functionality

## Issues Identified

### 1. Delete Buttons Not Visible

The delete buttons **are implemented** in the code but may not be visible in the UI. The `FileItem` component (used by OneDrive and Google Drive browsers) includes delete buttons (lines 3727-3733), but they might be:

- Hidden due to styling/layout issues
- Cut off by the container
- Not properly aligned

**Current Implementation:**

- `FileItem` component has delete button at line 3727-3733
- Uses `styles.fileAction` which has `padding: 8` and `marginLeft: 8`
- The button should appear on the right side of each file item

### 2. View Functionality Missing

View functionality exists for **App Documents** but is **missing** for OneDrive and Google Drive:

**Current State:**

- ✅ App Documents: Has `handleView` function (line 751) that opens documents via `Linking.openURL`
- ❌ OneDrive: No view functionality - only download
- ❌ Google Drive: No view functionality - only download

**Available Resources:**

- `CloudFile` interface has `webViewLink` property that can be used to open files in browser
- OneDrive and Google Drive APIs provide web view links for files

## Implementation Plan

### Task 1: Fix Delete Button Visibility

**File:** `mobile/app/(tabs)/documents.tsx`

1. Check the `FileItem` component layout (lines 3631-3736)
2. Ensure `fileAction` buttons are properly aligned and visible
3. May need to adjust styles to ensure buttons don't get cut off
4. Consider adding a container for action buttons similar to `fileActions` used in App Documents

### Task 2: Add View Functionality to OneDrive

**File:** `mobile/app/(tabs)/documents.tsx`

1. Add `handleView` function to `OneDriveBrowser` component (similar to App Documents)
2. Use `file.webViewLink` to open files in browser via `Linking.openURL`
3. Add view button to `FileItem` component or create separate handler
4. Update `FileItem` to accept `onView` prop (currently only has `onDownload` and `onDelete`)

### Task 3: Add View Functionality to Google Drive

**File:** `mobile/app/(tabs)/documents.tsx`

1. Add `handleView` function to `GoogleDriveBrowser` component
2. Use `file.webViewLink` to open files in browser
3. Pass `onView` handler to `FileItem` component

### Task 4: Update FileItem Component

**File:** `mobile/app/(tabs)/documents.tsx`

1. Add `onView?: (file: CloudFile) => void` prop to `FileItem` component
2. Add view button (eye icon) similar to App Documents (line 1375)
3. Position view button before download button
4. Only show view button for files (not folders) and when `webViewLink` is available

## Files to Modify

- `mobile/app/(tabs)/documents.tsx`
  - `FileItem` component (lines 3631-3736) - Add view button and fix delete button visibility
  - `OneDriveBrowser` component (lines 1452-2195) - Add `handleView` function
  - `GoogleDriveBrowser` component (lines 2197-2938) - Add `handleView` function

## Implementation Details

### View Button Implementation

```typescript
// In FileItem component, add view button:
{!isFolder && file.webViewLink && (
  <TouchableOpacity
    style={styles.fileAction}
    onPress={() => onView?.(file)}
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  >
    <FontAwesome name="eye" size={18} color={colors.primary} />
  </TouchableOpacity>
)}
```

### View Handler Implementation

```typescript
// In OneDriveBrowser and GoogleDriveBrowser:
const handleView = async (file: CloudFile) => {
  if (!file.webViewLink) {
    Alert.alert('Error', 'This file cannot be viewed in browser.');
    return;
  }
  try {
    const canOpen = await Linking.canOpenURL(file.webViewLink);
    if (canOpen) {
      await Linking.openURL(file.webViewLink);
    } else {
      Alert.alert('Error', 'Unable to open this file.');
    }
  } catch (err: any) {
    console.error('Error viewing file:', err);
    Alert.alert('Error', 'Failed to open file.');
  }
};
```