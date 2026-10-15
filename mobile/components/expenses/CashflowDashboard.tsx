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
import moneyService from '../../services/moneyService';
import { Budget, Expense } from '../../types/expenses';
import { IncomeOccurrence, IncomeStream, IncomeStreamType } from '../../types/money';
import {
  buildMonthlyCashflowSeries,
  cashflowTrackingStartMonthIndex,
  CashflowMonthPoint,
  CashflowOverBudgetRow,
  CashflowUnderBudgetRow,
  defaultDashboardMonthIndex,
  isExpensePaid,
  monthsInCashflowTracking,
  rollupCashflowSeries,
} from '../../utils/cashflow';
import { monthKey } from '../../utils/budgetSeries';
import AuthService from '../../services/authService';
import { STORAGE_KEYS, storage } from '../../utils/storage';
import {
  canUseMoneyDemoPortfolio,
  withDemoIncome,
} from '../../utils/moneyDemoPortfolio';
import DonutChart from './charts/DonutChart';
import MonthCashflowBars from './charts/MonthCashflowBars';

const UNPAID_COLOR = '#f59e0b';
const BUDGET_COLOR = '#6366f1';

/** Survive tab remounts so we don't re-POST generate_occurrences every visit. */
const ensuredCashflowScheduleKeys = new Set<string>();

type CashflowYearCache = {
  streams: IncomeStream[];
  occurrences: IncomeOccurrence[];
  expenses: Expense[];
  budgetsByMonth: Record<string, Budget[]>;
  demoPortfolio: boolean;
};

/** Keep last Overview year payload so Budgets → Overview doesn't cold-reload. */
const cashflowYearCache = new Map<string, CashflowYearCache>();

function cashflowCacheKey(familyId: number, y: number) {
  return `${familyId}:${y}`;
}

/** Drop cached Overview years after expense/income mutations so return isn't stale. */
export function invalidateCashflowYearCache(familyId?: number | null) {
  if (familyId == null) {
    cashflowYearCache.clear();
    return;
  }
  const prefix = `${familyId}:`;
  for (const key of [...cashflowYearCache.keys()]) {
    if (key.startsWith(prefix)) cashflowYearCache.delete(key);
  }
}

function monthTitle(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function emptyBudgetsByMonth(year: number): Record<string, Budget[]> {
  const next: Record<string, Budget[]> = {};
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    next[monthKey(year, monthIndex)] = [];
  }
  return next;
}

function normalizeBudgetsBoard(
  year: number,
  board: Record<string, Budget[]>
): Record<string, Budget[]> {
  const next = emptyBudgetsByMonth(year);
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const key = monthKey(year, monthIndex);
    next[key] = board[key] || [];
  }
  return next;
}

type DrillFilter = 'spent' | 'unpaid' | null;

type CashflowDashboardProps = {
  refreshKey?: number;
};

