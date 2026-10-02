import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Budget, Expense } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import { formatCurrency } from '../../utils/moneyInput';

interface BudgetCardProps {
  budget: Budget;
  /** Expenses in this category for the viewed period */
  items?: Expense[];
  /** Override period label under the category name */
  subtitle?: string;
  /** When false, show paid total only (no / budget). Default true. */
  showBudgetLimit?: boolean;
  /** Prefer paid sum from items over budget.spent_amount. Default true when items provided. */
  useItemsForSpent?: boolean;
  onPress?: () => void;
  onDelete?: () => void;
  onItemPress?: (expense: Expense) => void;
  /** When set, each item shows a paid/unpaid switch (expenses tab only). */
  onToggleItemPaid?: (expense: Expense, nextPaid: boolean) => void;
  paidToggleExpenseId?: number | null;
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

function formatShortDate(dateString: string): string {
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

export default function BudgetCard({
  budget,
  items = [],
  subtitle,
  showBudgetLimit = true,
  useItemsForSpent,
  onPress,
  onDelete,
  onItemPress,
  onToggleItemPaid,
  paidToggleExpenseId,
}: BudgetCardProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const preferItemsSpent = useItemsForSpent ?? items.length > 0;
  const spentFromItems = items.reduce(
    (sum, exp) => sum + (exp.is_paid !== false ? toNumber(exp.amount) : 0),
    0
  );
  const spent = preferItemsSpent ? spentFromItems : toNumber(budget.spent_amount);
  const amount = toNumber(budget.amount);
  const remaining = showBudgetLimit ? amount - spent : 0;
  const percentageUsed = showBudgetLimit && amount > 0 ? (spent / amount) * 100 : 0;
  const percentage = Math.min(percentageUsed, 100);
  const isExceeded = showBudgetLimit && percentageUsed > 100;
  const isOnBudget = showBudgetLimit && percentageUsed >= 100 && !isExceeded;
  const isWarning =
    showBudgetLimit &&
    percentageUsed >= budget.alert_threshold &&
    !isExceeded &&
    !isOnBudget;

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

  const sortedItems = [...items].sort((a, b) => a.expense_date.localeCompare(b.expense_date));

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerText}
          onPress={onPress}
          activeOpacity={0.7}
          disabled={!onPress}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={onPress ? `Edit ${budget.category_name}` : undefined}
        >
          <Text style={[styles.category, { color: colors.text }]} numberOfLines={2}>
            {budget.category_name}
          </Text>
          <Text style={[styles.period, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle ?? periodLabel(budget.period)}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {onPress && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={onPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Edit budget"
            >
              <FontAwesome name="pencil" size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={onDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Delete budget"
            >
              <FontAwesome name="trash-o" size={13} color={colors.error || '#ef4444'} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={[styles.amount, { color: colors.primary }]} numberOfLines={1}>
        {formatCurrency(spent)}
        {showBudgetLimit ? (
          <Text style={[styles.amountDivider, { color: colors.textSecondary }]}>
            {' / '}
            {formatCurrency(amount)}
          </Text>
        ) : null}
      </Text>

      {showBudgetLimit ? (
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
      ) : null}

      <View style={styles.footer}>
        <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
          {showBudgetLimit
            ? `${percentageUsed.toFixed(0)}% · ${formatCurrency(remaining)} left`
            : `${sortedItems.length} ${sortedItems.length === 1 ? 'expense' : 'expenses'}`}
        </Text>
        {statusLabel ? (
          <View style={[styles.statusChip, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.expandToggle, { borderTopColor: colors.border }]}
        onPress={() => setExpanded((open) => !open)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded
            ? `Hide ${sortedItems.length} expenses`
            : `Show ${sortedItems.length} expenses`
        }
      >
        <FontAwesome
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={10}
          color={colors.textSecondary}
        />
        <Text style={[styles.expandToggleText, { color: colors.primary }]}>
          {sortedItems.length} {sortedItems.length === 1 ? 'item' : 'items'}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.itemsList}>
          {sortedItems.length === 0 ? (
            <Text style={[styles.emptyItems, { color: colors.textSecondary }]}>
              No expenses this period
            </Text>
          ) : (
            sortedItems.map((expense) => {
              const paid = expense.is_paid !== false;
              return (
                <View
                  key={expense.id}
                  style={[styles.itemRow, { borderTopColor: colors.border }]}
                >
                  <TouchableOpacity
                    onPress={() => onItemPress?.(expense)}
                    activeOpacity={onItemPress ? 0.65 : 1}
                    disabled={!onItemPress}
                  >
                    <Text style={[styles.itemDesc, { color: colors.text }]} numberOfLines={2}>
                      {expense.description}
                    </Text>
                    <Text style={[styles.itemMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {formatShortDate(expense.expense_date)}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.itemSecondLine}>
                    {onToggleItemPaid ? (
                      <View style={styles.itemPaidWrap}>
                        <Text
                          style={[
                            styles.itemPaidLabel,
                            { color: paid ? '#10b981' : colors.textSecondary },
                          ]}
                        >
                          {paid ? 'Paid' : 'Unpaid'}
                        </Text>
                        <Switch
                          value={paid}
                          onValueChange={(value) => onToggleItemPaid(expense, value)}
                          disabled={paidToggleExpenseId === expense.id}
                          trackColor={{ false: colors.border, true: '#10b981' }}
                          thumbColor="#fff"
                          style={styles.itemPaidSwitch}
                        />
                      </View>
                    ) : (
                      <Text
                        style={[
                          styles.itemPaidLabel,
                          { color: paid ? colors.textSecondary : colors.textSecondary },
                        ]}
                      >
                        {paid ? '' : 'Unpaid'}
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.itemAmt,
                        { color: paid ? colors.primary : colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {formatCurrency(expense.amount)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 4,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
  iconBtn: {
    padding: 4,
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
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    paddingBottom: 4,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemsList: {
    paddingBottom: 4,
  },
  emptyItems: {
    fontSize: 10,
    paddingVertical: 4,
  },
  itemRow: {
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemDesc: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  itemMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  itemSecondLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemPaidWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  itemPaidLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  itemPaidSwitch: {
    transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }],
  },
  itemAmt: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
    textAlign: 'right',
  },
});
