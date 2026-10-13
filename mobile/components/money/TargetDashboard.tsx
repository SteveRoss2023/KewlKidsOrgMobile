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
import moneyService from '../../services/moneyService';
import { MoneyAccount } from '../../types/money';
import { forFamily } from '../../utils/familyScope';
import AuthService from '../../services/authService';
import { STORAGE_KEYS, storage } from '../../utils/storage';
import { canUseMoneyDemoPortfolio } from '../../utils/moneyDemoPortfolio';
import {
  projectAccountsAtYearsAhead,
  projectPortfolioAtYears,
} from '../../utils/moneyReturns';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';

const TARGET_RATES = [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10];
const DEFAULT_FORECAST_RATE = 2.5;
const FORECAST_YEARS = 10;

interface TargetDashboardProps {
  refreshKey?: number;
}

export default function TargetDashboard({ refreshKey = 0 }: TargetDashboardProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const isWide = useIsWideLayout();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [demoPortfolio, setDemoPortfolio] = useState(false);
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(null);
  const [forecastRate, setForecastRate] = useState(DEFAULT_FORECAST_RATE);
  const [horizonYearsAhead, setHorizonYearsAhead] = useState(1);
  const [expandedForecastYears, setExpandedForecastYears] = useState<number[]>([]);
  const currentCalendarYear = new Date().getFullYear();

  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;

  const investedColor = colors.primary;
  const cashColor = colors.warning;
  const growthColor = colors.success;

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setAccounts([]);
    setError('');
    setDataFamilyId(null);
    setExpandedForecastYears([]);
    setForecastRate(DEFAULT_FORECAST_RATE);
    setHorizonYearsAhead(1);
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
      if (!soft) setLoading(true);
      setError('');
      try {
        const demoEnabled = await readDemoPortfolioPref();
        const acctList = await moneyService.getAccounts(familyId);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setDemoPortfolio(demoEnabled);
        setAccounts(forFamily(acctList, familyId));
        setDataFamilyId(familyId);
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load forecast');
        setAccounts([]);
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
    [selectedFamily, clearState, readDemoPortfolioPref]
  );

  useEffect(() => {
    clearState();
    if (!selectedFamily) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) {
        setLoading(false);
        return;
      }
      const sameFamily = dataFamilyId === selectedFamily.id;
      void load({ soft: sameFamily && accounts.length > 0 });
    }, [selectedFamily?.id, load, dataFamilyId, accounts.length])
  );

  useEffect(() => {
    if (!selectedFamily || refreshKey === 0) return;
    void load({ soft: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const forecast = useMemo(
    () =>
      projectPortfolioAtYears(
        accounts,
        forecastRate,
        FORECAST_YEARS,
        demoPortfolio,
        currentCalendarYear
      ),
    [accounts, forecastRate, demoPortfolio, currentCalendarYear]
  );

  const horizonPoint = useMemo(
    () =>
      forecast.points.find((p) => p.yearsAhead === horizonYearsAhead) ??
      forecast.points[forecast.points.length - 1],
    [forecast.points, horizonYearsAhead]
  );

  const fmtSignedMoney = (n: number | null) => {
    if (n == null) return '—';
    if (n === 0) return displayMoney(0);
    const sign = n > 0 ? '+' : '-';
    return `${sign}${displayMoney(Math.abs(n))}`;
  };

  const selectForecastYear = (yearsAhead: number) => {
    setHorizonYearsAhead(yearsAhead);
    setExpandedForecastYears((prev) =>
      prev.includes(yearsAhead)
        ? prev.filter((y) => y !== yearsAhead)
        : [...prev, yearsAhead]
    );
  };

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  const investGrowthSelected = horizonPoint?.investGrowth ?? 0;
  const investEndSelected = horizonPoint?.invest ?? 0;
  const cashSelected = horizonPoint?.cash ?? 0;

  const intro = (
    <>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Forward forecast</Text>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        Investment growth compounds each year; cash stays flat and is added to portfolio.
      </Text>
    </>
  );

  const rateChips = (
    <>
      <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>
        Investment return
      </Text>
      <View style={styles.chipWrap}>
        {TARGET_RATES.map((rate) => {
          const active = rate === forecastRate;
          return (
            <TouchableOpacity
              key={rate}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.card || colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setForecastRate(rate)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${rate} percent return`}
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]}>
                {rate}%
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  const selectedYearHero = (
    <View
      style={[
        styles.heroCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>
        {horizonPoint?.calendarYear ?? currentCalendarYear + 1} · {forecastRate}% investment
        return
      </Text>
      <Text style={[styles.heroPortfolio, { color: growthColor }]} numberOfLines={1}>
        {fmtSignedMoney(investGrowthSelected)}
      </Text>
      <Text style={[styles.heroPortfolioHint, { color: colors.textSecondary }]}>
        Investment growth this year
      </Text>
      <View style={styles.heroBreakdown}>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Invest start
          </Text>
          <Text style={[styles.heroValue, { color: investedColor }]} numberOfLines={1}>
            {displayMoney(horizonPoint?.investStart ?? 0)}
          </Text>
        </View>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Invest end</Text>
          <Text style={[styles.heroValue, { color: investedColor }]} numberOfLines={1}>
            {displayMoney(investEndSelected)}
          </Text>
        </View>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Cash</Text>
          <Text style={[styles.heroValue, { color: cashColor }]} numberOfLines={1}>
            {displayMoney(cashSelected)}
          </Text>
        </View>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Portfolio</Text>
          <Text style={[styles.heroValue, { color: colors.primary }]} numberOfLines={1}>
            {displayMoney(horizonPoint?.portfolio ?? 0)}
          </Text>
        </View>
      </View>
      <Text style={[styles.heroFormulaHint, { color: colors.textSecondary }]}>
        Invest end + cash = portfolio (cash flat)
      </Text>
    </View>
  );

  const byYearCards = (
    <View style={styles.yearStack}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>By year</Text>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        At {forecastRate}% · tap to expand accounts
      </Text>
      {forecast.points.map((p) => {
        const selected = p.yearsAhead === horizonYearsAhead;
        const expanded = expandedForecastYears.includes(p.yearsAhead);
        const accountRows = expanded
          ? projectAccountsAtYearsAhead(
              accounts,
              forecastRate,
              p.yearsAhead,
              demoPortfolio
            )
          : [];
        return (
          <View
            key={p.yearsAhead}
            style={[
              styles.yearCard,
              {
                backgroundColor: colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.yearCardHeader}
              onPress={() => selectForecastYear(p.yearsAhead)}
              accessibilityRole="button"
              accessibilityState={{ expanded, selected }}
              accessibilityLabel={`${p.calendarYear} forecast`}
            >
              <FontAwesome
                name={expanded ? 'chevron-down' : 'chevron-right'}
                size={11}
                color={colors.textSecondary}
              />
              <Text style={[styles.yearCardYear, { color: colors.text }]}>
                {p.calendarYear}
              </Text>
              <Text
                style={[styles.yearCardMeta, { color: colors.textSecondary, flex: 1 }]}
                numberOfLines={1}
              >
                {displayMoney(p.investStart)}→
                <Text style={{ color: investedColor, fontWeight: '700' }}>
                  {displayMoney(p.invest)}
                </Text>
              </Text>
              <Text
                style={[styles.yearCardGrowth, { color: growthColor }]}
                numberOfLines={1}
              >
                {fmtSignedMoney(p.investGrowth)}
              </Text>
            </TouchableOpacity>

            {expanded ? (
              <View
                style={[
                  styles.yearAccounts,
                  {
                    borderTopColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              >
                {accountRows.length === 0 ? (
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    No account balances to project.
                  </Text>
                ) : (
                  accountRows.map((row) => {
                    const amtColor = row.isCash ? cashColor : investedColor;
                    return (
                      <View
                        key={`${p.yearsAhead}-${row.id}`}
                        style={[styles.yearAccountRow, { borderTopColor: colors.border }]}
                      >
                        <Text
                          style={[styles.accountName, { color: colors.text, flex: 1 }]}
                          numberOfLines={1}
                        >
                          {row.name}
                        </Text>
                        <Text
                          style={[
                            styles.yearAccountPathLine,
                            { color: colors.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {displayMoney(row.start)}→
                          <Text style={{ color: amtColor, fontWeight: '700' }}>
                            {displayMoney(row.end)}
                          </Text>
                        </Text>
                        <Text
                          style={[
                            styles.yearAccountGrowth,
                            {
                              color: row.growth > 0 ? growthColor : colors.textSecondary,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {fmtSignedMoney(row.growth)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  const left = (
    <>
      {intro}
      {rateChips}
      {selectedYearHero}
    </>
  );
  const right = byYearCards;

  return (
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
          {!forecast.base.hasBalances ? (
            <>
              {intro}
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                Add accounts and update balances to see a forecast.
              </Text>
            </>
          ) : isWide ? (
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
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40, gap: 12 },
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
  empty: { fontSize: 13, paddingVertical: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionHint: { fontSize: 12, fontWeight: '500', marginTop: -6 },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: -4,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  heroCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  heroPortfolio: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  heroPortfolioHint: { fontSize: 12, fontWeight: '600', marginTop: -4 },
  heroBreakdown: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  heroBreakCell: { flexGrow: 1, flexBasis: '40%', minWidth: 100, gap: 2 },
  heroFormulaHint: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  heroCaption: { fontSize: 11, fontWeight: '600' },
  heroValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  yearStack: { gap: 10 },
  yearCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  yearCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  yearCardYear: { fontSize: 15, fontWeight: '800', flexShrink: 0 },
  yearCardGrowth: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  yearCardMeta: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    minWidth: 0,
  },
  yearAccounts: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 2,
  },
  yearAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    paddingLeft: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  yearAccountPathLine: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  yearAccountGrowth: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
    minWidth: 64,
    textAlign: 'right',
  },
  accountName: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 11, fontWeight: '500', marginTop: 1 },
});
