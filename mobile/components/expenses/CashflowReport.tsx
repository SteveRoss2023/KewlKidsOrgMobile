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
import expenseService from '../../services/expenseService';
import moneyService from '../../services/moneyService';
import { Budget, Expense } from '../../types/expenses';
import { IncomeOccurrence, IncomeStream } from '../../types/money';
import { buildCashflowSummary } from '../../utils/cashflow';
import {
  formatPeriodLabel,
  periodDateRange,
  shiftPeriod,
  startOfPeriod,
} from '../../utils/expensePeriods';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';

function toAmt(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

const UNPAID_BAR = '#f59e0b';

function SummaryRow({
  label,
  meta,
  metaNode,
  amount,
  secondaryAmount,
  secondaryColor,
  net,
  barScale,
  barColor,
  barSegments,
  trackColor,
  amountColor,
  netColor,
  mutedColor,
  borderColor,
  textColor,
}: {
  label: string;
  meta?: string;
  /** Optional rich meta (e.g. colored paid / unpaid counts). */
  metaNode?: React.ReactNode;
  amount: number;
  /** Optional second total shown beside amount (e.g. unpaid in orange). */
  secondaryAmount?: number;
  secondaryColor?: string;
  net: number | null;
  barScale: number;
  barColor: string;
  /** Optional stacked segments (e.g. spent + unpaid). Widths are relative to barScale. */
  barSegments?: { amount: number; color: string }[];
  trackColor: string;
  amountColor: string;
  netColor: string;
  mutedColor: string;
  borderColor: string;
  textColor: string;
}) {
  const { displayMoney } = useShowAmounts();
  const pct = barScale > 0 ? Math.min(100, Math.max(0, (amount / barScale) * 100)) : 0;
  const segments = barSegments?.filter((s) => s.amount > 0) ?? null;
  const showSecondary = secondaryAmount != null && secondaryAmount > 0 && !!secondaryColor;
  return (
    <View style={[styles.summaryRow, { borderBottomColor: borderColor }]}>
      <View style={styles.summaryTop}>
        <View style={styles.summaryLabelCol}>
          <Text style={[styles.summaryLabel, { color: textColor }]}>{label}</Text>
          {metaNode ? (
            <Text style={styles.summaryMeta}>{metaNode}</Text>
          ) : meta ? (
            <Text style={[styles.summaryMeta, { color: mutedColor }]}>{meta}</Text>
          ) : null}
        </View>
        <Text
          style={[
            styles.summaryAmount,
            showSecondary && styles.summaryAmountWide,
            { color: amountColor },
          ]}
        >
          {showSecondary ? (
            <>
              <Text style={{ color: amountColor, fontWeight: '700' }}>
                {displayMoney(amount)}
              </Text>
              <Text style={{ color: mutedColor, fontWeight: '600' }}>{' / '}</Text>
              <Text style={{ color: secondaryColor, fontWeight: '700' }}>
                {displayMoney(secondaryAmount)}
              </Text>
            </>
          ) : (
            displayMoney(amount)
          )}
        </Text>
        <Text
          style={[styles.summaryNet, { color: net == null ? mutedColor : netColor }]}
          numberOfLines={1}
        >
          {net == null ? '—' : displayMoney(net)}
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: trackColor }]}>
        {segments && segments.length > 0 ? (
          <View style={styles.barStack}>
            {segments.map((seg, i) => {
              const segPct =
                barScale > 0 ? Math.min(100, Math.max(0, (seg.amount / barScale) * 100)) : 0;
              return (
                <View
                  key={`${seg.color}-${i}`}
                  style={[styles.barSegment, { width: `${segPct}%`, backgroundColor: seg.color }]}
                />
              );
            })}
          </View>
        ) : (
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
        )}
      </View>
    </View>
  );
}

