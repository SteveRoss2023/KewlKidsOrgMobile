import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import expenseService from '../../services/expenseService';
import {
  Budget,
  Expense,
  ExpenseCategory,
  ExpenseTag,
  PaymentMethod,
  RecurringExpense,
} from '../../types/expenses';
import {
  PeriodMode,
  PeriodModeOrAll,
  PERIOD_OPTIONS,
  formatPeriodLabel,
  periodDateRange,
  shiftPeriod,
  startOfPeriod,
} from '../../utils/expensePeriods';
import { forFamily } from '../../utils/familyScope';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';
import ThemeAwarePicker from '../lists/ThemeAwarePicker';
import RecurringExpenseRow, { formatOccurrenceDate } from './RecurringExpenseRow';
import ExpenseCategoryRow from './ExpenseCategoryRow';
import DonutChart from './charts/DonutChart';
import AlertModal from '../AlertModal';
import { invalidateCashflowYearCache } from './CashflowDashboard';
import { invalidateBudgetYearCache } from './BudgetDashboard';

type SortBy = 'date' | 'amount' | 'category';
type SortOrder = 'asc' | 'desc';

const UNPAID_COLOR = '#f59e0b';

type ExpenseBoardCache = {
  expenses: Expense[];
  budgets: Budget[];
  categories: ExpenseCategory[];
  tags: ExpenseTag[];
  recurringExpenses: RecurringExpense[];
  periodMode: PeriodModeOrAll;
  viewDateISO: string;
};

/** Survive Expenses tab remounts (Overview ↔ Expenses). */
const expenseBoardCache = new Map<string, ExpenseBoardCache>();
const expenseBoardLastKey = new Map<number, string>();

function expenseBoardRangeKey(periodMode: PeriodModeOrAll, viewDate: Date): string {
  if (periodMode === 'all') return 'all';
  const range = periodDateRange(viewDate, periodMode);
  return `${periodMode}:${range.start_date ?? ''}:${range.end_date ?? ''}`;
}

function expenseBoardCacheKey(
  familyId: number,
  periodMode: PeriodModeOrAll,
  viewDate: Date
): string {
  return `${familyId}:${expenseBoardRangeKey(periodMode, viewDate)}`;
}

/** Drop cached Expenses boards after expense/budget mutations. */
export function invalidateExpenseBoardCache(familyId?: number | null) {
  if (familyId == null) {
    expenseBoardCache.clear();
    expenseBoardLastKey.clear();
    return;
  }
  const prefix = `${familyId}:`;
  for (const key of [...expenseBoardCache.keys()]) {
    if (key.startsWith(prefix)) expenseBoardCache.delete(key);
  }
  expenseBoardLastKey.delete(familyId);
}

