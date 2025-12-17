// Web stub for LocationMarker - returns null since web uses WebMapView with Leaflet markers
import React from 'react';
import { Platform } from 'react-native';

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

const LocationMarker = React.memo(function LocationMarker(_props: LocationMarkerProps) {
  // This should never be called on web, but return null as a safety measure
  if (Platform.OS === 'web') {
    return null;
  }
  return null;
});

export default LocationMarker;

