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
import WebMapView from '../../components/maps/WebMapView';
import GlobalNavBar from '../../components/GlobalNavBar';

// Conditionally import react-native-maps only on native platforms
let MapView: any = null;
let LocationMarker: any = null;
let Region: any = null;
let MapType: any = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Region = Maps.Region;
    MapType = Maps.MapType;
  } catch (error) {
    console.warn('react-native-maps not available:', error);
  }
  
  // Only load LocationMarker on native platforms
  // On web, we'll use the .web.tsx stub which doesn't import react-native-maps
  try {
    LocationMarker = require('../../components/maps/LocationMarker').default;
  } catch (error) {
    console.warn('LocationMarker not available:', error);
    LocationMarker = null;
  }
} else {
  // For web, explicitly use the web stub to avoid any react-native-maps imports
  LocationMarker = null; // Web uses WebMapView with Leaflet, doesn't need LocationMarker
}

interface MemberWithLocation extends Member {
  user_profile?: {
    location_sharing_enabled: boolean;
    latitude: string | null;
    longitude: string | null;
    last_location_update: string | null;
  };
}

export default function MapScreen() {
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
  const [initialRegion, setInitialRegion] = useState<any>(null);
  const [currentRegion, setCurrentRegion] = useState<any>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const initialRegionSetRef = useRef(false);

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
    const region = {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: 10,
      longitudeDelta: 10,
    };
    
    if (Platform.OS !== 'web' && mapRef.current) {
      mapRef.current.animateToRegion(region, 1000);
    } else if (Platform.OS === 'web' && webMapRef.current) {
      // For web, use Leaflet map instance reset method
      if ((webMapRef.current as any).resetView) {
        (webMapRef.current as any).resetView();
      } else {
        webMapRef.current.setView([center.latitude, center.longitude], 4);
      }
    } else {
      // Fallback: update the region state
      setInitialRegion(region);
    }
    setHasUserInteracted(false);
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
    // Reset initial region when family changes
    initialRegionSetRef.current = false;
    setInitialRegion(null);
    
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
  }, [selectedFamily?.id]); // Only depend on family ID, not the callbacks

  // Refresh members when location sharing changes
  useEffect(() => {
    if (selectedFamily) {
      fetchMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSharingEnabled, selectedFamily?.id]); // Only depend on family ID, not the callback

  // Set initial region when we have location data (only once)
  useEffect(() => {
    if (initialRegionSetRef.current) return; // Prevent re-setting
    if (!loading && (members.length > 0 || currentLocation)) {
      const center = calculateCenter();
      // Only set if we have actual location data (not default center)
      if (center.latitude !== 39.8283 || center.longitude !== -98.5795) {
        setInitialRegion({
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: 10,
          longitudeDelta: 10,
        });
        initialRegionSetRef.current = true;
      } else if (members.length === 0 && !currentLocation) {
        // Set default region only if we have no locations at all
        setInitialRegion({
          latitude: 39.8283,
          longitude: -98.5795,
          latitudeDelta: 50,
          longitudeDelta: 50,
        });
        initialRegionSetRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, members.length, currentLocation?.latitude, currentLocation?.longitude]); // Only depend on specific values, not the callback

  // Preserve region when mapType changes (but not on initial load)
  useEffect(() => {
    if (currentRegion && mapRef.current && Platform.OS !== 'web' && hasUserInteracted) {
      // Preserve the current view when map type changes
      const timer = setTimeout(() => {
        if (mapRef.current && currentRegion) {
          mapRef.current.animateToRegion(currentRegion, 0);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [mapType]); // Only trigger on mapType change

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

  // Convert map type option to react-native-maps mapType string
  const getMapType = (): string => {
    if (Platform.OS === 'web' || !MapView) return 'standard';
    // react-native-maps expects lowercase string values
    switch (mapType) {
      case 'satellite':
        return 'satellite';
      case 'hybrid':
        return 'hybrid';
      case 'standard':
      default:
        return 'standard';
    }
  };

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

  if (loading && !initialRegion) {
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

        {initialRegion && Platform.OS !== 'web' && MapView && (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={initialRegion}
            region={hasUserInteracted && currentRegion ? currentRegion : undefined}
            mapType={getMapType()}
            showsUserLocation={false} // We'll use custom markers
            showsMyLocationButton={false}
            onRegionChangeComplete={(region) => {
              setHasUserInteracted(true);
              setCurrentRegion(region);
            }}
          >
            {/* User's own location */}
            {currentLocation && locationSharingEnabled && LocationMarker && (
              <LocationMarker
                key="user-location"
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

              return LocationMarker ? (
                <LocationMarker
                  key={member.id}
                  coordinate={{ latitude: lat, longitude: lng }}
                  title={displayName}
                  lastUpdate={profile.last_location_update}
                />
              ) : null;
            })}
          </MapView>
        )}

        {initialRegion && Platform.OS === 'web' && (() => {
          const center = calculateCenter();
          const centerArray: [number, number] = [center.latitude, center.longitude];
          
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
              position: [currentLocation.latitude, currentLocation.longitude],
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
              position: [lat, lng],
              title: displayName,
              lastUpdate: profile.last_location_update,
            });
          });

          return (
            <WebMapView
              key={`webmap-${mapType}`}
              center={centerArray}
              zoom={4}
              mapType={mapType}
              markers={webMarkers}
              onMapReady={(map) => {
                webMapRef.current = map;
              }}
              onResetView={handleResetView}
              style={styles.map}
            />
          );
        })()}

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
    paddingTop: 0, // Remove top padding since controls are separate
  },
  controlsWrapper: {
    padding: 16,
    paddingBottom: 0,
    zIndex: 10, // Ensure controls are above map
    backgroundColor: 'transparent',
    ...(Platform.OS !== 'web' ? {
      minHeight: 250, // Reserve space for dropdown on mobile only
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
  },
  map: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 1, // Map should be below controls
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
  webMapMessage: {
    fontSize: 14,
    textAlign: 'center',
    padding: 16,
    marginBottom: 12,
  },
  markersList: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 300,
  },
  markersListTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  markerItem: {
    padding: 8,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  markerName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  markerCoords: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  markerUpdate: {
    fontSize: 11,
  },
});
