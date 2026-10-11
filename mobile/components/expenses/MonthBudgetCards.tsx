import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import expenseService from '../../services/expenseService';
import { Budget, Expense } from '../../types/expenses';
import BudgetCard from './BudgetCard';
import AlertModal from '../AlertModal';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function monthRange(year: number, monthIndex: number): { start: string; end: string } {
  const start = `${monthKey(year, monthIndex)}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const end = `${monthKey(year, monthIndex)}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function toAmt(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

function progressColor(percentageUsed: number, alertThreshold = 80): string {
  if (percentageUsed > 100) return '#ef4444';
  // Exactly on budget (e.g. 1850/1850) counts as green.
  if (percentageUsed >= 100) return '#10b981';
  if (percentageUsed >= alertThreshold) return '#f59e0b';
  return '#10b981';
}

function gridColumns(width: number): number {
  if (width < 700) return 2;
  if (width < 1100) return 3;
  return 4;
}

/** Pick a font size so `text` fits on one line inside `maxWidth` (bold tabular nums). */
function fitFontSize(text: string, maxWidth: number, maxSize = 15, minSize = 9): number {
  const usable = Math.max(maxWidth, 40);
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    // Bold tabular figures are ~0.62× fontSize wide on average.
    if (text.length * size * 0.62 <= usable) return size;
  }
  return minSize;
}

/** Current-month highlight — warm amber, distinct from primary blue. */
const CURRENT_MONTH_ACCENT = '#f59e0b';

interface MonthBudgetCardsProps {
  onExpensePress?: (expense: Expense) => void;
  onBudgetPress?: (budget: Budget) => void;
  onBudgetDelete?: (budget: Budget) => void | Promise<void>;
  refreshKey?: number;
}

export default function MonthBudgetCards({
  onExpensePress,
  onBudgetPress,
  onBudgetDelete,
  refreshKey = 0,
}: MonthBudgetCardsProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const { width: windowWidth } = useWindowDimensions();
  const columns = gridColumns(windowWidth);
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [budgetsByMonth, setBudgetsByMonth] = useState<Record<string, Budget[]>>({});
  const [expensesByMonth, setExpensesByMonth] = useState<Record<string, Expense[]>>({});
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(() => new Set());
  const [yearLoading, setYearLoading] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState<number | null>(null);
  const [paidToggleId, setPaidToggleId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [budgetPendingDelete, setBudgetPendingDelete] = useState<Budget | null>(null);

  const loadYear = useCallback(
    async (y: number) => {
      if (!selectedFamily) return;
      setYearLoading(true);
      setError('');
      try {
        const results = await Promise.all(
          Array.from({ length: 12 }, async (_, monthIndex) => {
            const key = monthKey(y, monthIndex);
            const asOf = `${key}-01`;
            const data = await expenseService.getBudgets(selectedFamily.id, true, { asOf });
            return [key, data] as const;
          })
        );
        const next: Record<string, Budget[]> = {};
        for (const [key, data] of results) {
          next[key] = data;
        }
        setBudgetsByMonth(next);
      } catch (err: any) {
        setError(err.message || 'Failed to load budgets');
      } finally {
        setYearLoading(false);
      }
    },
    [selectedFamily]
  );

  const fetchMonthExpenses = useCallback(
    async (monthIndex: number, y: number) => {
      if (!selectedFamily) return;
      const key = monthKey(y, monthIndex);
      setLoadingMonth(monthIndex);
      try {
        const { start, end } = monthRange(y, monthIndex);
        const data = await expenseService.getExpenses(selectedFamily.id, {
          start_date: start,
          end_date: end,
        });
        setExpensesByMonth((prev) => ({ ...prev, [key]: data }));
      } catch (err: any) {
        setError(err.message || 'Failed to load expenses');
      } finally {
        setLoadingMonth(null);
      }
    },
    [selectedFamily]
  );

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) return;
      setExpensesByMonth({});
      setExpandedMonths(new Set());
      void loadYear(year);
    }, [selectedFamily?.id, year, loadYear, refreshKey])
  );

  const toggleMonth = (monthIndex: number) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthIndex)) {
        next.delete(monthIndex);
      } else {
        next.add(monthIndex);
        const key = monthKey(year, monthIndex);
        if (!expensesByMonth[key]) {
          void fetchMonthExpenses(monthIndex, year);
        }
      }
      return next;
    });
  };

  const handleTogglePaid = async (expense: Expense, nextPaid: boolean) => {
    setPaidToggleId(expense.id);
    try {
      const updated = await expenseService.updateExpense(expense.id, { is_paid: nextPaid });
      setExpensesByMonth((prev) => {
        const next: Record<string, Expense[]> = {};
        for (const [key, list] of Object.entries(prev)) {
          next[key] = list.map((e) => (e.id === updated.id ? updated : e));
        }
        return next;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to update paid status');
    } finally {
      setPaidToggleId(null);
    }
  };

  const months = useMemo(() => MONTH_NAMES.map((name, index) => ({ name, index })), []);
  const isCurrentYear = year === now.getFullYear();
  const currentMonthIndex = now.getMonth();

  const visibleMonths = useMemo(() => {
    return months.filter(({ index }) => {
      const key = monthKey(year, index);
      const budgets = budgetsByMonth[key];
      if (budgets === undefined) return true;
      if (expandedMonths.has(index)) return true;
      return budgets.length > 0;
    });
  }, [months, year, budgetsByMonth, expandedMonths]);

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  const colWidth = `${100 / columns}%` as `${number}%`;

  return (
    <>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {error ? (
        <Text style={[styles.error, { color: colors.error || '#c0392b' }]}>{error}</Text>
      ) : null}

      <View style={[styles.yearRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          style={styles.yearArrow}
          onPress={() => setYear((y) => y - 1)}
          accessibilityLabel="Previous year"
        >
          <FontAwesome name="chevron-left" size={14} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.yearLabel, { color: colors.text }]}>{year}</Text>
        <TouchableOpacity
          style={styles.yearArrow}
          onPress={() => setYear((y) => y + 1)}
          accessibilityLabel="Next year"
        >
          <FontAwesome name="chevron-right" size={14} color={colors.text} />
        </TouchableOpacity>
      </View>

      {yearLoading && Object.keys(budgetsByMonth).length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : null}

      <View style={styles.monthGrid}>
        {visibleMonths.map(({ name, index }) => {
          const key = monthKey(year, index);
          const budgets = budgetsByMonth[key] || [];
          const expenses = expensesByMonth[key] || [];
          const monthOpen = expandedMonths.has(index);
          const spanFull = monthOpen;
          const isCurrentMonth = isCurrentYear && index === currentMonthIndex;

          const spentByCategory = new Map<number, number>();
          for (const exp of expenses) {
            if (exp.is_paid === false) continue;
            spentByCategory.set(
              exp.category,
              (spentByCategory.get(exp.category) || 0) + toAmt(exp.amount)
            );
          }

          const totalLimit = budgets.reduce((s, b) => s + toAmt(b.amount), 0);
          const totalSpent = budgets.reduce((s, b) => {
            if (expensesByMonth[key] != null) {
              return s + (spentByCategory.get(b.category) || 0);
            }
            return s + toAmt(b.spent_amount);
          }, 0);

          const pct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
          const barPct = Math.min(pct, 100);
          const statusColor = progressColor(pct);
          const remaining = totalLimit - totalSpent;

          // Card inner width for amount line (grid pad + card pad + chevron).
          const amountMaxWidth =
            windowWidth / (spanFull ? 1 : columns) - 8 - 24 - 20;
          const spentLabel = displayMoney(totalSpent);
          const limitLabel = displayMoney(totalLimit);
          const amountsText = `${spentLabel} / ${limitLabel}`;
          const amountFontSize = fitFontSize(amountsText, amountMaxWidth, 15, 9);
          const metaLabel =
            totalLimit > 0
              ? `${pct.toFixed(0)}% · ${displayMoney(remaining)} left`
              : `${budgets.length} categories`;
          const metaFontSize = fitFontSize(metaLabel, amountMaxWidth, 11, 8);

          const sortedBudgets = [...budgets].sort((a, b) =>
            (a.category_name || '').localeCompare(b.category_name || '', undefined, {
              sensitivity: 'base',
            })
          );

          return (
            <View
              key={key}
              style={[
                styles.monthGridItem,
                { width: spanFull ? '100%' : colWidth },
              ]}
            >
              <View
                style={[
                  styles.monthCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: isCurrentMonth ? CURRENT_MONTH_ACCENT : colors.border,
                    borderWidth: isCurrentMonth ? 2 : StyleSheet.hairlineWidth,
                  },
                  isCurrentMonth && styles.monthCardCurrent,
                ]}
              >
                <TouchableOpacity
                  style={styles.monthHeader}
                  onPress={() => toggleMonth(index)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: monthOpen }}
                  accessibilityLabel={
                    isCurrentMonth ? `${name}, current month` : name
                  }
                >
                  <FontAwesome
                    name={monthOpen ? 'chevron-down' : 'chevron-right'}
                    size={12}
                    color={isCurrentMonth ? CURRENT_MONTH_ACCENT : colors.textSecondary}
                  />
                  <View style={styles.monthHeaderText}>
                    <View style={styles.monthTitleRow}>
                      <Text
                        style={[
                          styles.monthName,
                          { color: colors.text },
                          isCurrentMonth && { color: CURRENT_MONTH_ACCENT },
                        ]}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                      {isCurrentMonth ? (
                        <View
                          style={[
                            styles.nowChip,
                            { backgroundColor: `${CURRENT_MONTH_ACCENT}33` },
                          ]}
                        >
                          <Text style={[styles.nowChipText, { color: CURRENT_MONTH_ACCENT }]}>
                            Now
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.monthAmounts,
                        { color: colors.primary, fontSize: amountFontSize },
                      ]}
                      numberOfLines={1}
                    >
                      {spentLabel}
                      <Text style={{ color: colors.textSecondary }}>
                        {' / '}
                        {limitLabel}
                      </Text>
                    </Text>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${barPct}%`, backgroundColor: statusColor },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.monthMeta,
                        { color: colors.textSecondary, fontSize: metaFontSize },
                      ]}
                      numberOfLines={1}
                    >
                      {metaLabel}
                    </Text>
                  </View>
                </TouchableOpacity>

                {monthOpen && (
                  <View style={[styles.monthBody, { borderTopColor: colors.border }]}>
                    {loadingMonth === index && !expensesByMonth[key] ? (
                      <ActivityIndicator
                        color={colors.primary}
                        style={{ marginVertical: 16 }}
                      />
                    ) : sortedBudgets.length === 0 ? (
                      <Text style={[styles.empty, { color: colors.textSecondary }]}>
                        No budgets for this month
                      </Text>
                    ) : (
                      <View style={styles.categoryGrid}>
                        {sortedBudgets.map((budget) => {
                          const catExpenses = expenses.filter(
                            (e) => e.category === budget.category
                          );
                          return (
                            <View
                              key={budget.id}
                              style={[styles.categoryGridItem, { width: colWidth }]}
                            >
                              <BudgetCard
                                budget={budget}
                                items={catExpenses}
                                showBudgetLimit
                                useItemsForSpent={expensesByMonth[key] != null}
                                subtitle={name}
                                onPress={
                                  onBudgetPress ? () => onBudgetPress(budget) : undefined
                                }
                                onDelete={
                                  onBudgetDelete
                                    ? () => setBudgetPendingDelete(budget)
                                    : undefined
                                }
                                onItemPress={onExpensePress}
                                onToggleItemPaid={(exp, next) =>
                                  void handleTogglePaid(exp, next)
                                }
                                paidToggleExpenseId={paidToggleId}
                              />
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.helpHeader, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => setHelpOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <FontAwesome
          name={helpOpen ? 'chevron-down' : 'chevron-right'}
          size={12}
          color={colors.textSecondary}
        />
        <FontAwesome name="info-circle" size={14} color={colors.primary} />
        <Text style={[styles.helpTitle, { color: colors.text }]}>How this works</Text>
      </TouchableOpacity>
      {helpOpen ? (
        <View style={[styles.helpBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            Budgets are monthly category limits. On the Expenses tab you see paid spending against
            these limits.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            Update plan syncs unpaid expenses and category limits from active bills. Bill-backed
            budgets start on the earliest bill in that category.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            Yearly and other dues only count in their due months, so month totals can differ.
          </Text>
        </View>
      ) : null}
    </ScrollView>

    <AlertModal
      visible={!!budgetPendingDelete}
      title="Delete budget?"
      message={
        budgetPendingDelete
          ? `Delete ${budgetPendingDelete.category_name || 'this'} budget for ${displayMoney(budgetPendingDelete.amount)}? This cannot be undone.`
          : ''
      }
      type="warning"
      showCancel
      cancelText="Cancel"
      confirmText="Delete"
      onConfirm={() => {
        if (budgetPendingDelete && onBudgetDelete) {
          const target = budgetPendingDelete;
          setBudgetPendingDelete(null);
          void Promise.resolve(onBudgetDelete(target));
        }
      }}
      onClose={() => setBudgetPendingDelete(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 40, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { marginBottom: 4, fontSize: 13 },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  yearArrow: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  yearLabel: { fontSize: 16, fontWeight: '700' },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  monthGridItem: {
    padding: 4,
  },
  monthCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 96,
  },
  monthCardCurrent: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  monthHeaderText: { flex: 1, minWidth: 0, gap: 4, overflow: 'visible' },
  monthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  monthName: { fontSize: 14, fontWeight: '700' },
  nowChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  nowChipText: { fontSize: 11, fontWeight: '700' },
  monthAmounts: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    width: '100%',
    flexShrink: 0,
  },
  monthMeta: {
    fontVariant: ['tabular-nums'],
    width: '100%',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  monthBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 4,
    paddingBottom: 8,
  },
  empty: { padding: 12, fontSize: 12 },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  categoryGridItem: {
    padding: 4,
  },
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  helpTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  helpBody: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
  },
  helpText: { fontSize: 13, lineHeight: 18 },
});
