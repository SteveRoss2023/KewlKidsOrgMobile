/**
 * Badge component for displaying unread message counts.
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface MessageBadgeProps {
  count: number;
  style?: ViewStyle;
}

export default function MessageBadge({ count, style }: MessageBadgeProps) {
  const { colors } = useTheme();

  // Don't render if count is 0
  if (count <= 0) {
    return null;
  }

  // Format count display
  const displayCount = count > 99 ? '99+' : count.toString();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.error || '#ef4444' },
        style,
      ]}
    >
      <Text style={styles.badgeText}>{displayCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});

