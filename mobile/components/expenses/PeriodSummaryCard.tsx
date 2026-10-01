import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { formatCurrency } from '../../utils/moneyInput';

interface PeriodSummaryCardProps {
  title: string;
  total: number;
  count: number;
  isCurrent?: boolean;
  onPress: () => void;
}

export default function PeriodSummaryCard({
  title,
  total,
  count,
  isCurrent = false,
  onPress,
}: PeriodSummaryCardProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isCurrent ? colors.primary : colors.border,
          borderLeftColor: isCurrent ? colors.primary : colors.border,
          borderLeftWidth: isCurrent ? 3 : StyleSheet.hairlineWidth,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatCurrency(total)}, ${count} expenses`}
    >
      <View style={styles.left}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {isCurrent && (
            <View style={[styles.badge, { backgroundColor: `${colors.primary}22` }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>Now</Text>
            </View>
          )}
        </View>
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {count} {count === 1 ? 'expense' : 'expenses'}
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={[styles.total, { color: colors.primary }]}>{formatCurrency(total)}</Text>
        <FontAwesome name="chevron-right" size={11} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  left: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  count: {
    fontSize: 12,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  total: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
