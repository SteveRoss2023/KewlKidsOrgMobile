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
import { Expense } from '../../types/expenses';
import { IncomeOccurrence, IncomeStream, IncomeStreamType } from '../../types/money';
import {
  buildMonthlyCashflowSeries,
  defaultDashboardMonthIndex,
  rollupCashflowSeries,
} from '../../utils/cashflow';
import AuthService from '../../services/authService';
import { STORAGE_KEYS, storage } from '../../utils/storage';
import {
  canUseMoneyDemoPortfolio,
  withDemoIncome,
} from '../../utils/moneyDemoPortfolio';
import DonutChart from './charts/DonutChart';
import MonthCashflowBars from './charts/MonthCashflowBars';
import CategoryHBars from './charts/CategoryHBars';

const UNPAID_COLOR = '#f59e0b';

/** Survive tab remounts so we don't re-POST generate_occurrences every visit. */
const ensuredCashflowScheduleKeys = new Set<string>();

type CashflowYearCache = {
  streams: IncomeStream[];
  occurrences: IncomeOccurrence[];
  expenses: Expense[];
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

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setStreams([]);
    setOccurrences([]);
    setExpenses([]);
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
      if (cached) {
        setDemoPortfolio(cached.demoPortfolio);
        setStreams(cached.streams);
        setOccurrences(cached.occurrences);
        setExpenses(cached.expenses);
        setDataFamilyId(familyId);
        setLoadedYear(year);
        setLoading(false);
        // Cached tab return: skip network (mutations clear cache).
        if (soft) return;
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

        const [streamList, occs, expList] = await Promise.all([
          reuseStreams
            ? Promise.resolve(existingStreams)
            : moneyService.getStreams(familyId),
          moneyService.getOccurrences(familyId, { start_date, end_date }),
          expenseService.getExpenses(familyId, { start_date, end_date }),
        ]);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setDemoPortfolio(demoEnabled);
        setStreams(streamList);
        setOccurrences(occs);
        setExpenses(expList);
        setDataFamilyId(familyId);
        setLoadedYear(year);
        setLoading(false);
        cashflowYearCache.set(cashflowCacheKey(familyId, year), {
          streams: streamList,
          occurrences: occs,
          expenses: expList,
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
      if (cached) {
        setDemoPortfolio(cached.demoPortfolio);
        setStreams(cached.streams);
        setOccurrences(cached.occurrences);
        setExpenses(cached.expenses);
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
      const cacheHit = cashflowYearCache.has(
        cashflowCacheKey(selectedFamily.id, year)
      );
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
    void load({ soft: true });
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
    () => buildMonthlyCashflowSeries(displayOccurrences, expenses, year),
    [displayOccurrences, expenses, year]
  );

  const yearSummary = useMemo(() => rollupCashflowSeries(months), [months]);

  useEffect(() => {
    if (loading) return;
    if (monthInitYearRef.current === year) return;
    monthInitYearRef.current = year;
    setSelectedMonthIndex(defaultDashboardMonthIndex(year, months, now));
  }, [loading, year, months, now]);

  const selectedMonth = months[selectedMonthIndex] || months[0];

  const barPoints = useMemo(
    () =>
      months.map((m) => ({
        monthIndex: m.monthIndex,
        label: m.label,
        income: m.incomeTotal,
        spent: m.spentTotal + m.unpaidTotal,
        netAfterUnpaid: m.netAfterUnpaid,
      })),
    [months]
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
        label: 'Spent',
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

  const yearHero = (
    <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>Year overview</Text>
      <View style={styles.heroGrid}>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Income</Text>
          <Text style={[styles.heroValue, { color: colors.success }]}>
            {displayMoney(yearSummary.incomeTotal)}
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Outflow</Text>
          <Text style={[styles.heroValue, { color: spentColor }]}>
            {displayMoney(yearSummary.spentTotal + yearSummary.unpaidTotal)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
            {yearSummary.paidCount} paid · {yearSummary.unpaidCount} unpaid
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Net</Text>
          <Text style={[styles.heroValue, { color: toneFor(yearSummary.netAfterUnpaid) }]}>
            {displayMoney(yearSummary.netAfterUnpaid)}
          </Text>
          <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>After unpaid</Text>
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
        Tap a month · dots show net after unpaid
      </Text>
      <MonthCashflowBars
        points={barPoints}
        selectedMonthIndex={selectedMonthIndex}
        onSelectMonth={setSelectedMonthIndex}
        incomeColor={colors.success}
        spentColor={spentColor}
        trackColor={colors.border}
        textColor={colors.text}
        mutedColor={colors.textSecondary}
        selectedBorderColor={colors.primary}
      />
    </View>
  );

  const monthDetail = selectedMonth ? (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {monthTitle(year, selectedMonth.monthIndex)}
      </Text>

      <View style={styles.monthKpis}>
        <Kpi
          label="In"
          value={displayMoney(selectedMonth.incomeTotal)}
          color={colors.success}
          muted={colors.textSecondary}
        />
        <Kpi
          label="Spent"
          value={displayMoney(selectedMonth.spentTotal)}
          color={spentColor}
          muted={colors.textSecondary}
        />
        <Kpi
          label="Unpaid"
          value={displayMoney(selectedMonth.unpaidTotal)}
          color={UNPAID_COLOR}
          muted={colors.textSecondary}
        />
        <Kpi
          label="Net"
          value={displayMoney(selectedMonth.netAfterUnpaid)}
          color={toneFor(selectedMonth.netAfterUnpaid)}
          muted={colors.textSecondary}
        />
      </View>

      <View style={styles.donutBlock}>
        <DonutChart
          slices={donutSlices}
          textColor={colors.text}
          mutedColor={colors.textSecondary}
          trackColor={colors.border}
          centerLabel={displayMoney(
            selectedMonth.incomeTotal ||
              selectedMonth.spentTotal + selectedMonth.unpaidTotal
          )}
          centerSubLabel="Activity"
        />
        <View style={styles.donutLegend}>
          {donutSlices.map((s) => (
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

      <Text style={[styles.subSectionTitle, { color: colors.text }]}>Spent by category</Text>
      <CategoryHBars
        rows={selectedMonth.spentByCategory}
        emptyText="No paid expenses this month"
        barColor={spentColor}
        trackColor={colors.border}
        textColor={colors.text}
        mutedColor={colors.textSecondary}
        formatAmount={displayMoney}
      />

      <Text style={[styles.subSectionTitle, { color: colors.text, marginTop: 16 }]}>
        Unpaid by category
      </Text>
      <CategoryHBars
        rows={selectedMonth.unpaidByCategory}
        emptyText="No unpaid expenses this month"
        barColor={UNPAID_COLOR}
        trackColor={colors.border}
        textColor={colors.text}
        mutedColor={colors.textSecondary}
        formatAmount={displayMoney}
      />
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
  chartCard: {
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', alignSelf: 'stretch' },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: -4,
    alignSelf: 'stretch',
  },
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
});
