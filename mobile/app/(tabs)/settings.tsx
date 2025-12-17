import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import SettingsMenu, { SettingsMenuRef } from '../../components/SettingsMenu';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const settingsMenuRef = useRef<SettingsMenuRef>(null);

  // Open modal when screen is focused
  useFocusEffect(
    useCallback(() => {
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        settingsMenuRef.current?.openModal();
      }, 100);
      return () => clearTimeout(timer);
    }, [])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SettingsMenu 
        ref={settingsMenuRef}
        showButton={false} 
        autoOpen={true}
        onClose={() => {
          // Navigate back when modal is closed
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

