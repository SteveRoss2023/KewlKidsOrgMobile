import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import moneyService from '../../services/moneyService';
import {
  AccountSnapshot,
  AccountType,
  IncomeFrequency,
  IncomeOccurrence,
  IncomeStream,
  IncomeStreamType,
  MoneyAccount,
} from '../../types/money';
import ThemeAwarePicker from '../../components/lists/ThemeAwarePicker';
import ThemeAwareDatePicker from '../../components/ThemeAwareDatePicker';
import AlertModal from '../../components/AlertModal';
import UpdateBalancesWizard, {
  firstOfMonthYmd,
} from '../../components/money/UpdateBalancesWizard';
import AccountDetailModal from '../../components/money/AccountDetailModal';
import TooltipButton from '../../components/TooltipButton';
import { formatCurrency, formatMoneyDisplay, onMoneyChange, parseMoneyDisplay } from '../../utils/moneyInput';
import AuthService from '../../services/authService';
import { STORAGE_KEYS, storage } from '../../utils/storage';
import {
  canUseMoneyDemoPortfolio,
  withDemoBalance,
  withDemoIncome,
} from '../../utils/moneyDemoPortfolio';

type MoneyTab = 'income' | 'accounts' | 'forecast';

const GROWTH_RATES = [2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20];

const STREAM_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
];

function streamColor(streamId: number): string {
  return STREAM_COLORS[Math.abs(streamId) % STREAM_COLORS.length];
}

const STREAM_TYPES: { label: string; value: IncomeStreamType }[] = [
  { label: 'Employment', value: 'employment' },
  { label: 'Pension', value: 'pension' },
  { label: 'Other', value: 'other' },
];

const FREQUENCIES: { label: string; value: IncomeFrequency }[] = [
  { label: 'Every 2 weeks', value: 'biweekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Monthly (CPP/OAS)', value: 'third_last_biz' },
  { label: 'Monthly (LAPP)', value: 'second_last_biz' },
  { label: 'One-time', value: 'one_time' },
];

const ACCOUNT_TYPES: { label: string; value: AccountType }[] = [
  { label: 'RRSP', value: 'rrsp' },
  { label: 'TFSA', value: 'tfsa' },
  { label: 'Non-registered', value: 'non_reg' },
  { label: 'Cash / savings', value: 'cash' },
  { label: 'Other', value: 'other' },
];

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function projectBalance(start: number, annualPct: number, months: number): number {
  const monthly = Math.pow(1 + annualPct / 100, 1 / 12) - 1;
  let bal = start;
  for (let i = 0; i < months; i++) bal *= 1 + monthly;
  return bal;
}

