import { View, StyleSheet, Platform, Animated } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import SettingsMenu from '../../../components/SettingsMenu';
import { useEffect, useRef } from 'react';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Start from off-screen right
      slideAnim.setValue(1);
      // Animate to center
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [slideAnim]);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Platform.OS === 'web' ? 1000 : 0],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          transform: [{ translateX }],
        },
      ]}
    >
      <SettingsMenu />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

