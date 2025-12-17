import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeAwarePicker from '../lists/ThemeAwarePicker';

export type MapType = 'standard' | 'satellite' | 'hybrid';

interface MapControlsProps {
  mapType: MapType;
  onMapTypeChange: (type: MapType) => void;
  locationSharingEnabled: boolean;
  onToggleLocationSharing: (enabled: boolean) => void;
  onResetView: () => void;
  updatingLocation?: boolean;
}

export default function MapControls({
  mapType,
  onMapTypeChange,
  locationSharingEnabled,
  onToggleLocationSharing,
  onResetView,
  updatingLocation = false,
}: MapControlsProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Location Sharing Toggle - Move to top */}
      <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.toggleContainer}
          onPress={() => onToggleLocationSharing(!locationSharingEnabled)}
          disabled={updatingLocation}
        >
          <View style={styles.toggleContent}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Share my location</Text>
            {updatingLocation && (
              <Text style={[styles.updatingText, { color: colors.textSecondary }]}>Updating...</Text>
            )}
          </View>
          <View
            style={[
              styles.toggleSwitch,
              locationSharingEnabled && { backgroundColor: colors.primary },
              !locationSharingEnabled && { backgroundColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                locationSharingEnabled && styles.toggleThumbActive,
                { backgroundColor: '#fff' },
              ]}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* Map Style Selector and Reset Button */}
      <View style={styles.row}>
        {/* Map Style Selector */}
        <View style={[styles.controlGroup, styles.pickerWrapper]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Map Style:</Text>
          <View style={styles.pickerContainer}>
            <ThemeAwarePicker
              selectedValue={mapType}
              onValueChange={(value) => onMapTypeChange(value as MapType)}
              options={[
                { label: 'Street', value: 'standard' },
                { label: 'Satellite', value: 'satellite' },
                { label: 'Hybrid', value: 'hybrid' },
              ]}
              placeholder="Select map style"
              enabled={true}
            />
          </View>
        </View>

        {/* Reset View Button */}
        <TouchableOpacity
          style={[styles.resetButton, { backgroundColor: colors.primary + '20', borderColor: colors.border }]}
          onPress={onResetView}
        >
          <FontAwesome name="home" size={18} color={colors.primary} />
          <Text style={[styles.resetButtonText, { color: colors.primary }]}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
    position: 'relative',
    zIndex: 100, // Ensure container is above map
    ...(Platform.OS !== 'web' ? {
      minHeight: 250, // Reserve space for dropdown on mobile only
      overflow: 'hidden', // Keep dropdown within container bounds on mobile
    } : {}),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  controlGroup: {
    flex: 1,
    minWidth: 0, // Allow flex to shrink
  },
  pickerWrapper: {
    position: 'relative',
    overflow: 'visible', // Allow dropdown to render within container
  },
  pickerContainer: {
    overflow: 'visible',
    zIndex: 1000, // High z-index for dropdown
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '500',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0, // Don't shrink the reset button
  },
  resetButtonText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleRow: {
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 0,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleContent: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  updatingText: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
});
