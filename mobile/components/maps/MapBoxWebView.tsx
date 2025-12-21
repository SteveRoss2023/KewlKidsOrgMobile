import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';

interface MapBoxWebViewProps {
  accessToken: string;
  center: [number, number];
  zoom: number;
  mapType?: 'standard' | 'satellite' | 'hybrid';
  markers?: Array<{
    id: string;
    position: [number, number];
    title: string;
    description?: string;
    lastUpdate?: string | null;
  }>;
  onMapReady?: (map: any) => void;
  onResetView?: () => void;
  style?: any;
}

export default function MapBoxWebView({
  accessToken,
  center,
  zoom,
  mapType = 'standard',
  markers = [],
  onMapReady,
  onResetView,
  style,
}: MapBoxWebViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    // Dynamically load MapBox GL JS
    const loadMapbox = async () => {
      try {
        // Load CSS
        if (!document.getElementById('mapbox-gl-css')) {
          const link = document.createElement('link');
          link.id = 'mapbox-gl-css';
          link.rel = 'stylesheet';
          link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
          document.head.appendChild(link);
        }

        // Load JS
        if (!(window as any).mapboxgl) {
          const script = document.createElement('script');
          script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
          script.async = true;
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        const mapboxgl = (window as any).mapboxgl;
        if (!mapboxgl || !mapContainerRef.current) return;

        // Initialize map
        mapboxgl.accessToken = accessToken;

        const mapStyle = mapType === 'satellite'
          ? 'mapbox://styles/mapbox/satellite-v9'
          : mapType === 'hybrid'
          ? 'mapbox://styles/mapbox/satellite-streets-v12'
          : 'mapbox://styles/mapbox/streets-v12';

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: mapStyle,
          center: center,
          zoom: zoom,
        });

        map.on('load', () => {
          setIsLoaded(true);
          mapInstanceRef.current = map;

          // Add markers
          markers.forEach((marker) => {
            const el = document.createElement('div');
            el.className = 'marker';
            el.style.width = '30px';
            el.style.height = '30px';
            el.style.borderRadius = '50%';
            el.style.backgroundColor = marker.id === 'user-location' ? '#3b82f6' : '#ef4444';
            el.style.border = '2px solid white';
            el.style.cursor = 'pointer';

            new mapboxgl.Marker(el)
              .setLngLat(marker.position)
              .setPopup(
                new mapboxgl.Popup({ offset: 25 }).setHTML(
                  `<div>
                    <strong>${marker.title}</strong>
                    ${marker.lastUpdate ? `<br/><small>Updated: ${new Date(marker.lastUpdate).toLocaleString()}</small>` : ''}
                  </div>`
                )
              )
              .addTo(map);
          });

          if (onMapReady) {
            onMapReady(map);
          }
        });

        // Store reset function
        (map as any).resetView = () => {
          map.flyTo({
            center: center,
            zoom: zoom,
            duration: 1000,
          });
        };
      } catch (error) {
        console.error('Error loading MapBox GL JS:', error);
      }
    };

    loadMapbox();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [accessToken, center, zoom, mapType]);

  // Update markers when they change
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || Platform.OS === 'web') return;

    // Clear existing markers and add new ones
    const map = mapInstanceRef.current;
    // Note: In a real implementation, you'd track marker instances to remove them
    // For now, we'll rely on the map reloading when markers change significantly
  }, [markers, isLoaded]);

  if (Platform.OS !== 'web') {
    return <View style={[styles.container, style]} />;
  }

  return (
    <View style={[styles.container, style]}>
      {!isLoaded && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      )}
      {/* @ts-ignore - web DOM element */}
      <div
        ref={(el) => {
          mapContainerRef.current = el;
        }}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});

