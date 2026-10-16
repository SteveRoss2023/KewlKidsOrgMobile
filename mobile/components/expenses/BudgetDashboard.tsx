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
import MonthBudgetBars from './charts/MonthBudgetBars';
import {
  buildMonthlyBudgetSeries,
  defaultBudgetBoardMonthIndex,
  expensesForCategory,
  isExpensePaid,
  monthKey,
} from '../../utils/budgetSeries';
import {
  applyBillExpensesForYear,
  ensureYearHasChanges,
  previewBillExpensesForYear,
} from '../../utils/ensureBillYear';
import EnsureYearModal from './EnsureYearModal';
import type { EnsureYearResult } from '../../types/expenses';

const UNPAID_COLOR = '#f59e0b';

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

function emptyExpensesByMonth(year: number): Record<string, Expense[]> {
  const next: Record<string, Expense[]> = {};
  for (let i = 0; i < 12; i++) next[monthKey(year, i)] = [];
  return next;
}

function bucketExpensesByMonth(year: number, expenses: Expense[]): Record<string, Expense[]> {
  const next = emptyExpensesByMonth(year);
  for (const e of expenses) {
    const key = (e.expense_date || '').slice(0, 7);
    if (key && next[key]) next[key].push(e);
  }
  return next;
}

function categoryPaidUnpaid(
  expenses: Expense[] | undefined,
  categoryId: number
): { paid: number; unpaid: number } {
  let paid = 0;
  let unpaid = 0;
  for (const e of expensesForCategory(expenses, categoryId)) {
    const n = typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount ?? 0));
    const amt = Number.isNaN(n) ? 0 : n;
    if (isExpensePaid(e)) paid += amt;
    else unpaid += amt;
  }
  return { paid, unpaid };
}

interface BudgetDashboardProps {
  onBudgetPress?: (budget: Budget) => void;
  onBudgetDelete?: (budget: Budget) => void | Promise<void>;
  onAddBudget?: () => void;
  refreshKey?: number;
}

