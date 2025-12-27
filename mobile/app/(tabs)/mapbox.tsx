import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useLocationTracking } from '../../hooks/useLocationTracking';
import { useWebLocationTracking } from '../../hooks/useWebLocationTracking';
import ProfileService, { UserProfile } from '../../services/profileService';
import FamilyService, { Member } from '../../services/familyService';
import MapControls, { MapType as MapTypeOption } from '../../components/maps/MapControls';
import MapBoxWebView from '../../components/maps/MapBoxWebView';
import GlobalNavBar from '../../components/GlobalNavBar';
import Constants from 'expo-constants';

// Conditionally import native MapBox components only on native platforms
let MapBoxMapView: any = null;
let MapBoxLocationMarker: any = null;

if (Platform.OS !== 'web') {
  try {
    MapBoxMapView = require('../../components/maps/MapBoxMapView').default;
    MapBoxLocationMarker = require('../../components/maps/MapBoxLocationMarker').default;
  } catch (error) {
    console.warn('MapBox native components not available:', error);
  }
}

// Get MapBox access token from environment
const getMapboxToken = (): string => {
  // Try to get from environment variable (Expo uses EXPO_PUBLIC_ prefix)
  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) {
    console.warn('MapBox access token not found. Please set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in your .env file.');
    return '';
  }
  return token;
};

// Set MapBox access token early for native platforms
if (Platform.OS !== 'web') {
  const token = getMapboxToken();
  if (token) {
    try {
      const MapBoxMapViewModule = require('../../components/maps/MapBoxMapView');
      if (MapBoxMapViewModule.setMapboxAccessToken) {
        MapBoxMapViewModule.setMapboxAccessToken(token);
      }
    } catch (error) {
      console.warn('Could not set MapBox access token early:', error);
    }
  }
}

interface MemberWithLocation extends Member {
  user_profile?: {
    location_sharing_enabled: boolean;
    latitude: string | null;
    longitude: string | null;
    last_location_update: string | null;
  };
}

