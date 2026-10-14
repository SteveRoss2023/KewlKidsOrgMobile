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
import {
  canUseMoneyDemoPortfolio,
  withDemoBalance,
} from '../../utils/moneyDemoPortfolio';
import { groupAccountsByInstitution } from '../../utils/moneyAccounts';
import DonutChart from '../expenses/charts/DonutChart';
import TooltipButton from '../TooltipButton';
import { useIsWideLayout } from '../../hooks/useIsWideLayout';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  rrsp: 'RRSP',
  tfsa: 'TFSA',
  non_reg: 'Non-registered',
  cash: 'Cash / savings',
  other: 'Other',
};

/** Saturated enough for light surfaces; dark palette leans brighter for contrast. */
const INSTITUTION_COLORS_LIGHT = [
  '#2563eb',
  '#059669',
  '#c2410c',
  '#db2777',
  '#7c3aed',
  '#0e7490',
  '#ea580c',
  '#4f46e5',
];
const INSTITUTION_COLORS_DARK = [
  '#60a5fa',
  '#34d399',
  '#fb923c',
  '#f472b6',
  '#a78bfa',
  '#22d3ee',
  '#fdba74',
  '#818cf8',
];

function institutionColor(key: string, dark: boolean): string {
  const palette = dark ? INSTITUTION_COLORS_DARK : INSTITUTION_COLORS_LIGHT;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m) return ymd;
  const dt = new Date(y, m - 1, d || 1);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface AccountsDashboardProps {
  refreshKey?: number;
  /** Seed from Money parent to avoid a duplicate first fetch. */
  initialAccounts?: MoneyAccount[];
  initialSnapshots?: AccountSnapshot[];
  onUpdateBalances?: () => void;
  onAddAccount?: () => void;
  onEditAccount?: (account: MoneyAccount) => void;
  onDeleteAccount?: (account: MoneyAccount) => void;
  onEditSnapshot?: (account: MoneyAccount, snap: AccountSnapshot) => void;
  onDeleteSnapshot?: (snap: AccountSnapshot) => void;
}

