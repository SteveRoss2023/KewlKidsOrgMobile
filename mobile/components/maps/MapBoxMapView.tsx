import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';

// Conditionally import MapBox only on native platforms
let MapboxGL: any = null;
let mapboxLoaded = false;
let accessTokenSet = false;

if (Platform.OS !== 'web') {
  try {
    MapboxGL = require('@rnmapbox/maps');
    mapboxLoaded = true;
  } catch (error) {
    console.warn('@rnmapbox/maps not available:', error);
  }
}

// Function to set access token (must be called before rendering MapView)
export const setMapboxAccessToken = (token: string) => {
  if (Platform.OS !== 'web' && MapboxGL && mapboxLoaded && !accessTokenSet) {
    try {
      MapboxGL.setAccessToken(token);
      accessTokenSet = true;
      console.log('MapBox access token set successfully');
    } catch (error) {
      console.error('Error setting MapBox access token:', error);
    }
  }
};

interface MapBoxMapViewProps {
  accessToken: string;
  styleURL?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  mapType?: 'standard' | 'satellite' | 'hybrid';
  onMapReady?: (map: any) => void;
  children?: React.ReactNode;
  style?: any;
  animateCamera?: boolean; // Whether to animate camera changes
}

export default function MapBoxMapView({
  accessToken,
  styleURL,
  initialCenter = [0, 0],
  initialZoom = 4,
  mapType = 'standard',
  onMapReady,
  children,
  style,
  animateCamera = false,
}: MapBoxMapViewProps) {
  const mapRef = useRef<any>(null);

  // Set access token immediately (before render)
  if (Platform.OS !== 'web' && MapboxGL && mapboxLoaded && accessToken) {
    setMapboxAccessToken(accessToken);
  }

  // Return null on web (web uses MapBox GL JS)
  if (Platform.OS === 'web') {
    return null;
  }

  if (!MapboxGL || !mapboxLoaded) {
    console.error('MapBoxMapView: @rnmapbox/maps is not installed. Please install it: npm install @rnmapbox/maps');
    return (
      <View style={[styles.container, style, { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Text style={{ color: '#666', textAlign: 'center' }}>
          MapBox native library not installed.{'\n'}
          Please install @rnmapbox/maps and rebuild the app.
        </Text>
      </View>
    );
  }

  const { MapView, Camera } = MapboxGL;

  // Map style URLs for different map types
  const getStyleURL = (): string => {
    if (styleURL) return styleURL;

    switch (mapType) {
      case 'satellite':
        return MapboxGL.StyleURL.Satellite;
      case 'hybrid':
        return MapboxGL.StyleURL.SatelliteStreet;
      case 'standard':
      default:
        return MapboxGL.StyleURL.Street;
    }
  };

  // Validate access token
  if (!accessToken || accessToken.trim() === '') {
    console.error('MapBoxMapView: Access token is required');
    return (
      <View style={[styles.container, style, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
        {/* @ts-ignore */}
        <Text style={{ color: '#fff' }}>MapBox access token not configured</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        styleURL={getStyleURL()}
        style={styles.map}
        scaleBarEnabled={false}
        onDidFinishLoadingMap={() => {
          console.log('MapBox map finished loading');
          if (onMapReady && mapRef.current) {
            onMapReady(mapRef.current);
          }
        }}
        onDidFailLoadingMap={(error: any) => {
          console.error('MapBox map failed to load:', error);
        }}
      >
        <Camera
          key={`${initialCenter[0]}-${initialCenter[1]}-${initialZoom}-${animateCamera}`}
          zoomLevel={initialZoom}
          centerCoordinate={initialCenter}
          animationMode={animateCamera ? "flyTo" : "none"}
          animationDuration={animateCamera ? 1000 : 0}
        />
        {children}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});