export default function MapBoxScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const mapRef = useRef<any>(null);
  const webMapRef = useRef<any>(null);

  const [members, setMembers] = useState<MemberWithLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [mapType, setMapType] = useState<MapTypeOption>('satellite');
  const [initialCenter, setInitialCenter] = useState<[number, number]>([0, 0]);
  const [initialZoom, setInitialZoom] = useState(4);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [animateCamera, setAnimateCamera] = useState(false);
  const initialCenterSetRef = useRef(false);
  const mapboxToken = getMapboxToken();

  // Location tracking hook - use different hooks for web vs mobile
  const handleLocationError = useCallback((err: string) => {
    setError(err);
  }, []);

  // Use web geolocation API for web, expo-location for mobile
  const mobileLocation = useLocationTracking({
    enabled: locationSharingEnabled && Platform.OS !== 'web',
    onLocationUpdate: undefined,
    onError: handleLocationError,
  });

  const webLocation = useWebLocationTracking({
    enabled: locationSharingEnabled && Platform.OS === 'web',
    onLocationUpdate: undefined,
    onError: handleLocationError,
  });

  const currentLocation = Platform.OS === 'web' ? webLocation.location : mobileLocation.location;
  const locationLoading = Platform.OS === 'web' ? webLocation.loading : mobileLocation.loading;
  const locationError = Platform.OS === 'web' ? webLocation.error : mobileLocation.error;

  // Calculate center of all markers
  const calculateCenter = useCallback((): { latitude: number; longitude: number } => {
    const locations: Array<{ latitude: number; longitude: number }> = [];

    // Add user's location if available
    if (currentLocation) {
      locations.push(currentLocation);
    }

    // Add member locations
    members.forEach((member) => {
      const profile = member.user_profile;
      if (profile?.location_sharing_enabled && profile.latitude && profile.longitude) {
        const lat = parseFloat(profile.latitude);
        const lng = parseFloat(profile.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          locations.push({ latitude: lat, longitude: lng });
        }
      }
    });

    if (locations.length === 0) {
      return { latitude: 39.8283, longitude: -98.5795 }; // Center of USA
    }

    if (locations.length === 1) {
      return locations[0];
    }

    // Calculate average center
    const avgLat = locations.reduce((sum, loc) => sum + loc.latitude, 0) / locations.length;
    const avgLng = locations.reduce((sum, loc) => sum + loc.longitude, 0) / locations.length;
    return { latitude: avgLat, longitude: avgLng };
  }, [currentLocation, members]);

  // Reset map view
  const handleResetView = useCallback(() => {
    const center = calculateCenter();
    const centerArray: [number, number] = [center.longitude, center.latitude];

    // For native MapBox, enable animation and update center/zoom
    if (Platform.OS !== 'web') {
      setAnimateCamera(true);
      setInitialCenter(centerArray);
      setInitialZoom(4);
      setHasUserInteracted(false);
      // Reset animation flag after a short delay
      setTimeout(() => {
        setAnimateCamera(false);
      }, 1100); // Slightly longer than animation duration
    } else if (Platform.OS === 'web' && webMapRef.current) {
      // For web, use resetView method if available
      if ((webMapRef.current as any).resetView) {
        (webMapRef.current as any).resetView();
      } else if (webMapRef.current.flyTo) {
        webMapRef.current.flyTo({
          center: centerArray,
          zoom: 4,
          duration: 1000,
        });
      }
    }
  }, [calculateCenter]);

  // Fetch family members
  const fetchMembers = useCallback(async () => {
    if (!selectedFamily) {
      setMembers([]);
      return;
    }

    try {
      const membersList = await FamilyService.getFamilyMembers(selectedFamily.id);

      // Filter members who have location sharing enabled and have coordinates
      const membersWithLocation = membersList.filter((member: MemberWithLocation) => {
        const profile = member.user_profile;
        return profile?.location_sharing_enabled &&
               profile?.latitude &&
               profile?.longitude;
      });

      setMembers(membersWithLocation as MemberWithLocation[]);
    } catch (err: any) {
      console.error('Error fetching members:', err);
      setError('Failed to load family members');
    }
  }, [selectedFamily]);

  // Fetch user profile
  const fetchUserProfile = useCallback(async () => {
    try {
      const profile = await ProfileService.getProfile();
      setUserProfile(profile);
      setLocationSharingEnabled(profile.location_sharing_enabled || false);
    } catch (err: any) {
      console.error('Error fetching user profile:', err);
    }
  }, []);

  // Load data on mount and when family changes
  useEffect(() => {
    // Reset initial center when family changes
    initialCenterSetRef.current = false;
    setInitialCenter([0, 0]);

    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchUserProfile(), fetchMembers()]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  // Refresh members when location sharing changes
  useEffect(() => {
    if (selectedFamily) {
      fetchMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSharingEnabled, selectedFamily?.id]);

  // Set initial center when we have location data (only once)
  useEffect(() => {
    if (initialCenterSetRef.current) return;
    if (!loading && (members.length > 0 || currentLocation)) {
      const center = calculateCenter();
      // Only set if we have actual location data (not default center)
      if (center.latitude !== 39.8283 || center.longitude !== -98.5795) {
        setInitialCenter([center.longitude, center.latitude]);
        setInitialZoom(4);
        initialCenterSetRef.current = true;
      } else if (members.length === 0 && !currentLocation) {
        // Set default center only if we have no locations at all
        setInitialCenter([-98.5795, 39.8283]);
        setInitialZoom(2);
        initialCenterSetRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, members.length, currentLocation?.latitude, currentLocation?.longitude]);

  // Handle location sharing toggle
  const handleToggleLocationSharing = async (enabled: boolean) => {
    try {
      const profile = await ProfileService.toggleLocationSharing(enabled);
      setLocationSharingEnabled(profile.location_sharing_enabled || false);
      setUserProfile(profile);

      if (!enabled && selectedFamily) {
        // Refresh members to remove user's location
        const membersList = await FamilyService.getFamilyMembers(selectedFamily.id);
        const membersWithLocation = membersList.filter((member: MemberWithLocation) => {
          const profile = member.user_profile;
          return profile?.location_sharing_enabled &&
                 profile?.latitude &&
                 profile?.longitude;
        });
        setMembers(membersWithLocation as MemberWithLocation[]);
      }
    } catch (err: any) {
      console.error('Error updating location sharing:', err);
      Alert.alert('Error', 'Failed to update location sharing settings');
    }
  };

  // Check if MapBox token is available
  if (!mapboxToken) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.error }]}>
            MapBox access token not configured
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Please set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in your .env file.{'\n'}
            See MAPBOX_SETUP.md for instructions.
          </Text>
        </View>
      </View>
    );
  }

  // Check if using Expo Go (MapBox requires development build)
  if (Platform.OS !== 'web' && !MapBoxMapView && Constants.executionEnvironment === 'storeClient') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            MapBox requires a development build
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            MapBox native maps are not available in Expo Go.{'\n'}
            Please create a development build to use MapBox on mobile.{'\n'}
            See DEV_BUILD_INSTRUCTIONS.md for details.
          </Text>
        </View>
      </View>
    );
  }

  if (!selectedFamily) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            Please select a family to view locations
          </Text>
        </View>
      </View>
    );
  }

  if (loading && initialCenter[0] === 0 && initialCenter[1] === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading map...
          </Text>
        </View>
      </View>
    );
  }

  // Prepare markers for web map
  const webMarkers: Array<{
    id: string;
    position: [number, number];
    title: string;
    description?: string;
    lastUpdate?: string | null;
  }> = [];

  // Add user's location
  if (currentLocation && locationSharingEnabled) {
    webMarkers.push({
      id: 'user-location',
      position: [currentLocation.longitude, currentLocation.latitude],
      title: 'You',
      lastUpdate: userProfile?.last_location_update || null,
    });
  }

  // Add family member locations
  members.forEach((member) => {
    const profile = member.user_profile;
    if (!profile?.latitude || !profile?.longitude) return;

    const lat = parseFloat(profile.latitude);
    const lng = parseFloat(profile.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    const displayName = member.user_display_name || member.user_email?.split('@')[0] || 'Unknown';

    webMarkers.push({
      id: `member-${member.id}`,
      position: [lng, lat],
      title: displayName,
      lastUpdate: profile.last_location_update,
    });
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={styles.controlsWrapper}>
        <MapControls
          mapType={mapType}
          onMapTypeChange={setMapType}
          locationSharingEnabled={locationSharingEnabled}
          onToggleLocationSharing={handleToggleLocationSharing}
          onResetView={handleResetView}
          updatingLocation={locationLoading}
        />
      </View>
      <View style={styles.content}>

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {locationError && (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{locationError}</Text>
          </View>
        )}

        {initialCenter[0] !== 0 && initialCenter[1] !== 0 && Platform.OS !== 'web' && MapBoxMapView ? (
          <MapBoxMapView
            accessToken={mapboxToken}
            initialCenter={initialCenter}
            initialZoom={initialZoom}
            mapType={mapType}
            animateCamera={animateCamera}
            onMapReady={(map) => {
              mapRef.current = map;
            }}
            style={styles.map}
          >
            {/* User's own location */}
            {currentLocation && locationSharingEnabled && MapBoxLocationMarker && (
              <MapBoxLocationMarker
                id="user-location"
                coordinate={currentLocation}
                title="You"
                isCurrentUser={true}
                lastUpdate={userProfile?.last_location_update || null}
              />
            )}

            {/* Family members' locations */}
            {members.map((member) => {
              const profile = member.user_profile;
              if (!profile?.latitude || !profile?.longitude) return null;

              const lat = parseFloat(profile.latitude);
              const lng = parseFloat(profile.longitude);
              if (isNaN(lat) || isNaN(lng)) return null;

              const displayName = member.user_display_name || member.user_email?.split('@')[0] || 'Unknown';

              return MapBoxLocationMarker ? (
                <MapBoxLocationMarker
                  key={member.id}
                  id={`member-${member.id}`}
                  coordinate={{ latitude: lat, longitude: lng }}
                  title={displayName}
                  lastUpdate={profile.last_location_update}
                />
              ) : null;
            })}
          </MapBoxMapView>
        ) : Platform.OS !== 'web' ? (
          <View style={[styles.map, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
            <Text style={[styles.emptyStateText, { color: colors.text }]}>
              MapBox native library not available.{'\n\n'}
              To use MapBox on mobile, you need to:{'\n'}
              1. Install @rnmapbox/maps: npm install @rnmapbox/maps{'\n'}
              2. Rebuild the app: npm run dev:android
            </Text>
          </View>
        ) : null}

        {initialCenter[0] !== 0 && initialCenter[1] !== 0 && Platform.OS === 'web' && (
          <MapBoxWebView
            accessToken={mapboxToken}
            center={initialCenter}
            zoom={initialZoom}
            mapType={mapType}
            markers={webMarkers}
            onMapReady={(map) => {
              webMapRef.current = map;
            }}
            onResetView={handleResetView}
            style={styles.map}
          />
        )}

        {!loading && members.length === 0 && !currentLocation && (
          <View style={styles.emptyStateContainer}>
            <Text style={[styles.emptyStateText, { color: colors.text }]}>
              No family members are sharing their location yet.
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>
              Enable "Share my location" to start sharing your location with your family.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    paddingTop: 0,
  },
  controlsWrapper: {
    padding: 16,
    paddingBottom: 0,
    zIndex: 10,
    backgroundColor: 'transparent',
    ...(Platform.OS !== 'web' ? {
      minHeight: 250,
    } : {}),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  map: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 1,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
  },
  emptyStateContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 12,
    textAlign: 'center',
  },
});

