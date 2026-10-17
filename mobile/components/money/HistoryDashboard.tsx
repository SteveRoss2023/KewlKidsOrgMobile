import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
import moneyService from '../../services/moneyService';
import { AccountSnapshot, AccountType, MoneyAccount } from '../../types/money';
import { forFamily } from '../../utils/familyScope';
import AuthService from '../../services/authService';
import { STORAGE_KEYS, storage } from '../../utils/storage';
import { canUseMoneyDemoPortfolio, withDemoBalance } from '../../utils/moneyDemoPortfolio';
import { groupAccountsByInstitution } from '../../utils/moneyAccounts';
import { readForecastGoal } from '../../utils/forecastGoal';
import { yearLatestSnap, yearStartSnap, ytdPortfolioTotals } from '../../utils/moneyReturns';
import BalanceLineChart, { BalanceLinePoint } from './charts/BalanceLineChart';
import { isPhoneMoneyLayout, phoneMoneyValueStyle } from '../expenses/phoneMoneyLayout';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  rrsp: 'RRSP',
  tfsa: 'TFSA',
  non_reg: 'Non-registered',
  cash: 'Cash / savings',
  other: 'Other',
};

const ACCOUNT_COLORS = [
  '#2563eb',
  '#059669',
  '#c2410c',
  '#db2777',
  '#7c3aed',
  '#0e7490',
  '#ea580c',
  '#4f46e5',
];

function formatMonthDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m) return ymd;
  return new Date(y, m - 1, d || 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m) return ymd;
  return new Date(y, m - 1, d || 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function yearOf(ymd: string): number {
  return parseInt(ymd.slice(0, 4), 10);
}

/** Raw balance coming into the year, or the first snapshot in the year. */
function realYearStart(snaps: AccountSnapshot[], year: number): number | null {
  const jan1 = `${year}-01-01`;
  let prior: AccountSnapshot | null = null;
  for (const s of snaps) {
    if (s.as_of_date <= jan1) prior = s;
    else break;
  }
  const source = prior ?? snaps.find((s) => yearOf(s.as_of_date) === year);
  if (!source) return null;
  const value = Number(source.balance);
  return Number.isNaN(value) ? null : value;
}

/**
 * Demo keeps the real return and applies it to the boosted start, matching Year to date.
 * A flat boost on every snapshot would leave the dollar growth unchanged.
 */
function displayBalance(
  raw: number,
  realStart: number | null,
  account: MoneyAccount,
  demo: boolean
): number {
  if (!demo || realStart == null || realStart <= 0) {
    return withDemoBalance(raw, account.account_type, demo) ?? raw;
  }
  const displayStart = withDemoBalance(realStart, account.account_type, true) ?? realStart;
  return displayStart * (raw / realStart);
}

/** Balance coming into the year, or the first snapshot in the year when nothing is earlier. */
function yearStartValue(
  snaps: AccountSnapshot[],
  year: number,
  account: MoneyAccount,
  demo: boolean
): number | null {
  const realStart = realYearStart(snaps, year);
  if (realStart == null) return null;
  return displayBalance(realStart, realStart, account, demo);
}

function snapsForAccount(snapshots: AccountSnapshot[], accountId: number): AccountSnapshot[] {
  return snapshots
    .filter((s) => s.account === accountId)
    .slice()
    .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
}

function balanceOnOrBefore(snaps: AccountSnapshot[], ymd: string): number | null {
  let found: number | null = null;
  for (const s of snaps) {
    if (s.as_of_date <= ymd) found = Number(s.balance);
    else break;
  }
  return found;
}

function accountPoints(
  snaps: AccountSnapshot[],
  year: number,
  account: MoneyAccount,
  demo: boolean
): BalanceLinePoint[] {
  const realStart = realYearStart(snaps, year);
  return snaps
    .filter((s) => yearOf(s.as_of_date) === year)
    .map((s) => ({
      date: s.as_of_date,
      label: formatMonthDay(s.as_of_date),
      value: displayBalance(Number(s.balance), realStart, account, demo),
    }));
}

function portfolioPoints(
  accounts: MoneyAccount[],
  snapshots: AccountSnapshot[],
  year: number,
  demo: boolean
): BalanceLinePoint[] {
  const byAccount = new Map<number, AccountSnapshot[]>();
  const dates = new Set<string>();
  const included: MoneyAccount[] = [];
  let realStart = 0;
  let displayStart = 0;

  for (const account of accounts) {
    if (account.account_type === 'cash') continue;
    const snaps = snapsForAccount(snapshots, account.id);
    byAccount.set(account.id, snaps);
    const startSnap = yearStartSnap(snapshots, account.id, year);
    const latestSnap = yearLatestSnap(snapshots, account.id, year);
    if (!startSnap || !latestSnap) continue;
    const start = Number(startSnap.balance);
    const latest = Number(latestSnap.balance);
    if (Number.isNaN(start) || Number.isNaN(latest)) continue;
    included.push(account);
    realStart += start;
    displayStart += withDemoBalance(start, account.account_type, demo) ?? start;
    for (const snap of snaps) {
      if (yearOf(snap.as_of_date) === year) dates.add(snap.as_of_date);
    }
  }

  const scale = realStart > 0 ? displayStart / realStart : 1;
  return [...dates].sort().map((date) => {
    let raw = 0;
    for (const account of included) {
      const value = balanceOnOrBefore(byAccount.get(account.id) || [], date);
      if (value == null) continue;
      raw += value;
    }
    return { date, label: formatMonthDay(date), value: raw * scale };
  });
}

interface HistoryDashboardProps {
  refreshKey?: number;
  initialAccounts?: MoneyAccount[];
  initialSnapshots?: AccountSnapshot[];
}

type HistoryStatCell = {
  key: string;
  label: string;
  value: string;
  color: string;
  hint?: string;
};

function statFont(text: string, rowWidth: number, columns: number, base: number) {
  if (rowWidth <= 0) return { fontSize: base, lineHeight: base + 4 };
  const cell = (rowWidth - 8 * Math.max(0, columns - 1)) / Math.max(columns, 1);
  const size = Math.min(base, Math.max(9, (cell - 4) / (Math.max(text.length, 1) * 0.62)));
  return { fontSize: size, lineHeight: Math.round(size + 4) };
}

function HistoryStatRow({ cells }: { cells: HistoryStatCell[] }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const longest = cells.reduce((best, cell) => (cell.value.length > best.length ? cell.value : best), '');
  const font = statFont(longest, width, cells.length, 16);
  const showHints = cells.some((cell) => cell.hint);
  return (
    <View
      style={styles.statRow}
      onLayout={(e) => {
        const next = Math.floor(e.nativeEvent.layout.width);
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      {cells.map((cell) => (
        <View key={cell.key} style={styles.statCell}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={2}>
            {cell.label}
          </Text>
          <Text style={[styles.statValue, { color: cell.color }, font]} numberOfLines={1}>
            {cell.value}
          </Text>
          {showHints ? (
            <Text
              style={[styles.statHint, { color: cell.hint ? cell.color : 'transparent' }]}
              numberOfLines={1}
            >
              {cell.hint || ' '}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export default function HistoryDashboard({
  refreshKey = 0,
  initialAccounts,
  initialSnapshots,
}: HistoryDashboardProps) {
  const { colors, theme } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const { width: windowWidth } = useWindowDimensions();
  const phoneMoney = isPhoneMoneyLayout(windowWidth);
  const isWide = useIsWideLayout();
  const nowYear = new Date().getFullYear();

  const seeded =
    !!selectedFamily &&
    Array.isArray(initialAccounts) &&
    Array.isArray(initialSnapshots) &&
    (initialAccounts.length === 0 || initialAccounts.every((a) => a.family === selectedFamily.id));

  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<MoneyAccount[]>(() =>
    seeded && selectedFamily ? forFamily(initialAccounts!, selectedFamily.id) : []
  );
  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>(() =>
    seeded && selectedFamily ? forFamily(initialSnapshots!, selectedFamily.id) : []
  );
  const [demoPortfolio, setDemoPortfolio] = useState(false);
  const [goalRate, setGoalRate] = useState(2.5);
  const [year, setYear] = useState(nowYear);

  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;

  const readDemoPortfolioPref = useCallback(async (): Promise<boolean> => {
    const user = await AuthService.getUserData();
    const email = user?.email || null;
    if (!canUseMoneyDemoPortfolio(email) || !email) return false;
    const key = `${STORAGE_KEYS.MONEY_DEMO_PORTFOLIO}:${email.toLowerCase()}`;
    const v = await storage.getItem(key);
    return v === '1';
  }, []);

  const load = useCallback(async () => {
    if (!selectedFamily) {
      setLoading(false);
      return;
    }
    const familyId = selectedFamily.id;
    const generation = ++fetchGenerationRef.current;
    setError('');
    try {
      const demoEnabled = await readDemoPortfolioPref();
      const [acctList, snapList] = await Promise.all([
        moneyService.getAccounts(familyId),
        moneyService.getSnapshots(familyId),
      ]);
      if (generation !== fetchGenerationRef.current || selectedFamilyIdRef.current !== familyId) {
        return;
      }
      setDemoPortfolio(demoEnabled);
      setAccounts(forFamily(acctList, familyId));
      setSnapshots(forFamily(snapList, familyId));
    } catch (err: any) {
      if (generation !== fetchGenerationRef.current || selectedFamilyIdRef.current !== familyId) {
        return;
      }
      setError(err.message || 'Failed to load history');
    } finally {
      if (generation === fetchGenerationRef.current && selectedFamilyIdRef.current === familyId) {
        setLoading(false);
      }
    }
  }, [selectedFamily, readDemoPortfolioPref]);

  useEffect(() => {
    if (!selectedFamily || !Array.isArray(initialAccounts) || !Array.isArray(initialSnapshots)) {
      return;
    }
    if (
      initialAccounts.length > 0 &&
      initialAccounts.some((a) => a.family !== selectedFamily.id)
    ) {
      return;
    }
    setAccounts(forFamily(initialAccounts, selectedFamily.id));
    setSnapshots(forFamily(initialSnapshots, selectedFamily.id));
    setLoading(false);
  }, [initialAccounts, initialSnapshots, selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void readDemoPortfolioPref().then((v) => {
        if (!cancelled) setDemoPortfolio(v);
      });
      return () => {
        cancelled = true;
      };
    }, [readDemoPortfolioPref])
  );

  useEffect(() => {
    if (!selectedFamily) return;
    let cancelled = false;
    void readForecastGoal(selectedFamily.id).then((rate) => {
      if (!cancelled) setGoalRate(rate);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedFamily?.id]);

  useEffect(() => {
    if (!selectedFamily || refreshKey === 0) return;
    void load();
  }, [refreshKey, selectedFamily, load]);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.is_active !== false),
    [accounts]
  );
  const groups = useMemo(() => groupAccountsByInstitution(activeAccounts), [activeAccounts]);
  const ytdSplit = useMemo(
    () => ytdPortfolioTotals(accounts, snapshots, year, demoPortfolio),
    [accounts, snapshots, year, demoPortfolio]
  );
  const portfolio = useMemo(
    () => portfolioPoints(accounts, snapshots, year, demoPortfolio),
    [accounts, snapshots, year, demoPortfolio]
  );
  const end = portfolio.length > 0 ? portfolio[portfolio.length - 1] : null;
  const lineColor = colors.primary || '#2563eb';
  const cashColor = colors.warning || '#d97706';
  const startColor = theme === 'dark' ? '#c4c4c8' : '#6b7280';
  const portfolioColor = theme === 'dark' ? '#5eead4' : '#0f766e';
  const trackColor = theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const invested = ytdSplit.invested;
  const hasInvest = invested.returnPct != null || invested.start > 0;
  const portfolioStart = hasInvest ? invested.start : null;
  const savingsNow = ytdSplit.cash.latest;

  const accountSeries = useMemo(() => {
    const map = new Map<number, BalanceLinePoint[]>();
    for (const a of activeAccounts) {
      map.set(
        a.id,
        accountPoints(snapsForAccount(snapshots, a.id), year, a, demoPortfolio)
      );
    }
    return map;
  }, [activeAccounts, snapshots, year, demoPortfolio]);

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  if (loading && accounts.length === 0 && snapshots.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const currentValueLabel = phoneMoney ? 'Current Value' : 'Current Invest. Value';
  const hidden = displayMoney(1) === '*****';
  const signedMoney = (delta: number) =>
    hidden
      ? '*****'
      : delta === 0
        ? displayMoney(0)
        : `${delta > 0 ? '+' : '-'}${displayMoney(Math.abs(delta))}`;
  const trackFor = (start: number | null, endValue: number | null) => {
    if (start == null || endValue == null) return null;
    const delta = endValue - start;
    const pct = start ? (delta / start) * 100 : null;
    const goalValue = start > 0 ? start * (1 + goalRate / 100) : null;
    const deltaColor =
      delta === 0 ? colors.textSecondary : delta > 0 ? colors.success : colors.error || '#ef4444';
    const pctLabel = pct == null || hidden ? '' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
    const guides = [
      { value: start, color: colors.textSecondary },
      ...(goalValue != null ? [{ value: goalValue, color: colors.warning || '#d97706' }] : []),
    ];
    const summary = (
      <HistoryStatRow
        cells={[
          { key: 'start', label: 'Start', value: displayMoney(start), color: startColor },
          {
            key: 'change',
            label: 'Change',
            value: signedMoney(delta),
            hint: pctLabel,
            color: deltaColor,
          },
          ...(goalValue != null
            ? [
                {
                  key: 'goal',
                  label: `Goal ${goalRate}%`,
                  value: displayMoney(goalValue),
                  color: colors.warning || '#d97706',
                },
              ]
            : []),
        ]}
      />
    );
    return { guides, summary };
  };
  const investNow = hasInvest ? invested.latest : null;
  const portfolioTotal = hasInvest || savingsNow > 0 ? (investNow ?? 0) + savingsNow : null;
  const investDelta = hasInvest ? invested.delta : null;
  const investPct = invested.returnPct;
  const investGoal =
    portfolioStart != null && portfolioStart > 0 ? portfolioStart * (1 + goalRate / 100) : null;
  const investDeltaColor =
    investDelta == null || investDelta === 0
      ? colors.textSecondary
      : investDelta > 0
        ? colors.success
        : colors.error || '#ef4444';
  const investPctLabel =
    investPct == null || hidden ? '' : `${investPct > 0 ? '+' : ''}${investPct.toFixed(1)}%`;
  const portfolioTrack = trackFor(portfolioStart, investNow);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, phoneMoney && styles.contentPhone]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {error ? (
        <Text style={{ color: colors.error || '#c0392b', fontSize: 13 }}>{error}</Text>
      ) : null}

      <View
        style={[
          styles.card,
          phoneMoney && styles.cardPhone,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderLeftColor: lineColor,
          },
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Portfolio</Text>
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
            onPress={() => setYear((y) => Math.min(nowYear, y + 1))}
            disabled={year >= nowYear}
            accessibilityLabel="Next year"
          >
            <FontAwesome
              name="chevron-right"
              size={16}
              color={year >= nowYear ? colors.border : colors.text}
            />
          </TouchableOpacity>
          {year !== nowYear ? (
            <TouchableOpacity
              style={[styles.todayBtn, { borderColor: colors.border }]}
              onPress={() => setYear(nowYear)}
            >
              <Text style={[styles.todayBtnText, { color: colors.primary }]}>This year</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {investNow != null ? (
          <HistoryStatRow
            cells={[
              {
                key: 'start',
                label: 'Invest start',
                value: portfolioStart != null ? displayMoney(portfolioStart) : '—',
                color: startColor,
              },
              {
                key: 'growth',
                label: 'Growth',
                value: investDelta != null ? signedMoney(investDelta) : '—',
                hint: investPctLabel,
                color: investDeltaColor,
              },
              {
                key: 'now',
                label: currentValueLabel,
                value: displayMoney(investNow),
                color: lineColor,
              },
              ...(investGoal != null
                ? [
                    {
                      key: 'goal',
                      label: `Goal ${goalRate}%`,
                      value: displayMoney(investGoal),
                      color: colors.warning || '#d97706',
                    },
                  ]
                : []),
            ]}
          />
        ) : null}
        {portfolioTotal != null ? (
          <HistoryStatRow
            cells={[
              {
                key: 'invest',
                label: currentValueLabel,
                value: investNow != null ? displayMoney(investNow) : '—',
                color: lineColor,
              },
              {
                key: 'savings',
                label: 'Savings',
                value: displayMoney(savingsNow),
                color: cashColor,
              },
              {
                key: 'total',
                label: 'Portfolio',
                value: displayMoney(portfolioTotal),
                color: portfolioColor,
              },
            ]}
          />
        ) : null}
        <Text style={[styles.caption, { color: colors.textSecondary }]}>
          {end
            ? `Investments as of ${formatFullDate(end.date)}`
            : `No investment history in ${year}`}
        </Text>
        {portfolio.length > 0 ? (
          <BalanceLineChart
            points={portfolio}
            guides={portfolioTrack?.guides}
            lineColor={lineColor}
            trackColor={trackColor}
            textColor={colors.text}
            mutedColor={colors.textSecondary}
            formatAmount={displayMoney}
          />
        ) : (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Update balances to see the portfolio for this year.
          </Text>
        )}
      </View>

      {groups.map((group) => (
        <View key={group.key || '__other'} style={styles.group}>
          <Text style={[styles.institutionHeader, { color: colors.textSecondary }]}>
            {group.label}
          </Text>
          <View style={isWide ? styles.accountGrid : styles.group}>
          {group.accounts.map((account) => {
            const points = accountSeries.get(account.id) || [];
            const last = points.length > 0 ? points[points.length - 1] : null;
            const color = ACCOUNT_COLORS[account.id % ACCOUNT_COLORS.length];
            const amount = last ? displayMoney(last.value) : '—';
            const start = yearStartValue(
              snapsForAccount(snapshots, account.id),
              year,
              account,
              demoPortfolio
            );
            const track = trackFor(start, last?.value ?? null);
            return (
              <View
                key={account.id}
                style={[
                  styles.card,
                  phoneMoney && styles.cardPhone,
                  isWide && styles.accountGridItem,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderLeftColor: color,
                  },
                ]}
              >
                <View style={[styles.accountHead, phoneMoney && styles.accountHeadPhone]}>
                  <View style={styles.accountTitles}>
                    <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={phoneMoney ? 2 : 1}>
                      {account.name}
                    </Text>
                    <Text style={[styles.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                      {ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type}
                      {last ? ` · ${formatMonthDay(last.date)}` : ''}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.accountAmount,
                      { color },
                      phoneMoney && styles.accountAmountPhone,
                      phoneMoney
                        ? phoneMoneyValueStyle(amount, windowWidth, 18, 0.92, 0, 0.56)
                        : null,
                    ]}
                    numberOfLines={1}
                  >
                    {amount}
                  </Text>
                </View>
                {track?.summary}
                {points.length > 0 ? (
                  <BalanceLineChart
                    points={points}
                    lineColor={color}
                    trackColor={trackColor}
                    textColor={colors.text}
                    mutedColor={colors.textSecondary}
                    formatAmount={displayMoney}
                    guides={track?.guides}
                  />
                ) : (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>
                    No snapshots in {year}.
                  </Text>
                )}
              </View>
            );
          })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 12 },
  contentPhone: { paddingHorizontal: 12, gap: 10 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    maxWidth: '100%',
  },
  cardPhone: { padding: 12, gap: 6 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  yearNav: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  yearLabel: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  todayBtnText: { fontSize: 12, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },
  empty: { fontSize: 13, lineHeight: 18, paddingVertical: 8 },
  group: { gap: 8 },
  accountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  accountGridItem: { flexGrow: 1, flexBasis: '47%', minWidth: 280 },
  institutionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  accountHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: '100%',
  },
  accountHeadPhone: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  accountTitles: { flex: 1, minWidth: 0, gap: 2 },
  accountName: { fontSize: 16, fontWeight: '700' },
  accountAmount: { fontSize: 16, fontWeight: '800', flexShrink: 0 },
  accountAmountPhone: { flexShrink: 1, minWidth: 0 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    gap: 8,
  },
  statCell: { flex: 1, minWidth: 0, gap: 1 },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statValue: { fontWeight: '800' },
  statHint: { fontSize: 12, fontWeight: '700' },
});