function BreakdownList({
  title,
  rows,
  emptyText,
  textColor,
  mutedColor,
  borderColor,
  surfaceColor,
  accentColor,
  budgetByKey,
  onBudgetColor,
  overBudgetColor,
}: {
  title: string;
  rows: { key: string; label: string; amount: number }[];
  emptyText: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  surfaceColor: string;
  accentColor: string;
  /** When set, show spent / budget under the category name. */
  budgetByKey?: Map<string, number>;
  onBudgetColor?: string;
  overBudgetColor?: string;
}) {
  const { displayMoney } = useShowAmounts();
  return (
    <View
      style={[
        styles.breakdownSection,
        { backgroundColor: surfaceColor, borderColor },
      ]}
    >
      <View style={[styles.breakdownHeader, { borderBottomColor: borderColor }]}>
        <View style={[styles.breakdownAccent, { backgroundColor: accentColor }]} />
        <Text style={[styles.breakdownTitle, { color: accentColor }]}>{title}</Text>
      </View>
      <View style={styles.breakdownBody}>
        {rows.length === 0 ? (
          <Text style={[styles.breakdownEmpty, { color: mutedColor }]}>{emptyText}</Text>
        ) : (
          rows.map((row) => {
            const budget = budgetByKey?.get(row.key);
            const hasBudget = budget != null && budget > 0;
            const over = hasBudget && row.amount > budget;
            const ratioColor = over
              ? overBudgetColor || '#ef4444'
              : onBudgetColor || '#34C759';
            return (
              <View
                key={row.key}
                style={[styles.breakdownRow, { borderBottomColor: borderColor }]}
              >
                <View style={styles.breakdownLabelCol}>
                  <Text style={[styles.breakdownLabel, { color: textColor }]} numberOfLines={1}>
                    {row.label}
                  </Text>
                  {hasBudget ? (
                    <Text style={[styles.breakdownStatus, { color: mutedColor }]}>
                      <Text style={{ color: ratioColor, fontWeight: '600' }}>
                        {displayMoney(row.amount)}
                      </Text>
                      {` / ${displayMoney(budget)}`}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.breakdownAmount, { color: textColor }]}>
                  {displayMoney(row.amount)}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

export default function CashflowReport() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [viewDate, setViewDate] = useState(() => startOfPeriod(new Date(), 'month'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [occurrences, setOccurrences] = useState<IncomeOccurrence[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  const ensuredYearRef = useRef('');

  const range = useMemo(() => periodDateRange(viewDate, 'month'), [viewDate]);
  const periodLabel = formatPeriodLabel(viewDate, 'month');
  const todayMonth = startOfPeriod(new Date(), 'month');
  const onTodayMonth = startOfPeriod(viewDate, 'month').getTime() === todayMonth.getTime();

  const ensureYearSchedule = useCallback(
    async (month: Date, streamList: IncomeStream[], familyId: number) => {
      if (streamList.length === 0) return;
      if (streamList.some((s) => s.family !== familyId)) return;
      const y = month.getFullYear();
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

  const clearCashflowState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setOccurrences([]);
    setExpenses([]);
    setBudgets([]);
    setError('');
    ensuredYearRef.current = '';
    setLoading(true);
  }, []);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!selectedFamily || !range.start_date || !range.end_date) {
        clearCashflowState();
        setLoading(false);
        return;
      }
      const soft = !!opts?.soft;
      const familyId = selectedFamily.id;
      const generation = ++fetchGenerationRef.current;
      if (!soft) setLoading(true);
      setError('');
      try {
        const streams = await moneyService.getStreams(familyId);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        await ensureYearSchedule(viewDate, streams, familyId);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        const [occs, expList, budgetList] = await Promise.all([
          moneyService.getOccurrences(familyId, {
            start_date: range.start_date,
            end_date: range.end_date,
          }),
          expenseService.getExpenses(familyId, {
            start_date: range.start_date,
            end_date: range.end_date,
          }),
          expenseService.getBudgets(familyId, true, {
            asOf: range.asOf,
            budgetPeriod: 'month',
          }),
        ]);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setOccurrences(occs);
        setExpenses(expList);
        setBudgets(budgetList);
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load cashflow');
        setOccurrences([]);
        setExpenses([]);
        setBudgets([]);
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
      range.start_date,
      range.end_date,
      range.asOf,
      viewDate,
      ensureYearSchedule,
      clearCashflowState,
    ]
  );

  useEffect(() => {
    clearCashflowState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useEffect(() => {
    void load({ soft: false });
  }, [load]);

  const summary = useMemo(() => {
    if (!range.start_date || !range.end_date) {
      return buildCashflowSummary([], [], '1970-01-01', '1970-01-01');
    }
    return buildCashflowSummary(occurrences, expenses, range.start_date, range.end_date);
  }, [occurrences, expenses, range.start_date, range.end_date]);

  const budgetTotal = useMemo(
    () => budgets.reduce((s, b) => s + toAmt(b.amount), 0),
    [budgets]
  );
  /** Income − spent − unpaid. */
  const netAfterUnpaid = summary.netAfterUnpaid;
  /** Income − full month budget. */
  const netAtBudget = summary.incomeTotal - budgetTotal;
  /** Shared bar scale so in / spent / unpaid / budget are comparable. */
  const barScale = Math.max(
    summary.incomeTotal,
    summary.spentTotal,
    summary.unpaidTotal,
    budgetTotal,
    1
  );

  const toneFor = (n: number) =>
    n > 0 ? colors.success : n < 0 ? colors.error || '#ef4444' : colors.text;
  const spentColor = colors.error || '#ef4444';

  const budgetByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of budgets) {
      const key = String(b.category);
      map.set(key, (map.get(key) || 0) + toAmt(b.amount));
    }
    return map;
  }, [budgets]);

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.monthNav}>
        <TouchableOpacity
          style={styles.monthNavBtn}
          onPress={() => setViewDate((d) => shiftPeriod(d, 'month', -1))}
          accessibilityLabel="Previous month"
        >
          <FontAwesome name="chevron-left" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.monthNavLabel, { color: colors.text }]}>{periodLabel}</Text>
        <TouchableOpacity
          style={styles.monthNavBtn}
          onPress={() => setViewDate((d) => shiftPeriod(d, 'month', 1))}
          accessibilityLabel="Next month"
        >
          <FontAwesome name="chevron-right" size={16} color={colors.text} />
        </TouchableOpacity>
        {!onTodayMonth ? (
          <TouchableOpacity
            style={[styles.todayBtn, { borderColor: colors.border }]}
            onPress={() => setViewDate(todayMonth)}
          >
            <Text style={[styles.todayBtnText, { color: colors.primary }]}>This month</Text>
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
          <View style={[styles.summaryHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.summaryHeaderLabel, { color: colors.textSecondary }]}> </Text>
            <Text style={[styles.summaryHeaderAmount, { color: colors.textSecondary }]}>
              Total
            </Text>
            <Text style={[styles.summaryHeaderNet, { color: colors.textSecondary }]}>Net</Text>
          </View>

          <SummaryRow
            label="Total in"
            meta="Income this month"
            amount={summary.incomeTotal}
            net={null}
            barScale={barScale}
            barColor={colors.success}
            trackColor={colors.border}
            amountColor={colors.success}
            netColor={colors.text}
            mutedColor={colors.textSecondary}
            borderColor={colors.border}
            textColor={colors.text}
          />
          <SummaryRow
            label="Total spent"
            metaNode={
              summary.unpaidCount > 0 ? (
                <>
                  <Text style={{ color: spentColor, fontWeight: '600' }}>
                    {summary.paidCount} paid
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>{' · '}</Text>
                  <Text style={{ color: UNPAID_BAR, fontWeight: '600' }}>
                    {summary.unpaidCount} unpaid
                  </Text>
                </>
              ) : (
                <Text style={{ color: spentColor, fontWeight: '600' }}>
                  {summary.paidCount} paid
                </Text>
              )
            }
            amount={summary.spentTotal}
            secondaryAmount={summary.unpaidTotal}
            secondaryColor={UNPAID_BAR}
            net={netAfterUnpaid}
            barScale={barScale}
            barColor={spentColor}
            barSegments={[
              { amount: summary.spentTotal, color: spentColor },
              { amount: summary.unpaidTotal, color: UNPAID_BAR },
            ]}
            trackColor={colors.border}
            amountColor={spentColor}
            netColor={toneFor(netAfterUnpaid)}
            mutedColor={colors.textSecondary}
            borderColor={colors.border}
            textColor={colors.text}
          />
          <SummaryRow
            label="Total budget"
            meta="If full budget is used"
            amount={budgetTotal}
            net={budgetTotal > 0 ? netAtBudget : null}
            barScale={barScale}
            barColor={colors.primary}
            trackColor={colors.border}
            amountColor={colors.primary}
            netColor={toneFor(netAtBudget)}
            mutedColor={colors.textSecondary}
            borderColor={colors.border}
            textColor={colors.text}
          />

          <BreakdownList
            title="Income by stream"
            rows={summary.incomeByStream}
            emptyText="No income this month"
            textColor={colors.text}
            mutedColor={colors.textSecondary}
            borderColor={colors.border}
            surfaceColor={colors.surface}
            accentColor={colors.success}
          />
          <BreakdownList
            title="Spent by category"
            rows={summary.spentByCategory}
            emptyText="No paid expenses this month"
            textColor={colors.text}
            mutedColor={colors.textSecondary}
            borderColor={colors.border}
            surfaceColor={colors.surface}
            accentColor={spentColor}
            budgetByKey={budgetByCategory}
            onBudgetColor={colors.success}
            overBudgetColor={spentColor}
          />
          <BreakdownList
            title="Unpaid by category"
            rows={summary.unpaidByCategory}
            emptyText="No unpaid expenses this month"
            textColor={colors.text}
            mutedColor={colors.textSecondary}
            borderColor={colors.border}
            surfaceColor={colors.surface}
            accentColor={UNPAID_BAR}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  monthNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthNavLabel: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  todayBtnText: { fontSize: 12, fontWeight: '700' },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  summaryHeaderLabel: { flex: 1, fontSize: 11, fontWeight: '700' },
  summaryHeaderAmount: { flex: 1.6, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  summaryHeaderNet: { flex: 0.9, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  summaryRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryLabelCol: { flex: 1, minWidth: 72, gap: 2, flexShrink: 1 },
  summaryLabel: { fontSize: 14, fontWeight: '700' },
  summaryMeta: { fontSize: 11 },
  summaryAmount: {
    flex: 1.4,
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  summaryAmountWide: { flex: 1.8, fontSize: 12 },
  summaryNet: {
    flex: 0.9,
    flexShrink: 0,
    minWidth: 64,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden', width: '100%' },
  barFill: { height: '100%', borderRadius: 4 },
  barStack: { flexDirection: 'row', height: '100%', width: '100%' },
  barSegment: { height: '100%' },
  breakdownSection: {
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  breakdownAccent: { width: 4, height: 18, borderRadius: 2 },
  breakdownTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  breakdownBody: { paddingHorizontal: 12, paddingBottom: 4 },
  breakdownEmpty: { fontSize: 13, paddingVertical: 10 },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  breakdownLabelCol: { flex: 1, gap: 2 },
  breakdownLabel: { fontSize: 14, fontWeight: '600' },
  breakdownStatus: { fontSize: 11, fontWeight: '600' },
  breakdownAmount: { fontSize: 14, fontWeight: '700' },
});
