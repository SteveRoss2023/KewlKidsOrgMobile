import React from 'react';
import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface VoiceButtonProps {
  onPress: () => void;
  isListening?: boolean;
  disabled?: boolean;
  size?: number;
}

export default function VoiceButton({
  onPress,
  isListening = false,
  disabled = false,
  size = 24,
}: VoiceButtonProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: isListening ? colors.error || '#ef4444' : colors.primary,
          opacity: disabled ? 0.5 : 1,
        },
        isListening && styles.listening,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel="Voice Command"
      accessibilityHint="Press to start or stop voice recognition"
    >
      <FontAwesome
        name="microphone"
        size={size}
        color="#fff"
        style={isListening ? styles.pulsing : undefined}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  listening: {
    transform: [{ scale: 1.1 }],
  },
  pulsing: {
    // Animation would be handled by Animated API if needed
  },
});



