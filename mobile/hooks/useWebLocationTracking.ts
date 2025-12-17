import { useState, useEffect, useRef, useCallback } from 'react';
import ProfileService from '../services/profileService';

interface LocationData {
  latitude: number;
  longitude: number;
}

interface UseWebLocationTrackingOptions {
  enabled: boolean;
  onLocationUpdate?: (location: LocationData) => void;
  onError?: (error: string) => void;
}

interface UseWebLocationTrackingReturn {
  location: LocationData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Web-specific location tracking using browser geolocation API
 * - Minimum 30 seconds between updates
 * - Minimum 50 meters distance change
 */
export function useWebLocationTracking({
  enabled,
  onLocationUpdate,
  onError,
}: UseWebLocationTrackingOptions): UseWebLocationTrackingReturn {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const watchIdRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const lastLocationRef = useRef<LocationData | null>(null);
  const updatingRef = useRef(false);

  // Calculate distance between two coordinates in meters (Haversine formula)
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Update location to backend with throttling
  const updateLocation = useCallback(async (latitude: number, longitude: number, isInitial = false) => {
    const now = Date.now();
    const MIN_UPDATE_INTERVAL = 30000; // 30 seconds
    const MIN_DISTANCE_CHANGE = 50; // 50 meters

    // Check if we should skip this update
    if (!isInitial && lastLocationRef.current) {
      const distance = calculateDistance(
        lastLocationRef.current.latitude,
        lastLocationRef.current.longitude,
        latitude,
        longitude
      );

      // Skip if not enough time has passed AND not enough distance changed
      if (now - lastUpdateTimeRef.current < MIN_UPDATE_INTERVAL && distance < MIN_DISTANCE_CHANGE) {
        // Don't update state if location hasn't changed significantly
        return;
      }
    }

    // Prevent concurrent updates
    if (updatingRef.current) {
      return;
    }

    try {
      updatingRef.current = true;
      
      // Only show loading for initial update or significant changes
      if (isInitial || !lastLocationRef.current) {
        setLoading(true);
      }

      await ProfileService.updateLocation(latitude, longitude);
      
      const newLocation = { latitude, longitude };
      setLocation(newLocation);
      lastLocationRef.current = newLocation;
      lastUpdateTimeRef.current = now;

      if (onLocationUpdate) {
        onLocationUpdate(newLocation);
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to update location';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
      updatingRef.current = false;
    }
  }, [calculateDistance, onLocationUpdate, onError]);

  // Request permissions and start tracking
  useEffect(() => {
    if (!enabled) {
      // Stop tracking if disabled
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      const errorMsg = 'Geolocation is not supported by your browser';
      setError(errorMsg);
      if (onError) {
        onError(errorMsg);
      }
      return;
    }

    let mounted = true;

    const startTracking = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get initial location
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!mounted) return;
            const { latitude, longitude } = position.coords;
            updateLocation(latitude, longitude, true);
          },
          (err) => {
            if (!mounted) return;
            const errorMsg = 'Failed to get your location. Please enable location permissions.';
            setError(errorMsg);
            if (onError) {
              onError(errorMsg);
            }
            setLoading(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
          }
        );

        // Watch position for updates
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            if (!mounted) return;
            const { latitude, longitude } = position.coords;
            updateLocation(latitude, longitude, false);
          },
          (err) => {
            if (!mounted) return;
            console.error('Error watching location:', err);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
          }
        );
      } catch (err: any) {
        if (!mounted) return;
        const errorMessage = err?.message || 'Failed to start location tracking';
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
        setLoading(false);
      }
    };

    startTracking();

    return () => {
      mounted = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, updateLocation, onError]);

  return {
    location,
    loading,
    error,
  };
}