function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m) return ymd;
  const dt = new Date(y, m - 1, d || 1);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MoneyScreen() {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < 600;
  const { selectedFamily } = useFamily();
  const params = useLocalSearchParams<{ tab?: string; updateBalances?: string }>();
  const [tab, setTab] = useState<MoneyTab>('income');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [streams, setStreams] = useState<IncomeStream[]>([]);
  const [occurrences, setOccurrences] = useState<IncomeOccurrence[]>([]);
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [incomeViewMonth, setIncomeViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [growthRate, setGrowthRate] = useState(2.5);
  const [forecastMonths, setForecastMonths] = useState(12);
  /** Invested accounts included in the portfolio forecast (all on by default). */
  const [forecastSelectedIds, setForecastSelectedIds] = useState<number[]>([]);

  const [showStreamForm, setShowStreamForm] = useState(false);
  const [editingStream, setEditingStream] = useState<IncomeStream | null>(null);
  const [streamName, setStreamName] = useState('');
  const [streamType, setStreamType] = useState<IncomeStreamType>('employment');
  const [streamFreq, setStreamFreq] = useState<IncomeFrequency>('biweekly');
  const [streamEstimate, setStreamEstimate] = useState('');
  const [streamStart, setStreamStart] = useState(toYmd(new Date()));
  const [streamEnd, setStreamEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingOcc, setEditingOcc] = useState<IncomeOccurrence | null>(null);
  const [occEstimate, setOccEstimate] = useState('');
  const [occActual, setOccActual] = useState('');

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<MoneyAccount | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('rrsp');
  const [accountInitialBalance, setAccountInitialBalance] = useState('');

  const [showSnapForm, setShowSnapForm] = useState(false);
  const [showBalancesWizard, setShowBalancesWizard] = useState(false);
  const [showAccountDetail, setShowAccountDetail] = useState(false);
  const [snapDate, setSnapDate] = useState(toYmd(new Date()));
  const [snapBalance, setSnapBalance] = useState('');
  const snapBalanceRef = useRef<TextInput>(null);
  const [pendingDeleteStream, setPendingDeleteStream] = useState<IncomeStream | null>(null);
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState<MoneyAccount | null>(null);
  const [showAmounts, setShowAmounts] = useState(false);
  const [demoPortfolio, setDemoPortfolio] = useState(false);
  const [streamsExpanded, setStreamsExpanded] = useState(false);
  const [monthListExpanded, setMonthListExpanded] = useState(false);
  const [accountsExpanded, setAccountsExpanded] = useState(false);
  const [forecastAccountsExpanded, setForecastAccountsExpanded] = useState(true);
  const ensuredYearRef = useRef('');

  const loadDemoPortfolioPref = useCallback(async () => {
    const user = await AuthService.getUserData();
    const email = user?.email || null;
    if (!canUseMoneyDemoPortfolio(email) || !email) {
      setDemoPortfolio(false);
      return;
    }
    const key = `${STORAGE_KEYS.MONEY_DEMO_PORTFOLIO}:${email.toLowerCase()}`;
    const v = await storage.getItem(key);
    setDemoPortfolio(v === '1');
  }, []);

  // Fresh defaults whenever Money is opened (e.g. from Home card).
  useFocusEffect(
    useCallback(() => {
      setShowAmounts(false);
      setStreamsExpanded(false);
      setMonthListExpanded(false);
      setAccountsExpanded(false);
      void loadDemoPortfolioPref();
    }, [loadDemoPortfolioPref])
  );

  useEffect(() => {
    const t = String(params.tab || '');
    if (t === 'accounts' || t === 'income' || t === 'forecast') {
      setTab(t);
    }
    if (params.updateBalances === '1' || params.updateBalances === 'true') {
      setTab('accounts');
      setShowBalancesWizard(true);
    }
  }, [params.tab, params.updateBalances]);

  const toggleShowAmounts = () => {
    setShowAmounts((prev) => !prev);
  };

  const displayMoney = (value: number | null | undefined, empty = '—') => {
    if (value == null || Number.isNaN(value)) return empty;
    if (!showAmounts) return '*****';
    return formatCurrency(value);
  };

  const displayMoneyShort = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return '';
    if (!showAmounts) return '*****';
    return formatCurrency(value).replace(/\.00$/, '');
  };

  /** Account balances only — optional personal demo overlay (never written to the server). */
  const displayAccountMoney = (
    balance: number | null | undefined,
    accountType: AccountType | string,
    empty = '—'
  ) => {
    const boosted = withDemoBalance(balance, accountType, demoPortfolio);
    return displayMoney(boosted, empty);
  };

  /** Income amounts — employment gets +$15k per pay when demo overlay is on. */
  const displayIncomeMoney = (
    amount: number | null | undefined,
    streamType: IncomeStreamType | string | null | undefined,
    empty = '—'
  ) => {
    const boosted = withDemoIncome(amount, streamType, demoPortfolio);
    return displayMoney(boosted, empty);
  };

  const displayIncomeMoneyShort = (
    amount: number | null | undefined,
    streamType: IncomeStreamType | string | null | undefined
  ) => {
    const boosted = withDemoIncome(amount, streamType, demoPortfolio);
    return displayMoneyShort(boosted);
  };

  const streamTypeById = useMemo(() => {
    const map = new Map<number, IncomeStreamType>();
    for (const s of streams) map.set(s.id, s.stream_type);
    return map;
  }, [streams]);

  useEffect(() => {
    if (!showSnapForm) return;
    const t = setTimeout(() => snapBalanceRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [showSnapForm]);

  const load = useCallback(async () => {
    if (!selectedFamily) return;
    setLoading(true);
    setError('');
    try {
      const [s, o, a, sn] = await Promise.all([
        moneyService.getStreams(selectedFamily.id),
        moneyService.getOccurrences(selectedFamily.id),
        moneyService.getAccounts(selectedFamily.id),
        moneyService.getSnapshots(selectedFamily.id),
      ]);
      setStreams(s);
      setOccurrences(o);
      setAccounts(a);
      setSnapshots(sn);
      setSelectedStreamId((prev) => prev ?? (s[0]?.id ?? null));
      setSelectedAccountId((prev) => prev ?? (a[0]?.id ?? null));
    } catch (err: any) {
      setError(err.message || 'Failed to load money data');
    } finally {
      setLoading(false);
    }
  }, [selectedFamily]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const monthOccs = useMemo(() => {
    const y = incomeViewMonth.getFullYear();
    const m = incomeViewMonth.getMonth();
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
    return occurrences
      .filter((o) => o.due_date.startsWith(prefix))
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.stream - b.stream);
  }, [occurrences, incomeViewMonth]);

  const occByDay = useMemo(() => {
    const map = new Map<number, IncomeOccurrence[]>();
    for (const o of monthOccs) {
      const day = parseInt(o.due_date.slice(8, 10), 10);
      const list = map.get(day) || [];
      list.push(o);
      map.set(day, list);
    }
    return map;
  }, [monthOccs]);

  const calendarCells = useMemo(() => {
    const y = incomeViewMonth.getFullYear();
    const m = incomeViewMonth.getMonth();
    const firstDow = new Date(y, m, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: Array<{ day: number | null }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
    while (cells.length % 7 !== 0) cells.push({ day: null });
    return cells;
  }, [incomeViewMonth]);

  const incomeMonthLabel = incomeViewMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

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

  const accountsTotal = useMemo(() => {
    return accounts.reduce((sum, a) => {
      const bal = withDemoBalance(a.latest_balance, a.account_type, demoPortfolio);
      return sum + (bal ?? 0);
    }, 0);
  }, [accounts, demoPortfolio]);

  /** Forecast is for invested accounts only — cash/savings stay out of growth math. */
  const forecastAccounts = useMemo(
    () => accounts.filter((a) => a.account_type !== 'cash'),
    [accounts]
  );

  // Keep selection in sync: drop removed accounts, auto-include new ones (default = all).
  useEffect(() => {
    const ids = forecastAccounts.map((a) => a.id);
    setForecastSelectedIds((prev) => {
      if (ids.length === 0) return [];
      if (prev.length === 0) return ids;
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !prev.includes(id));
      const next = [...kept, ...added];
      return next.length > 0 ? next : ids;
    });
  }, [forecastAccounts]);

  const forecastSelectedSet = useMemo(
    () => new Set(forecastSelectedIds),
    [forecastSelectedIds]
  );

  const toggleForecastAccount = (id: number) => {
    setForecastSelectedIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // keep at least one selected
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const selectAllForecastAccounts = () => {
    setForecastSelectedIds(forecastAccounts.map((a) => a.id));
  };

  const forecastStart = useMemo(() => {
    return forecastAccounts.reduce((sum, a) => {
      if (!forecastSelectedSet.has(a.id)) return sum;
      const bal = withDemoBalance(a.latest_balance, a.account_type, demoPortfolio);
      return sum + (bal ?? 0);
    }, 0);
  }, [forecastAccounts, forecastSelectedSet, demoPortfolio]);

  const forecastProjected = useMemo(() => {
    if (forecastStart <= 0 || forecastSelectedIds.length === 0) return 0;
    return projectBalance(forecastStart, growthRate, forecastMonths);
  }, [forecastStart, forecastSelectedIds.length, growthRate, forecastMonths]);

  const forecastGain = Math.max(0, forecastProjected - forecastStart);
  const forecastGainPct =
    forecastStart > 0 ? (forecastGain / forecastStart) * 100 : 0;
  /** Share of projected total that is today's balance vs estimated growth. */
  const forecastNowSharePct =
    forecastProjected > 0
      ? Math.min(100, Math.max(0, (forecastStart / forecastProjected) * 100))
      : 0;
  const forecastGrowthSharePct = Math.max(0, 100 - forecastNowSharePct);

  const forecastAccountSummary = useMemo(() => {
    // Invested accounts first, then cash — cash is total wealth but not grown.
    const ordered = [
      ...accounts.filter((a) => a.account_type !== 'cash'),
      ...accounts.filter((a) => a.account_type === 'cash'),
    ];
    return ordered.map((a) => {
      const start =
        withDemoBalance(a.latest_balance, a.account_type, demoPortfolio) ?? 0;
      const isCash = a.account_type === 'cash';
      const selected = isCash ? true : forecastSelectedSet.has(a.id);
      const projected =
        start <= 0
          ? 0
          : isCash
            ? start
            : projectBalance(start, growthRate, forecastMonths);
      return {
        id: a.id,
        name: a.name,
        accountType: a.account_type,
        isCash,
        selected,
        start,
        projected,
      };
    });
  }, [accounts, demoPortfolio, growthRate, forecastMonths, forecastSelectedSet]);

  /** Total wealth = selected invested (grown) + all cash (flat). */
  const forecastSummaryTotals = useMemo(() => {
    return forecastAccountSummary
      .filter((row) => row.selected)
      .reduce(
        (acc, row) => ({
          start: acc.start + row.start,
          projected: acc.projected + row.projected,
        }),
        { start: 0, projected: 0 }
      );
  }, [forecastAccountSummary]);

  const forecastTermLabel = `${forecastMonths / 12}y @ ${growthRate}%`;

  const openNewStream = () => {
    setEditingStream(null);
    setStreamName('');
    setStreamType('employment');
    setStreamFreq('biweekly');
    setStreamEstimate('');
    setStreamStart(toYmd(new Date()));
    setStreamEnd('');
    setShowStreamForm(true);
  };

  const openEditStream = (s: IncomeStream) => {
    setEditingStream(s);
    setStreamName(s.name);
    setStreamType(s.stream_type);
    setStreamFreq(s.frequency);
    setStreamEstimate(formatMoneyDisplay(s.default_estimate));
    setStreamStart(s.start_date);
    setStreamEnd(s.end_date || '');
    setShowStreamForm(true);
  };

  const saveStream = async () => {
    if (!selectedFamily) return;
    const amt = parseMoneyDisplay(streamEstimate);
    if (!streamName.trim() || amt == null || amt <= 0) {
      setError('Name and estimate are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        family: selectedFamily.id,
        name: streamName.trim(),
        stream_type: streamType,
        frequency: streamFreq,
        default_estimate: amt,
        start_date: streamStart,
        end_date: streamFreq === 'one_time' ? null : streamEnd || null,
      };
      let stream: IncomeStream;
      if (editingStream) {
        stream = await moneyService.updateStream(editingStream.id, payload);
      } else {
        stream = await moneyService.createStream(payload);
      }
      const startYear = parseInt(stream.start_date.slice(0, 4), 10);
      const startMonth = parseInt(stream.start_date.slice(5, 7), 10) - 1;
      const viewYearEnd = `${Math.max(incomeViewMonth.getFullYear(), startYear)}-12-31`;
      const until = stream.end_date || viewYearEnd;
      await moneyService.generateOccurrences(stream.id, until);
      ensuredYearRef.current = '';
      // Jump calendar to the stream's start month so future pensions are visible.
      setIncomeViewMonth(new Date(startYear, startMonth, 1));
      setShowStreamForm(false);
      setSelectedStreamId(stream.id);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save stream');
    } finally {
      setSaving(false);
    }
  };

  const ensureYearSchedule = useCallback(
    async (month: Date, streamList: IncomeStream[]) => {
      if (!selectedFamily || streamList.length === 0) return;
      const y = month.getFullYear();
      const key = `${selectedFamily.id}:${y}:${streamList.map((s) => s.id).join(',')}`;
      if (ensuredYearRef.current === key) return;
      const yearStart = `${y}-01-01`;
      const yearEnd = `${y}-12-31`;
      let createdAny = false;
      try {
        for (const s of streamList) {
          if (s.start_date > yearEnd) continue;
          if (s.end_date && s.end_date < yearStart) continue;
          let until = yearEnd;
          if (s.end_date && s.end_date < until) until = s.end_date;
          const res = await moneyService.generateOccurrences(s.id, until);
          if (res.created > 0) createdAny = true;
        }
        ensuredYearRef.current = key;
        if (createdAny) await load();
      } catch {
        // ignore auto-fill errors; user can navigate again
      }
    },
    [selectedFamily, load]
  );

  useEffect(() => {
    if (tab !== 'income' || streams.length === 0) return;
    void ensureYearSchedule(incomeViewMonth, streams);
  }, [tab, streams, incomeViewMonth, ensureYearSchedule]);

  const openOcc = (o: IncomeOccurrence) => {
    setEditingOcc(o);
    setOccEstimate(formatMoneyDisplay(o.estimated_amount));
    setOccActual(o.actual_amount != null ? formatMoneyDisplay(o.actual_amount) : '');
  };

  const saveOcc = async () => {
    if (!editingOcc) return;
    const est = parseMoneyDisplay(occEstimate);
    const act = occActual.trim() ? parseMoneyDisplay(occActual) : null;
    if (est == null) {
      setError('Estimate required');
      return;
    }
    setSaving(true);
    try {
      await moneyService.updateOccurrence(editingOcc.id, {
        estimated_amount: est,
        actual_amount: act,
        status: act != null ? 'received' : 'estimated',
      });
      setEditingOcc(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update payment');
    } finally {
      setSaving(false);
    }
  };

  const openNewAccount = () => {
    setEditingAccount(null);
    setAccountName('');
    setAccountType('rrsp');
    setAccountInitialBalance('');
    setShowAccountForm(true);
  };

  const openEditAccount = (a: MoneyAccount) => {
    setEditingAccount(a);
    setAccountName(a.name);
    setAccountType(a.account_type);
    setAccountInitialBalance('');
    setShowAccountForm(true);
  };

  const saveAccount = async () => {
    if (!selectedFamily || !accountName.trim()) return;
    setSaving(true);
    try {
      if (editingAccount) {
        await moneyService.updateAccount(editingAccount.id, {
          name: accountName.trim(),
          account_type: accountType,
        });
      } else {
        const initial = parseMoneyDisplay(accountInitialBalance);
        if (initial == null) {
          setError('Initial balance is required');
          setSaving(false);
          return;
        }
        const created = await moneyService.createAccount({
          family: selectedFamily.id,
          name: accountName.trim(),
          account_type: accountType,
        });
        await moneyService.upsertSnapshot({
          account: created.id,
          as_of_date: toYmd(new Date()),
          balance: initial,
        });
        setSelectedAccountId(created.id);
      }
      setShowAccountForm(false);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save account');
    } finally {
      setSaving(false);
    }
  };

  const openSnapForm = (account: MoneyAccount) => {
    setSelectedAccountId(account.id);
    setSnapDate(toYmd(new Date()));
    setSnapBalance('');
    setShowSnapForm(true);
  };

  const saveSnap = async () => {
    if (!selectedAccountId) return;
    const bal = parseMoneyDisplay(snapBalance);
    if (bal == null) {
      setError('Balance required');
      return;
    }
    setSaving(true);
    try {
      await moneyService.upsertSnapshot({
        account: selectedAccountId,
        as_of_date: snapDate,
        balance: bal,
      });
      setShowSnapForm(false);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save balance');
    } finally {
      setSaving(false);
    }
  };

  const freqLabel = (f: IncomeFrequency) =>
    FREQUENCIES.find((x) => x.value === f)?.label || f;
  const typeLabel = (t: IncomeStreamType) =>
    STREAM_TYPES.find((x) => x.value === t)?.label || t;

  const goToToday = () => {
    const next = new Date();
    next.setDate(1);
    setIncomeViewMonth(next);
  };

  const shiftMonth = (deltaMonths: number) => {
    setIncomeViewMonth(
      (d) => new Date(d.getFullYear(), d.getMonth() + deltaMonths, 1)
    );
  };

  const shiftYear = (deltaYears: number) => {
    setIncomeViewMonth(
      (d) => new Date(d.getFullYear() + deltaYears, d.getMonth(), 1)
    );
  };

  const renderIncome = () => {
    return (
      <View style={styles.flex}>
        {streams.length === 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Income streams</Text>
              <TooltipButton tooltip="Add income stream" onPress={openNewStream}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Add</Text>
              </TooltipButton>
            </View>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Add a paycheck or pension stream with start/end dates (e.g. work until Apr 2027, pensions from
              Dec 2027).
            </Text>
          </>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 12 }}>
            <View style={[styles.streamList, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <TouchableOpacity
                style={styles.streamCollapseHeader}
                onPress={() => setStreamsExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: streamsExpanded }}
                accessibilityLabel={
                  streamsExpanded ? 'Collapse income streams' : 'Expand income streams'
                }
              >
                <FontAwesome
                  name={streamsExpanded ? 'chevron-down' : 'chevron-right'}
                  size={12}
                  color={colors.textSecondary}
                />
                <Text style={[styles.sectionTitle, { color: colors.text, flex: 1, fontSize: 15 }]}>
                  Income streams ({streams.length})
                </Text>
              <TooltipButton
                tooltip="Add income stream"
                onPress={openNewStream}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Add</Text>
              </TooltipButton>
              </TouchableOpacity>
              {streamsExpanded
                ? streams.map((s) => {
                    const active = s.id === selectedStreamId;
                    const color = streamColor(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[
                          styles.streamCard,
                          {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: colors.border,
                          },
                          active && { backgroundColor: `${color}18` },
                        ]}
                        onPress={() => setSelectedStreamId(s.id)}
                        accessibilityLabel={`Select ${s.name}`}
                      >
                        <View style={[styles.colorBar, { backgroundColor: color }]} />
                        <View style={styles.flex}>
                          <View style={styles.streamCardTop}>
                            <Text
                              style={[
                                styles.streamCardName,
                                { color: colors.text, fontWeight: active ? '700' : '600' },
                              ]}
                              numberOfLines={1}
                            >
                              {s.name}
                            </Text>
                            <Text style={[styles.streamCardAmt, { color: colors.text }]}>
                              {displayIncomeMoney(s.default_estimate, s.stream_type)}
                            </Text>
                          </View>
                          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={2}>
                            {typeLabel(s.stream_type)} · {freqLabel(s.frequency)}
                          </Text>
                          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                            {formatShortDate(s.start_date)}
                            {' → '}
                            {s.end_date ? formatShortDate(s.end_date) : 'open'}
                          </Text>
                        </View>
                        <View style={styles.streamCardActions}>
                          <TooltipButton
                            tooltip={`Edit ${s.name}`}
                            style={styles.iconAction}
                            onPress={() => openEditStream(s)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <FontAwesome name="pencil" size={13} color={colors.primary} />
                          </TooltipButton>
                          <TooltipButton
                            tooltip={`Delete ${s.name}`}
                            style={styles.iconAction}
                            onPress={() => setPendingDeleteStream(s)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <FontAwesome name="trash" size={13} color={colors.error || '#ef4444'} />
                          </TooltipButton>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                : null}
            </View>

            <View style={{ paddingTop: 16, gap: 8 }}>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                Tap a pay day to set estimate or actual.
              </Text>

              <View style={styles.calNav}>
                <TouchableOpacity
                  style={styles.calNavBtn}
                  onPress={() => shiftYear(-1)}
                  accessibilityLabel="Previous year"
                >
                  <FontAwesome name="angle-double-left" size={16} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calNavBtn}
                  onPress={() => shiftMonth(-1)}
                  accessibilityLabel="Previous month"
                >
                  <FontAwesome name="chevron-left" size={14} color={colors.text} />
                </TouchableOpacity>
                <Text
                  style={[styles.calNavLabel, { color: colors.text, fontSize: isNarrow ? 14 : 15 }]}
                  numberOfLines={1}
                >
                  {incomeMonthLabel}
                </Text>
                <TouchableOpacity
                  style={styles.calNavBtn}
                  onPress={() => shiftMonth(1)}
                  accessibilityLabel="Next month"
                >
                  <FontAwesome name="chevron-right" size={14} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calNavBtn}
                  onPress={() => shiftYear(1)}
                  accessibilityLabel="Next year"
                >
                  <FontAwesome name="angle-double-right" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.calNavSecondary}>
                <TouchableOpacity
                  style={[styles.todayBtn, { borderColor: colors.primary }]}
                  onPress={goToToday}
                  accessibilityLabel="Go to today"
                >
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Today</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.calGrid, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dow, i) => (
                  <Text key={`dow-${i}`} style={[styles.calDow, { color: colors.textSecondary }]}>
                    {dow}
                  </Text>
                ))}
                {calendarCells.map((cell, idx) => {
                  if (cell.day == null) {
                    return <View key={`e-${idx}`} style={styles.calCell} />;
                  }
                  const dayOccs = occByDay.get(cell.day) || [];
                  const hasPay = dayOccs.length > 0;
                  const preferred =
                    dayOccs.find((o) => o.stream === selectedStreamId) || dayOccs[0];
                  const today = new Date();
                  const isToday =
                    today.getFullYear() === incomeViewMonth.getFullYear() &&
                    today.getMonth() === incomeViewMonth.getMonth() &&
                    today.getDate() === cell.day;
                  const uniqueStreamIds = [...new Set(dayOccs.map((o) => o.stream))];
                  return (
                    <TouchableOpacity
                      key={`d-${cell.day}`}
                      style={[
                        styles.calCell,
                        isNarrow && styles.calCellNarrow,
                        hasPay && { backgroundColor: `${streamColor(dayOccs[0].stream)}18` },
                        isToday && { borderColor: colors.primary, borderWidth: 1 },
                      ]}
                      disabled={!hasPay}
                      onPress={() => {
                        if (preferred) openOcc(preferred);
                      }}
                    >
                      <Text
                        style={[
                          styles.calDayNum,
                          { color: hasPay ? colors.text : colors.textSecondary },
                        ]}
                      >
                        {cell.day}
                      </Text>
                      {hasPay ? (
                        isNarrow ? (
                          <View style={styles.calDots}>
                            {uniqueStreamIds.slice(0, 4).map((sid) => (
                              <View
                                key={sid}
                                style={[styles.calDot, { backgroundColor: streamColor(sid) }]}
                              />
                            ))}
                          </View>
                        ) : (
                          dayOccs.map((o) => (
                            <Text
                              key={o.id}
                              style={[styles.calDayAmt, { color: streamColor(o.stream) }]}
                              numberOfLines={1}
                            >
                              {displayIncomeMoneyShort(
                                o.actual_amount ?? o.estimated_amount,
                                streamTypeById.get(o.stream)
                              )}
                            </Text>
                          ))
                        )
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View
                style={[
                  styles.monthList,
                  { borderColor: colors.border, backgroundColor: colors.card, marginTop: 8 },
                ]}
              >
                <TouchableOpacity
                  style={styles.streamCollapseHeader}
                  onPress={() => setMonthListExpanded((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: monthListExpanded }}
                  accessibilityLabel={
                    monthListExpanded ? 'Collapse this month payments' : 'Expand this month payments'
                  }
                >
                  <FontAwesome
                    name={monthListExpanded ? 'chevron-down' : 'chevron-right'}
                    size={12}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.sectionTitle, { color: colors.text, flex: 1, fontSize: 15 }]}>
                    This month ({monthOccs.length})
                  </Text>
                </TouchableOpacity>
                {monthListExpanded ? (
                  monthOccs.length === 0 ? (
                    <Text
                      style={[
                        styles.meta,
                        {
                          color: colors.textSecondary,
                          paddingHorizontal: 12,
                          paddingBottom: 12,
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border,
                          paddingTop: 10,
                        },
                      ]}
                    >
                      No payments this month for any stream. Check stream start/end dates, or pick
                      another month.
                    </Text>
                  ) : (
                    monthOccs.map((o) => {
                      const color = streamColor(o.stream);
                      return (
                        <TouchableOpacity
                          key={o.id}
                          style={[
                            styles.monthListRow,
                            {
                              borderTopColor: colors.border,
                              backgroundColor: colors.card,
                            },
                          ]}
                          onPress={() => openOcc(o)}
                        >
                          <View style={[styles.colorBar, { backgroundColor: color }]} />
                          <View style={styles.flex}>
                            <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                              {o.stream_name ||
                                streams.find((s) => s.id === o.stream)?.name ||
                                'Stream'}
                            </Text>
                            <Text
                              style={[styles.meta, { color: colors.textSecondary }]}
                              numberOfLines={2}
                            >
                              {formatShortDate(o.due_date)} · Est{' '}
                              {displayIncomeMoney(o.estimated_amount, streamTypeById.get(o.stream))}
                              {o.actual_amount != null
                                ? ` · Actual ${displayIncomeMoney(
                                    o.actual_amount,
                                    streamTypeById.get(o.stream)
                                  )}`
                                : ''}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor:
                                  o.status === 'received'
                                    ? '#10b98133'
                                    : o.status === 'skipped'
                                      ? '#94a3b833'
                                      : '#f59e0b33',
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color:
                                  o.status === 'received'
                                    ? '#10b981'
                                    : o.status === 'skipped'
                                      ? '#64748b'
                                      : '#f59e0b',
                              }}
                            >
                              {o.status}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )
                ) : null}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    );
  };

  const renderAccounts = () => (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 8 }}>
        {accounts.length > 0 ? (
          <TooltipButton
            tooltip="Update all account balances for the 1st of the month"
            style={[styles.wizardBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowBalancesWizard(true)}
          >
            <FontAwesome name="calendar-check-o" size={16} color="#fff" />
            <View style={styles.flex}>
              <Text style={styles.wizardBtnTitle}>Update balances</Text>
              <Text style={styles.wizardBtnSub}>{lastBalancesUpdatedLabel}</Text>
            </View>
            <FontAwesome name="chevron-right" size={14} color="rgba(255,255,255,0.85)" />
          </TooltipButton>
        ) : null}

        {accounts.length === 0 ? (
          <>
            <View style={styles.sectionHeaderInline}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Accounts</Text>
              <TooltipButton tooltip="Add account" onPress={openNewAccount}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Add</Text>
              </TooltipButton>
            </View>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Add RRSP, TFSA, Non-reg, or Cash — then update balances monthly.
            </Text>
          </>
        ) : (
          <View style={[styles.streamList, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={styles.streamCollapseHeader}
              onPress={() => setAccountsExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: accountsExpanded }}
              accessibilityLabel={accountsExpanded ? 'Collapse accounts' : 'Expand accounts'}
            >
              <FontAwesome
                name={accountsExpanded ? 'chevron-down' : 'chevron-right'}
                size={12}
                color={colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 15 }]}>
                  Accounts ({accounts.length})
                </Text>
                <Text style={[styles.amount, { color: colors.primary, fontSize: 13, marginTop: 2 }]}>
                  {displayMoney(accountsTotal)}
                </Text>
              </View>
              <TooltipButton
                tooltip="Add account"
                onPress={openNewAccount}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Add</Text>
              </TooltipButton>
            </TouchableOpacity>
            {accountsExpanded
              ? accounts.map((a) => {
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[
                        styles.monthListRow,
                        {
                          borderTopColor: colors.border,
                          backgroundColor: colors.card,
                        },
                      ]}
                      onPress={() => {
                        setSelectedAccountId(a.id);
                        setShowAccountDetail(true);
                      }}
                      accessibilityLabel={`Open ${a.name} details and history`}
                    >
                      <View style={styles.flex}>
                        <Text style={[styles.rowTitle, { color: colors.text }]}>{a.name}</Text>
                        <Text style={[styles.meta, { color: colors.textSecondary }]}>
                          {ACCOUNT_TYPES.find((t) => t.value === a.account_type)?.label ||
                            a.account_type}
                          {a.latest_as_of ? ` · as of ${a.latest_as_of}` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.amount, { color: colors.primary }]}>
                        {displayAccountMoney(a.latest_balance, a.account_type)}
                      </Text>
                      <TooltipButton
                        tooltip={`Update balance for ${a.name}`}
                        onPress={() => openSnapForm(a)}
                        style={styles.iconAction}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <FontAwesome name="plus" size={16} color={colors.primary} />
                      </TooltipButton>
                      <TooltipButton
                        tooltip={`Edit ${a.name}`}
                        onPress={() => openEditAccount(a)}
                        style={styles.iconAction}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <FontAwesome name="pencil" size={14} color={colors.primary} />
                      </TooltipButton>
                      <TooltipButton
                        tooltip={`Delete ${a.name}`}
                        onPress={() => setPendingDeleteAccount(a)}
                        style={styles.iconAction}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <FontAwesome name="trash" size={13} color={colors.error || '#ef4444'} />
                      </TooltipButton>
                      <FontAwesome name="chevron-right" size={12} color={colors.textSecondary} />
                    </TouchableOpacity>
                  );
                })
              : null}
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderForecast = () => (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 10 }}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Growth forecast</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        Manual projection for invested accounts (RRSP, TFSA, non-reg). Cash / savings excluded.
      </Text>
      {forecastAccounts.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          Add an RRSP, TFSA, or non-registered account with a balance to forecast.
        </Text>
      ) : (
        <>
          <View
            style={[
              styles.monthList,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              style={styles.streamCollapseHeader}
              onPress={() => setForecastAccountsExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: forecastAccountsExpanded }}
              accessibilityLabel={
                forecastAccountsExpanded
                  ? 'Collapse forecast accounts'
                  : 'Expand forecast accounts'
              }
            >
              <FontAwesome
                name={forecastAccountsExpanded ? 'chevron-down' : 'chevron-right'}
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.sectionTitle, { color: colors.text, flex: 1, fontSize: 15 }]}>
                Accounts ({forecastSelectedIds.length}/{forecastAccounts.length})
              </Text>
              {forecastSelectedIds.length < forecastAccounts.length ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    selectAllForecastAccounts();
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                    Select all
                  </Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
            {forecastAccountsExpanded
              ? forecastAccounts.map((a, idx) => {
                  const selected = forecastSelectedSet.has(a.id);
                  const bal =
                    withDemoBalance(a.latest_balance, a.account_type, demoPortfolio) ?? 0;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[
                        styles.monthListRow,
                        {
                          borderTopColor: colors.border,
                          backgroundColor: selected ? colors.card : colors.surface,
                          opacity: selected ? 1 : 0.7,
                        },
                        idx === 0 ? { borderTopWidth: StyleSheet.hairlineWidth } : null,
                      ]}
                      onPress={() => toggleForecastAccount(a.id)}
                    >
                      <FontAwesome
                        name={selected ? 'check-square' : 'square-o'}
                        size={18}
                        color={selected ? colors.primary : colors.textSecondary}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}
                          numberOfLines={1}
                        >
                          {a.name}
                        </Text>
                        <Text
                          style={[styles.meta, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {ACCOUNT_TYPES.find((t) => t.value === a.account_type)?.label ||
                            a.account_type}{' '}
                          · {displayMoney(bal)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              : null}
          </View>

          <Text style={[styles.meta, { color: colors.textSecondary }]}>Annual return</Text>
          <View style={styles.chipWrap}>
            {GROWTH_RATES.map((r) => {
              const active = r === growthRate;
              return (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setGrowthRate(r)}
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]}>
                    {r}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.meta, { color: colors.textSecondary }]}>Term</Text>
          <View style={styles.chipWrap}>
            {[12, 24, 60, 120, 240].map((m) => {
              const active = m === forecastMonths;
              return (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setForecastMonths(m)}
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]}>
                    {m / 12}y
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View
            style={[
              styles.portfolioHeroCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.portfolioHeroTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.portfolioHeroEyebrow, { color: colors.primary }]}>
                  PORTFOLIO FORECAST
                </Text>
                <Text style={[styles.portfolioHeroTitle, { color: colors.text }]}>
                  Selected invested
                </Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {forecastSelectedIds.length} account
                  {forecastSelectedIds.length === 1 ? '' : 's'} · {forecastMonths / 12}y term ·{' '}
                  {growthRate}% return
                </Text>
              </View>
              <View
                style={[
                  styles.portfolioGainPill,
                  { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' },
                ]}
              >
                <Text style={[styles.portfolioGainPillText, { color: colors.primary }]}>
                  +{displayMoney(forecastGain)}
                </Text>
              </View>
            </View>

            <View style={styles.portfolioHeroMetrics}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                  Now
                </Text>
                <Text style={[styles.portfolioHeroNow, { color: colors.text }]}>
                  {displayMoney(forecastStart)}
                </Text>
              </View>
              <FontAwesome
                name="long-arrow-right"
                size={16}
                color={colors.textSecondary}
                style={{ marginTop: 18, marginHorizontal: 6 }}
              />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                  Projected
                </Text>
                <Text style={[styles.portfolioHeroProjected, { color: colors.primary }]}>
                  {displayMoney(forecastProjected)}
                </Text>
              </View>
            </View>

            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Bar = projected total · solid = today · tint = estimated growth
            </Text>
            <View style={[styles.portfolioTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.portfolioTrackFill,
                  {
                    width: `${forecastNowSharePct}%` as any,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
              <View
                style={[
                  styles.portfolioTrackGrowth,
                  {
                    width: `${forecastGrowthSharePct}%` as any,
                    backgroundColor: colors.primary + '55',
                  },
                ]}
              />
            </View>
            <View style={styles.portfolioTrackLegend}>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                Today {forecastNowSharePct.toFixed(1)}%
              </Text>
              <Text style={[styles.meta, { color: colors.primary, fontWeight: '700' }]}>
                Growth {forecastGrowthSharePct.toFixed(1)}% (+{forecastGainPct.toFixed(1)}% on
                principal)
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 4 }]}>
            By account
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Same split: today vs growth inside each projected total. Cash stays flat.
          </Text>
          {forecastAccountSummary.map((row) => {
            const gain = Math.max(0, row.projected - row.start);
            const gainPct = row.start > 0 ? (gain / row.start) * 100 : 0;
            const nowShare =
              row.projected > 0
                ? Math.min(100, Math.max(0, (row.start / row.projected) * 100))
                : 0;
            const growthShare = Math.max(0, 100 - nowShare);
            return (
              <View
                key={row.id}
                style={[
                  styles.forecastAccountCompact,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: row.selected ? 1 : 0.45,
                  },
                ]}
              >
                <View style={styles.forecastAccountCompactTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}
                      numberOfLines={1}
                    >
                      {row.name}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {ACCOUNT_TYPES.find((t) => t.value === row.accountType)?.label ||
                        row.accountType}
                      {row.isCash ? ' · cash' : row.selected ? '' : ' · excluded'}
                    </Text>
                  </View>
                  {!row.isCash && gain > 0 ? (
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>
                      +{gainPct.toFixed(1)}%
                    </Text>
                  ) : null}
                </View>
                <View style={styles.forecastAccountCompactAmounts}>
                  <Text style={[styles.forecastCompactNow, { color: colors.text }]}>
                    {displayMoney(row.start)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>→</Text>
                  <Text style={[styles.forecastCompactProjected, { color: colors.primary }]}>
                    {displayMoney(row.projected)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.portfolioTrackCompact,
                    { backgroundColor: colors.border, flexDirection: 'row' },
                  ]}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${nowShare}%` as any,
                      backgroundColor: colors.primary,
                    }}
                  />
                  <View
                    style={{
                      height: '100%',
                      width: `${growthShare}%` as any,
                      backgroundColor: colors.primary + '55',
                    }}
                  />
                </View>
              </View>
            );
          })}
          {(() => {
            const twGain = Math.max(
              0,
              forecastSummaryTotals.projected - forecastSummaryTotals.start
            );
            const twGainPct =
              forecastSummaryTotals.start > 0
                ? (twGain / forecastSummaryTotals.start) * 100
                : 0;
            const twNowShare =
              forecastSummaryTotals.projected > 0
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      (forecastSummaryTotals.start / forecastSummaryTotals.projected) * 100
                    )
                  )
                : 0;
            const twGrowthShare = Math.max(0, 100 - twNowShare);
            return (
              <View
                style={[
                  styles.forecastAccountCompact,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.primary + '66',
                    borderWidth: 1.5,
                  },
                ]}
              >
                <View style={styles.forecastAccountCompactTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>
                      Total wealth
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      Invested + cash
                    </Text>
                  </View>
                  {twGain > 0 ? (
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>
                      +{twGainPct.toFixed(1)}%
                    </Text>
                  ) : null}
                </View>
                <View style={styles.forecastAccountCompactAmounts}>
                  <Text style={[styles.forecastCompactNow, { color: colors.text, fontWeight: '800' }]}>
                    {displayMoney(forecastSummaryTotals.start)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>→</Text>
                  <Text
                    style={[
                      styles.forecastCompactProjected,
                      { color: colors.primary, fontWeight: '800' },
                    ]}
                  >
                    {displayMoney(forecastSummaryTotals.projected)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.portfolioTrackCompact,
                    { backgroundColor: colors.border, flexDirection: 'row' },
                  ]}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${twNowShare}%` as any,
                      backgroundColor: colors.primary,
                    }}
                  />
                  <View
                    style={{
                      height: '100%',
                      width: `${twGrowthShare}%` as any,
                      backgroundColor: colors.primary + '55',
                    }}
                  />
                </View>
              </View>
            );
          })()}
        </>
      )}
    </ScrollView>
  );

  const formModal = (
    title: string,
    visible: boolean,
    onClose: () => void,
    onSave: () => void,
    children: React.ReactNode
  ) => (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {children}
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.topTitle, { color: colors.text }]}>Money</Text>
        <TooltipButton
          tooltip={showAmounts ? 'Hide amounts' : 'Show amounts'}
          style={styles.amountToggle}
          onPress={toggleShowAmounts}
          accessibilityRole="switch"
          accessibilityState={{ checked: showAmounts }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <FontAwesome
            name={showAmounts ? 'eye' : 'eye-slash'}
            size={16}
            color={colors.textSecondary}
          />
          <Text style={[styles.amountToggleText, { color: colors.textSecondary }]}>
            {showAmounts ? 'Hide amounts' : 'Show amounts'}
          </Text>
        </TooltipButton>
      </View>
      <View style={[styles.tabContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(
            [
              { id: 'income' as const, label: 'Income', icon: 'usd' as const },
              { id: 'accounts' as const, label: 'Accounts', icon: 'university' as const },
              { id: 'forecast' as const, label: 'Forecast', icon: 'line-chart' as const },
            ] as const
          ).map((t) => {
            const selected = tab === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.tab,
                  selected && { backgroundColor: colors.primary },
                  { borderColor: colors.border },
                ]}
                onPress={() => setTab(t.id)}
              >
                <FontAwesome name={t.icon} size={14} color={selected ? '#fff' : colors.textSecondary} />
                <Text style={[styles.tabText, { color: selected ? '#fff' : colors.textSecondary }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {error ? (
        <Text style={[styles.errorBanner, { color: colors.error || '#c0392b' }]}>{error}</Text>
      ) : null}

      {!selectedFamily ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
        </View>
      ) : loading && streams.length === 0 && accounts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : tab === 'income' ? (
        renderIncome()
      ) : tab === 'accounts' ? (
        renderAccounts()
      ) : (
        renderForecast()
      )}

      {formModal('Income stream', showStreamForm, () => setShowStreamForm(false), () => void saveStream(), (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Name</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={streamName}
            onChangeText={setStreamName}
            placeholder="e.g. Work paycheck, CPP, EPCOR"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.label, { color: colors.text }]}>Type</Text>
          <ThemeAwarePicker
            selectedValue={streamType}
            onValueChange={(v) => setStreamType(String(v) as IncomeStreamType)}
            options={STREAM_TYPES}
          />
          <Text style={[styles.label, { color: colors.text }]}>Frequency</Text>
          <ThemeAwarePicker
            selectedValue={streamFreq}
            onValueChange={(v) => setStreamFreq(String(v) as IncomeFrequency)}
            options={FREQUENCIES}
          />
          {streamFreq === 'third_last_biz' ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Pays on the 3rd-to-last business day each month (same schedule as CPP and OAS).
            </Text>
          ) : null}
          {streamFreq === 'second_last_biz' ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Pays on the 2nd-to-last banking day each month (LAPP schedule; December before the 25th).
            </Text>
          ) : null}
          <Text style={[styles.label, { color: colors.text }]}>Default estimate</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={streamEstimate}
            onChangeText={(t) => setStreamEstimate(onMoneyChange(t))}
            keyboardType="decimal-pad"
            placeholder="$0.00"
            placeholderTextColor={colors.textSecondary}
          />
          <ThemeAwareDatePicker
            value={streamStart}
            onChange={setStreamStart}
            label={streamFreq === 'one_time' ? 'Payment date' : 'Start date'}
          />
          {streamFreq !== 'one_time' ? (
            <>
              <ThemeAwareDatePicker
                value={streamEnd || streamStart}
                onChange={setStreamEnd}
                label="End date (optional)"
              />
              <TouchableOpacity onPress={() => setStreamEnd('')}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                  Clear end date
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              One-time income (e.g. annual bonus) — a single payment on this date.
            </Text>
          )}
        </>
      ))}

      {formModal('Payment', !!editingOcc, () => setEditingOcc(null), () => void saveOcc(), (
        <>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {editingOcc?.due_date} · {editingOcc?.stream_name}
          </Text>
          <Text style={[styles.label, { color: colors.text }]}>Estimate</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={occEstimate}
            onChangeText={(t) => setOccEstimate(onMoneyChange(t))}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.label, { color: colors.text }]}>Actual (when deposited)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={occActual}
            onChangeText={(t) => setOccActual(onMoneyChange(t))}
            keyboardType="decimal-pad"
            placeholder="Leave blank until deposited"
            placeholderTextColor={colors.textSecondary}
          />
        </>
      ))}

      {formModal(
        editingAccount ? 'Edit account' : 'Add account',
        showAccountForm,
        () => setShowAccountForm(false),
        () => void saveAccount(),
        (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Name</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={accountName}
            onChangeText={setAccountName}
            placeholder="RRSP, TFSA, Cash…"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.label, { color: colors.text }]}>Type</Text>
          <ThemeAwarePicker
            selectedValue={accountType}
            onValueChange={(v) => setAccountType(String(v) as AccountType)}
            options={ACCOUNT_TYPES}
          />
          {!editingAccount ? (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Initial balance</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                value={accountInitialBalance}
                onChangeText={(t) => setAccountInitialBalance(onMoneyChange(t))}
                keyboardType="decimal-pad"
                placeholder="$0.00"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
            </>
          ) : null}
        </>
        )
      )}

      {formModal('Update balance', showSnapForm, () => setShowSnapForm(false), () => void saveSnap(), (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Balance</Text>
          <TextInput
            ref={snapBalanceRef}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={snapBalance}
            onChangeText={(t) => setSnapBalance(onMoneyChange(t))}
            keyboardType="decimal-pad"
            placeholder="$0.00"
            placeholderTextColor={colors.textSecondary}
            autoFocus
          />
          <ThemeAwareDatePicker value={snapDate} onChange={setSnapDate} label="As of" />
        </>
      ))}

      <UpdateBalancesWizard
        visible={showBalancesWizard}
        accounts={accounts}
        defaultAsOf={firstOfMonthYmd()}
        onClose={() => setShowBalancesWizard(false)}
        onSaved={() => {
          void load();
        }}
      />

      <AccountDetailModal
        visible={showAccountDetail}
        account={accounts.find((a) => a.id === selectedAccountId) || null}
        snapshots={snapshots}
        showAmounts={showAmounts}
        demoPortfolio={demoPortfolio}
        onClose={() => setShowAccountDetail(false)}
        onUpdateBalance={(a) => {
          setShowAccountDetail(false);
          openSnapForm(a);
        }}
        onEdit={(a) => {
          setShowAccountDetail(false);
          openEditAccount(a);
        }}
        onDelete={(a) => {
          setShowAccountDetail(false);
          setPendingDeleteAccount(a);
        }}
      />

      <AlertModal
        visible={!!pendingDeleteStream}
        title="Delete stream?"
        message={
          pendingDeleteStream
            ? `Delete "${pendingDeleteStream.name}" and all its payments?`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onConfirm={async () => {
          if (!pendingDeleteStream) return;
          try {
            await moneyService.deleteStream(pendingDeleteStream.id);
            setPendingDeleteStream(null);
            setSelectedStreamId(null);
            await load();
          } catch (err: any) {
            setError(err.message || 'Delete failed');
            setPendingDeleteStream(null);
          }
        }}
        onClose={() => setPendingDeleteStream(null)}
      />
      <AlertModal
        visible={!!pendingDeleteAccount}
        title="Delete account?"
        message={
          pendingDeleteAccount
            ? `Delete "${pendingDeleteAccount.name}" and its balance history?`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onConfirm={async () => {
          if (!pendingDeleteAccount) return;
          try {
            await moneyService.deleteAccount(pendingDeleteAccount.id);
            setPendingDeleteAccount(null);
            setSelectedAccountId(null);
            await load();
          } catch (err: any) {
            setError(err.message || 'Delete failed');
            setPendingDeleteAccount(null);
          }
        }}
        onClose={() => setPendingDeleteAccount(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  topTitle: { fontSize: 16, fontWeight: '700' },
  amountToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  amountToggleText: { fontSize: 12, fontWeight: '600' },
  tabContainer: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  tabsScroll: { paddingHorizontal: 10, gap: 8, flexDirection: 'row' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabText: { fontSize: 13, fontWeight: '700' },
  errorBanner: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
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
  chipRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  sectionHeaderInline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  streamList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 8,
  },
  streamCollapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  monthList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
  },
  monthListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  streamCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  streamCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  streamCardName: { flex: 1, fontSize: 15 },
  streamCardAmt: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  streamCardActions: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  colorBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 36 },
  iconAction: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingTop: 4,
    gap: 2,
  },
  calNavSecondary: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calNavBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calNavLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
  },
  calDow: {
    width: `${100 / 7}%` as any,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    paddingVertical: 6,
  },
  calCell: {
    width: `${100 / 7}%` as any,
    minHeight: 56,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  calCellNarrow: { minHeight: 44 },
  calDayNum: { fontSize: 12, fontWeight: '600' },
  calDayAmt: { fontSize: 9, fontWeight: '700', marginTop: 1 },
  calDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 2,
    marginTop: 3,
  },
  calDot: { width: 7, height: 7, borderRadius: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12 },
  amount: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  forecastCompareLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  portfolioHeroCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    marginTop: 4,
  },
  portfolioHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  portfolioHeroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  portfolioHeroTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  portfolioGainPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  portfolioGainPillText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  portfolioHeroMetrics: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  portfolioHeroNow: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  portfolioHeroProjected: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  portfolioTrack: {
    height: 12,
    borderRadius: 99,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  portfolioTrackFill: {
    height: '100%',
  },
  portfolioTrackGrowth: {
    height: '100%',
  },
  portfolioTrackLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  portfolioTrackCompact: {
    height: 5,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 6,
  },
  forecastAccountCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  forecastAccountCompactTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  forecastAccountCompactAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  forecastCompactNow: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  forecastCompactProjected: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  empty: { textAlign: 'center', marginTop: 32, paddingHorizontal: 24, fontSize: 14 },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 8,
    maxHeight: '90%',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  label: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
});
