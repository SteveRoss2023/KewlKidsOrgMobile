import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

// Conditionally import react-native-maps only on native platforms
// DO NOT import at module level - use lazy loading in component
let Marker: any = null;
let Callout: any = null;
let mapsLoaded = false;

interface LocationMarkerProps {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  title: string;
  description?: string;
  isCurrentUser?: boolean;
  lastUpdate?: string | null;
}

const LocationMarker = React.memo(function LocationMarker({
  coordinate,
  title,
  description,
  isCurrentUser = false,
  lastUpdate,
}: LocationMarkerProps) {
  const { colors } = useTheme();

  // Return null on web (web uses WebMapView with Leaflet markers)
  if (Platform.OS === 'web') {
    return null;
  }

  // Lazy load react-native-maps only when component is actually used (on native)
  // This should never execute on web due to early return above
  if (!mapsLoaded) {
    try {
      // Direct require - this file is only loaded on native platforms
      // Metro's platform-specific resolution ensures .native.tsx is only used on native
      const Maps = require('react-native-maps');
      Marker = Maps.Marker;
      Callout = Maps.Callout;
      mapsLoaded = true;
    } catch (error) {
      console.warn('react-native-maps not available:', error);
      return null;
    }
  }

  if (!Marker || !Callout) {
    return null;
  }

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  // Memoize coordinate to prevent unnecessary re-renders from floating point changes
  // Round to ~1 meter precision to avoid re-renders from GPS jitter
  const latRounded = Math.round(coordinate.latitude * 100000);
  const lngRounded = Math.round(coordinate.longitude * 100000);
  
  const memoizedCoordinate = useMemo(() => ({
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  }), [latRounded, lngRounded]);

  return (
    <Marker
      coordinate={memoizedCoordinate}
      title={title}
      pinColor={isCurrentUser ? '#3b82f6' : '#ef4444'}
    >
      <Callout>
        <View style={[styles.calloutContainer, { backgroundColor: colors.surface }]}>
          <Text style={[styles.calloutTitle, { color: colors.text }]}>{title}</Text>
          {description && (
            <Text style={[styles.calloutDescription, { color: colors.textSecondary }]}>
              {description}
            </Text>
          )}
          <Text style={[styles.calloutCoordinates, { color: colors.textSecondary }]}>
            {coordinate.latitude.toFixed(6)}, {coordinate.longitude.toFixed(6)}
          </Text>
          {lastUpdate && (
            <Text style={[styles.calloutUpdate, { color: colors.textSecondary }]}>
              Last updated: {formatDate(lastUpdate)}
            </Text>
          )}
        </View>
      </Callout>
    </Marker>
  );
});

export default LocationMarker;

const styles = StyleSheet.create({
  calloutContainer: {
    padding: 12,
    borderRadius: 8,
    minWidth: 200,
    maxWidth: 250,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  calloutDescription: {
    fontSize: 14,
    marginBottom: 4,
  },
  calloutCoordinates: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  calloutUpdate: {
    fontSize: 11,
    marginTop: 4,
  },
});
