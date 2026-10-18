---
name: Add MapBox Map Card
overview: Add a new "Map(MapBox)" card on the home page and create a MapBox implementation screen to compare with the existing react-native-maps implementation. Include setup instructions for obtaining a free MapBox API key.
todos: []
---

# Add MapBox Map Card a

nd Implementation

## Overview

Add a new card on the home page called "Map(MapBox)" that navigates to a new MapBox-based map screen. This will allow side-by-side comparison with the existing `react-native-maps` implementation to determine which map solution to use for development builds.

## Current State

- Existing map implementation uses `react-native-maps` for native platforms and Leaflet for web

- Map screen located at `mobile/app/(tabs)/map.tsx`

- Home page cards defined in `mobile/app/(tabs)/index.tsx` with navigation handled by `handleCardPress`

- Current map card routes to `/(tabs)/map`

## Implementation Steps

### 1. Install MapBox Dependencies

- Install `@rnmapbox/maps` (the official React Native MapBox library)

- Install `@rnmapbox/maps` for both iOS and Android native modules
- Update `mobile/package.json` with the new dependency

### 2. Configure MapBox in app.json

- Add MapBox configuration to `mobile/app.json`

- Add iOS configuration for MapBox (Info.plist entries)

- Add Android configuration for MapBox (permissions and API key setup)

### 3. Create MapBox Map Screen

- Create new screen: `mobile/app/(tabs)/mapbox.tsx` or `mobile/app/(tabs)/map-mapbox.tsx`

- Implement MapBox map view with similar functionality to existing map:

- Location tracking integration

- Family member location markers

- Map controls (map type, location sharing toggle, reset view)

- Support for both native and web platforms

- Reuse existing hooks: `useLocationTracking`, `useWebLocationTracking`

- Reuse existing services: `ProfileService`, `FamilyService`

- Reuse existing components: `MapControls`, `GlobalNavBar`

### 4. Create MapBox Components

- Create `mobile/components/maps/MapBoxMapView.tsx` for native MapBox implementation

- Create `mobile/components/maps/MapBoxWebView.tsx` for web MapBox implementation (if needed)

- Create `mobile/components/maps/MapBoxLocationMarker.tsx` for MapBox markers

### 5. Add MapBox Card to Home Page

- Add new card entry to the `cards` array in `mobile/app/(tabs)/index.tsx`:

  ```typescript
    {
      id: 'mapbox',
      title: 'Map(MapBox)',
      description: 'MapBox location sharing and tracking',
      icon: '🗺️',
      color: '#0066ff', // MapBox blue color
    }
  ```

- Add navigation case in `handleCardPress` function:

  ```typescript
    case 'mapbox':
      router.push('/(tabs)/mapbox');
      break;
  ```



### 6. Environment Configuration

- Add MapBox access token to environment variables

- Create/update `mobile/.env.example` with `MAPBOX_ACCESS_TOKEN` placeholder

- Update `mobile/.env` with actual token (user will add their own)

- Ensure environment variable is loaded in the MapBox screen

### 7. Documentation

- Create `mobile/MAPBOX_SETUP.md` with instructions for:

- How to get a free MapBox API key
- Step-by-step account creation

- Where to find the access token

- How to configure it in the app

- Usage limits for free tier

## Files to Create/Modify

### New Files

- `mobile/app/(tabs)/mapbox.tsx` - New MapBox map screen

- `mobile/components/maps/MapBoxMapView.tsx` - Native MapBox map component

- `mobile/components/maps/MapBoxWebView.tsx` - Web MapBox map component (if needed)

- `mobile/components/maps/MapBoxLocationMarker.tsx` - MapBox marker component

- `mobile/MAPBOX_SETUP.md` - Setup instructions for MapBox API key

### Modified Files

- `mobile/package.json` - Add `@rnmapbox/maps` dependency

- `mobile/app.json` - Add MapBox configuration

- `mobile/app/(tabs)/index.tsx` - Add new MapBox card and navigation

- `mobile/.env.example` - Add `MAPBOX_ACCESS_TOKEN` variable

## MapBox API Key Setup Instructions

### Getting a Free MapBox API Key

1. **Create MapBox Account**

- Go to https://account.mapbox.com/auth/signup/

- Sign up with email or use GitHub/Google account

- Verify your email address

2. **Get Your Access Token**

- After logging in, go to https://account.mapbox.com/access-tokens/

- You'll see a "Default public token" - this is your access token

- Copy this token (starts with `pk.`)

3. **Free Tier Limits**

- 50,000 map loads per month (free)

- 50,000 geocoding requests per month (free)

- Suitable for development and testing

- No credit card required for free tier

4. **Configure in App**

- Add token to `mobile/.env` file:

     ```javascript
          MAPBOX_ACCESS_TOKEN=pk.your_token_here
     ```

- The app will automatically use this token when initializing MapBox

## Technical Considerations

- MapBox requires native module setup for iOS and Android

- May need to run `npx pod-install` for iOS after installation

- Web implementation may use MapBox GL JS instead of native library

- Ensure MapBox token is kept secure and not committed to version control

- Both map implementations should share the same data sources and functionality for fair comparison

## Testing

- Test MapBox implementation on iOS device/simulator

- Test MapBox implementation on Android device/emulator

- Test MapBox implementation on web (if using MapBox GL JS)

- Compare performance and features with existing react-native-maps implementation
- Verify location tracking works correctly