export default function CashflowDashboard({ refreshKey = 0 }: CashflowDashboardProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const isWide = useIsWideLayout();

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => now.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => now.getMonth());
  /** Donut / KPI drill: spent | unpaid | income | null */
  const [donutFilter, setDonutFilter] = useState<string | null>(null);
  const [drillFilter, setDrillFilter] = useState<DrillFilter>(null);

  const initialCache =
    selectedFamily != null
      ? cashflowYearCache.get(cashflowCacheKey(selectedFamily.id, now.getFullYear()))
      : undefined;

  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState('');
  const [streams, setStreams] = useState<IncomeStream[]>(() => initialCache?.streams ?? []);
  const [occurrences, setOccurrences] = useState<IncomeOccurrence[]>(
    () => initialCache?.occurrences ?? []
  );
  const [expenses, setExpenses] = useState<Expense[]>(() => initialCache?.expenses ?? []);
  const [budgetsByMonth, setBudgetsByMonth] = useState<Record<string, Budget[]>>(
    () => initialCache?.budgetsByMonth ?? emptyBudgetsByMonth(now.getFullYear())
  );
  const [demoPortfolio, setDemoPortfolio] = useState(() => initialCache?.demoPortfolio ?? false);
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(() =>
    initialCache && selectedFamily ? selectedFamily.id : null
  );
  const [loadedYear, setLoadedYear] = useState<number | null>(() =>
    initialCache ? now.getFullYear() : null
  );
  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  const ensuredYearRef = useRef('');
  const monthInitYearRef = useRef<number | null>(null);
  const streamsRef = useRef<IncomeStream[]>(streams);
  streamsRef.current = streams;

  const spentColor = colors.error || '#ef4444';
  const budgetColor = colors.primary || BUDGET_COLOR;

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setStreams([]);
    setOccurrences([]);
    setExpenses([]);
    setBudgetsByMonth({});
    setError('');
    setDataFamilyId(null);
    setLoadedYear(null);
    ensuredYearRef.current = '';
    monthInitYearRef.current = null;
    setLoading(true);
  }, []);

  const readDemoPortfolioPref = useCallback(async (): Promise<boolean> => {
    const user = await AuthService.getUserData();
    const email = user?.email || null;
    if (!canUseMoneyDemoPortfolio(email) || !email) return false;
    const key = `${STORAGE_KEYS.MONEY_DEMO_PORTFOLIO}:${email.toLowerCase()}`;
    const v = await storage.getItem(key);
    return v === '1';
  }, []);

  const ensureYearSchedule = useCallback(
    async (y: number, streamList: IncomeStream[], familyId: number) => {
      if (streamList.length === 0) return false;
      if (streamList.some((s) => s.family !== familyId)) return false;
      const key = `${familyId}:${y}:${streamList.map((s) => s.id).join(',')}`;
      if (ensuredYearRef.current === key || ensuredCashflowScheduleKeys.has(key)) {
        ensuredYearRef.current = key;
        return false;
      }
      const yearStart = `${y}-01-01`;
      const yearEnd = `${y}-12-31`;
      let createdAny = false;
      try {
        const results = await Promise.all(
          streamList.map(async (s) => {
            if (s.start_date > yearEnd) return 0;
            if (s.end_date && s.end_date < yearStart) return 0;
            let until = yearEnd;
            if (s.end_date && s.end_date < until) until = s.end_date;
            const res = await moneyService.generateOccurrences(s.id, until);
            return res.created;
          })
        );
        createdAny = results.some((n) => n > 0);
        ensuredYearRef.current = key;
        ensuredCashflowScheduleKeys.add(key);
      } catch {
        // ignore auto-fill errors
      }
      return createdAny;
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
      const cached = cashflowYearCache.get(cashflowCacheKey(familyId, year));
      // Soft return only when cache has budgets (shape from budget-aware Overview).
      const cacheComplete = !!cached?.budgetsByMonth;
      if (cached && cacheComplete) {
        setDemoPortfolio(cached.demoPortfolio);
        setStreams(cached.streams);
        setOccurrences(cached.occurrences);
        setExpenses(cached.expenses);
        setBudgetsByMonth(cached.budgetsByMonth);
        setDataFamilyId(familyId);
        setLoadedYear(year);
        setLoading(false);
        // Cached tab return: skip network (mutations clear cache), but always
        // re-read demo overlay so Profile toggle updates Income / nets without
        // a cold reload. Budgets / expenses stay real either way.
        if (soft) {
          void readDemoPortfolioPref().then((demoEnabled) => {
            if (
              generation !== fetchGenerationRef.current ||
              selectedFamilyIdRef.current !== familyId
            ) {
              return;
            }
            setDemoPortfolio(demoEnabled);
            const prev = cashflowYearCache.get(cashflowCacheKey(familyId, year));
            if (prev && prev.demoPortfolio !== demoEnabled) {
              cashflowYearCache.set(cashflowCacheKey(familyId, year), {
                ...prev,
                demoPortfolio: demoEnabled,
              });
            }
          });
          return;
        }
      } else if (!soft) {
        setLoading(true);
      }
      setError('');
      try {
        const demoEnabled = await readDemoPortfolioPref();
        const start_date = `${year}-01-01`;
        const end_date = `${year}-12-31`;
        const existingStreams = streamsRef.current;
        const reuseStreams =
          soft &&
          existingStreams.length > 0 &&
          existingStreams.every((s) => s.family === familyId);

        const [streamList, occs, expList, board] = await Promise.all([
          reuseStreams
            ? Promise.resolve(existingStreams)
            : moneyService.getStreams(familyId),
          moneyService.getOccurrences(familyId, { start_date, end_date }),
          expenseService.getExpenses(familyId, { start_date, end_date }),
          expenseService.getBudgetsYearBoard(familyId, year, true),
        ]);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        const budgets = normalizeBudgetsBoard(year, board);
        setDemoPortfolio(demoEnabled);
        setStreams(streamList);
        setOccurrences(occs);
        setExpenses(expList);
        setBudgetsByMonth(budgets);
        setDataFamilyId(familyId);
        setLoadedYear(year);
        setLoading(false);
        cashflowYearCache.set(cashflowCacheKey(familyId, year), {
          streams: streamList,
          occurrences: occs,
          expenses: expList,
          budgetsByMonth: budgets,
          demoPortfolio: demoEnabled,
        });

        const createdAny = await ensureYearSchedule(year, streamList, familyId);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        if (createdAny) {
          const refreshed = await moneyService.getOccurrences(familyId, {
            start_date,
            end_date,
          });
          if (
            generation !== fetchGenerationRef.current ||
            selectedFamilyIdRef.current !== familyId
          ) {
            return;
          }
          setOccurrences(refreshed);
          const prev = cashflowYearCache.get(cashflowCacheKey(familyId, year));
          if (prev) {
            cashflowYearCache.set(cashflowCacheKey(familyId, year), {
              ...prev,
              occurrences: refreshed,
            });
          }
        }
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load dashboard');
        if (!cached) {
          setStreams([]);
          setOccurrences([]);
          setExpenses([]);
          setBudgetsByMonth({});
          setDataFamilyId(null);
          setLoadedYear(null);
        }
      } finally {
        if (
          generation === fetchGenerationRef.current &&
          selectedFamilyIdRef.current === familyId
        ) {
          setLoading(false);
        }
      }
    },
    [selectedFamily, year, clearState, ensureYearSchedule, readDemoPortfolioPref]
  );

  useEffect(() => {
    // Family switch: drop in-memory board state; year cache entries for other families stay.
    clearState();
    if (selectedFamily) {
      const cached = cashflowYearCache.get(
        cashflowCacheKey(selectedFamily.id, year)
      );
      if (cached?.budgetsByMonth) {
        setDemoPortfolio(cached.demoPortfolio);
        setStreams(cached.streams);
        setOccurrences(cached.occurrences);
        setExpenses(cached.expenses);
        setBudgetsByMonth(cached.budgetsByMonth);
        setDataFamilyId(selectedFamily.id);
        setLoadedYear(year);
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) return;
      const cached = cashflowYearCache.get(
        cashflowCacheKey(selectedFamily.id, year)
      );
      const cacheHit = !!cached?.budgetsByMonth;
      // Soft when we already showed this family (tab return / year change) or have cache.
      const soft =
        cacheHit || dataFamilyId === selectedFamily.id || loadedYear != null;
      void load({ soft });
    }, [selectedFamily?.id, load, dataFamilyId, loadedYear, year])
  );

  // Only react when refreshKey actually changes — not on every remount (refreshKey is
  // often > 0). Remount + invalidate was wiping the tab cache and causing random spinners.
  const lastRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (!selectedFamily) return;
    if (refreshKey === lastRefreshKeyRef.current) return;
    lastRefreshKeyRef.current = refreshKey;
    // Force network (soft would reuse streams / skip after cache paint).
    void load({ soft: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const streamTypeById = useMemo(() => {
    const map = new Map<number, IncomeStreamType>();
    for (const s of streams) map.set(s.id, s.stream_type);
    return map;
  }, [streams]);

  const displayOccurrences = useMemo(() => {
    if (!demoPortfolio) return occurrences;
    return occurrences.map((o) => {
      const streamType = streamTypeById.get(o.stream);
      const estimated = withDemoIncome(o.estimated_amount, streamType, true);
      const actual =
        o.actual_amount == null
          ? null
          : withDemoIncome(o.actual_amount, streamType, true);
      return {
        ...o,
        estimated_amount: estimated ?? o.estimated_amount,
        actual_amount: actual,
      };
    });
  }, [occurrences, demoPortfolio, streamTypeById]);

  const months = useMemo(
    () => buildMonthlyCashflowSeries(displayOccurrences, expenses, year, budgetsByMonth),
    [displayOccurrences, expenses, year, budgetsByMonth]
  );

  // Months before the first income month are incomplete / not tracked — exclude from year totals.
  const trackingStartMonth = useMemo(
    () => cashflowTrackingStartMonthIndex(months),
    [months]
  );
  const trackedMonths = useMemo(() => monthsInCashflowTracking(months), [months]);
  const yearSummary = useMemo(() => rollupCashflowSeries(trackedMonths), [trackedMonths]);

  useEffect(() => {
    if (loading) return;
    if (monthInitYearRef.current === year) return;
    monthInitYearRef.current = year;
    setSelectedMonthIndex(defaultDashboardMonthIndex(year, months, now));
  }, [loading, year, months, now]);

  useEffect(() => {
    setDonutFilter(null);
    setDrillFilter(null);
  }, [selectedMonthIndex, year]);

  const selectedMonth = months[selectedMonthIndex] || months[0];

  const handleSelectMonth = (monthIndex: number) => {
    setSelectedMonthIndex(monthIndex);
    setDrillFilter(null);
    setDonutFilter(null);
  };

  const toggleDrill = (key: DrillFilter) => {
    setDrillFilter((prev) => (prev === key ? null : key));
    if (key) setDonutFilter(key);
    else setDonutFilter(null);
  };

  const barPoints = useMemo(
    () =>
      months.map((m) => {
        const tracked = trackingStartMonth < 0 || m.monthIndex >= trackingStartMonth;
        if (!tracked) {
          return {
            monthIndex: m.monthIndex,
            label: m.label,
            income: 0,
            budget: 0,
            spent: 0,
            unpaid: 0,
            plannedNet: 0,
            netAfterUnpaid: 0,
          };
        }
        return {
          monthIndex: m.monthIndex,
          label: m.label,
          income: m.incomeTotal,
          budget: m.budgetTotal,
          spent: m.spentTotal,
          unpaid: m.unpaidTotal,
          plannedNet: m.plannedNet,
          netAfterUnpaid: m.netAfterUnpaid,
        };
      }),
    [months, trackingStartMonth]
  );

  const donutSlices = useMemo(() => {
    if (!selectedMonth) return [];
    return [
      {
        key: 'income',
        label: 'Income',
        amount: selectedMonth.incomeTotal,
        color: colors.success,
      },
      {
        key: 'spent',
        label: 'Paid',
        amount: selectedMonth.spentTotal,
        color: spentColor,
      },
      {
        key: 'unpaid',
        label: 'Unpaid',
        amount: selectedMonth.unpaidTotal,
        color: UNPAID_COLOR,
      },
    ];
  }, [selectedMonth, colors.success, spentColor]);

  const toneFor = (n: number) =>
    n > 0 ? colors.success : n < 0 ? spentColor : colors.text;

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  const trackingHint =
    trackingStartMonth > 0
      ? `Totals from ${months[trackingStartMonth]?.label ?? ''}–Dec (months before first income ignored)`
      : trackingStartMonth < 0
        ? 'No income months yet — year totals are empty'
        : null;

  const yearHero = (
    <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>Year overview</Text>
      {trackingHint ? (
        <Text style={[styles.sectionHint, { color: colors.textSecondary, marginBottom: 8 }]}>
          {trackingHint}
        </Text>
      ) : null}
      <View style={styles.heroGrid}>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Income</Text>
          <Text style={[styles.heroValue, { color: colors.success }]}>
            {displayMoney(yearSummary.incomeTotal)}
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Budget</Text>
          <Text style={[styles.heroValue, { color: budgetColor }]}>
            {displayMoney(yearSummary.budgetTotal)}
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Actual</Text>
          <Text style={[styles.heroValue, { color: spentColor }]}>
            {displayMoney(yearSummary.spentTotal + yearSummary.unpaidTotal)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            {yearSummary.paidCount} paid · {yearSummary.unpaidCount} unpaid
          </Text>
        </View>
      </View>
      <View style={[styles.heroGrid, { marginTop: 4 }]}>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Planned net</Text>
          <Text style={[styles.heroValue, { color: toneFor(yearSummary.plannedNet) }]}>
            {displayMoney(yearSummary.plannedNet)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>Income − Budget</Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Actual net</Text>
          <Text style={[styles.heroValue, { color: toneFor(yearSummary.netAfterUnpaid) }]}>
            {displayMoney(yearSummary.netAfterUnpaid)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            After paid + unpaid
          </Text>
        </View>
      </View>
    </View>
  );

  const monthBars = (
    <View
      style={[
        styles.sectionCard,
        styles.chartCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Monthly cashflow</Text>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        Hover or tap a month · income · budget · paid + unpaid
      </Text>
      <MonthCashflowBars
        points={barPoints}
        selectedMonthIndex={selectedMonthIndex}
        onSelectMonth={handleSelectMonth}
        incomeColor={colors.success}
        budgetColor={budgetColor}
        spentColor={spentColor}
        unpaidColor={UNPAID_COLOR}
        trackColor={colors.border}
        textColor={colors.text}
        mutedColor={colors.textSecondary}
        selectedBorderColor={colors.primary}
        formatAmount={displayMoney}
      />
    </View>
  );

  const showPaidDrill = drillFilter === 'spent' || donutFilter === 'spent';
  const showUnpaidDrill = drillFilter === 'unpaid' || donutFilter === 'unpaid';
  const showDrill = showPaidDrill || showUnpaidDrill;
  const showVariance =
    !!selectedMonth &&
    !showDrill &&
    (selectedMonth.overBudget.length > 0 ||
      selectedMonth.underBudget.length > 0 ||
      selectedMonth.unbudgeted.length > 0);

  const monthActualTotal = selectedMonth
    ? selectedMonth.spentTotal + selectedMonth.unpaidTotal
    : 0;
  const monthBudgetVariance = selectedMonth
    ? selectedMonth.budgetTotal - monthActualTotal
    : 0;
  const monthVarianceLabel =
    monthBudgetVariance > 0 ? 'Under' : monthBudgetVariance < 0 ? 'Over' : 'On budget';
  const monthVarianceValue =
    monthBudgetVariance === 0
      ? displayMoney(0)
      : displayMoney(Math.abs(monthBudgetVariance));

  const monthDetail = selectedMonth ? (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {monthTitle(year, selectedMonth.monthIndex)}
      </Text>

      <View style={styles.monthKpis}>
        <Kpi
          label="Income"
          value={displayMoney(selectedMonth.incomeTotal)}
          color={colors.success}
          muted={colors.textSecondary}
        />
      </View>

      <View style={styles.monthKpis}>
        <Kpi
          label="Budget"
          value={displayMoney(selectedMonth.budgetTotal)}
          color={budgetColor}
          muted={colors.textSecondary}
        />
        <Kpi
          label="Actual"
          value={displayMoney(monthActualTotal)}
          color={spentColor}
          muted={colors.textSecondary}
          meta={`${selectedMonth.paidCount} paid · ${selectedMonth.unpaidCount} unpaid`}
          onPress={() => {
            if (drillFilter === null) toggleDrill('spent');
            else if (drillFilter === 'spent') toggleDrill('unpaid');
            else {
              setDrillFilter(null);
              setDonutFilter(null);
            }
          }}
          selected={drillFilter === 'spent' || drillFilter === 'unpaid'}
          selectedBorder={colors.primary}
        />
        <Kpi
          label={monthVarianceLabel}
          value={monthVarianceValue}
          color={toneFor(monthBudgetVariance)}
          muted={colors.textSecondary}
          meta="Budget − Actual"
        />
      </View>

      <View style={styles.monthKpis}>
        <Kpi
          label="Planned net"
          value={displayMoney(selectedMonth.plannedNet)}
          color={toneFor(selectedMonth.plannedNet)}
          muted={colors.textSecondary}
          meta="Income − Budget"
        />
        <Kpi
          label="Actual net"
          value={displayMoney(selectedMonth.netAfterUnpaid)}
          color={toneFor(selectedMonth.netAfterUnpaid)}
          muted={colors.textSecondary}
          meta="After paid + unpaid"
        />
      </View>

      <View style={styles.donutBlock}>
        <DonutChart
          slices={donutSlices}
          textColor={colors.text}
          mutedColor={colors.textSecondary}
          trackColor={colors.border}
          selectedKey={donutFilter}
          onSelectSlice={(key) => {
            setDonutFilter(key);
            if (key === 'spent' || key === 'unpaid') {
              setDrillFilter(key);
            } else {
              setDrillFilter(null);
            }
          }}
          centerLabel={displayMoney(
            selectedMonth.incomeTotal ||
              selectedMonth.spentTotal + selectedMonth.unpaidTotal
          )}
          centerSubLabel={
            donutFilter
              ? donutSlices.find((s) => s.key === donutFilter)?.label || 'Filtered'
              : 'Activity'
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
                onPress={() => {
                  const next = active ? null : s.key;
                  setDonutFilter(next);
                  if (next === 'spent' || next === 'unpaid') setDrillFilter(next);
                  else setDrillFilter(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
                <Text style={[styles.donutLegendLabel, { color: colors.text }]}>{s.label}</Text>
                <Text style={[styles.donutLegendAmt, { color: colors.textSecondary }]}>
                  {displayMoney(s.amount)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {showDrill ? (
        <ExpenseDrillBreakdown
          key={`${showPaidDrill ? 'paid' : 'unpaid'}-${selectedMonth.monthIndex}-${year}`}
          mode={showPaidDrill ? 'paid' : 'unpaid'}
          month={selectedMonth}
          amountColor={showPaidDrill ? spentColor : UNPAID_COLOR}
          underColor={colors.success}
          textColor={colors.text}
          mutedColor={colors.textSecondary}
          borderColor={colors.border}
          formatAmount={displayMoney}
          monthVarianceLabel={monthVarianceLabel}
          monthVarianceValue={monthVarianceValue}
          showReconcile={monthBudgetVariance !== 0}
        />
      ) : null}

      {showVariance ? (
        <View style={styles.varianceBlock}>
          <Text style={[styles.subSectionTitle, { color: colors.text }]}>
            Outside budget
          </Text>
          <Text style={[styles.varianceCaption, { color: colors.textSecondary }]}>
            Explains month Under/Over: category gaps use paid + unpaid vs budget
          </Text>
          {selectedMonth.overBudget.length > 0 ? (
            <>
              <Text
                style={[
                  styles.varianceCaption,
                  { color: colors.textSecondary, marginTop: 6 },
                ]}
              >
                Over budget
              </Text>
              {selectedMonth.overBudget.map((row) => (
                <View
                  key={`over-${row.key}`}
                  style={[styles.varianceRow, { borderBottomColor: colors.border }]}
                >
                  <View style={styles.varianceMain}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                      {row.label}
                    </Text>
                    <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                      Actual {displayMoney(row.actualAmount)}
                      {row.unpaidAmount > 0
                        ? ` (${displayMoney(row.paidAmount)} paid · ${displayMoney(row.unpaidAmount)} unpaid)`
                        : ''}
                      {' · Budget '}
                      {displayMoney(row.budgetAmount)}
                    </Text>
                  </View>
                  <Text style={[styles.itemAmount, { color: spentColor }]}>
                    +{displayMoney(row.overBy)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
          {selectedMonth.unbudgeted.length > 0 ? (
            <>
              <Text
                style={[
                  styles.varianceCaption,
                  {
                    color: colors.textSecondary,
                    marginTop:
                      selectedMonth.overBudget.length > 0 ||
                      selectedMonth.underBudget.length > 0
                        ? 10
                        : 6,
                  },
                ]}
              >
                Unbudgeted items
              </Text>
              {selectedMonth.unbudgeted.map((e) => (
                <View
                  key={`unb-${e.id}`}
                  style={[styles.varianceRow, { borderBottomColor: colors.border }]}
                >
                  <View style={styles.varianceMain}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                      {e.description || 'Expense'}
                    </Text>
                    <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                      {formatShortDate(e.expense_date)}
                      {e.category_name ? ` · ${e.category_name}` : ''}
                      {e.is_paid === false ? ' · unpaid' : ''}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.itemAmount,
                      { color: e.is_paid === false ? UNPAID_COLOR : spentColor },
                    ]}
                  >
                    +{displayMoney(Number(e.amount) || 0)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
          {selectedMonth.underBudget.length > 0 ? (
            <>
              <Text
                style={[
                  styles.varianceCaption,
                  {
                    color: colors.textSecondary,
                    marginTop:
                      selectedMonth.overBudget.length > 0 ||
                      selectedMonth.unbudgeted.length > 0
                        ? 10
                        : 6,
                  },
                ]}
              >
                Under budget (offsets Over)
              </Text>
              {selectedMonth.underBudget.map((row) => (
                <View
                  key={`under-${row.key}`}
                  style={[styles.varianceRow, { borderBottomColor: colors.border }]}
                >
                  <View style={styles.varianceMain}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                      {row.label}
                    </Text>
                    <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                      Actual {displayMoney(row.actualAmount)} · Budget{' '}
                      {displayMoney(row.budgetAmount)}
                    </Text>
                  </View>
                  <Text style={[styles.itemAmount, { color: colors.success }]}>
                    −{displayMoney(row.underBy)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
          {monthBudgetVariance !== 0 ? (
            <Text style={[styles.varianceReconcile, { color: colors.textSecondary }]}>
              Overs + unbudgeted − unders = month {monthVarianceLabel}{' '}
              {monthVarianceValue}
            </Text>
          ) : null}
        </View>
      ) : null}

      {donutFilter === 'income' && !showPaidDrill && !showUnpaidDrill ? (
        <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
          Income has no expense line items — tap Paid or Unpaid for details.
        </Text>
      ) : null}
    </View>
  ) : null;

  return (
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

      {loading && !(dataFamilyId === selectedFamily?.id && loadedYear === year) ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {isWide ? (
            <View style={styles.wideRow}>
              <View style={styles.wideCol}>
                {yearHero}
                {monthBars}
              </View>
              <View style={styles.wideCol}>{monthDetail}</View>
            </View>
          ) : (
            <>
              {yearHero}
              {monthBars}
              {monthDetail}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Kpi({
  label,
  value,
  color,
  muted,
  meta,
  onPress,
  selected,
  selectedBorder,
}: {
  label: string;
  value: string;
  color: string;
  muted: string;
  meta?: string;
  onPress?: () => void;
  selected?: boolean;
  selectedBorder?: string;
}) {
  const body = (
    <>
      <Text style={[styles.kpiLabel, { color: muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.kpiValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text
        style={[styles.kpiMeta, { color: muted, opacity: meta ? 1 : 0 }]}
        numberOfLines={1}
      >
        {meta || ' '}
      </Text>
    </>
  );
  const boxStyle = [
    styles.kpi,
    styles.kpiCell,
    selected && selectedBorder ? { borderColor: selectedBorder } : null,
  ];
  if (onPress) {
    return (
      <TouchableOpacity
        style={boxStyle}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected }}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={boxStyle}>{body}</View>;
}

type DrillCategoryGroup = {
  key: string;
  label: string;
  amount: number;
  items: Expense[];
  meta?: string;
};

function groupExpensesByCategory(items: Expense[]): DrillCategoryGroup[] {
  const map = new Map<string, DrillCategoryGroup>();
  for (const e of items) {
    const key = String(e.category ?? 'none');
    const label = (e.category_name || '').trim() || `Category ${e.category}`;
    const amt = Number(e.amount) || 0;
    const existing = map.get(key);
    if (existing) {
      existing.amount += amt;
      existing.items.push(e);
    } else {
      map.set(key, { key, label, amount: amt, items: [e] });
    }
  }
  for (const g of map.values()) {
    g.items.sort(
      (a, b) =>
        a.expense_date.localeCompare(b.expense_date) ||
        (a.description || '').localeCompare(b.description || '')
    );
  }
  return [...map.values()].sort(
    (a, b) => b.amount - a.amount || a.label.localeCompare(b.label)
  );
}

function CollapsibleBlock({
  title,
  amount,
  amountColor,
  textColor,
  mutedColor,
  borderColor,
  formatAmount,
  depth = 0,
  defaultOpen = false,
  children,
  emptyText,
  hasContent,
}: {
  title: string;
  amount?: number;
  amountColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  formatAmount: (n: number) => string;
  depth?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  emptyText?: string;
  hasContent: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View
      style={[
        styles.collapseBlock,
        depth > 0 && styles.collapseNested,
        depth > 0 && { borderLeftColor: borderColor },
      ]}
    >
      <TouchableOpacity
        style={styles.collapseHeader}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <FontAwesome
          name={open ? 'chevron-down' : 'chevron-right'}
          size={depth > 0 ? 11 : 12}
          color={mutedColor}
          style={styles.collapseChevron}
        />
        <Text
          style={[
            depth > 0 ? styles.collapseCatTitle : styles.collapseSectionTitle,
            { color: textColor, flex: 1 },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {amount != null ? (
          <Text style={[styles.collapseAmount, { color: amountColor }]}>
            {formatAmount(amount)}
          </Text>
        ) : null}
      </TouchableOpacity>
      {open ? (
        hasContent ? (
          <View style={styles.collapseBody}>{children}</View>
        ) : emptyText ? (
          <Text style={[styles.emptyHint, { color: mutedColor, marginLeft: 20 }]}>
            {emptyText}
          </Text>
        ) : null
      ) : null}
    </View>
  );
}

function CompactExpenseLine({
  expense,
  amountColor,
  textColor,
  mutedColor,
  borderColor,
  formatAmount,
}: {
  expense: Expense;
  amountColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  formatAmount: (n: number) => string;
}) {
  return (
    <View style={[styles.itemRowCompact, { borderBottomColor: borderColor }]}>
      <Text style={[styles.itemTitle, { color: textColor, flex: 1, minWidth: 0 }]} numberOfLines={1}>
        {expense.description || 'Expense'}
      </Text>
      <Text style={[styles.itemMetaInline, { color: mutedColor }]}>
        {formatShortDate(expense.expense_date)}
      </Text>
      <Text style={[styles.itemAmount, { color: amountColor }]}>
        {formatAmount(Number(expense.amount) || 0)}
      </Text>
    </View>
  );
}

function ExpenseDrillBreakdown({
  mode,
  month,
  amountColor,
  underColor,
  textColor,
  mutedColor,
  borderColor,
  formatAmount,
  monthVarianceLabel,
  monthVarianceValue,
  showReconcile,
}: {
  mode: 'paid' | 'unpaid';
  month: CashflowMonthPoint;
  amountColor: string;
  underColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  formatAmount: (n: number) => string;
  monthVarianceLabel: string;
  monthVarianceValue: string;
  showReconcile: boolean;
}) {
  const primaryItems = mode === 'paid' ? month.paidExpenses : month.unpaidExpenses;
  const primaryGroups = useMemo(
    () => groupExpensesByCategory(primaryItems),
    [primaryItems]
  );
  const primaryTotal =
    mode === 'paid' ? month.spentTotal : month.unpaidTotal;

  const overRows: CashflowOverBudgetRow[] = useMemo(() => {
    return month.overBudget.filter((r) =>
      mode === 'paid' ? r.paidAmount > 0.005 : r.unpaidAmount > 0.005
    );
  }, [month.overBudget, mode]);

  const overGroups = useMemo(() => {
    const byKey = new Map(overRows.map((r) => [r.key, r]));
    const items = primaryItems.filter((e) => byKey.has(String(e.category)));
    return groupExpensesByCategory(items).map((g) => {
      const row = byKey.get(g.key);
      return {
        ...g,
        meta: row
          ? `Budget ${formatAmount(row.budgetAmount)} · Over ${formatAmount(row.overBy)}`
          : undefined,
        amount: mode === 'paid' ? (row?.paidAmount ?? g.amount) : (row?.unpaidAmount ?? g.amount),
      };
    });
  }, [overRows, primaryItems, mode, formatAmount]);

  // Under is category-level (actual vs budget), same list for paid/unpaid drills.
  const underRows: CashflowUnderBudgetRow[] = month.underBudget;

  const underGroups = useMemo(() => {
    const byKey = new Map(underRows.map((r) => [r.key, r]));
    // Include under categories even when this mode has no line items yet (room left).
    const fromItems = groupExpensesByCategory(
      primaryItems.filter((e) => byKey.has(String(e.category)))
    );
    const seen = new Set(fromItems.map((g) => g.key));
    const groups = fromItems.map((g) => {
      const row = byKey.get(g.key);
      return {
        ...g,
        meta: row
          ? `Actual ${formatAmount(row.actualAmount)} · Budget ${formatAmount(row.budgetAmount)}`
          : undefined,
        amount: row?.underBy ?? 0,
      };
    });
    for (const row of underRows) {
      if (seen.has(row.key)) continue;
      groups.push({
        key: row.key,
        label: row.label,
        amount: row.underBy,
        items: [],
        meta: `Actual ${formatAmount(row.actualAmount)} · Budget ${formatAmount(row.budgetAmount)}`,
      });
    }
    return groups.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  }, [underRows, primaryItems, formatAmount]);

  const underTotal = underGroups.reduce((s, g) => s + g.amount, 0);

  const unbudgetedItems = useMemo(
    () =>
      month.unbudgeted.filter((e) =>
        mode === 'paid' ? isExpensePaid(e) : e.is_paid === false
      ),
    [month.unbudgeted, mode]
  );
  const unbudgetedGroups = useMemo(
    () => groupExpensesByCategory(unbudgetedItems),
    [unbudgetedItems]
  );
  const unbudgetedTotal = unbudgetedItems.reduce(
    (s, e) => s + (Number(e.amount) || 0),
    0
  );

  const primaryTitle = mode === 'paid' ? 'Paid this month' : 'Left to pay';

  return (
    <View style={styles.drillBlock}>
      <CollapsibleBlock
        title={primaryTitle}
        amount={primaryTotal}
        amountColor={amountColor}
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
        formatAmount={formatAmount}
        hasContent={primaryGroups.length > 0}
        emptyText={mode === 'paid' ? 'No paid expenses this month' : 'No unpaid expenses this month'}
      >
        {primaryGroups.map((g) => (
          <CollapsibleBlock
            key={`pri-${g.key}`}
            title={g.label}
            amount={g.amount}
            amountColor={amountColor}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            formatAmount={formatAmount}
            depth={1}
            hasContent={g.items.length > 0}
          >
            {g.items.map((e) => (
              <CompactExpenseLine
                key={e.id}
                expense={e}
                amountColor={amountColor}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
                formatAmount={formatAmount}
              />
            ))}
          </CollapsibleBlock>
        ))}
      </CollapsibleBlock>

      <CollapsibleBlock
        title="Outside budget"
        amount={overGroups.reduce((s, g) => s + g.amount, 0)}
        amountColor={amountColor}
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
        formatAmount={formatAmount}
        hasContent={overGroups.length > 0}
        emptyText="No over-budget categories for these items"
      >
        {overGroups.map((g) => (
          <CollapsibleBlock
            key={`over-${g.key}`}
            title={g.label}
            amount={g.amount}
            amountColor={amountColor}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            formatAmount={formatAmount}
            depth={1}
            hasContent={g.items.length > 0}
          >
            {g.meta ? (
              <Text style={[styles.itemMeta, { color: mutedColor, marginBottom: 2 }]} numberOfLines={1}>
                {g.meta}
              </Text>
            ) : null}
            {g.items.map((e) => (
              <CompactExpenseLine
                key={e.id}
                expense={e}
                amountColor={amountColor}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
                formatAmount={formatAmount}
              />
            ))}
          </CollapsibleBlock>
        ))}
      </CollapsibleBlock>

      <CollapsibleBlock
        title="Unbudgeted"
        amount={unbudgetedTotal}
        amountColor={amountColor}
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
        formatAmount={formatAmount}
        hasContent={unbudgetedGroups.length > 0}
        emptyText="No unbudgeted items"
      >
        {unbudgetedGroups.map((g) => (
          <CollapsibleBlock
            key={`unb-${g.key}`}
            title={g.label}
            amount={g.amount}
            amountColor={amountColor}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            formatAmount={formatAmount}
            depth={1}
            hasContent={g.items.length > 0}
          >
            {g.items.map((e) => (
              <CompactExpenseLine
                key={e.id}
                expense={e}
                amountColor={amountColor}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
                formatAmount={formatAmount}
              />
            ))}
          </CollapsibleBlock>
        ))}
      </CollapsibleBlock>

      <CollapsibleBlock
        title="Under budget"
        amount={underTotal}
        amountColor={underColor}
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
        formatAmount={formatAmount}
        hasContent={underGroups.length > 0}
        emptyText="No under-budget categories"
      >
        {underGroups.map((g) => (
          <CollapsibleBlock
            key={`under-${g.key}`}
            title={g.label}
            amount={g.amount}
            amountColor={underColor}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            formatAmount={formatAmount}
            depth={1}
            hasContent={g.items.length > 0 || !!g.meta}
          >
            {g.meta ? (
              <Text style={[styles.itemMeta, { color: mutedColor, marginBottom: 2 }]} numberOfLines={1}>
                {g.meta}
              </Text>
            ) : null}
            {g.items.map((e) => (
              <CompactExpenseLine
                key={e.id}
                expense={e}
                amountColor={amountColor}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
                formatAmount={formatAmount}
              />
            ))}
          </CollapsibleBlock>
        ))}
      </CollapsibleBlock>

      {showReconcile ? (
        <Text style={[styles.varianceReconcile, { color: mutedColor }]}>
          Overs + unbudgeted − unders = month {monthVarianceLabel} {monthVarianceValue}
        </Text>
      ) : null}
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
  chartCard: {
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', alignSelf: 'stretch' },
  emptyHint: { fontSize: 13, fontWeight: '500', marginTop: 8 },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: -4,
    alignSelf: 'stretch',
  },
  monthKpis: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    gap: 8,
  },
  kpi: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kpiCell: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  kpiLabel: { fontSize: 11, fontWeight: '600' },
  kpiValue: { fontSize: 14, fontWeight: '800' },
  kpiMeta: { fontSize: 10, fontWeight: '500', minHeight: 13 },
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
  drillBlock: { gap: 8, marginTop: 4 },
  collapseBlock: { gap: 2 },
  collapseNested: {
    marginLeft: 6,
    paddingLeft: 8,
    borderLeftWidth: 2,
  },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  collapseChevron: { width: 14, textAlign: 'center' },
  collapseSectionTitle: { fontSize: 14, fontWeight: '800' },
  collapseCatTitle: { fontSize: 13, fontWeight: '700' },
  collapseAmount: { fontSize: 13, fontWeight: '800' },
  collapseBody: { gap: 2, paddingBottom: 4 },
  varianceBlock: { gap: 4, marginTop: 8 },
  varianceCaption: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  varianceReconcile: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 10,
    opacity: 0.85,
  },
  varianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  varianceMain: { flex: 1, minWidth: 0, gap: 2 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemTitle: { fontSize: 13, fontWeight: '600' },
  itemMeta: { fontSize: 11, fontWeight: '500' },
  itemMetaInline: { fontSize: 11, fontWeight: '500', flexShrink: 0 },
  itemAmount: { fontSize: 13, fontWeight: '800', flexShrink: 0 },
});
