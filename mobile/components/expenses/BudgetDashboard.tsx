import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';
import expenseService from '../../services/expenseService';
import { Budget, Expense } from '../../types/expenses';
import BudgetCategoryRow from './BudgetCategoryRow';
import AlertModal from '../AlertModal';
import DonutChart from './charts/DonutChart';
import MonthBudgetBars from './charts/MonthBudgetBars';
import {
  buildMonthlyBudgetSeries,
  defaultBudgetBoardMonthIndex,
  expensesForCategory,
  monthKey,
  monthRange,
  rollupBudgetSeries,
} from '../../utils/budgetSeries';
import { invalidateCashflowYearCache } from './CashflowDashboard';
import {
  applyBillExpensesForYear,
  ensureYearHasChanges,
  previewBillExpensesForYear,
} from '../../utils/ensureBillYear';
import EnsureYearModal from './EnsureYearModal';
import type { EnsureYearResult } from '../../types/expenses';

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

type BudgetYearCache = {
  budgetsByMonth: Record<string, Budget[]>;
  expensesByMonth: Record<string, Expense[]>;
  selectedMonthIndex: number;
};

/** Survive Budgets tab remounts (Overview ↔ Budgets). */
const budgetYearCache = new Map<string, BudgetYearCache>();

function budgetCacheKey(familyId: number, y: number) {
  return `${familyId}:${y}`;
}

/** Drop cached Budgets years after expense/budget mutations. */
export function invalidateBudgetYearCache(familyId?: number | null) {
  if (familyId == null) {
    budgetYearCache.clear();
    return;
  }
  const prefix = `${familyId}:`;
  for (const key of [...budgetYearCache.keys()]) {
    if (key.startsWith(prefix)) budgetYearCache.delete(key);
  }
}

interface BudgetDashboardProps {
  onExpensePress?: (expense: Expense) => void;
  onBudgetPress?: (budget: Budget) => void;
  onBudgetDelete?: (budget: Budget) => void | Promise<void>;
  refreshKey?: number;
}

