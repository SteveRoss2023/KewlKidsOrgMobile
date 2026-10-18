---
name: Map Features Implementation
overview: Implement Map/Location Sharing features from the reference project, including map view with family member locations, location sharing toggle, real-time location tracking, map style selector, and navigation from the home page Map card.
todos:
  - id: backend-serializer
    content: Extend MemberSerializer in backend/families/serializers.py to include user profile location fields (location_sharing_enabled, latitude, longitude, last_location_update)
    status: pending
  - id: backend-migration
    content: Activate backend virtual environment (venv\Scripts\activate on Windows) and run makemigrations and migrate if model changes are needed
    status: pending
    dependencies:
      - backend-serializer
  - id: install-dependencies
    content: Install react-native-maps and expo-location packages in mobile directory
    status: pending
  - id: extend-profile-service
    content: Extend profileService.ts to add location update and toggle methods, and update UserProfile interface
    status: pending
  - id: create-location-hook
    content: Create useLocationTracking.ts hook for location tracking with throttling and permission handling
    status: pending
    dependencies:
      - install-dependencies
  - id: create-map-components
    content: Create MapControls.tsx and LocationMarker.tsx components in mobile/components/maps/
    status: pending
    dependencies:
      - install-dependencies
  - id: create-map-screen
    content: Create map.tsx screen in mobile/app/(tabs)/ with map view, markers, controls, and location tracking integration
    status: pending
    dependencies:
      - create-location-hook
      - create-map-components
      - extend-profile-service
  - id: update-home-navigation
    content: Update index.tsx home screen to navigate to map screen when Map card is pressed
    status: pending
    dependencies:
      - create-map-screen
  - id: update-tab-layout
    content: "Add map screen to _layout.tsx tabs configuration with href: null to hide from bottom nav"
    status: pending
    dependencies:
      - create-map-screen
---

# Map Features Implementation Plan

## Overview

Replicate the Map features from the reference project (`KewlKidsOrganizer/frontend/react/src/components/Map.jsx`) into the mobile app. The map will display family member locations, allow users to share their location, and provide map controls.

## Reference Project Analysis

The reference Map component includes:

- Map view with markers for family members who have location sharing enabled
- User's own location marker
- Location sharing toggle (enable/disable)
- Real-time location tracking using geolocation API
- Map style selector (satellite, hybrid, street)
- Reset map view button
- Location update throttling (30s minimum interval, 50m minimum distance)
- Auto-centering on initial load
- Zoom level display
- Popups showing member name, coordinates, and last update time

## Backend Changes

### 1. Extend Member Serializer

**File**: `backend/families/serializers.py`

- Add user profile location fields to `MemberSerializer`:
  - `user_profile` nested object with `location_sharing_enabled`, `latitude`, `longitude`, `last_location_update`
- This allows the mobile app to filter members with location sharing enabled

### 2. Update Profile Serializer (if needed)

**File**: `backend/api/serializers.py`

- Verify `UserProfileSerializer` includes location fields:
  - `location_sharing_enabled`
  - `latitude`
  - `longitude`
  - `last_location_update`
- These fields should already exist based on the model

### 3. Database Migration

- **IMPORTANT**: Activate the backend virtual environment before running migrations:
  - Windows: `backend\venv\Scripts\activate` or use `backend\activate.ps1`
  - Navigate to `backend/` directory
  - Run `python manage.py makemigrations` if model changes are made
  - Run `python manage.py migrate` to apply migrations
- Location fields already exist in `UserProfile` model, so migration may not be needed unless serializer changes require it

## Mobile App Changes

### 1. Install Dependencies

**File**: `mobile/package.json`

- Install `react-native-maps`: `npx expo install react-native-maps`
- Install `expo-location`: `npx expo install expo-location`
- Both packages are required for map functionality

### 2. Create Map Service

**File**: `mobile/services/mapService.ts` (new)

- Service for map-related API calls:
  - `updateLocation(latitude, longitude)`: Update user's location
  - `toggleLocationSharing(enabled)`: Enable/disable location sharing
  - `getFamilyMembersWithLocations(familyId)`: Get family members with location data
- Extend existing `profileService.ts` to include location update methods

### 3. Create Map Screen

**File**: `mobile/app/(tabs)/map.tsx` (new)

- Main map screen component with:
  - Map view using `react-native-maps` (MapView component)
  - Markers for family members with location sharing enabled
  - User's own location marker
  - Location sharing toggle switch
  - Map style selector (satellite, hybrid, standard)
  - Reset map view button
  - Loading and error states
  - Empty state when no locations are shared

