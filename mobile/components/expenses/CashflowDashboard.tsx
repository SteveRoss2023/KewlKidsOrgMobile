import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import expenseService from '../../services/expenseService';
import moneyService from '../../services/moneyService';
import { Expense } from '../../types/expenses';
import { IncomeOccurrence, IncomeStream } from '../../types/money';
import {
  buildMonthlyCashflowSeries,
  defaultDashboardMonthIndex,
  rollupCashflowSeries,
} from '../../utils/cashflow';
import DonutChart from './charts/DonutChart';
import MonthCashflowBars from './charts/MonthCashflowBars';
import CategoryHBars from './charts/CategoryHBars';

const UNPAID_COLOR = '#f59e0b';

function monthTitle(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export default function CashflowDashboard() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => now.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => now.getMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [occurrences, setOccurrences] = useState<IncomeOccurrence[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  const ensuredYearRef = useRef('');
  const monthInitYearRef = useRef<number | null>(null);

  const spentColor = colors.error || '#ef4444';

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setOccurrences([]);
    setExpenses([]);
    setError('');
    ensuredYearRef.current = '';
    monthInitYearRef.current = null;
    setLoading(true);
  }, []);

  const ensureYearSchedule = useCallback(
    async (y: number, streamList: IncomeStream[], familyId: number) => {
      if (streamList.length === 0) return;
      if (streamList.some((s) => s.family !== familyId)) return;
      const key = `${familyId}:${y}:${streamList.map((s) => s.id).join(',')}`;
      if (ensuredYearRef.current === key) return;
      const yearStart = `${y}-01-01`;
      const yearEnd = `${y}-12-31`;
      try {
        for (const s of streamList) {
          if (s.start_date > yearEnd) continue;
          if (s.end_date && s.end_date < yearStart) continue;
          let until = yearEnd;
          if (s.end_date && s.end_date < until) until = s.end_date;
          await moneyService.generateOccurrences(s.id, until);
        }
        ensuredYearRef.current = key;
      } catch {
        // ignore auto-fill errors
      }
    },
    []
  );

  const load = useCallback(async () => {
    if (!selectedFamily) {
      clearState();
      setLoading(false);
      return;
    }
    const familyId = selectedFamily.id;
    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setError('');
    try {
      const streams = await moneyService.getStreams(familyId);
      if (
        generation !== fetchGenerationRef.current ||
        selectedFamilyIdRef.current !== familyId
      ) {
        return;
      }
      await ensureYearSchedule(year, streams, familyId);
      if (
        generation !== fetchGenerationRef.current ||
        selectedFamilyIdRef.current !== familyId
      ) {
        return;
      }
      const start_date = `${year}-01-01`;
      const end_date = `${year}-12-31`;
      const [occs, expList] = await Promise.all([
        moneyService.getOccurrences(familyId, { start_date, end_date }),
        expenseService.getExpenses(familyId, { start_date, end_date }),
      ]);
      if (
        generation !== fetchGenerationRef.current ||
        selectedFamilyIdRef.current !== familyId
      ) {
        return;
      }
      setOccurrences(occs);
      setExpenses(expList);
    } catch (err: any) {
      if (
        generation !== fetchGenerationRef.current ||
        selectedFamilyIdRef.current !== familyId
      ) {
        return;
      }
      setError(err.message || 'Failed to load dashboard');
      setOccurrences([]);
      setExpenses([]);
    } finally {
      if (
        generation === fetchGenerationRef.current &&
        selectedFamilyIdRef.current === familyId
      ) {
        setLoading(false);
      }
    }
  }, [selectedFamily, year, clearState, ensureYearSchedule]);

  useEffect(() => {
    clearState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const months = useMemo(
    () => buildMonthlyCashflowSeries(occurrences, expenses, year),
    [occurrences, expenses, year]
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Year hero */}
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>
              Year overview
            </Text>
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
                <Text
                  style={[
                    styles.heroValue,
                    { color: toneFor(yearSummary.netAfterUnpaid) },
                  ]}
                >
                  {displayMoney(yearSummary.netAfterUnpaid)}
                </Text>
                <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
                  After unpaid
                </Text>
              </View>
            </View>
          </View>

          {/* 12-month bars */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

          {/* Selected month */}
          {selectedMonth ? (
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
                      <Text style={[styles.donutLegendLabel, { color: colors.text }]}>
                        {s.label}
                      </Text>
                      <Text style={[styles.donutLegendAmt, { color: colors.textSecondary }]}>
                        {displayMoney(s.amount)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <Text style={[styles.subSectionTitle, { color: colors.text }]}>
                Spent by category
              </Text>
              <CategoryHBars
                rows={selectedMonth.spentByCategory}
                emptyText="No paid expenses this month"
                barColor={spentColor}
                trackColor={colors.border}
                textColor={colors.text}
                mutedColor={colors.textSecondary}
                formatAmount={displayMoney}
              />

              <Text
                style={[
                  styles.subSectionTitle,
                  { color: colors.text, marginTop: 16 },
                ]}
              >
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
          ) : null}
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
