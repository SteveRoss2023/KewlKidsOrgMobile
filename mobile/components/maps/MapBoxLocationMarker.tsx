import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

// Conditionally import MapBox only on native platforms
let PointAnnotation: any = null;
let Callout: any = null;
let mapboxLoaded = false;

if (Platform.OS !== 'web') {
  try {
    const MapboxGL = require('@rnmapbox/maps');
    PointAnnotation = MapboxGL.PointAnnotation;
    Callout = MapboxGL.Callout;
    mapboxLoaded = true;
  } catch (error) {
    console.warn('@rnmapbox/maps not available:', error);
  }
}

interface MapBoxLocationMarkerProps {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  title: string;
  description?: string;
  isCurrentUser?: boolean;
  lastUpdate?: string | null;
  id: string;
}

export default function MapBoxLocationMarker({
  coordinate,
  title,
  description,
  isCurrentUser = false,
  lastUpdate,
  id,
}: MapBoxLocationMarkerProps) {
  const { colors } = useTheme();

  // Return null on web (web uses MapBox GL JS markers)
  if (Platform.OS === 'web') {
    return null;
  }

  if (!PointAnnotation || !Callout || !mapboxLoaded) {
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

  // Memoize coordinate to prevent unnecessary re-renders
  const latRounded = Math.round(coordinate.latitude * 100000);
  const lngRounded = Math.round(coordinate.longitude * 100000);

  const memoizedCoordinate = useMemo(() => [coordinate.longitude, coordinate.latitude], [latRounded, lngRounded]);

  return (
    <PointAnnotation
      id={id}
      coordinate={memoizedCoordinate}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View
        style={[
          styles.marker,
          {
            backgroundColor: isCurrentUser ? '#3b82f6' : '#ef4444',
            borderColor: '#fff',
          },
        ]}
      >
        <View style={styles.markerInner} />
      </View>
      <Callout title={title}>
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
    </PointAnnotation>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
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




