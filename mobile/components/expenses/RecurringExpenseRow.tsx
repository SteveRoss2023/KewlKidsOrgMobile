import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { RecurringExpense } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import { formatCurrency } from '../../utils/moneyInput';

interface RecurringExpenseRowProps {
  recurring: RecurringExpense;
  /** Overrides the date shown on the second line. */
  dateLabel?: string;
  badge?: { label: string; color: string } | null;
  onPress?: () => void;
  onDelete?: () => void;
}

function formatDate(dateString: string): string {
  try {
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatOccurrenceDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RecurringExpenseRow({
  recurring,
  dateLabel,
  badge,
  onPress,
  onDelete,
}: RecurringExpenseRowProps) {
  const { colors } = useTheme();
  const frequency =
    recurring.frequency.charAt(0).toUpperCase() + recurring.frequency.slice(1);
  const metaParts = [
    frequency,
    dateLabel ?? formatDate(recurring.next_due_date),
    recurring.category_name || null,
  ].filter(Boolean);

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.65}
      accessibilityRole="button"
      accessibilityLabel={`${recurring.description}, ${formatCurrency(recurring.amount)}, ${frequency}`}
    >
      <View style={styles.main}>
        <View style={styles.topLine}>
          <Text style={[styles.description, { color: colors.text }]} numberOfLines={1}>
            {recurring.description}
          </Text>
          <Text style={[styles.amount, { color: colors.primary }]}>
            {formatCurrency(recurring.amount)}
          </Text>
        </View>

        <View style={styles.bottomLine}>
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {metaParts.join(' · ')}
          </Text>
          <View style={styles.chips}>
            <View
              style={[
                styles.chip,
                { backgroundColor: recurring.is_active ? '#10b98122' : '#6b728022' },
              ]}
            >
              <Text style={[styles.chipText, { color: recurring.is_active ? '#10b981' : '#6b7280' }]}>
                {recurring.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
            {badge ? (
              <View style={[styles.chip, { backgroundColor: badge.color }]}>
                <Text style={styles.badgeText}>{badge.label}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {onDelete ? (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            onDelete();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          accessibilityLabel="Delete recurring expense"
        >
          <FontAwesome name="trash-o" size={16} color={colors.error || '#ef4444'} />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  description: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 18,
  },
  meta: {
    flexShrink: 1,
    fontSize: 12,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  deleteBtn: {
    paddingLeft: 10,
    paddingVertical: 8,
  },
});