export default function BudgetDashboard({
  onBudgetPress,
  onBudgetDelete,
  onAddBudget,
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
  const [budgetsByMonth, setBudgetsByMonth] = useState<Record<string, Budget[]>>(
    () => initialCache?.budgetsByMonth ?? {}
  );
  const [expensesByMonth, setExpensesByMonth] = useState<Record<string, Expense[]>>(
    () => initialCache?.expensesByMonth ?? emptyExpensesByMonth(now.getFullYear())
  );
  const [yearLoading, setYearLoading] = useState(!initialCache);
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const ensuredYearsRef = useRef<Set<string>>(new Set());
  const dismissedEnsureRef = useRef<Set<string>>(new Set());
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
  const unpaidColor = UNPAID_COLOR;
  const okColor = colors.success;

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    ensuredYearsRef.current.clear();
    dismissedEnsureRef.current.clear();
    setBudgetsByMonth({});
    setExpensesByMonth({});
    setError('');
    setEnsurePreview(null);
    setDataFamilyId(null);
    setLoadedYear(null);
    monthInitYearRef.current = null;
    setYearLoading(true);
  }, []);

  useEffect(() => {
    const keep = selectedFamily != null ? `${selectedFamily.id}:${year}` : null;
    for (const key of [...dismissedEnsureRef.current]) {
      if (key !== keep) dismissedEnsureRef.current.delete(key);
    }
  }, [year, selectedFamily?.id]);

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

      const ensureKey = `${familyId}:${y}`;
      if (
        !ensuredYearsRef.current.has(ensureKey) &&
        !dismissedEnsureRef.current.has(ensureKey)
      ) {
        try {
          const preview = await previewBillExpensesForYear(familyId, y);
          if (generation !== fetchGenerationRef.current) return;
          if (ensureYearHasChanges(preview)) {
            setEnsurePreview(preview);
          } else {
            ensuredYearsRef.current.add(ensureKey);
          }
        } catch {
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
        const [board, yearExpenses] = await Promise.all([
          expenseService.getBudgetsYearBoard(familyId, y, true),
          expenseService.getExpenses(familyId, {
            start_date: `${y}-01-01`,
            end_date: `${y}-12-31`,
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
        const nextExpenses = bucketExpensesByMonth(y, yearExpenses);
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
          setExpensesByMonth({});
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

  const yearSummary = useMemo(() => {
    let budgeted = 0;
    let paid = 0;
    let unpaid = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let monthsWithBudgets = 0;
    for (const m of months) {
      if (m.categoryCount > 0) monthsWithBudgets += 1;
      budgeted += m.budgeted;
      paid += m.paidTotal;
      unpaid += m.unpaidTotal;
      paidCount += m.paidCount;
      unpaidCount += m.unpaidCount;
    }
    const projected = paid + unpaid;
    const variance = budgeted - projected;
    return {
      budgeted,
      paid,
      unpaid,
      projected,
      variance,
      monthsWithBudgets,
      paidCount,
      unpaidCount,
    };
  }, [months]);

  useEffect(() => {
    if (yearLoading) return;
    if (monthInitYearRef.current === year) return;
    monthInitYearRef.current = year;
    const idx = defaultBudgetBoardMonthIndex(year, months, now);
    setSelectedMonthIndex(idx);
  }, [yearLoading, year, months, now]);

  const selectedMonth = months[selectedMonthIndex] || months[0];
  const selectedKey = selectedMonth?.key;
  const selectedExpenses = selectedKey ? expensesByMonth[selectedKey] : undefined;
  const expensesReady = selectedKey != null && expensesByMonth[selectedKey] != null;

  const handleSelectMonth = (monthIndex: number) => {
    setSelectedMonthIndex(monthIndex);
    if (selectedFamily && loadedYear === year) {
      writeCache(selectedFamily.id, year, budgetsByMonth, expensesByMonth, monthIndex);
    }
  };

  const barPoints = useMemo(
    () =>
      months.map((m) => {
        const budgeted = m.budgeted;
        const paid = m.paidTotal;
        const unpaid = m.unpaidTotal;
        const projected = paid + unpaid;
        return {
          monthIndex: m.monthIndex,
          label: m.label,
          budgeted,
          spent: paid,
          unpaid,
          percentageUsed:
            budgeted > 0 ? (projected / budgeted) * 100 : projected > 0 ? 100 : 0,
        };
      }),
    [months]
  );

  const sortedBudgets = useMemo(() => {
    if (!selectedMonth) return [];
    return [...selectedMonth.budgets].sort((a, b) =>
      (a.category_name || '').localeCompare(b.category_name || '')
    );
  }, [selectedMonth]);

  const toneVariance = (n: number) =>
    n > 0 ? okColor : n < 0 ? spentColor : colors.text;

  const monthPaid = selectedMonth?.paidTotal ?? 0;
  const monthUnpaid = selectedMonth?.unpaidTotal ?? 0;
  const monthBudget = selectedMonth?.budgeted ?? 0;
  const monthProjected = monthPaid + monthUnpaid;
  const monthVariance = monthBudget - monthProjected;
  const monthVarianceLabel =
    monthVariance > 0.005 ? 'Under' : monthVariance < -0.005 ? 'Over' : 'On budget';
  const yearVarianceLabel =
    yearSummary.variance > 0.005
      ? 'Under'
      : yearSummary.variance < -0.005
        ? 'Over'
        : 'On budget';

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
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Budget</Text>
          <Text style={[styles.heroValue, { color: colors.primary }]}>
            {displayMoney(yearSummary.budgeted)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            {yearSummary.monthsWithBudgets} months
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Projected</Text>
          <Text style={[styles.heroValue, { color: spentColor }]}>
            {displayMoney(yearSummary.projected)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            Paid + Unpaid
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            {yearVarianceLabel}
          </Text>
          <Text
            style={[
              styles.heroValue,
              { color: toneVariance(yearSummary.variance) },
            ]}
          >
            {Math.abs(yearSummary.variance) > 0.005
              ? displayMoney(Math.abs(yearSummary.variance))
              : displayMoney(0)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            Budget − Projected
          </Text>
        </View>
      </View>
      <View style={[styles.heroGrid, { marginTop: 4 }]}>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Paid</Text>
          <Text style={[styles.heroValue, { color: spentColor }]}>
            {displayMoney(yearSummary.paid)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            {yearSummary.paidCount} items
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Unpaid</Text>
          <Text style={[styles.heroValue, { color: unpaidColor }]}>
            {displayMoney(yearSummary.unpaid)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            {yearSummary.unpaidCount} items
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
        Tap a month · Budget · Paid + Unpaid (stacked)
      </Text>
      <MonthBudgetBars
        points={barPoints}
        selectedMonthIndex={selectedMonthIndex}
        onSelectMonth={handleSelectMonth}
        budgetColor={colors.primary}
        spentColor={spentColor}
        unpaidColor={unpaidColor}
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
        <View style={styles.kpi}>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Budget</Text>
          <Text style={[styles.kpiValue, { color: colors.primary }]}>
            {displayMoney(monthBudget)}
          </Text>
          <Text style={[styles.kpiMeta, { color: colors.textSecondary }]}>
            Includes bill dues this month
          </Text>
        </View>
        <View style={styles.kpi}>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Projected</Text>
          <Text style={[styles.kpiValue, { color: spentColor }]}>
            {expensesReady ? displayMoney(monthProjected) : '…'}
          </Text>
          <Text style={[styles.kpiMeta, { color: colors.textSecondary }]}>
            Paid + Unpaid
          </Text>
        </View>
        <View style={styles.kpi}>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
            {monthVarianceLabel}
          </Text>
          <Text style={[styles.kpiValue, { color: toneVariance(monthVariance) }]}>
            {expensesReady
              ? Math.abs(monthVariance) > 0.005
                ? displayMoney(Math.abs(monthVariance))
                : displayMoney(0)
              : '…'}
          </Text>
          <Text style={[styles.kpiMeta, { color: colors.textSecondary }]}>
            Budget − Projected
          </Text>
        </View>
      </View>

      <View style={styles.monthKpis}>
        <View style={styles.kpi}>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Paid</Text>
          <Text style={[styles.kpiValue, { color: spentColor }]}>
            {expensesReady ? displayMoney(monthPaid) : '…'}
          </Text>
          <Text style={[styles.kpiMeta, { color: colors.textSecondary }]}>
            {expensesReady ? `${selectedMonth.paidCount} items` : 'Loading…'}
          </Text>
        </View>
        <View style={styles.kpi}>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Unpaid</Text>
          <Text style={[styles.kpiValue, { color: unpaidColor }]}>
            {expensesReady ? displayMoney(monthUnpaid) : '…'}
          </Text>
          <Text style={[styles.kpiMeta, { color: colors.textSecondary }]}>
            {expensesReady ? `${selectedMonth.unpaidCount} items` : 'Loading…'}
          </Text>
        </View>
      </View>

      <View style={[styles.categoriesDivider, { backgroundColor: colors.border }]} />
      <Text style={[styles.subSectionTitle, { color: colors.text }]}>Categories</Text>

      {sortedBudgets.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No budgets for this month
        </Text>
      ) : (
        <View style={styles.categoryList}>
          {sortedBudgets.map((budget) => {
            const split = expensesReady
              ? categoryPaidUnpaid(selectedExpenses, budget.category)
              : undefined;
            return (
              <BudgetCategoryRow
                key={budget.id}
                budget={budget}
                paidAmount={split?.paid}
                unpaidAmount={split?.unpaid}
                onEditBudget={onBudgetPress ? () => onBudgetPress(budget) : undefined}
                onDeleteBudget={
                  onBudgetDelete ? () => setBudgetPendingDelete(budget) : undefined
                }
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
            Projected = Paid + Unpaid. Under/Over is Budget − Projected. Standing =
            saved limit · This month may rise for bill dues · Manual is not overwritten
            by bills. Income and nets live on Overview.
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
          {onAddBudget ? (
            <TouchableOpacity
              style={[styles.addBudgetBtn, { backgroundColor: colors.primary }]}
              onPress={onAddBudget}
              accessibilityLabel="Add budget"
            >
              <FontAwesome name="plus" size={12} color="#fff" />
              <Text style={styles.addBudgetBtnText}>Add budget</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {error ? (
          <Text style={[styles.errorBanner, { color: colors.error || '#c0392b' }]}>
            {error}
          </Text>
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
            ? `Delete the ${budgetPendingDelete.category_name || 'category'} budget (Standing ${displayMoney(
                budgetPendingDelete.base_amount != null
                  ? budgetPendingDelete.base_amount
                  : budgetPendingDelete.amount
              )}, This month ${displayMoney(budgetPendingDelete.amount)})? This cannot be undone.`
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
            dismissedEnsureRef.current.add(
              `${selectedFamily.id}:${ensurePreview.through_year}`
            );
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
              dismissedEnsureRef.current.delete(`${familyId}:${y}`);
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
  addBudgetBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBudgetBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  kpiValue: { fontSize: 15, fontWeight: '800' },
  kpiMeta: { fontSize: 10, fontWeight: '500', lineHeight: 13 },
  categoriesDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 6,
    marginBottom: 2,
  },
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
