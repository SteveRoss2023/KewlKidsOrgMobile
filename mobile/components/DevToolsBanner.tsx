import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, NativeModules, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

export default function DevToolsBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Only show banner in development, but NOT on web (web doesn't need it, mobile uses icon in header)
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
      const { Alert } = require('react-native');
      Alert.alert(
        'Open DevTools',
        'Shake your device and tap "Debug" to open DevTools on your PC.',
        [{ text: 'OK' }]
      );
    }
  };

  // Estimate tab bar height: ~49px on iOS, ~56px on Android, plus safe area insets
  const tabBarHeight = Platform.OS === 'ios' ? 49 : 56;
  const totalBottomOffset = tabBarHeight + insets.bottom;

  return (
    <View style={[
      styles.banner,
      {
        backgroundColor: colors.primary,
        bottom: totalBottomOffset,
        paddingBottom: 8,
      }
    ]}>
      <TouchableOpacity
        onPress={openDevTools}
        style={styles.button}
        activeOpacity={0.7}
      >
        <Text style={[styles.text, { color: '#fff' }]}>
          🛠️ Open DevTools
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 9999,
    ...Platform.select({
      android: {
        elevation: 8,
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
    }),
  },
  button: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});

