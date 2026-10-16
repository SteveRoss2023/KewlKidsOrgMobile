import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { RecurringExpense } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import { isPhoneMoneyLayout } from './phoneMoneyLayout';

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
  const { displayMoney } = useShowAmounts();
  const { width: windowWidth } = useWindowDimensions();
  const amountText = displayMoney(recurring.amount);
  const statusLabel = recurring.is_active ? 'Active' : 'Inactive';
  const statusColor = recurring.is_active ? '#10b981' : colors.error || '#ef4444';
  const phone = isPhoneMoneyLayout(windowWidth);
  const nameRoom =
    windowWidth - 36 - (onDelete ? 34 : 0) - amountText.length * 8.5 - 16;
  const statusWordWidth = statusLabel.length * 7 + 16;
  const showStatusDot =
    phone && recurring.description.length * 7.5 + statusWordWidth > nameRoom;
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const frequency =
    recurring.frequency.charAt(0).toUpperCase() + recurring.frequency.slice(1);
  const isSeasonal =
    !!recurring.is_seasonal &&
    recurring.season_start_month != null &&
    recurring.season_end_month != null;
  const seasonLabel = isSeasonal
    ? `${monthNames[recurring.season_start_month! - 1]}–${monthNames[recurring.season_end_month! - 1]}`
    : null;
  const startLabel = formatDate(recurring.start_date);
  const endLabel = recurring.end_date ? formatDate(recurring.end_date) : 'no end';

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.65}
      accessibilityRole="button"
      accessibilityLabel={`${recurring.description}, ${statusLabel}, ${amountText}, ${frequency}${seasonLabel ? `, seasonal ${seasonLabel}` : ''}`}
    >
      <View style={styles.main}>
        <View style={styles.topLine}>
          <View style={styles.nameRow}>
            <Text style={[styles.description, { color: colors.text }]} numberOfLines={1}>
              {recurring.description}
            </Text>
            {showStatusDot ? (
              <View
                style={[styles.statusDot, { backgroundColor: statusColor }]}
                accessibilityLabel={statusLabel}
              />
            ) : (
              <View style={[styles.chip, { backgroundColor: `${statusColor}22` }]}>
                <Text style={[styles.chipText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.amount, { color: colors.primary }]}>
            {amountText}
          </Text>
        </View>

        <View style={styles.details}>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {frequency}
            {dateLabel ? ` · due ${dateLabel}` : ''}
            {` · ${startLabel} – ${endLabel}`}
          </Text>
          {isSeasonal ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Seasonal {seasonLabel}
            </Text>
          ) : null}
          {badge ? (
            <View style={styles.chips}>
              <View style={[styles.chip, { backgroundColor: badge.color }]}>
                <Text style={styles.badgeText}>{badge.label}</Text>
              </View>
            </View>
          ) : null}
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
    alignItems: 'flex-start',
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
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  nameRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  details: { gap: 2 },
  meta: {
    fontSize: 12,
    lineHeight: 16,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  chip: {
    flexShrink: 0,
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
    paddingTop: 8,
    paddingBottom: 8,
  },
});
