import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Budget } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import { formatCurrency } from '../../utils/moneyInput';

interface BudgetCardProps {
  budget: Budget;
  onPress?: () => void;
  onDelete?: () => void;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isNaN(n) ? 0 : n;
}

function periodLabel(period: Budget['period']): string {
  if (period === 'daily') return 'Daily';
  if (period === 'weekly') return 'Weekly';
  if (period === 'yearly') return 'Yearly';
  return 'Monthly';
}

export default function BudgetCard({ budget, onPress, onDelete }: BudgetCardProps) {
  const { colors } = useTheme();

  const amount = toNumber(budget.amount);
  const spent = toNumber(budget.spent_amount);
  const remaining = toNumber(budget.remaining_amount);
  const percentageUsed = toNumber(budget.percentage_used);
  const percentage = Math.min(percentageUsed, 100);
  const isExceeded = percentageUsed > 100;
  const isOnBudget = percentageUsed >= 100 && !isExceeded;
  const isWarning = percentageUsed >= budget.alert_threshold && !isExceeded && !isOnBudget;

  const statusColor = isExceeded
    ? '#ef4444'
    : isOnBudget
      ? '#10b981'
      : isWarning
        ? '#f59e0b'
        : colors.primary;
  const statusLabel = isExceeded
    ? 'Over'
    : isOnBudget
      ? 'On budget'
      : isWarning
        ? 'Near limit'
        : null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${budget.category_name}, ${formatCurrency(spent)} of ${formatCurrency(amount)}`}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.category, { color: colors.text }]} numberOfLines={2}>
            {budget.category_name}
          </Text>
          <Text style={[styles.period, { color: colors.textSecondary }]} numberOfLines={1}>
            {periodLabel(budget.period)}
          </Text>
        </View>
        {onDelete && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Delete budget"
          >
            <FontAwesome name="trash-o" size={13} color={colors.error || '#ef4444'} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.amount, { color: colors.primary }]} numberOfLines={1}>
        {formatCurrency(spent)}
        <Text style={[styles.amountDivider, { color: colors.textSecondary }]}> / </Text>
        {formatCurrency(amount)}
      </Text>

      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${percentage}%`,
              backgroundColor: statusColor,
            },
          ]}
        />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
          {percentageUsed.toFixed(0)}% · {formatCurrency(remaining)} left
        </Text>
        {statusLabel ? (
          <View style={[styles.statusChip, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
    gap: 5,
    minHeight: 110,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  category: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  period: {
    fontSize: 10,
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 2,
    marginTop: -2,
    marginRight: -2,
  },
  amount: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  amountDivider: {
    fontWeight: '500',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  footer: {
    gap: 4,
  },
  meta: {
    fontSize: 10,
    fontWeight: '500',
  },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
  },
});
