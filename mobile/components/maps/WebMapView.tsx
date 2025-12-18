import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

// Only import react-leaflet on web - use lazy loading to avoid SSR issues
let MapContainer: any = null;
let TileLayer: any = null;
let Marker: any = null;
let Popup: any = null;
let leafletLoaded = false;

function loadLeaflet() {
  if (leafletLoaded || Platform.OS !== 'web') return;

  try {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return;
    }

    const Leaflet = require('react-leaflet');
    MapContainer = Leaflet.MapContainer;
    TileLayer = Leaflet.TileLayer;
    Marker = Leaflet.Marker;
    Popup = Leaflet.Popup;

    // Import Leaflet CSS only in browser
    if (typeof document !== 'undefined') {
      // Dynamically inject CSS to avoid Metro bundler issues
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      if (!document.querySelector(`link[href="${link.href}"]`)) {
        document.head.appendChild(link);
      }
    }

    // Fix Leaflet default icon paths
    const L = require('leaflet');
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });

    leafletLoaded = true;
  } catch (error) {
    console.warn('react-leaflet not available:', error);
  }
}

interface WebMapViewProps {
  center: [number, number];
  zoom: number;
  mapType: 'standard' | 'satellite' | 'hybrid';
  markers: Array<{
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

export default function WebMapView({
  center,
  zoom,
  mapType,
  markers,
  onMapReady,
  onResetView,
  style,
}: WebMapViewProps) {
  const { colors } = useTheme();
  const mapInstanceRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load leaflet only when component mounts in browser
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      loadLeaflet();
      setIsLoaded(true);
    }
  }, []);

  // Expose reset handler to parent via ref
  useEffect(() => {
    if (mapInstanceRef.current && onResetView) {
      // Store the reset function that parent can call
      (mapInstanceRef.current as any).resetView = () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView(center, zoom);
        }
      };
    }
  }, [center, zoom, onResetView]);

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* While leaflet is loading or not available, show a spinner */}
      {Platform.OS !== 'web' || !isLoaded || !MapContainer ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        // @ts-ignore - web DOM element
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <MapContainer
            center={center}
            zoom={zoom}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
            whenCreated={(map: any) => {
              // Store reference and notify parent
              mapInstanceRef.current = map;
              map.setView(center, zoom);
              if (onMapReady) {
                onMapReady(map);
              }
            }}
          >
            {/* Satellite map style */}
            {mapType === 'satellite' && (
              <>
                <TileLayer
                  key="satellite-base"
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.mapbox.com/">Mapbox</a>'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
                <TileLayer
                  key="satellite-labels"
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  opacity={0.85}
                  maxZoom={18}
                />
              </>
            )}

            {/* Hybrid map style */}
            {mapType === 'hybrid' && (
              <>
                <TileLayer
                  key="hybrid-base"
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
                <TileLayer
                  key="hybrid-labels"
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  opacity={0.7}
                />
              </>
            )}

            {/* Street map style */}
            {mapType === 'standard' && (
              <TileLayer
                key="street"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
            )}

            {/* Render markers */}
            {markers.map((marker) => (
              <Marker key={marker.id} position={marker.position}>
                <Popup>
                  <div
                    style={{
                      padding: '8px',
                      minWidth: '200px',
                      backgroundColor: colors.surface,
                      color: colors.text,
                    }}
                  >
                    <strong style={{ color: colors.text, display: 'block', marginBottom: '4px' }}>
                      {marker.title}
                    </strong>
                    {marker.description && (
                      <div
                        style={{
                          color: colors.textSecondary,
                          marginBottom: '4px',
                          fontSize: '14px',
                        }}
                      >
                        {marker.description}
                      </div>
                    )}
                    <div
                      style={{
                        color: colors.textSecondary,
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        marginBottom: '4px',
                      }}
                    >
                      {marker.position[0].toFixed(6)}, {marker.position[1].toFixed(6)}
                    </div>
                    {marker.lastUpdate && (
                      <div
                        style={{
                          color: colors.textSecondary,
                          fontSize: '11px',
                          marginTop: '4px',
                        }}
                      >
                        Last updated: {formatDate(marker.lastUpdate)}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
});

