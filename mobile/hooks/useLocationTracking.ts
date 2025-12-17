import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import ProfileService from '../services/profileService';

interface LocationData {
  latitude: number;
  longitude: number;
}

interface UseLocationTrackingOptions {
  enabled: boolean;
  onLocationUpdate?: (location: LocationData) => void;
  onError?: (error: string) => void;
}

interface UseLocationTrackingReturn {
  location: LocationData | null;
  loading: boolean;
  error: string | null;
  permissionStatus: Location.PermissionStatus | null;
}

/**
 * Custom hook for location tracking with throttling
 * - Minimum 30 seconds between updates
 * - Minimum 50 meters distance change
 */
export function useLocationTracking({
  enabled,
  onLocationUpdate,
  onError,
}: UseLocationTrackingOptions): UseLocationTrackingReturn {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  
  const watchSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
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
        // This prevents marker flashing from minor GPS fluctuations
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
      if (watchSubscriptionRef.current) {
        watchSubscriptionRef.current.remove();
        watchSubscriptionRef.current = null;
      }
      return;
    }

    let mounted = true;

    const startTracking = async () => {
      try {
        setLoading(true);
        setError(null);

        // Request permissions
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        setPermissionStatus(foregroundStatus);

        if (foregroundStatus !== 'granted') {
          const errorMsg = 'Location permission denied. Please enable location permissions in settings.';
          setError(errorMsg);
          if (onError) {
            onError(errorMsg);
          }
          setLoading(false);
          return;
        }

        // Request background permissions (optional, for better tracking)
        await Location.requestBackgroundPermissionsAsync();

        // Get initial location
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (!mounted) return;

        const { latitude, longitude } = initialLocation.coords;
        await updateLocation(latitude, longitude, true);

        // Watch position for updates
        // Use longer intervals to reduce updates and prevent marker flashing
        watchSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced, // Use balanced instead of high to reduce GPS jitter
            timeInterval: 30000, // Update every 30 seconds (reduced from 60)
            distanceInterval: 25, // Update every 25 meters (reduced from 50 to catch movement but still throttle)
          },
          (position) => {
            if (!mounted) return;
            const { latitude, longitude } = position.coords;
            updateLocation(latitude, longitude, false);
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
      if (watchSubscriptionRef.current) {
        watchSubscriptionRef.current.remove();
        watchSubscriptionRef.current = null;
      }
    };
  }, [enabled, updateLocation, onError]);

  return {
    location,
    loading,
    error,
    permissionStatus,
  };
}
