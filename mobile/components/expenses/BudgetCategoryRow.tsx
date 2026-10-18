import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Budget } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';

function toNumber(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isNaN(n) ? 0 : n;
}

interface BudgetCategoryRowProps {
  budget: Budget;
  paidAmount?: number;
  unpaidAmount?: number;
  onEditBudget?: () => void;
  onDeleteBudget?: () => void;
}

export default function BudgetCategoryRow({
  budget,
  paidAmount,
  unpaidAmount,
  onEditBudget,
  onDeleteBudget,
}: BudgetCategoryRowProps) {
  const { colors } = useTheme();
  const { displayMoney } = useShowAmounts();

  const amount = toNumber(budget.amount);
  const standing =
    budget.base_amount != null && !Number.isNaN(Number(budget.base_amount))
      ? toNumber(budget.base_amount)
      : amount;
  const paid =
    paidAmount != null && !Number.isNaN(paidAmount)
      ? paidAmount
      : toNumber(budget.spent_amount);
  const unpaid = unpaidAmount != null && !Number.isNaN(unpaidAmount) ? unpaidAmount : 0;
  const committed = paid + unpaid;
  const remaining = amount - committed;
  const percentageUsed = amount > 0 ? (committed / amount) * 100 : committed > 0 ? 100 : 0;
  const isExceeded = percentageUsed > 100.005;
  const isOnBudget = Math.abs(remaining) <= 0.005 && amount > 0;
  const isWarning =
    !isExceeded && !isOnBudget && percentageUsed >= (budget.alert_threshold || 80);
  const statusColor = isExceeded
    ? '#ef4444'
    : isOnBudget
      ? '#10b981'
      : isWarning
        ? '#f59e0b'
        : '#10b981';
  const statusLabel = isExceeded
    ? 'Over'
    : isOnBudget
      ? 'On budget'
      : isWarning
        ? 'Near'
        : null;
  const origin = budget.origin || 'bills';
  const originLabel =
    origin === 'manual' ? 'Manual' : origin === 'analysis' ? 'Analysis' : 'From bills';
  const originColor =
    origin === 'manual'
      ? colors.primary || '#2563eb'
      : origin === 'analysis'
        ? '#7c3aed'
        : '#0f766e';
  const duesRaiseLimit = Math.abs(standing - amount) >= 0.005;
  const monthName = (m: number) =>
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] || '';
  const seasonLabel =
    budget.is_seasonal && budget.season_start_month && budget.season_end_month
      ? `${monthName(budget.season_start_month)}–${monthName(budget.season_end_month)} each year`
      : null;
  const unpaidColor = '#f59e0b';

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.body}>
        <View style={styles.line1}>
          <Text style={[styles.category, { color: colors.text }]} numberOfLines={1}>
            {budget.category_name}
          </Text>
          <View style={[styles.badge, { backgroundColor: `${originColor}18` }]}>
            <Text style={[styles.badgeText, { color: originColor }]}>{originLabel}</Text>
          </View>
          {seasonLabel ? (
            <View style={[styles.badge, { backgroundColor: `${colors.primary || '#2563eb'}18` }]}>
              <Text style={[styles.badgeText, { color: colors.primary || '#2563eb' }]}>{seasonLabel}</Text>
            </View>
          ) : null}
          {statusLabel ? (
            <View style={[styles.badge, { backgroundColor: `${statusColor}18` }]}>
              <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            {onEditBudget ? (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onEditBudget}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Edit ${budget.category_name} budget`}
              >
                <FontAwesome name="pencil" size={13} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
            {onDeleteBudget ? (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onDeleteBudget}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Delete ${budget.category_name} budget`}
              >
                <FontAwesome name="trash-o" size={14} color={colors.error || '#ef4444'} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <Text style={[styles.limitsMeta, { color: colors.textSecondary }]}>
          Standing {displayMoney(standing)}
          {' · This month '}
          <Text
            style={{
              color: duesRaiseLimit
                ? colors.primary || '#2563eb'
                : colors.textSecondary,
              fontWeight: duesRaiseLimit ? '700' : '500',
            }}
          >
            {displayMoney(amount)}
          </Text>
        </Text>

        <Text style={[styles.line3, { color: colors.textSecondary }]}>
          Paid <Text style={{ color: '#ef4444' }}>{displayMoney(paid)}</Text>
          {' · Unpaid '}
          <Text style={{ color: unpaidColor }}>{displayMoney(unpaid)}</Text>
          {' / '}
          <Text style={{ color: colors.primary }}>{displayMoney(amount)}</Text>
          {isExceeded
            ? ` · Over ${displayMoney(-remaining)}`
            : remaining > 0.005
              ? ` · ${displayMoney(remaining)} left`
              : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  body: { gap: 4 },
  line1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  category: { flex: 1, fontSize: 15, fontWeight: '800', minWidth: 0 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 },
  iconBtn: { padding: 5 },
  limitsMeta: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.85,
    fontVariant: ['tabular-nums'],
  },
  line3: { fontSize: 13, fontWeight: '500' },
});
