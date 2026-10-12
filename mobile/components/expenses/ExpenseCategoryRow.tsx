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
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import { resolveMediaUrl } from '../../utils/mediaUrl';

function toNumber(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isNaN(n) ? 0 : n;
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

interface ExpenseCategoryRowProps {
  categoryName: string;
  items: Expense[];
  budget?: Budget | null;
  showBudgetLimit?: boolean;
  onEditBudget?: () => void;
  onItemPress?: (expense: Expense) => void;
  onItemDelete?: (expense: Expense) => void;
  onToggleItemPaid?: (expense: Expense, nextPaid: boolean) => void;
  paidToggleExpenseId?: number | null;
}

export default function ExpenseCategoryRow({
  categoryName,
  items,
  budget = null,
  showBudgetLimit = false,
  onEditBudget,
  onItemPress,
  onItemDelete,
  onToggleItemPaid,
  paidToggleExpenseId,
}: ExpenseCategoryRowProps) {
  const { colors } = useTheme();
  const { displayMoney } = useShowAmounts();
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

  const paidSpent = items.reduce(
    (sum, exp) => sum + (exp.is_paid !== false ? toNumber(exp.amount) : 0),
    0
  );
  const unpaidTotal = items.reduce(
    (sum, exp) => sum + (exp.is_paid === false ? toNumber(exp.amount) : 0),
    0
  );
  const limit = showBudgetLimit && budget ? toNumber(budget.amount) : 0;
  const percentageUsed = limit > 0 ? (paidSpent / limit) * 100 : 0;
  const barPct = Math.min(Math.max(percentageUsed, 0), 100);
  const isExceeded = showBudgetLimit && limit > 0 && percentageUsed > 100;
  const isOnBudget = showBudgetLimit && limit > 0 && percentageUsed >= 100 && !isExceeded;
  const isWarning =
    showBudgetLimit &&
    limit > 0 &&
    !isExceeded &&
    !isOnBudget &&
    percentageUsed >= (budget?.alert_threshold || 80);
  const statusColor = isExceeded
    ? '#ef4444'
    : isOnBudget || (showBudgetLimit && limit > 0 && !isWarning)
      ? '#10b981'
      : isWarning
        ? '#f59e0b'
        : colors.primary;
  const statusLabel = isExceeded
    ? 'Over'
    : isOnBudget
      ? 'On budget'
      : isWarning
        ? 'Near'
        : null;

  const sortedItems = [...items].sort((a, b) => a.expense_date.localeCompare(b.expense_date));

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.mainRow}>
        <TouchableOpacity
          style={styles.mainTap}
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${categoryName}, ${expanded ? 'collapse' : 'expand'} items`}
        >
          <FontAwesome
            name={expanded ? 'chevron-down' : 'chevron-right'}
            size={11}
            color={colors.textSecondary}
            style={styles.chevron}
          />
          <View style={styles.mainCopy}>
            <View style={styles.titleRow}>
              <Text style={[styles.category, { color: colors.text }]} numberOfLines={1}>
                {categoryName}
              </Text>
              {statusLabel ? (
                <View style={[styles.statusChip, { backgroundColor: `${statusColor}22` }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              ) : null}
            </View>
            {showBudgetLimit && limit > 0 ? (
              <>
                <View style={[styles.track, { backgroundColor: colors.border }]}>
                  <View
                    style={[styles.fill, { width: `${barPct}%`, backgroundColor: statusColor }]}
                  />
                </View>
                <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                  <Text style={{ color: statusColor, fontWeight: '700' }}>
                    {displayMoney(paidSpent)}
                  </Text>
                  {` / ${displayMoney(limit)} · ${Math.round(percentageUsed)}% · ${sortedItems.length} item${sortedItems.length === 1 ? '' : 's'}`}
                  {unpaidTotal > 0 ? ` · ${displayMoney(unpaidTotal)} unpaid` : ''}
                </Text>
              </>
            ) : (
              <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  {displayMoney(paidSpent)}
                </Text>
                {` paid · ${sortedItems.length} item${sortedItems.length === 1 ? '' : 's'}`}
                {unpaidTotal > 0 ? ` · ${displayMoney(unpaidTotal)} unpaid` : ''}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {onEditBudget && budget ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onEditBudget}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Edit ${categoryName} budget`}
          >
            <FontAwesome name="pencil" size={13} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {expanded ? (
        <View style={styles.items}>
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
                  <TouchableOpacity
                    style={styles.itemMain}
                    onPress={() => onItemPress?.(expense)}
                    activeOpacity={onItemPress ? 0.65 : 1}
                    disabled={!onItemPress}
                  >
                    <Text style={[styles.itemDesc, { color: colors.text }]} numberOfLines={1}>
                      {expense.description}
                    </Text>
                    <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                      {formatShortDate(expense.expense_date)}
                    </Text>
                  </TouchableOpacity>

                  {isGenerated ? (
                    <FontAwesome
                      name="refresh"
                      size={11}
                      color="#10b981"
                      style={styles.itemIcon}
                      accessibilityLabel="Recurring"
                    />
                  ) : null}
                  {!!itemReceiptUrl ? (
                    <TouchableOpacity
                      style={styles.itemIconBtn}
                      onPress={() => {
                        setImageLoading(true);
                        setReceiptExpense(expense);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="View receipt"
                    >
                      <FontAwesome name="file-image-o" size={12} color={colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                  {onToggleItemPaid ? (
                    <Switch
                      value={paid}
                      onValueChange={(value) => onToggleItemPaid(expense, value)}
                      disabled={paidToggleExpenseId === expense.id}
                      trackColor={{ false: colors.border, true: '#10b981' }}
                      thumbColor="#fff"
                      style={styles.paidSwitch}
                      accessibilityLabel={paid ? 'Paid' : 'Unpaid'}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.itemAmt,
                      { color: paid ? colors.primary : colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {displayMoney(expense.amount)}
                  </Text>
                  {onItemDelete ? (
                    <TouchableOpacity
                      style={styles.itemIconBtn}
                      onPress={() => onItemDelete(expense)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Delete expense"
                    >
                      <FontAwesome name="trash-o" size={13} color={colors.error || '#ef4444'} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      ) : null}

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
              {imageLoading ? (
                <ActivityIndicator
                  size="large"
                  color={colors.primary}
                  style={styles.receiptSpinner}
                />
              ) : null}
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
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  mainTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  chevron: { marginTop: 4, width: 12 },
  mainCopy: { flex: 1, gap: 5, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  category: { flex: 1, fontSize: 14, fontWeight: '700' },
  statusChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: { fontSize: 10, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: 3 },
  meta: { fontSize: 11, fontWeight: '500' },
  iconBtn: { padding: 6 },
  items: { marginTop: 4, marginLeft: 20 },
  emptyItems: { fontSize: 12, paddingVertical: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  itemDesc: { flexShrink: 1, fontSize: 13, fontWeight: '600' },
  itemMeta: { flexShrink: 0, fontSize: 11 },
  itemIcon: { marginHorizontal: 2 },
  itemIconBtn: { padding: 4 },
  paidSwitch: { transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] },
  itemAmt: {
    minWidth: 52,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  receiptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  receiptSheet: {
    borderRadius: 12,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  receiptTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  receiptBody: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  receiptSpinner: { position: 'absolute' },
  receiptImage: { width: '100%', height: 320 },
  receiptImageLoading: { opacity: 0.3 },
  receiptFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  receiptFooterBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
