---
name: Add Profile Image Deletion
overview: Add the ability to delete/remove profile images from the player profile edit screen. Currently users can only add or replace images, but not remove them.
todos: []
---

## Overview

Add a "Remove Image" button to the player profile edit screen that allows users to delete their profile image. The implementation will track deletion intent and send a null value to the backend API to clear the profile image.

## Current State

- **Frontend** (`frontend/lib/screens/admin/account_edit_screen.dart`): Has profile image upload/replace functionality but no delete option
- **Backend** (`backend/accounts/models.py`): `profile_image` field supports `null=True, blank=True`, so deletion is supported
- **Service** (`frontend/lib/services/player_service.dart`): Has methods for uploading images but doesn't handle deletion

## Implementation Plan

### 1. Frontend UI Changes (`frontend/lib/screens/admin/account_edit_screen.dart`)

- Add a boolean state variable `_shouldDeleteImage` to track deletion intent
- Add a `_removeImage()` method that:
- Sets `_shouldDeleteImage = true`
- Clears `_currentProfileImageUrl`, `_selectedImageFile`, and `_selectedImageBytes`
- Updates UI to show placeholder
- Add a "Remove Image" button in the profile image section:
- Only visible when `_currentProfileImageUrl != null` (there's an existing image)
- Hidden when a new image is selected (`_selectedImageFile != null` or `_selectedImageBytes != null`)
- Positioned below the "Change Profile Image" button
- Uses error/warning color styling to indicate destructive action
- Modify `_handleSave()` to:
- Check if `_shouldDeleteImage` is true
- If deleting, include `'profile_image': null` in the `playerData` map
- Use regular `updatePlayer()` method (not multipart) when deleting
- Reset `_shouldDeleteImage` after successful save

### 2. Service Layer Changes (`frontend/lib/services/player_service.dart`)

- Modify `updatePlayer()` method to handle `profile_image: null` in the data map
- The existing method should already work since it sends JSON data, but verify it handles null values correctly
- No new method needed - deletion can use the regular PATCH endpoint

### 3. Backend Verification

- The backend already supports this:
- `AccountDetailView.partial_update()` handles PATCH requests
- `profile_image` field in model allows `null=True, blank=True`
- Django REST Framework serializer should accept null values for ImageField

## Files to Modify

1. `frontend/lib/screens/admin/account_edit_screen.dart`

- Add `_shouldDeleteImage` state variable
- Add `_removeImage()` method
- Add "Remove Image" button in UI (around line 442, after "Change Profile Image" button)
- Modify `_handleSave()` to handle deletion (around line 195-227)

2. `frontend/lib/services/player_service.dart`

- Verify `updatePlayer()` handles null values (should already work, but may need minor adjustment)

## UI Flow

1. User sees existing profile image
2. User clicks "Remove Image" button
3. Image disappears, placeholder shows
4. User clicks "Save Changes"
5. Profile image is deleted on backend
6. Success message shown

## Edge Cases

- If user removes image then selects a new one: `_shouldDeleteImage` should be reset to false
- If user removes image then cancels: deletion intent should be cleared
- If user has both a new image selected AND wants to delete: new image takes precedence (don't show delete button when new image selected)