import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  Image,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Budget, Expense } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import { formatCurrency } from '../../utils/moneyInput';
import { resolveMediaUrl } from '../../utils/mediaUrl';

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
  onItemDelete?: (expense: Expense) => void;
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
  onItemDelete,
  onToggleItemPaid,
  paidToggleExpenseId,
}: BudgetCardProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [receiptExpense, setReceiptExpense] = useState<Expense | null>(null);
  const [imageLoading, setImageLoading] = useState(true);

  const receiptUrl = resolveMediaUrl(receiptExpense?.receipt_url);

  useEffect(() => {
    if (!receiptExpense || !receiptUrl) return;
    setImageLoading(true);
    const t = setTimeout(() => setImageLoading(false), 1500);
    return () => clearTimeout(t);
  }, [receiptExpense, receiptUrl]);

  const openReceiptExternally = async () => {
    if (!receiptUrl) return;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(receiptUrl, '_blank');
      } else {
        await Linking.openURL(receiptUrl);
      }
    } catch {
      // ignore
    }
  };

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
              const isGenerated = !!(expense.is_recurring && expense.recurring_expense);
              const itemReceiptUrl = resolveMediaUrl(expense.receipt_url);
              return (
                <View
                  key={expense.id}
                  style={[styles.itemRow, { borderTopColor: colors.border }]}
                >
                  <View style={styles.itemTopRow}>
                    <TouchableOpacity
                      style={styles.itemMain}
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
                    {onItemDelete && (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => onItemDelete(expense)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Delete expense"
                      >
                        <FontAwesome name="trash-o" size={14} color={colors.error || '#ef4444'} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {(isGenerated || !!itemReceiptUrl) && (
                    <View style={styles.itemChips}>
                      {isGenerated && (
                        <View style={[styles.itemChip, { backgroundColor: '#10b98122' }]}>
                          <FontAwesome name="refresh" size={8} color="#10b981" />
                          <Text style={[styles.itemChipText, { color: '#10b981' }]}>Recurring</Text>
                        </View>
                      )}
                      {!!itemReceiptUrl && (
                        <TouchableOpacity
                          style={[styles.itemChip, styles.receiptChip]}
                          onPress={() => {
                            setImageLoading(true);
                            setReceiptExpense(expense);
                          }}
                          accessibilityLabel="View receipt"
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <FontAwesome name="file-image-o" size={8} color="#fff" />
                          <Text style={styles.receiptChipText}>Receipt</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

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
                      <Text style={[styles.itemPaidLabel, { color: colors.textSecondary }]}>
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

      <Modal
        visible={!!receiptExpense}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptExpense(null)}
      >
        <View style={styles.receiptOverlay}>
          <View style={[styles.receiptSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.receiptHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.receiptTitle, { color: colors.text }]} numberOfLines={1}>
                Receipt — {receiptExpense?.description}
              </Text>
              <TouchableOpacity
                onPress={() => setReceiptExpense(null)}
                accessibilityLabel="Close receipt"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.receiptBody}>
              {imageLoading && (
                <ActivityIndicator
                  size="large"
                  color={colors.primary}
                  style={styles.receiptSpinner}
                />
              )}
              {receiptUrl ? (
                <Image
                  source={{ uri: receiptUrl }}
                  style={[styles.receiptImage, imageLoading && styles.receiptImageLoading]}
                  resizeMode="contain"
                  onLoad={() => setImageLoading(false)}
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => setImageLoading(false)}
                />
              ) : null}
            </View>
            <View style={[styles.receiptFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.receiptFooterBtn, { borderColor: colors.border }]}
                onPress={() => setReceiptExpense(null)}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.receiptFooterBtn, { backgroundColor: colors.primary }]}
                onPress={() => void openReceiptExternally()}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Open full size</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
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
  itemChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemChipText: {
    fontSize: 9,
    fontWeight: '700',
  },
  receiptChip: {
    backgroundColor: '#0ea5e9',
  },
  receiptChipText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
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
  receiptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  receiptSheet: {
    borderRadius: 12,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  receiptTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  receiptBody: {
    minHeight: 280,
    maxHeight: Platform.OS === 'web' ? 520 : 420,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  receiptSpinner: {
    position: 'absolute',
    zIndex: 1,
  },
  receiptImage: {
    width: '100%',
    height: '100%',
    minHeight: 280,
  },
  receiptImageLoading: {
    opacity: 0.35,
  },
  receiptFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
  receiptFooterBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