export default function BudgetDashboard({
  onExpensePress,
  onBudgetPress,
  onBudgetDelete,
  refreshKey = 0,
}: BudgetDashboardProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const isWide = useIsWideLayout();

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => now.getFullYear());

  const initialCache =
    selectedFamily != null
      ? budgetYearCache.get(budgetCacheKey(selectedFamily.id, now.getFullYear()))
      : undefined;

  const [selectedMonthIndex, setSelectedMonthIndex] = useState(
    () => initialCache?.selectedMonthIndex ?? now.getMonth()
  );
  /** Donut slice filter: spent | left | over | null (all) */
  const [donutFilter, setDonutFilter] = useState<string | null>(null);
  const [budgetsByMonth, setBudgetsByMonth] = useState<Record<string, Budget[]>>(
    () => initialCache?.budgetsByMonth ?? {}
  );
  const [expensesByMonth, setExpensesByMonth] = useState<Record<string, Expense[]>>(
    () => initialCache?.expensesByMonth ?? {}
  );
  const [yearLoading, setYearLoading] = useState(!initialCache);
  const [loadingMonth, setLoadingMonth] = useState<number | null>(null);
  const [paidToggleId, setPaidToggleId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const ensuredYearsRef = useRef<Set<string>>(new Set());
  const [ensurePreview, setEnsurePreview] = useState<EnsureYearResult | null>(null);
  const [ensureApplying, setEnsureApplying] = useState(false);
  const [budgetPendingDelete, setBudgetPendingDelete] = useState<Budget | null>(null);
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(() =>
    initialCache && selectedFamily ? selectedFamily.id : null
  );
  const [loadedYear, setLoadedYear] = useState<number | null>(() =>
    initialCache ? now.getFullYear() : null
  );
  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  const monthInitYearRef = useRef<number | null>(initialCache ? now.getFullYear() : null);
  const selectedMonthIndexRef = useRef(selectedMonthIndex);
  selectedMonthIndexRef.current = selectedMonthIndex;

  const spentColor = colors.error || '#ef4444';
  const okColor = colors.success;

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    ensuredYearsRef.current.clear();
    setBudgetsByMonth({});
    setExpensesByMonth({});
    setError('');
    setEnsurePreview(null);
    setDataFamilyId(null);
    setLoadedYear(null);
    monthInitYearRef.current = null;
    setYearLoading(true);
  }, []);

  const writeCache = useCallback(
    (
      familyId: number,
      y: number,
      budgets: Record<string, Budget[]>,
      expenses: Record<string, Expense[]>,
      monthIdx: number
    ) => {
      budgetYearCache.set(budgetCacheKey(familyId, y), {
        budgetsByMonth: budgets,
        expensesByMonth: expenses,
        selectedMonthIndex: monthIdx,
      });
    },
    []
  );

  const loadYear = useCallback(
    async (y: number, opts?: { soft?: boolean }) => {
      if (!selectedFamily) {
        clearState();
        setYearLoading(false);
        return;
      }
      const soft = !!opts?.soft;
      const familyId = selectedFamily.id;
      const generation = ++fetchGenerationRef.current;
      let cached = budgetYearCache.get(budgetCacheKey(familyId, y));

      // Preview bill expense reconcile for this year (confirm before apply).
      const ensureKey = `${familyId}:${y}`;
      if (!ensuredYearsRef.current.has(ensureKey)) {
        try {
          const preview = await previewBillExpensesForYear(familyId, y);
          if (generation !== fetchGenerationRef.current) return;
          if (ensureYearHasChanges(preview)) {
            setEnsurePreview(preview);
          } else {
            ensuredYearsRef.current.add(ensureKey);
          }
        } catch {
          // Don't block the board if preview fails.
          ensuredYearsRef.current.add(ensureKey);
        }
      }

      if (cached && soft) {
        setBudgetsByMonth(cached.budgetsByMonth);
        setExpensesByMonth(cached.expensesByMonth);
        setSelectedMonthIndex(cached.selectedMonthIndex);
        setDataFamilyId(familyId);
        setLoadedYear(y);
        monthInitYearRef.current = y;
        setYearLoading(false);
        return;
      } else if (!soft) {
        setYearLoading(true);
      }
      setError('');
      try {
        const monthIdx = cached?.selectedMonthIndex ?? selectedMonthIndexRef.current;
        const { start, end } = monthRange(y, monthIdx);
        const monthKeyStr = monthKey(y, monthIdx);

        // One year_board call (same data as 12× monthly asOf) + month expenses.
        const [board, monthExpenses] = await Promise.all([
          expenseService.getBudgetsYearBoard(familyId, y, true),
          expenseService.getExpenses(familyId, {
            start_date: start,
            end_date: end,
          }),
        ]);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        const next: Record<string, Budget[]> = {};
        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
          const key = monthKey(y, monthIndex);
          next[key] = board[key] || [];
        }
        const nextExpenses = {
          ...(cached?.expensesByMonth ?? {}),
          [monthKeyStr]: monthExpenses,
        };
        setBudgetsByMonth(next);
        setExpensesByMonth(nextExpenses);
        setDataFamilyId(familyId);
        setLoadedYear(y);
        writeCache(familyId, y, next, nextExpenses, monthIdx);
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load budgets');
        if (!cached) {
          setBudgetsByMonth({});
          setDataFamilyId(null);
          setLoadedYear(null);
        }
      } finally {
        if (
          generation === fetchGenerationRef.current &&
          selectedFamilyIdRef.current === familyId
        ) {
          setYearLoading(false);
        }
      }
    },
    [selectedFamily, clearState, writeCache]
  );

  const fetchMonthExpenses = useCallback(
    async (monthIndex: number, y: number) => {
      if (!selectedFamily) return;
      const familyId = selectedFamily.id;
      const key = monthKey(y, monthIndex);
      const generation = fetchGenerationRef.current;
      setLoadingMonth(monthIndex);
      try {
        const { start, end } = monthRange(y, monthIndex);
        const data = await expenseService.getExpenses(familyId, {
          start_date: start,
          end_date: end,
        });
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setExpensesByMonth((prev) => {
          const next = { ...prev, [key]: data };
          const budgets = budgetYearCache.get(budgetCacheKey(familyId, y))?.budgetsByMonth;
          if (budgets) {
            writeCache(familyId, y, budgets, next, monthIndex);
          }
          return next;
        });
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load expenses');
      } finally {
        if (
          generation === fetchGenerationRef.current &&
          selectedFamilyIdRef.current === familyId
        ) {
          setLoadingMonth(null);
        }
      }
    },
    [selectedFamily, writeCache]
  );

  useEffect(() => {
    clearState();
    if (selectedFamily) {
      const cached = budgetYearCache.get(budgetCacheKey(selectedFamily.id, year));
      if (cached) {
        setBudgetsByMonth(cached.budgetsByMonth);
        setExpensesByMonth(cached.expensesByMonth);
        setSelectedMonthIndex(cached.selectedMonthIndex);
        setDataFamilyId(selectedFamily.id);
        setLoadedYear(year);
        monthInitYearRef.current = year;
        setYearLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) return;
      const cacheHit = budgetYearCache.has(budgetCacheKey(selectedFamily.id, year));
      const soft =
        cacheHit || dataFamilyId === selectedFamily.id || loadedYear != null;
      void loadYear(year, { soft });
    }, [selectedFamily?.id, year, loadYear, dataFamilyId, loadedYear])
  );

  // Only react when refreshKey actually changes — not on every remount (refreshKey is
  // often > 0). Remount + invalidate was wiping the tab cache and causing random spinners.
  const lastRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (!selectedFamily) return;
    if (refreshKey === lastRefreshKeyRef.current) return;
    lastRefreshKeyRef.current = refreshKey;
    void loadYear(year, { soft: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const months = useMemo(
    () => buildMonthlyBudgetSeries(year, budgetsByMonth, expensesByMonth),
    [year, budgetsByMonth, expensesByMonth]
  );

  const yearSummary = useMemo(() => rollupBudgetSeries(months), [months]);

  useEffect(() => {
    if (yearLoading) return;
    if (monthInitYearRef.current === year) return;
    monthInitYearRef.current = year;
    const idx = defaultBudgetBoardMonthIndex(year, months, now);
    setSelectedMonthIndex(idx);
  }, [yearLoading, year, months, now]);

  useEffect(() => {
    if (yearLoading || !selectedFamily) return;
    const key = monthKey(year, selectedMonthIndex);
    if (!expensesByMonth[key] && loadingMonth !== selectedMonthIndex) {
      void fetchMonthExpenses(selectedMonthIndex, year);
    }
  }, [
    yearLoading,
    selectedFamily,
    year,
    selectedMonthIndex,
    expensesByMonth,
    loadingMonth,
    fetchMonthExpenses,
  ]);

  const selectedMonth = months[selectedMonthIndex] || months[0];
  const selectedKey = selectedMonth?.key;
  const selectedExpenses = selectedKey ? expensesByMonth[selectedKey] : undefined;
  const expensesReady = selectedKey != null && expensesByMonth[selectedKey] != null;

  const handleSelectMonth = (monthIndex: number) => {
    setDonutFilter(null);
    setSelectedMonthIndex(monthIndex);
    if (selectedFamily && loadedYear === year) {
      writeCache(selectedFamily.id, year, budgetsByMonth, expensesByMonth, monthIndex);
    }
    const key = monthKey(year, monthIndex);
    if (!expensesByMonth[key]) {
      void fetchMonthExpenses(monthIndex, year);
    }
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
        // Persist into tab cache so Overview → Budgets return keeps the toggle.
        if (selectedFamily) {
          writeCache(
            selectedFamily.id,
            year,
            budgetsByMonth,
            next,
            selectedMonthIndexRef.current
          );
          invalidateCashflowYearCache(selectedFamily.id);
        }
        return next;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to update paid status');
    } finally {
      setPaidToggleId(null);
    }
  };

  const barPoints = useMemo(
    () =>
      months.map((m) => ({
        monthIndex: m.monthIndex,
        label: m.label,
        budgeted: m.budgeted,
        spent: m.spent,
        percentageUsed: m.percentageUsed,
      })),
    [months]
  );

  const donutSlices = useMemo(() => {
    if (!selectedMonth) return [];
    const spent = selectedMonth.spent;
    const remaining = Math.max(0, selectedMonth.remaining);
    const over = Math.max(0, -selectedMonth.remaining);
    if (over > 0) {
      return [
        { key: 'spent', label: 'Spent', amount: selectedMonth.budgeted, color: spentColor },
        { key: 'over', label: 'Over', amount: over, color: colors.warning || '#f59e0b' },
      ];
    }
    return [
      { key: 'spent', label: 'Spent', amount: spent, color: spentColor },
      { key: 'left', label: 'Left', amount: remaining, color: okColor },
    ];
  }, [selectedMonth, spentColor, okColor, colors.warning]);

  const sortedBudgets = useMemo(() => {
    if (!selectedMonth) return [];
    let list = [...selectedMonth.budgets].sort((a, b) =>
      (a.category_name || '').localeCompare(b.category_name || '')
    );
    if (!donutFilter) return list;

    const spentFor = (b: Budget) => {
      if (expensesReady) {
        return expensesForCategory(selectedExpenses, b.category).reduce(
          (sum, exp) => sum + (exp.is_paid !== false ? Number(exp.amount) || 0 : 0),
          0
        );
      }
      return Number(b.spent_amount) || 0;
    };

    if (donutFilter === 'spent') {
      list = list.filter((b) => spentFor(b) > 0);
    } else if (donutFilter === 'left') {
      list = list.filter((b) => {
        const amount = Number(b.amount) || 0;
        return amount - spentFor(b) > 0;
      });
    } else if (donutFilter === 'over') {
      list = list.filter((b) => {
        const amount = Number(b.amount) || 0;
        return spentFor(b) > amount;
      });
    }
    return list;
  }, [selectedMonth, donutFilter, expensesReady, selectedExpenses]);

  useEffect(() => {
    setDonutFilter(null);
  }, [year]);

  const toneRemaining = (n: number) =>
    n > 0 ? okColor : n < 0 ? spentColor : colors.text;

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  const yearHero = (
    <View
      style={[
        styles.heroCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>
        Year overview
      </Text>
      <View style={styles.heroGrid}>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Budgeted
          </Text>
          <Text style={[styles.heroValue, { color: colors.primary }]}>
            {displayMoney(yearSummary.budgeted)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            {yearSummary.monthsWithBudgets} months
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Spent</Text>
          <Text style={[styles.heroValue, { color: spentColor }]}>
            {displayMoney(yearSummary.spent)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            {Math.round(yearSummary.percentageUsed)}% of limits
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Left</Text>
          <Text
            style={[
              styles.heroValue,
              { color: toneRemaining(yearSummary.remaining) },
            ]}
          >
            {displayMoney(yearSummary.remaining)}
          </Text>
        </View>
      </View>
    </View>
  );

  const monthlyBars = (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Monthly budgets</Text>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        Hover or tap a month · dots highlight near / over limit
      </Text>
      <MonthBudgetBars
        points={barPoints}
        selectedMonthIndex={selectedMonthIndex}
        onSelectMonth={handleSelectMonth}
        budgetColor={colors.primary}
        spentColor={spentColor}
        overColor={colors.warning || '#f59e0b'}
        trackColor={colors.border}
        textColor={colors.text}
        mutedColor={colors.textSecondary}
        selectedBorderColor={colors.primary}
        formatAmount={displayMoney}
      />
    </View>
  );

  const selectedMonthCard = selectedMonth ? (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {MONTH_NAMES[selectedMonth.monthIndex]} {year}
      </Text>

      <View style={styles.monthKpis}>
        <Kpi
          label="Budgeted"
          value={displayMoney(selectedMonth.budgeted)}
          color={colors.primary}
          muted={colors.textSecondary}
        />
        <Kpi
          label="Spent"
          value={displayMoney(selectedMonth.spent)}
          color={spentColor}
          muted={colors.textSecondary}
        />
        <Kpi
          label="Left"
          value={displayMoney(selectedMonth.remaining)}
          color={toneRemaining(selectedMonth.remaining)}
          muted={colors.textSecondary}
        />
        <Kpi
          label="Used"
          value={`${Math.round(selectedMonth.percentageUsed)}%`}
          color={
            selectedMonth.percentageUsed > 100
              ? spentColor
              : selectedMonth.percentageUsed >= 80
                ? colors.warning || '#f59e0b'
                : okColor
          }
          muted={colors.textSecondary}
        />
      </View>

      <View style={styles.donutBlock}>
        <DonutChart
          slices={donutSlices}
          textColor={colors.text}
          mutedColor={colors.textSecondary}
          trackColor={colors.border}
          selectedKey={donutFilter}
          onSelectSlice={setDonutFilter}
          centerLabel={
            selectedMonth.budgeted > 0
              ? `${Math.round(selectedMonth.percentageUsed)}%`
              : displayMoney(selectedMonth.spent)
          }
          centerSubLabel={
            donutFilter
              ? donutSlices.find((s) => s.key === donutFilter)?.label || 'Filtered'
              : selectedMonth.remaining < 0
                ? 'Over budget'
                : 'Of limit'
          }
        />
        <View style={styles.donutLegend}>
          {donutSlices.map((s) => {
            const active = donutFilter === s.key;
            const dimmed = donutFilter != null && !active;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.donutLegendRow, dimmed && { opacity: 0.4 }]}
                onPress={() => setDonutFilter(active ? null : s.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
                <Text style={[styles.donutLegendLabel, { color: colors.text }]}>
                  {s.label}
                </Text>
                <Text
                  style={[styles.donutLegendAmt, { color: colors.textSecondary }]}
                >
                  {displayMoney(s.amount)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <Text style={[styles.donutHint, { color: colors.textSecondary }]}>
        Tap a legend item to filter · tap the chart to show all
      </Text>

      <Text style={[styles.subSectionTitle, { color: colors.text }]}>
        Categories
        {donutFilter
          ? ` · ${donutSlices.find((s) => s.key === donutFilter)?.label || 'filtered'}`
          : ''}
      </Text>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        Tap a category to see items · pencil / trash to edit
      </Text>

      {loadingMonth === selectedMonthIndex && !expensesReady ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : sortedBudgets.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No budgets for this month
        </Text>
      ) : (
        <View style={styles.categoryList}>
          {sortedBudgets.map((budget) => {
            const catExpenses = expensesForCategory(
              selectedExpenses,
              budget.category
            );
            return (
              <BudgetCategoryRow
                key={budget.id}
                budget={budget}
                items={catExpenses}
                useItemsForSpent={expensesReady}
                onEditBudget={
                  onBudgetPress ? () => onBudgetPress(budget) : undefined
                }
                onDeleteBudget={
                  onBudgetDelete
                    ? () => setBudgetPendingDelete(budget)
                    : undefined
                }
                onItemPress={onExpensePress}
                onToggleItemPaid={(exp, next) => void handleTogglePaid(exp, next)}
                paidToggleExpenseId={paidToggleId}
              />
            );
          })}
        </View>
      )}
    </View>
  ) : null;

  const help = (
    <>
      <TouchableOpacity
        style={[
          styles.helpHeader,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={() => setHelpOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <FontAwesome
          name={helpOpen ? 'chevron-down' : 'chevron-right'}
          size={12}
          color={colors.textSecondary}
        />
        <Text style={[styles.helpTitle, { color: colors.text }]}>How this works</Text>
      </TouchableOpacity>
      {helpOpen ? (
        <View
          style={[
            styles.helpBody,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            1. These are monthly category limits for the year/month you select. Spent
            only counts paid expenses.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            2. Limits come from active bills on the Bills tab. This tab does not
            create budgets — use pencil to edit a limit or trash to delete one.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            3. When you add or change a bill, the app already generates that bill’s
            unpaid expenses and refreshes that category’s budget for you.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            4. Use Update plan on Bills for a full refresh across all bills (first
            setup, lots of changes) or to preview what will be created/updated before
            applying. Yearly or irregular dues only affect the months they fall due.
            Edits you make here can be overwritten the next time that category is
            synced from bills.
          </Text>
        </View>
      ) : null}
    </>
  );

  return (
    <>
      <View style={styles.flex}>
        <View style={styles.yearNav}>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setYear((y) => y - 1)}
            accessibilityLabel="Previous year"
          >
            <FontAwesome name="chevron-left" size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.yearLabel, { color: colors.text }]}>{year}</Text>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setYear((y) => y + 1)}
            accessibilityLabel="Next year"
          >
            <FontAwesome name="chevron-right" size={16} color={colors.text} />
          </TouchableOpacity>
          {year !== now.getFullYear() ? (
            <TouchableOpacity
              style={[styles.todayBtn, { borderColor: colors.border }]}
              onPress={() => setYear(now.getFullYear())}
            >
              <Text style={[styles.todayBtnText, { color: colors.primary }]}>This year</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {error ? (
          <Text style={[styles.errorBanner, { color: colors.error || '#c0392b' }]}>{error}</Text>
        ) : null}

        {yearLoading &&
        !(dataFamilyId === selectedFamily?.id && loadedYear === year) ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isWide ? (
              <View style={styles.wideRow}>
                <View style={styles.wideCol}>
                  {yearHero}
                  {monthlyBars}
                  {help}
                </View>
                <View style={styles.wideCol}>{selectedMonthCard}</View>
              </View>
            ) : (
              <>
                {yearHero}
                {monthlyBars}
                {selectedMonthCard}
                {help}
              </>
            )}
          </ScrollView>
        )}
      </View>

      <AlertModal
        visible={!!budgetPendingDelete}
        title="Delete budget?"
        message={
          budgetPendingDelete
            ? `Delete the ${budgetPendingDelete.category_name || 'category'} budget (${displayMoney(budgetPendingDelete.amount)})? This cannot be undone.`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onClose={() => setBudgetPendingDelete(null)}
        onConfirm={() => {
          const b = budgetPendingDelete;
          setBudgetPendingDelete(null);
          if (b && onBudgetDelete) void Promise.resolve(onBudgetDelete(b));
        }}
      />

      <EnsureYearModal
        visible={!!ensurePreview}
        preview={ensurePreview}
        applying={ensureApplying}
        onCancel={() => {
          if (ensurePreview && selectedFamily) {
            ensuredYearsRef.current.add(`${selectedFamily.id}:${ensurePreview.through_year}`);
          }
          setEnsurePreview(null);
        }}
        onApply={() => {
          void (async () => {
            if (!selectedFamily || !ensurePreview) return;
            const y = ensurePreview.through_year;
            const familyId = selectedFamily.id;
            setEnsureApplying(true);
            try {
              await applyBillExpensesForYear(familyId, y);
              ensuredYearsRef.current.add(`${familyId}:${y}`);
              setEnsurePreview(null);
              budgetYearCache.delete(budgetCacheKey(familyId, y));
              await loadYear(y, { soft: false });
            } catch (err: any) {
              setError(err.message || 'Failed to apply bill expenses for year');
            } finally {
              setEnsureApplying(false);
            }
          })();
        }}
      />
    </>
  );
}

function Kpi({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color: string;
  muted: string;
}) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  yearNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  yearLabel: { flex: 1, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  todayBtnText: { fontSize: 12, fontWeight: '700' },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40, gap: 14 },
  wideRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  wideCol: {
    flex: 1,
    minWidth: 0,
    gap: 14,
  },
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
  heroGrid: { flexDirection: 'row', gap: 8 },
  heroCell: { flex: 1, gap: 2 },
  heroCaption: { fontSize: 11, fontWeight: '600' },
  heroValue: { fontSize: 16, fontWeight: '800' },
  heroMeta: { fontSize: 10, fontWeight: '500', marginTop: 2 },
  sectionCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionHint: { fontSize: 12, fontWeight: '500', marginTop: -4 },
  monthKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpi: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 72,
    gap: 2,
  },
  kpiLabel: { fontSize: 11, fontWeight: '600' },
  kpiValue: { fontSize: 14, fontWeight: '800' },
  donutHint: { fontSize: 11, fontWeight: '500', opacity: 0.75, marginTop: -2 },
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
  subSectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  empty: { fontSize: 13, paddingVertical: 12 },
  categoryList: { marginTop: 2 },
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  helpTitle: { fontSize: 14, fontWeight: '700' },
  helpBody: {
    marginTop: -6,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  helpText: { fontSize: 13, lineHeight: 18 },
});