export default function AccountsDashboard({
  refreshKey = 0,
  initialAccounts,
  initialSnapshots,
  onUpdateBalances,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onEditSnapshot,
  onDeleteSnapshot,
}: AccountsDashboardProps) {
  const { colors, theme } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const isWide = useIsWideLayout();
  const isDark = theme === 'dark';

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
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(() =>
    seeded && selectedFamily ? selectedFamily.id : null
  );
  const [boardTab, setBoardTab] = useState<'overview' | 'accounts'>('overview');
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null);

  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  /** Skip only the first soft fetch right after parent seed (cold paint). */
  const skipNextSoftFetchRef = useRef(seeded);

  const investedColor = colors.primary;
  const cashColor = colors.warning;
  const investChipBg = isDark ? 'rgba(10,132,255,0.28)' : 'rgba(0,122,255,0.12)';
  const cashChipBg = isDark ? 'rgba(255,159,10,0.28)' : 'rgba(255,149,0,0.14)';

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setAccounts([]);
    setSnapshots([]);
    setError('');
    setDataFamilyId(null);
    setExpandedAccountId(null);
    setBoardTab('overview');
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
        setError(err.message || 'Failed to load accounts');
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

  // Stay in sync when parent reloads after balance/account edits.
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
    void load({ soft: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const displayAccountMoney = (
    balance: number | null | undefined,
    accountType: AccountType | string,
    empty = '—'
  ) => displayMoney(withDemoBalance(balance, accountType, demoPortfolio), empty);

  const institutionGroups = useMemo(
    () => groupAccountsByInstitution(accounts),
    [accounts]
  );

  const institutionGroupTotal = useCallback(
    (groupAccounts: MoneyAccount[]) =>
      groupAccounts.reduce((sum, a) => {
        const bal = withDemoBalance(a.latest_balance, a.account_type, demoPortfolio);
        return sum + (bal ?? 0);
      }, 0),
    [demoPortfolio]
  );

  const portfolioTotal = useMemo(
    () => institutionGroupTotal(accounts),
    [accounts, institutionGroupTotal]
  );

  const investedTotal = useMemo(
    () =>
      accounts
        .filter((a) => a.account_type !== 'cash')
        .reduce((sum, a) => {
          const bal = withDemoBalance(a.latest_balance, a.account_type, demoPortfolio);
          return sum + (bal ?? 0);
        }, 0),
    [accounts, demoPortfolio]
  );

  const cashTotal = useMemo(
    () =>
      accounts
        .filter((a) => a.account_type === 'cash')
        .reduce((sum, a) => {
          const bal = withDemoBalance(a.latest_balance, a.account_type, demoPortfolio);
          return sum + (bal ?? 0);
        }, 0),
    [accounts, demoPortfolio]
  );

  const lastBalancesUpdatedLabel = useMemo(() => {
    const dates = accounts
      .map((a) => a.latest_as_of)
      .filter((d): d is string => !!d)
      .sort();
    const last = dates.length ? dates[dates.length - 1] : null;
    if (!last) return 'Never updated · as of the 1st';
    try {
      const [y, m, d] = last.split('-').map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `Last updated ${label}`;
    } catch {
      return `Last updated ${last}`;
    }
  }, [accounts]);

  const donutSlices = useMemo(
    () =>
      institutionGroups
        .map((g) => ({
          key: g.key || '__other',
          label: g.label,
          amount: Math.max(0, institutionGroupTotal(g.accounts)),
          color: institutionColor(g.key || '__other', isDark),
        }))
        .filter((s) => s.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    [institutionGroups, institutionGroupTotal, isDark]
  );

  const investCashSlices = useMemo(
    () =>
      [
        {
          key: 'invested',
          label: 'Investments',
          amount: Math.max(0, investedTotal),
          color: investedColor,
        },
        {
          key: 'cash',
          label: 'Cash',
          amount: Math.max(0, cashTotal),
          color: cashColor,
        },
      ].filter((s) => s.amount > 0),
    [investedTotal, cashTotal, investedColor, cashColor]
  );

  const snapshotsForAccount = useCallback(
    (accountId: number) =>
      snapshots
        .filter((s) => s.account === accountId)
        .sort((a, b) => b.as_of_date.localeCompare(a.as_of_date)),
    [snapshots]
  );

  const toggleAccountExpanded = (accountId: number) => {
    setExpandedAccountId((prev) => (prev === accountId ? null : accountId));
  };

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
      </View>
    );
  }

  const renderOverview = () => {
    if (accounts.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.emptyBlock}>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Add RRSP, TFSA, Non-reg, or Cash — then update balances monthly.
            </Text>
            {onAddAccount ? (
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setBoardTab('accounts');
                  onAddAccount();
                }}
              >
                <FontAwesome name="plus" size={14} color="#fff" />
                <Text style={styles.primaryActionText}>Add account</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setBoardTab('accounts')}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Go to Accounts</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      );
    }

    const portfolioHero = (
      <View
        style={[
          styles.heroCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>Portfolio</Text>
        <View style={styles.heroGrid}>
          <View style={styles.heroCell}>
            <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Total</Text>
            <Text style={[styles.heroValue, { color: colors.primary }]} numberOfLines={1}>
              {displayMoney(portfolioTotal)}
            </Text>
          </View>
          <View style={styles.heroCell}>
            <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
              Investments
            </Text>
            <Text style={[styles.heroValue, { color: investedColor }]} numberOfLines={1}>
              {displayMoney(investedTotal)}
            </Text>
          </View>
          <View style={styles.heroCell}>
            <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>Cash</Text>
            <Text style={[styles.heroValue, { color: cashColor }]} numberOfLines={1}>
              {displayMoney(cashTotal)}
            </Text>
          </View>
        </View>
      </View>
    );

    const byInstitutionDonut = (
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>By institution</Text>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
          Latest balances
        </Text>
        {donutSlices.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No balances to chart
          </Text>
        ) : (
          <View style={styles.donutBlock}>
            <DonutChart
              slices={donutSlices}
              textColor={colors.text}
              mutedColor={colors.textSecondary}
              trackColor={colors.border}
              centerLabel={displayMoney(portfolioTotal)}
              centerSubLabel="Total"
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
        )}
      </View>
    );

    const investCashDonut =
      investCashSlices.length > 0 ? (
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Investments vs cash
          </Text>
          <View style={styles.donutBlock}>
            <DonutChart
              slices={investCashSlices}
              textColor={colors.text}
              mutedColor={colors.textSecondary}
              trackColor={colors.border}
              centerLabel={displayMoney(portfolioTotal)}
              centerSubLabel="Mix"
            />
            <View style={styles.donutLegend}>
              {investCashSlices.map((s) => (
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
        </View>
      ) : null;

    return (
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {portfolioHero}
        {isWide && investCashDonut ? (
          <View style={styles.wideRow}>
            <View style={styles.wideCol}>{byInstitutionDonut}</View>
            <View style={styles.wideCol}>{investCashDonut}</View>
          </View>
        ) : (
          <>
            {byInstitutionDonut}
            {investCashDonut}
          </>
        )}
      </ScrollView>
    );
  };

  const renderManage = () => {
    const updateBalancesCta =
      accounts.length > 0 && onUpdateBalances ? (
        <TouchableOpacity
          style={[styles.wizardBtn, { backgroundColor: colors.primary }]}
          onPress={onUpdateBalances}
          accessibilityRole="button"
          accessibilityLabel="Update balances"
        >
          <FontAwesome name="calendar-check-o" size={16} color="#fff" />
          <View style={styles.flex}>
            <Text style={styles.wizardBtnTitle}>Update balances</Text>
            <Text style={styles.wizardBtnSub}>{lastBalancesUpdatedLabel}</Text>
          </View>
          <FontAwesome name="chevron-right" size={14} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      ) : null;

    const manageHeader = (
      <View style={styles.manageHeader}>
        <Text style={styles.portfolioLine} numberOfLines={1}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Portfolio </Text>
          {accounts.length > 0 ? (
            <Text style={[styles.manageTotal, { color: colors.primary }]}>
              {displayMoney(portfolioTotal)}
            </Text>
          ) : null}
        </Text>
        {onAddAccount ? (
          <TouchableOpacity
            style={[styles.addLink]}
            onPress={onAddAccount}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome name="plus" size={12} color={colors.primary} />
            <Text style={[styles.addLinkText, { color: colors.primary }]}>Add</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );

    if (accounts.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {manageHeader}
          <View style={styles.emptyBlock}>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Add RRSP, TFSA, Non-reg, or Cash — then update balances monthly.
            </Text>
            {onAddAccount ? (
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                onPress={onAddAccount}
              >
                <FontAwesome name="plus" size={14} color="#fff" />
                <Text style={styles.primaryActionText}>Add account</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      );
    }

    const institutionCards = institutionGroups.map((group) => {
      const groupKey = group.key || '__other';
      const accent = institutionColor(groupKey, isDark);
      const groupTotal = institutionGroupTotal(group.accounts);
      return (
        <View
          key={groupKey}
          style={[
            styles.institutionCard,
            isWide && styles.institutionGridItem,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={[styles.institutionAccent, { backgroundColor: accent }]} />
          <View style={styles.institutionBody}>
            <View style={styles.institutionHeaderRow}>
              <View style={[styles.institutionDot, { backgroundColor: accent }]} />
              <Text
                style={[styles.institutionTitle, { color: colors.text, flex: 1 }]}
                numberOfLines={1}
              >
                {group.label}
              </Text>
              <Text style={[styles.groupAmt, { color: colors.text }]}>
                {displayMoney(groupTotal)}
              </Text>
            </View>

            {group.accounts.map((a, idx) => {
              const expanded = expandedAccountId === a.id;
              const history = expanded ? snapshotsForAccount(a.id) : [];
              const isCash = a.account_type === 'cash';
              const amtColor = isCash ? cashColor : investedColor;
              const typeLabel = ACCOUNT_TYPE_LABELS[a.account_type] || a.account_type;
              return (
                <View key={a.id}>
                  <TouchableOpacity
                    style={[
                      styles.accountRow,
                      idx > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      },
                    ]}
                    onPress={() => toggleAccountExpanded(a.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                  >
                    <FontAwesome
                      name={expanded ? 'chevron-down' : 'chevron-right'}
                      size={12}
                      color={colors.textSecondary}
                    />
                    <View style={styles.flex}>
                      <Text
                        style={[styles.accountName, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {a.name}
                      </Text>
                      <View style={styles.accountMetaRow}>
                        <View
                          style={[
                            styles.typeChip,
                            { backgroundColor: isCash ? cashChipBg : investChipBg },
                          ]}
                        >
                          <Text style={[styles.typeChipText, { color: amtColor }]}>
                            {typeLabel}
                          </Text>
                        </View>
                        {a.latest_as_of ? (
                          <Text
                            style={[styles.meta, { color: colors.textSecondary }]}
                            numberOfLines={1}
                          >
                            as of {formatShortDate(a.latest_as_of)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={[styles.accountAmt, { color: amtColor }]}>
                      {displayAccountMoney(a.latest_balance, a.account_type)}
                    </Text>
                    {onEditAccount ? (
                      <TooltipButton
                        tooltip={`Edit ${a.name}`}
                        style={styles.iconAction}
                        onPress={() => onEditAccount(a)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <FontAwesome name="pencil" size={13} color={colors.primary} />
                      </TooltipButton>
                    ) : null}
                    {onDeleteAccount ? (
                      <TooltipButton
                        tooltip={`Delete ${a.name}`}
                        style={styles.iconAction}
                        onPress={() => onDeleteAccount(a)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <FontAwesome
                          name="trash"
                          size={13}
                          color={colors.error || '#ef4444'}
                        />
                      </TooltipButton>
                    ) : null}
                  </TouchableOpacity>

                  {expanded ? (
                    <View
                      style={[
                        styles.historyPanel,
                        {
                          borderTopColor: colors.border,
                          backgroundColor: colors.background,
                          borderLeftColor: accent,
                        },
                      ]}
                    >
                      <Text style={[styles.historyTitle, { color: colors.text }]}>
                        History ({history.length})
                      </Text>
                      {history.length === 0 ? (
                        <Text style={[styles.meta, { color: colors.textSecondary }]}>
                          No balances yet. Use Update balances above.
                        </Text>
                      ) : (
                        history.map((s) => (
                          <View
                            key={s.id}
                            style={[
                              styles.historyRow,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.card || colors.surface,
                              },
                            ]}
                          >
                            <Text
                              style={[styles.historyDate, { color: colors.textSecondary }]}
                              numberOfLines={1}
                            >
                              {formatShortDate(s.as_of_date)}
                            </Text>
                            <Text
                              style={[styles.historyAmt, { color: amtColor }]}
                              numberOfLines={1}
                            >
                              {displayAccountMoney(s.balance, a.account_type)}
                            </Text>
                            {onEditSnapshot ? (
                              <TooltipButton
                                tooltip="Edit this balance"
                                style={styles.iconAction}
                                onPress={() => onEditSnapshot(a, s)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <FontAwesome name="pencil" size={12} color={colors.primary} />
                              </TooltipButton>
                            ) : null}
                            {onDeleteSnapshot ? (
                              <TooltipButton
                                tooltip="Delete this balance"
                                style={styles.iconAction}
                                onPress={() => onDeleteSnapshot(s)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <FontAwesome
                                  name="trash"
                                  size={12}
                                  color={colors.error || '#ef4444'}
                                />
                              </TooltipButton>
                            ) : null}
                          </View>
                        ))
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      );
    });

    return (
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {updateBalancesCta}
        {manageHeader}
        <View style={isWide ? styles.institutionGrid : styles.institutionStack}>
          {institutionCards}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.flex}>
      <View
        style={[
          styles.boardTabBar,
          { borderBottomColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        {(
          [
            { id: 'overview' as const, label: 'Overview', icon: 'pie-chart' as const },
            { id: 'accounts' as const, label: 'Accounts', icon: 'university' as const },
          ] as const
        ).map((t) => {
          const selected = boardTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.boardTab, selected && { borderBottomColor: colors.primary }]}
              onPress={() => setBoardTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <FontAwesome
                name={t.icon}
                size={13}
                color={selected ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.boardTabText,
                  { color: selected ? colors.primary : colors.textSecondary },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? (
        <Text style={[styles.errorBanner, { color: colors.error || '#c0392b' }]}>{error}</Text>
      ) : null}

      {loading && dataFamilyId !== selectedFamily.id ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : boardTab === 'accounts' ? (
        renderManage()
      ) : (
        renderOverview()
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
  boardTabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  boardTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  boardTabText: { fontSize: 13, fontWeight: '600' },
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
  institutionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  institutionGridItem: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 280,
  },
  emptyBlock: { gap: 12, paddingVertical: 16, alignItems: 'flex-start' },
  empty: { fontSize: 13, paddingVertical: 8 },
  wizardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  wizardBtnTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  wizardBtnSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, marginTop: 2 },
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
    gap: 8,
    overflow: 'hidden',
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionHint: { fontSize: 12, fontWeight: '500', marginTop: -4 },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroCell: { flexGrow: 1, flexBasis: '28%', minWidth: 88, gap: 2 },
  heroCaption: { fontSize: 11, fontWeight: '600' },
  heroValue: { fontSize: 16, fontWeight: '800' },
  donutBlock: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    width: '100%',
  },
  donutLegend: { width: '100%', gap: 8 },
  donutLegendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
  },
  legendSwatch: { width: 10, height: 10, borderRadius: 2, marginTop: 3 },
  donutLegendLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  donutLegendAmt: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingTop: 1,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryActionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  manageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  portfolioLine: { flex: 1, flexShrink: 1 },
  manageTotal: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  addLinkText: { fontSize: 14, fontWeight: '700' },
  institutionStack: { gap: 12 },
  institutionCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  institutionAccent: { width: 4 },
  institutionBody: { flex: 1, minWidth: 0 },
  institutionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  institutionDot: { width: 8, height: 8, borderRadius: 4 },
  institutionTitle: { fontSize: 14, fontWeight: '700' },
  groupAmt: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  accountName: { fontSize: 14, fontWeight: '600' },
  accountMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
  },
  typeChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeChipText: { fontSize: 10, fontWeight: '700' },
  accountAmt: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  meta: { fontSize: 11, fontWeight: '500' },
  iconAction: { padding: 6 },
  historyPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    marginLeft: 4,
  },
  historyTitle: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  historyDate: { flex: 1, fontSize: 12, fontWeight: '500' },
  historyAmt: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