### 4. Create Map Components

**File**: `mobile/components/maps/MapControls.tsx` (new)

- Map control buttons and selectors:
  - Map style selector dropdown
  - Reset view button
  - Location sharing toggle

**File**: `mobile/components/maps/LocationMarker.tsx` (new)

- Custom marker component for map markers
- Shows member name and last update time in callout

### 5. Update Home Screen Navigation

**File**: `mobile/app/(tabs)/index.tsx`

- Update `handleCardPress` function to navigate to map screen:
  ```typescript
  case 'map':
    router.push('/(tabs)/map');
    break;
  ```


### 6. Update Tab Layout

**File**: `mobile/app/(tabs)/_layout.tsx`

- Add map screen to tabs configuration:
  - Set `href: null` to hide from bottom nav (accessible via Home card only)

### 7. Extend Profile Service

**File**: `mobile/services/profileService.ts`

- Add location-related methods:
  - `updateLocation(latitude: number, longitude: number)`: Update user location
  - `toggleLocationSharing(enabled: boolean)`: Toggle location sharing
  - Extend `UserProfile` interface to include location fields

### 8. Location Tracking Hook

**File**: `mobile/hooks/useLocationTracking.ts` (new)

- Custom hook for location tracking:
  - Request location permissions
  - Watch position updates
  - Throttle updates (30s interval, 50m distance)
  - Handle location errors
  - Clean up on unmount

## Implementation Details

### Map Features

1. **Map View**

   - Use `react-native-maps` MapView component
   - Support multiple map types: standard, satellite, hybrid
   - Initial center calculated from all member locations
   - Default zoom level: 4 (or calculated to fit all markers)

2. **Location Tracking**

   - Use `expo-location` for location access
   - Request `FOREGROUND` and `BACKGROUND` permissions
   - Watch position with high accuracy
   - Update location to backend with throttling:
     - Minimum 30 seconds between updates
     - Minimum 50 meters distance change
   - Clear location when sharing is disabled

3. **Markers**

   - Show markers for all family members with:
     - `location_sharing_enabled = true`
     - Valid `latitude` and `longitude`
   - Different marker style for user's own location
   - Callout shows: name, coordinates, last update time

4. **Map Controls**

   - Map style selector (satellite/hybrid/standard)
   - Reset view button (centers on all locations)
   - Location sharing toggle with loading state

5. **State Management**

   - Track location sharing enabled/disabled
   - Track user's current location
   - Track family members with locations
   - Handle loading and error states

### API Integration

- **GET** `/users/me/profile/` - Get user profile (includes location fields)
- **PATCH** `/users/me/profile/` - Update location or toggle sharing
- **GET** `/families/{id}/members/` - Get family members (with profile data)

### Error Handling

- Handle location permission denied
- Handle location unavailable
- Handle API errors
- Show user-friendly error messages

### Performance

- Throttle location updates to reduce API calls
- Only update location when significant change occurs
- Use React.memo for map components
- Optimize marker rendering

## Testing Checklist

- [ ] Map loads and displays correctly
- [ ] Location sharing toggle works
- [ ] Location updates are sent to backend
- [ ] Family member locations are displayed
- [ ] Map style selector works
- [ ] Reset view button works
- [ ] Location permissions are requested correctly
- [ ] Location updates are throttled correctly
- [ ] Error states are handled gracefully
- [ ] Navigation from home page works
- [ ] Map is accessible from home card (not bottom nav)

## Files to Create/Modify

### Backend

- `backend/families/serializers.py` - Extend MemberSerializer
- Run migrations if needed

### Mobile

- `mobile/app/(tabs)/map.tsx` - Main map screen (new)
- `mobile/components/maps/MapControls.tsx` - Map controls (new)
- `mobile/components/maps/LocationMarker.tsx` - Marker component (new)
- `mobile/hooks/useLocationTracking.ts` - Location tracking hook (new)
- `mobile/services/mapService.ts` - Map service (new, optional)
- `mobile/services/profileService.ts` - Add location methods
- `mobile/app/(tabs)/index.tsx` - Update navigation
- `mobile/app/(tabs)/_layout.tsx` - Add map screen
- `mobile/package.json` - Add dependencies

## Dependencies

- `react-native-maps` - Map component
- `expo-location` - Location services

## Notes

- Map should be accessible from home page Map card, not bottom navigation
- Location sharing requires user permission
- Location updates are throttled to reduce server load
- Map uses native map providers (Google Maps on Android, Apple Maps on iOS)