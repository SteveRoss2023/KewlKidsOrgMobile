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
import { AccountSnapshot, AccountType, MoneyAccount } from '../../types/money';
import { forFamily } from '../../utils/familyScope';
import AuthService from '../../services/authService';
import { STORAGE_KEYS, storage } from '../../utils/storage';
import { canUseMoneyDemoPortfolio } from '../../utils/moneyDemoPortfolio';
import { buildYearReturnRows, YearReturnRow, ytdPortfolioTotals } from '../../utils/moneyReturns';
import DonutChart from '../expenses/charts/DonutChart';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  rrsp: 'RRSP',
  tfsa: 'TFSA',
  non_reg: 'Non-registered',
  cash: 'Cash / savings',
  other: 'Other',
};

const TYPE_ORDER: Record<AccountType, number> = {
  rrsp: 0,
  tfsa: 1,
  non_reg: 2,
  cash: 3,
  other: 4,
};

function institutionKey(row: YearReturnRow): string {
  return (row.institution || '').trim().toLowerCase();
}

function institutionLabel(row: YearReturnRow): string {
  const trimmed = (row.institution || '').trim();
  return trimmed || 'Other';
}

function groupReturnRowsByInstitution(rows: YearReturnRow[]): {
  key: string;
  label: string;
  rows: YearReturnRow[];
}[] {
  const byKey = new Map<string, YearReturnRow[]>();
  for (const row of rows) {
    const key = institutionKey(row);
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const groups: { key: string; label: string; rows: YearReturnRow[] }[] = [];
  for (const [key, list] of byKey) {
    list.sort((a, b) => {
      const ta = TYPE_ORDER[a.accountType] ?? 99;
      const tb = TYPE_ORDER[b.accountType] ?? 99;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    groups.push({
      key,
      label: key === '' ? 'Other' : institutionLabel(list[0]),
      rows: list,
    });
  }

  groups.sort((a, b) => {
    if (a.key === '') return 1;
    if (b.key === '') return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  return groups;
}

function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m) return ymd;
  const dt = new Date(y, m - 1, d || 1);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface YtdDashboardProps {
  refreshKey?: number;
  /** Seed from Money parent to avoid a duplicate first fetch. */
  initialAccounts?: MoneyAccount[];
  initialSnapshots?: AccountSnapshot[];
}

export default function YtdDashboard({
  refreshKey = 0,
  initialAccounts,
  initialSnapshots,
}: YtdDashboardProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const isWide = useIsWideLayout();

  const seeded =
    !!selectedFamily &&
    Array.isArray(initialAccounts) &&
    Array.isArray(initialSnapshots) &&
    initialAccounts.length >= 0 &&
    (initialAccounts.length === 0 || initialAccounts.every((a) => a.family === selectedFamily.id));

  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<MoneyAccount[]>(() =>
    seeded && selectedFamily ? forFamily(initialAccounts!, selectedFamily.id) : []
  );
  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>(() =>
    seeded && selectedFamily ? forFamily(initialSnapshots!, selectedFamily.id) : []
  );
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(() =>
    seeded && selectedFamily ? selectedFamily.id : null
  );
  const [demoPortfolio, setDemoPortfolio] = useState(false);
  const [returnsYear, setReturnsYear] = useState(() => new Date().getFullYear());
  const [accountsOpen, setAccountsOpen] = useState(false);

  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  /** Skip only the first soft fetch right after parent seed (cold paint). Later focuses refresh. */
  const skipNextSoftFetchRef = useRef(seeded);

  const investedColor = colors.primary || '#2563eb';
  const cashColor = '#d97706';

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setAccounts([]);
    setSnapshots([]);
    setError('');
    setDataFamilyId(null);
    setLoading(true);
    skipNextSoftFetchRef.current = false;
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
        const [acctList, snapList] = await Promise.all([
          moneyService.getAccounts(familyId),
          moneyService.getSnapshots(familyId),
        ]);
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setDemoPortfolio(demoEnabled);
        setAccounts(forFamily(acctList, familyId));
        setSnapshots(forFamily(snapList, familyId));
        setDataFamilyId(familyId);
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load YTD');
        setAccounts([]);
        setSnapshots([]);
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

  // Keep Overview in sync when parent reloads after an edit (balances, account, etc.).
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
    setDataFamilyId(selectedFamily.id);
    setLoading(false);
  }, [initialAccounts, initialSnapshots, selectedFamily?.id]);

  useEffect(() => {
    if (!seeded) return;
    let cancelled = false;
    void readDemoPortfolioPref().then((v) => {
      if (!cancelled) setDemoPortfolio(v);
    });
    return () => {
      cancelled = true;
    };
  }, [seeded, readDemoPortfolioPref]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) {
        setLoading(false);
        return;
      }
      setAccountsOpen(false);
      const sameFamily = dataFamilyId === selectedFamily.id;
      if (skipNextSoftFetchRef.current && sameFamily) {
        skipNextSoftFetchRef.current = false;
        setLoading(false);
        return;
      }
      void load({ soft: sameFamily });
    }, [selectedFamily?.id, load, dataFamilyId])
  );

  useEffect(() => {
    if (!selectedFamily || refreshKey === 0) return;
    skipNextSoftFetchRef.current = false;
    void load({ soft: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const returnsYearOptions = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    for (const s of snapshots) {
      const y = parseInt(s.as_of_date.slice(0, 4), 10);
      if (!Number.isNaN(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [snapshots]);

  useEffect(() => {
    if (returnsYearOptions.length === 0) return;
    if (!returnsYearOptions.includes(returnsYear)) {
      setReturnsYear(returnsYearOptions[0]);
    }
  }, [returnsYearOptions, returnsYear]);

  const yearReturnRows = useMemo(
    () => buildYearReturnRows(accounts, snapshots, returnsYear, demoPortfolio),
    [accounts, snapshots, returnsYear, demoPortfolio]
  );

  const institutionGroups = useMemo(
    () => groupReturnRowsByInstitution(yearReturnRows),
    [yearReturnRows]
  );

  const ytdHeroTotals = useMemo(
    () => ytdPortfolioTotals(accounts, snapshots, returnsYear, demoPortfolio),
    [accounts, snapshots, returnsYear, demoPortfolio]
  );

  const returnsDeltaColor = (n: number | null) => {
    if (n == null || n === 0) return colors.textSecondary;
    return n > 0 ? colors.success : colors.error || '#ef4444';
  };

  const fmtReturnPct = (n: number | null) => {
    if (n == null || Number.isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%`;
  };

  const fmtSignedMoney = (n: number | null) => {
    if (n == null) return '—';
    if (n === 0) return displayMoney(0);
    const sign = n > 0 ? '+' : '-';
    return `${sign}${displayMoney(Math.abs(n))}`;
  };

  const donutSlices = useMemo(() => {
    const invested = ytdHeroTotals.invested.latest;
    const cash = ytdHeroTotals.cash.latest;
    return [
      { key: 'invested', label: 'Investments', amount: Math.max(0, invested), color: investedColor },
      { key: 'cash', label: 'Cash', amount: Math.max(0, cash), color: cashColor },
    ].filter((s) => s.amount > 0);
  }, [ytdHeroTotals, investedColor, cashColor]);

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  const hasRows = yearReturnRows.length > 0;

  const yearChips = (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>Year</Text>
      <View style={styles.chipWrap}>
        {returnsYearOptions.map((y) => {
          const active = y === returnsYear;
          return (
            <TouchableOpacity
              key={y}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.background,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setReturnsYear(y)}
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]}>
                {y}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const growthHero = (
    <View
      style={[
        styles.heroCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>
        Year to date · {returnsYear}
        {ytdHeroTotals.invested.returnPct != null
          ? ` · ${fmtReturnPct(ytdHeroTotals.invested.returnPct)} invest return`
          : ''}
      </Text>
      <Text
        style={[
          styles.heroPortfolio,
          { color: returnsDeltaColor(ytdHeroTotals.invested.delta) },
        ]}
        numberOfLines={1}
      >
        {fmtSignedMoney(ytdHeroTotals.invested.delta)}
      </Text>
      <Text style={[styles.heroPortfolioHint, { color: colors.textSecondary }]}>
        Investment growth
      </Text>

      <View style={styles.heroInvestPath}>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Invest start
          </Text>
          <Text style={[styles.heroValue, { color: investedColor }]} numberOfLines={1}>
            {displayMoney(ytdHeroTotals.invested.start)}
          </Text>
        </View>
        <Text style={[styles.heroOp, { color: colors.textSecondary }]}>+</Text>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Growth</Text>
          <Text
            style={[
              styles.heroValue,
              { color: returnsDeltaColor(ytdHeroTotals.invested.delta) },
            ]}
            numberOfLines={1}
          >
            {fmtSignedMoney(ytdHeroTotals.invested.delta)}
          </Text>
          <Text
            style={[
              styles.heroMeta,
              { color: returnsDeltaColor(ytdHeroTotals.invested.returnPct) },
            ]}
          >
            {fmtReturnPct(ytdHeroTotals.invested.returnPct)}
          </Text>
        </View>
        <Text style={[styles.heroOp, { color: colors.textSecondary }]}>=</Text>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Invest now
          </Text>
          <Text style={[styles.heroValue, { color: investedColor }]} numberOfLines={1}>
            {displayMoney(ytdHeroTotals.invested.latest)}
          </Text>
        </View>
      </View>

      <View style={[styles.heroPortfolioRow, { borderTopColor: colors.border }]}>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Invest now
          </Text>
          <Text style={[styles.heroValue, { color: investedColor }]} numberOfLines={1}>
            {displayMoney(ytdHeroTotals.invested.latest)}
          </Text>
        </View>
        <Text style={[styles.heroOp, { color: colors.textSecondary }]}>+</Text>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Cash</Text>
          <Text style={[styles.heroValue, { color: cashColor }]} numberOfLines={1}>
            {displayMoney(ytdHeroTotals.cash.latest)}
          </Text>
        </View>
        <Text style={[styles.heroOp, { color: colors.textSecondary }]}>=</Text>
        <View style={styles.heroBreakCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Portfolio
          </Text>
          <Text style={[styles.heroValue, { color: colors.primary }]} numberOfLines={1}>
            {displayMoney(ytdHeroTotals.all.latest)}
          </Text>
        </View>
      </View>
      <Text style={[styles.heroFormulaHint, { color: colors.textSecondary }]}>
        Investment growth · cash added to portfolio total
      </Text>
    </View>
  );

  const investCashDonut = (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Investments vs cash</Text>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        Latest balances for {returnsYear}
      </Text>
      {donutSlices.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>No balances to chart</Text>
      ) : (
        <View style={styles.donutBlock}>
          <DonutChart
            slices={donutSlices}
            textColor={colors.text}
            mutedColor={colors.textSecondary}
            trackColor={colors.border}
            centerLabel={displayMoney(ytdHeroTotals.all.latest)}
            centerSubLabel="Latest"
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
      )}
    </View>
  );

  const byAccountList = (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={() => setAccountsOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: accountsOpen }}
      >
        <FontAwesome
          name={accountsOpen ? 'chevron-down' : 'chevron-right'}
          size={12}
          color={colors.textSecondary}
        />
        <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>By account</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
          {yearReturnRows.length}
        </Text>
      </TouchableOpacity>
      {accountsOpen
        ? institutionGroups.map((group) => (
            <View key={group.key} style={styles.institutionGroup}>
              <Text
                style={[styles.institutionHeader, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {group.label}
              </Text>
              {group.rows.map((row) => (
                <View
                  key={row.id}
                  style={[styles.accountRow, { borderTopColor: colors.border }]}
                >
                  <View style={styles.accountTop}>
                    <Text
                      style={[styles.accountName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {ACCOUNT_TYPE_LABELS[row.accountType] || row.accountType}
                    </Text>
                    <Text
                      style={[styles.accountPct, { color: returnsDeltaColor(row.returnPct) }]}
                    >
                      {fmtReturnPct(row.returnPct)}
                    </Text>
                    <Text
                      style={[styles.accountDelta, { color: returnsDeltaColor(row.delta) }]}
                      numberOfLines={1}
                    >
                      {fmtSignedMoney(row.delta)}
                    </Text>
                  </View>
                  <View style={styles.accountAmounts}>
                    <Text
                      style={[styles.accountMeta, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {row.startDate ? formatShortDate(row.startDate) : 'no start'}
                      {row.latestDate ? ` → ${formatShortDate(row.latestDate)}` : ''}
                    </Text>
                    <Text style={[styles.accountAmt, { color: colors.text }]}>
                      {displayMoney(row.startBalance)}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>→</Text>
                    <Text style={[styles.accountAmt, { color: colors.text }]}>
                      {displayMoney(row.latestBalance)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        : null}
    </View>
  );

  const left = (
    <>
      {yearChips}
      {growthHero}
      {investCashDonut}
    </>
  );
  const right = byAccountList;

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
          {!hasRows ? (
            <>
              {yearChips}
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                Add accounts and balance snapshots to see YTD returns.
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
  sectionCard: {
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
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionHint: { fontSize: 12, fontWeight: '500', marginTop: -4 },
  heroPortfolio: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  heroPortfolioHint: { fontSize: 12, fontWeight: '600', marginTop: -4 },
  heroInvestPath: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  heroPortfolioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 4,
  },
  heroBreakCell: { flexGrow: 1, flexBasis: '22%', minWidth: 88, gap: 2 },
  heroOp: { fontSize: 16, fontWeight: '700', paddingTop: 16 },
  heroFormulaHint: { fontSize: 11, fontWeight: '500' },
  heroCaption: { fontSize: 11, fontWeight: '600' },
  heroValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  heroMeta: { fontSize: 12, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  donutBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  donutLegend: { flexShrink: 1, gap: 8 },
  donutLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  donutLegendLabel: { fontSize: 13, fontWeight: '600' },
  donutLegendAmt: { fontSize: 12, fontWeight: '700' },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  institutionGroup: { gap: 0 },
  institutionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    paddingTop: 10,
    paddingBottom: 2,
  },
  accountRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    gap: 3,
  },
  accountTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600' },
  accountMeta: { flex: 1, minWidth: 0, fontSize: 10, fontWeight: '500' },
  accountAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  accountAmt: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  accountPct: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    minWidth: 44,
    textAlign: 'right',
  },
  accountDelta: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    textAlign: 'right',
  },
  empty: { fontSize: 13, paddingVertical: 12 },
});
