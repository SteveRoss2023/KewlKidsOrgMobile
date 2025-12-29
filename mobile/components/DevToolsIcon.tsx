import React from 'react';
import { TouchableOpacity, StyleSheet, Platform, NativeModules, DeviceEventEmitter, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export default function DevToolsIcon() {
  const { colors } = useTheme();

  // Only show in development and on mobile
  if (!__DEV__ || Platform.OS === 'web') {
    return null;
  }

  const openDevTools = () => {
    try {
      // Try to open dev menu programmatically
      const { DevMenu } = NativeModules;
      if (DevMenu && typeof DevMenu.show === 'function') {
        DevMenu.show();
        return;
      }

      // Try using DeviceEventEmitter to trigger dev menu
      DeviceEventEmitter.emit('RCTDevMenuShown');

      // Fallback: Try to enable remote debugging if available
      const { DevSettings } = NativeModules;
      if (DevSettings) {
        // Try any available method
        if (typeof DevSettings.reload === 'function') {
          // Reload might trigger the banner
          DevSettings.reload();
        }
      }
    } catch (err) {
      console.error('Failed to open dev menu:', err);
      // Show instructions as fallback
      Alert.alert(
        'Open DevTools',
        'Shake your device and tap "Debug" to open DevTools on your PC.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <TouchableOpacity
      onPress={openDevTools}
      style={[styles.iconButton, { borderColor: colors.border }]}
      activeOpacity={0.7}
    >
      <FontAwesome name="wrench" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
  },
});