function toAmt(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

function parseExpenseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface ExpenseDashboardProps {
  onAdd?: () => void;
  onScan?: () => void;
  onExpensePress?: (expense: Expense) => void;
  onExpenseDelete?: (expense: Expense) => void | Promise<void>;
  onTogglePaid?: (expense: Expense, nextPaid: boolean) => void | Promise<void>;
  onBudgetPress?: (budget: Budget) => void;
  refreshKey?: number;
  initialCategories?: ExpenseCategory[];
  initialTags?: ExpenseTag[];
}

export default function ExpenseDashboard({
  onAdd,
  onScan,
  onExpensePress,
  onExpenseDelete,
  onTogglePaid,
  onBudgetPress,
  refreshKey = 0,
  initialCategories,
  initialTags,
}: ExpenseDashboardProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const isWide = useIsWideLayout();

  const initialCache = (() => {
    if (!selectedFamily) return undefined;
    const lastKey = expenseBoardLastKey.get(selectedFamily.id);
    return lastKey ? expenseBoardCache.get(lastKey) : undefined;
  })();

  const [periodMode, setPeriodMode] = useState<PeriodModeOrAll>(
    () => initialCache?.periodMode ?? 'month'
  );
  const [viewDate, setViewDate] = useState(() =>
    initialCache?.viewDateISO
      ? parseExpenseDate(initialCache.viewDateISO)
      : startOfPeriod(new Date(), 'month')
  );
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>(() => initialCache?.expenses ?? []);
  const [budgets, setBudgets] = useState<Budget[]>(() => initialCache?.budgets ?? []);
  const [categories, setCategories] = useState<ExpenseCategory[]>(
    () => initialCache?.categories ?? []
  );
  const [tags, setTags] = useState<ExpenseTag[]>(() => initialCache?.tags ?? []);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>(
    () => initialCache?.recurringExpenses ?? []
  );
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(() =>
    initialCache && selectedFamily ? selectedFamily.id : null
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState<number | null>(null);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<PaymentMethod | null>(null);
  const [filterTag, setFilterTag] = useState<number | null>(null);
  const [filterRecurring, setFilterRecurring] = useState<boolean | null>(null);
  const [filterPaid, setFilterPaid] = useState<boolean | null>(null);
  const [showCombinedView, setShowCombinedView] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const [paidToggleId, setPaidToggleId] = useState<number | null>(null);
  const [expensePendingDelete, setExpensePendingDelete] = useState<Expense | null>(null);
  const [upcomingOpen, setUpcomingOpen] = useState(false);

  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  const skipPeriodResetRef = useRef(!!initialCache);
  const periodModeRef = useRef(periodMode);
  periodModeRef.current = periodMode;
  const viewDateRef = useRef(viewDate);
  viewDateRef.current = viewDate;
  const budgetsRef = useRef(budgets);
  budgetsRef.current = budgets;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const recurringRef = useRef(recurringExpenses);
  recurringRef.current = recurringExpenses;

  const paidColor = colors.success || '#10b981';

  useEffect(() => {
    if (periodMode === 'all') return;
    if (skipPeriodResetRef.current) {
      skipPeriodResetRef.current = false;
      return;
    }
    setViewDate(startOfPeriod(new Date(), periodMode));
  }, [periodMode]);

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setExpenses([]);
    setBudgets([]);
    setCategories([]);
    setTags([]);
    setRecurringExpenses([]);
    setError('');
    setDataFamilyId(null);
    setLoading(true);
  }, []);

  const writeCache = useCallback(
    (
      familyId: number,
      mode: PeriodModeOrAll,
      date: Date,
      payload: {
        expenses: Expense[];
        budgets: Budget[];
        categories: ExpenseCategory[];
        tags: ExpenseTag[];
        recurringExpenses: RecurringExpense[];
      }
    ) => {
      const key = expenseBoardCacheKey(familyId, mode, date);
      expenseBoardCache.set(key, {
        ...payload,
        periodMode: mode,
        viewDateISO: toDateISO(date),
      });
      expenseBoardLastKey.set(familyId, key);
    },
    []
  );

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!selectedFamily) {
        clearState();
        setLoading(false);
        return;
      }
      const soft = !!opts?.soft;
      const familyId = selectedFamily.id;
      const generation = ++fetchGenerationRef.current;
      const cacheKey = expenseBoardCacheKey(familyId, periodMode, viewDate);
      const cached = expenseBoardCache.get(cacheKey);
      if (cached) {
        setExpenses(cached.expenses);
        setBudgets(cached.budgets);
        setCategories(cached.categories);
        setTags(cached.tags);
        setRecurringExpenses(cached.recurringExpenses);
        setDataFamilyId(familyId);
        setLoading(false);
        // Tab return with fresh cache: skip network (mutations clear via invalidate).
        if (soft) return;
      } else if (!soft) {
        setLoading(true);
      }
      setError('');
      try {
        const range = periodDateRange(viewDate, periodMode);
        const budgetPeriod = periodMode === 'year' ? 'year' : 'month';
        const expenseFilters: { start_date?: string; end_date?: string } = {};
        if (range.start_date) expenseFilters.start_date = range.start_date;
        if (range.end_date) expenseFilters.end_date = range.end_date;

        const reuseCats =
          initialCategories &&
          initialCategories.length > 0 &&
          initialCategories.every((c) => c.family === familyId);
        const reuseTags =
          initialTags != null &&
          (initialTags.length === 0 || initialTags.every((t) => t.family === familyId));

        const [cats, tagList, expList, budgetList, recurringList] = await Promise.all([
          reuseCats
            ? Promise.resolve(initialCategories!)
            : expenseService.getCategories(familyId),
          reuseTags ? Promise.resolve(initialTags!) : expenseService.getTags(familyId),
          expenseService.getExpenses(familyId, expenseFilters),
          expenseService.getBudgets(familyId, true, {
            asOf: range.asOf,
            budgetPeriod,
          }),
          expenseService.getRecurringExpenses(familyId),
        ]);

        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }

        const nextCats = forFamily(cats, familyId);
        const nextTags = forFamily(tagList, familyId);
        const nextExpenses = forFamily(expList, familyId);
        const nextBudgets = forFamily(budgetList, familyId);
        const nextRecurring = forFamily(recurringList, familyId);
        setCategories(nextCats);
        setTags(nextTags);
        setExpenses(nextExpenses);
        setBudgets(nextBudgets);
        setRecurringExpenses(nextRecurring);
        setDataFamilyId(familyId);
        writeCache(familyId, periodMode, viewDate, {
          expenses: nextExpenses,
          budgets: nextBudgets,
          categories: nextCats,
          tags: nextTags,
          recurringExpenses: nextRecurring,
        });
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load');
        setExpenses([]);
        setBudgets([]);
        setCategories([]);
        setTags([]);
        setRecurringExpenses([]);
        setDataFamilyId(null);
      } finally {
        if (
          generation === fetchGenerationRef.current &&
          selectedFamilyIdRef.current === familyId
        ) {
          setLoading(false);
        }
      }
    },
    [
      selectedFamily,
      viewDate,
      periodMode,
      clearState,
      initialCategories,
      initialTags,
      writeCache,
    ]
  );

  useEffect(() => {
    clearState();
    if (selectedFamily) {
      const lastKey = expenseBoardLastKey.get(selectedFamily.id);
      const cached = lastKey ? expenseBoardCache.get(lastKey) : undefined;
      if (cached) {
        skipPeriodResetRef.current = true;
        setPeriodMode(cached.periodMode);
        setViewDate(parseExpenseDate(cached.viewDateISO));
        setExpenses(cached.expenses);
        setBudgets(cached.budgets);
        setCategories(cached.categories);
        setTags(cached.tags);
        setRecurringExpenses(cached.recurringExpenses);
        setDataFamilyId(selectedFamily.id);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) {
        setLoading(false);
        return;
      }
      const cacheHit = expenseBoardCache.has(
        expenseBoardCacheKey(selectedFamily.id, periodMode, viewDate)
      );
      const soft = cacheHit || dataFamilyId === selectedFamily.id;
      void load({ soft });
    }, [selectedFamily?.id, load, dataFamilyId, periodMode, viewDate])
  );

  const lastRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (!selectedFamily) return;
    if (refreshKey === lastRefreshKeyRef.current) return;
    lastRefreshKeyRef.current = refreshKey;
    void load({ soft: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const activePeriodMode: PeriodMode | null = periodMode === 'all' ? null : periodMode;
  const todayPeriod = activePeriodMode ? startOfPeriod(new Date(), activePeriodMode) : null;
  const onTodayPeriod = !!(
    todayPeriod &&
    activePeriodMode &&
    startOfPeriod(viewDate, activePeriodMode).getTime() === todayPeriod.getTime()
  );
  const periodLabel =
    periodMode === 'all' ? 'All expenses' : formatPeriodLabel(viewDate, periodMode);

  const filteredExpenses = useMemo(() => {
    let list = selectedFamily ? forFamily(expenses, selectedFamily.id) : [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (exp) =>
          exp.description.toLowerCase().includes(q) ||
          (exp.category_name && exp.category_name.toLowerCase().includes(q)) ||
          (exp.notes && exp.notes.toLowerCase().includes(q)) ||
          (exp.tag_names || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }
    if (filterCategory) {
      list = list.filter((exp) => exp.category === filterCategory);
    }
    if (filterPaymentMethod) {
      list = list.filter((exp) => exp.payment_method === filterPaymentMethod);
    }
    if (filterTag) {
      list = list.filter((exp) => exp.tags.includes(filterTag));
    }
    if (filterRecurring !== null) {
      list = filterRecurring
        ? list.filter((exp) => exp.is_recurring && exp.recurring_expense !== null)
        : list.filter((exp) => !exp.is_recurring || exp.recurring_expense === null);
    }
    if (filterPaid !== null) {
      list = filterPaid
        ? list.filter((exp) => exp.is_paid !== false)
        : list.filter((exp) => exp.is_paid === false);
    }
    list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison =
          parseExpenseDate(a.expense_date).getTime() - parseExpenseDate(b.expense_date).getTime();
      } else if (sortBy === 'amount') {
        comparison = toAmt(a.amount) - toAmt(b.amount);
      } else {
        comparison = (a.category_name || '').localeCompare(b.category_name || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return list;
  }, [
    expenses,
    selectedFamily,
    searchQuery,
    filterCategory,
    filterPaymentMethod,
    filterTag,
    filterRecurring,
    filterPaid,
    sortBy,
    sortOrder,
  ]);

  const hasActiveFilters = !!(
    filterCategory ||
    filterPaymentMethod ||
    filterTag ||
    filterRecurring !== null ||
    filterPaid !== null
  );

  const periodPaid = useMemo(
    () => filteredExpenses.reduce((s, e) => s + (e.is_paid !== false ? toAmt(e.amount) : 0), 0),
    [filteredExpenses]
  );
  const periodUnpaid = useMemo(
    () => filteredExpenses.reduce((s, e) => s + (e.is_paid === false ? toAmt(e.amount) : 0), 0),
    [filteredExpenses]
  );
  const periodBudgetTotal = useMemo(
    () => budgets.reduce((s, b) => s + toAmt(b.amount), 0),
    [budgets]
  );

  const donutSlices = useMemo(() => {
    const slices = [
      { key: 'paid', label: 'Paid', amount: periodPaid, color: paidColor },
      { key: 'unpaid', label: 'Unpaid', amount: periodUnpaid, color: UNPAID_COLOR },
    ];
    if (periodPaid <= 0 && periodUnpaid <= 0) {
      return [{ key: 'empty', label: 'None', amount: 0, color: colors.border }];
    }
    return slices;
  }, [periodPaid, periodUnpaid, paidColor, colors.border]);

  const categoryGroups = useMemo(() => {
    const groups = new Map<
      number,
      { name: string; expenses: Expense[]; budget: Budget | null }
    >();
    const budgetByCategory = new Map(budgets.map((b) => [b.category, b]));
    for (const expense of filteredExpenses) {
      const categoryId = expense.category ?? 0;
      const existing = groups.get(categoryId);
      if (existing) {
        existing.expenses.push(expense);
      } else {
        groups.set(categoryId, {
          name: expense.category_name || 'Uncategorized',
          expenses: [expense],
          budget: budgetByCategory.get(categoryId) || null,
        });
      }
    }
    if (!searchQuery.trim() && !hasActiveFilters) {
      for (const budget of budgets) {
        if (!groups.has(budget.category)) {
          groups.set(budget.category, {
            name: budget.category_name || 'Category',
            expenses: [],
            budget,
          });
        }
      }
    }
    return Array.from(groups.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name, undefined, { sensitivity: 'base' })
    );
  }, [filteredExpenses, budgets, searchQuery, hasActiveFilters]);

  const upcomingRecurring = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return recurringExpenses.filter((re) => {
      if (!re.is_active) return false;
      const nextDate = new Date(re.next_due_date);
      nextDate.setHours(0, 0, 0, 0);
      return nextDate >= today;
    });
  }, [recurringExpenses]);

  const handleTogglePaid = async (expense: Expense, nextPaid: boolean) => {
    setPaidToggleId(expense.id);
    try {
      let nextExpenses: Expense[];
      if (onTogglePaid) {
        await onTogglePaid(expense, nextPaid);
        nextExpenses = expenses.map((e) =>
          e.id === expense.id ? { ...e, is_paid: nextPaid } : e
        );
      } else {
        const updated = await expenseService.updateExpense(expense.id, { is_paid: nextPaid });
        nextExpenses = expenses.map((e) => (e.id === updated.id ? updated : e));
      }
      setExpenses(nextExpenses);
      if (selectedFamily) {
        writeCache(selectedFamily.id, periodModeRef.current, viewDateRef.current, {
          expenses: nextExpenses,
          budgets: budgetsRef.current,
          categories: categoriesRef.current,
          tags: tagsRef.current,
          recurringExpenses: recurringRef.current,
        });
        invalidateBudgetYearCache(selectedFamily.id);
        invalidateCashflowYearCache(selectedFamily.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update paid status');
    } finally {
      setPaidToggleId(null);
    }
  };

  const confirmDelete = async () => {
    const exp = expensePendingDelete;
    setExpensePendingDelete(null);
    if (!exp) return;
    try {
      if (onExpenseDelete) {
        await onExpenseDelete(exp);
      } else {
        await expenseService.deleteExpense(exp.id);
      }
      setExpenses((prev) => prev.filter((e) => e.id !== exp.id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete expense');
    }
  };

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  const left = (
    <>
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.periodChips}>
          {PERIOD_OPTIONS.map((opt) => {
            const active = periodMode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.background,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setPeriodMode(opt.value)}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activePeriodMode ? (
          <View style={styles.periodNav}>
            <TouchableOpacity
              onPress={() => setViewDate((d) => shiftPeriod(d, activePeriodMode, -1))}
              style={styles.navBtn}
              accessibilityLabel="Previous period"
            >
              <FontAwesome name="chevron-left" size={14} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.periodLabel, { color: colors.text }]} numberOfLines={1}>
              {periodLabel}
            </Text>
            <TouchableOpacity
              onPress={() => setViewDate((d) => shiftPeriod(d, activePeriodMode, 1))}
              style={styles.navBtn}
              accessibilityLabel="Next period"
            >
              <FontAwesome name="chevron-right" size={14} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.todayBtn,
                {
                  backgroundColor: onTodayPeriod ? colors.card : colors.primary,
                  borderColor: onTodayPeriod ? colors.border : colors.primary,
                },
              ]}
              onPress={() => todayPeriod && setViewDate(todayPeriod)}
              disabled={onTodayPeriod}
              accessibilityLabel="Go to today"
            >
              <Text
                style={[
                  styles.todayBtnText,
                  { color: onTodayPeriod ? colors.textSecondary : '#fff' },
                ]}
              >
                Today
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.periodLabel, { color: colors.text, textAlign: 'center' }]}>
            {periodLabel}
          </Text>
        )}
      </View>

      <View
        style={[
          styles.heroCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>
          Period summary
        </Text>
        <View style={styles.heroGrid}>
          <View style={styles.heroCell}>
            <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Paid</Text>
            <Text style={[styles.heroValue, { color: paidColor }]}>
              {displayMoney(periodPaid)}
            </Text>
          </View>
          <View style={styles.heroCell}>
            <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Unpaid</Text>
            <Text style={[styles.heroValue, { color: UNPAID_COLOR }]}>
              {displayMoney(periodUnpaid)}
            </Text>
          </View>
          <View style={styles.heroCell}>
            <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Expenses</Text>
            <Text style={[styles.heroValue, { color: colors.text }]}>
              {filteredExpenses.length}
            </Text>
          </View>
          {periodMode !== 'all' ? (
            <View style={styles.heroCell}>
              <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Budgeted</Text>
              <Text style={[styles.heroValue, { color: colors.primary }]}>
                {displayMoney(periodBudgetTotal)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Paid vs unpaid</Text>
        <View style={styles.donutBlock}>
          <DonutChart
            slices={donutSlices.filter((s) => s.key !== 'empty')}
            textColor={colors.text}
            mutedColor={colors.textSecondary}
            trackColor={colors.border}
            centerLabel={displayMoney(periodPaid + periodUnpaid)}
            centerSubLabel="Total"
          />
          <View style={styles.donutLegend}>
            {donutSlices
              .filter((s) => s.key !== 'empty')
              .map((s) => (
                <View key={s.key} style={styles.donutLegendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
                  <Text style={[styles.donutLegendLabel, { color: colors.text }]}>{s.label}</Text>
                  <Text style={[styles.donutLegendAmt, { color: colors.textSecondary }]}>
                    {displayMoney(s.amount)}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.primaryAction, { backgroundColor: colors.primary }]}
          onPress={onAdd}
          accessibilityLabel="Add expense"
        >
          <FontAwesome name="plus" size={14} color="#fff" />
          <Text style={styles.primaryActionText}>Add</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secondaryAction,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={onScan}
          accessibilityLabel="Scan receipt"
        >
          <FontAwesome name="camera" size={14} color={colors.primary} />
          <Text style={[styles.secondaryActionText, { color: colors.primary }]}>
            Scan receipt
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const right = (
    <>
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.toolsRow}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <FontAwesome name="search" size={12} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <FontAwesome name="times" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              {
                backgroundColor:
                  showFilters || hasActiveFilters ? colors.primary : colors.background,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setShowFilters((v) => !v)}
            accessibilityLabel="Filters"
          >
            <FontAwesome
              name="filter"
              size={13}
              color={showFilters || hasActiveFilters ? '#fff' : colors.text}
            />
          </TouchableOpacity>
        </View>

        {showFilters ? (
          <View style={styles.filterPanel}>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Category</Text>
              <ThemeAwarePicker
                selectedValue={filterCategory?.toString() || ''}
                onValueChange={(value) =>
                  setFilterCategory(value ? parseInt(value, 10) : null)
                }
                options={[
                  { label: 'All', value: '' },
                  ...categories.map((cat) => ({
                    label: cat.name,
                    value: cat.id.toString(),
                  })),
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Payment</Text>
              <ThemeAwarePicker
                selectedValue={filterPaymentMethod || ''}
                onValueChange={(value) =>
                  setFilterPaymentMethod((value || null) as PaymentMethod | null)
                }
                options={[
                  { label: 'All', value: '' },
                  { label: 'Cash', value: 'cash' },
                  { label: 'Credit Card', value: 'credit_card' },
                  { label: 'Debit Card', value: 'debit_card' },
                  { label: 'Bank Transfer', value: 'bank_transfer' },
                  { label: 'E-Transfer', value: 'e_transfer' },
                  { label: 'Check', value: 'check' },
                  { label: 'Other', value: 'other' },
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Tag</Text>
              <ThemeAwarePicker
                selectedValue={filterTag?.toString() || ''}
                onValueChange={(value) => setFilterTag(value ? parseInt(value, 10) : null)}
                options={[
                  { label: 'All', value: '' },
                  ...tags.map((tag) => ({ label: tag.name, value: tag.id.toString() })),
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Type</Text>
              <ThemeAwarePicker
                selectedValue={
                  filterRecurring === null ? '' : filterRecurring ? 'recurring' : 'one_time'
                }
                onValueChange={(value) => {
                  if (value === 'recurring') setFilterRecurring(true);
                  else if (value === 'one_time') setFilterRecurring(false);
                  else setFilterRecurring(null);
                }}
                options={[
                  { label: 'All', value: '' },
                  { label: 'Recurring', value: 'recurring' },
                  { label: 'One-time', value: 'one_time' },
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Status</Text>
              <ThemeAwarePicker
                selectedValue={filterPaid === null ? '' : filterPaid ? 'paid' : 'unpaid'}
                onValueChange={(value) => {
                  if (value === 'paid') setFilterPaid(true);
                  else if (value === 'unpaid') setFilterPaid(false);
                  else setFilterPaid(null);
                }}
                options={[
                  { label: 'All', value: '' },
                  { label: 'Paid', value: 'paid' },
                  { label: 'Unpaid', value: 'unpaid' },
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Sort</Text>
              <ThemeAwarePicker
                selectedValue={`${sortBy}_${sortOrder}`}
                onValueChange={(value) => {
                  const [by, order] = String(value ?? 'date_desc').split('_') as [
                    SortBy,
                    SortOrder,
                  ];
                  setSortBy(by);
                  setSortOrder(order);
                }}
                options={[
                  { label: 'Date (newest)', value: 'date_desc' },
                  { label: 'Date (oldest)', value: 'date_asc' },
                  { label: 'Amount (high)', value: 'amount_desc' },
                  { label: 'Amount (low)', value: 'amount_asc' },
                  { label: 'Category A–Z', value: 'category_asc' },
                  { label: 'Category Z–A', value: 'category_desc' },
                ]}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>Upcoming bills</Text>
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    alignSelf: 'flex-start',
                    backgroundColor: showCombinedView ? colors.primary : colors.background,
                    borderColor: showCombinedView ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setShowCombinedView((v) => !v)}
              >
                <Text
                  style={[styles.chipText, { color: showCombinedView ? '#fff' : colors.text }]}
                >
                  {showCombinedView ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.clearFiltersBtn, { backgroundColor: colors.border }]}
              onPress={() => {
                setFilterCategory(null);
                setFilterPaymentMethod(null);
                setFilterTag(null);
                setFilterRecurring(null);
                setFilterPaid(null);
                setSortBy('date');
                setSortOrder('desc');
                setShowCombinedView(false);
              }}
            >
              <Text style={[styles.clearFiltersText, { color: colors.text }]}>Clear filters</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {showCombinedView && upcomingRecurring.length > 0 ? (
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={styles.upcomingHeader}
            onPress={() => setUpcomingOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: upcomingOpen }}
          >
            <FontAwesome
              name={upcomingOpen ? 'chevron-down' : 'chevron-right'}
              size={12}
              color={colors.textSecondary}
            />
            <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>
              Upcoming bills
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {upcomingRecurring.length}
            </Text>
          </TouchableOpacity>
          {upcomingOpen
            ? upcomingRecurring.map((recurring) => {
                const nextDate = new Date(recurring.next_due_date);
                nextDate.setHours(0, 0, 0, 0);
                return (
                  <RecurringExpenseRow
                    key={`upcoming-${recurring.id}`}
                    recurring={recurring}
                    dateLabel={formatOccurrenceDate(nextDate)}
                    badge={{ label: 'Upcoming', color: colors.primary }}
                  />
                );
              })
            : null}
        </View>
      ) : null}

      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Categories</Text>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
          Tap a category for items · edit, paid, receipt, delete
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
        ) : categoryGroups.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No expenses or budgets this period
          </Text>
        ) : (
          <View style={styles.categoryList}>
            {categoryGroups.map(([catId, group]) => (
              <ExpenseCategoryRow
                key={catId}
                categoryName={group.name}
                items={group.expenses}
                budget={group.budget}
                showBudgetLimit={!!group.budget && periodMode !== 'all'}
                onEditBudget={
                  group.budget && onBudgetPress
                    ? () => onBudgetPress(group.budget!)
                    : undefined
                }
                onItemPress={onExpensePress}
                onItemDelete={(exp) => setExpensePendingDelete(exp)}
                onToggleItemPaid={(exp, next) => void handleTogglePaid(exp, next)}
                paidToggleExpenseId={paidToggleId}
              />
            ))}
          </View>
        )}
      </View>
    </>
  );

  return (
    <>
      <View style={styles.flex}>
        {error ? (
          <Text style={[styles.errorBanner, { color: colors.error || '#c0392b' }]}>{error}</Text>
        ) : null}

        {loading && dataFamilyId !== selectedFamily.id ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isWide ? (
              <View style={styles.wideRow}>
                <View style={styles.wideCol}>{left}</View>
                <View style={styles.wideCol}>{right}</View>
              </View>
            ) : (
              <>
                {left}
                {right}
              </>
            )}
          </ScrollView>
        )}
      </View>

      <AlertModal
        visible={!!expensePendingDelete}
        title="Delete expense?"
        message={
          expensePendingDelete
            ? `Delete “${expensePendingDelete.description}” (${displayMoney(expensePendingDelete.amount)})? This cannot be undone.`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onClose={() => setExpensePendingDelete(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40, gap: 14 },
  wideRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  wideCol: { flex: 1, minWidth: 0, gap: 14 },
  heroCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroCell: { flexGrow: 1, flexBasis: '22%', minWidth: 72, gap: 2 },
  heroCaption: { fontSize: 11, fontWeight: '600' },
  heroValue: { fontSize: 16, fontWeight: '800' },
  sectionCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionHint: { fontSize: 12, fontWeight: '500', marginTop: -4 },
  periodChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  periodLabel: { flex: 1, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  todayBtnText: { fontSize: 12, fontWeight: '700' },
  donutBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  donutLegend: { flex: 1, minWidth: 140, gap: 8 },
  donutLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  donutLegendLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  donutLegendAmt: { fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryActionText: { fontSize: 14, fontWeight: '800' },
  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  filterBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterPanel: { gap: 8, marginTop: 4 },
  filterRow: { gap: 4 },
  filterLabel: { fontSize: 12, fontWeight: '700' },
  clearFiltersBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  clearFiltersText: { fontSize: 12, fontWeight: '700' },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  empty: { fontSize: 13, paddingVertical: 12 },
  categoryList: { marginTop: 2 },
});
