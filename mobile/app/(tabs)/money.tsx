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
import TooltipButton from '../../components/TooltipButton';
import { formatCurrency, formatMoneyDisplay, onMoneyChange, parseMoneyDisplay } from '../../utils/moneyInput';
import AuthService from '../../services/authService';
import { STORAGE_KEYS, storage } from '../../utils/storage';
import {
  canUseMoneyDemoPortfolio,
  withDemoBalance,
  withDemoIncome,
} from '../../utils/moneyDemoPortfolio';
import {
  buildYearReturnRows,
  portfolioTargetAtRate,
  sumReturnRows,
  yearEndTarget,
  ytdPortfolioTotals,
} from '../../utils/moneyReturns';
import { groupAccountsByInstitution } from '../../utils/moneyAccounts';

type MoneyTab = 'income' | 'accounts' | 'ytd' | 'target';
type IncomeSubTab = 'streams' | 'calendar';

/** Year-end what-if rates shown on the Target tab. */
const TARGET_RATES = [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10];

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

function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m) return ymd;
  const dt = new Date(y, m - 1, d || 1);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MoneyScreen() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const params = useLocalSearchParams<{ tab?: string; updateBalances?: string }>();
  const [tab, setTab] = useState<MoneyTab>('ytd');
  const [incomeSubTab, setIncomeSubTab] = useState<IncomeSubTab>('calendar');
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
  const [returnsYear, setReturnsYear] = useState(() => new Date().getFullYear());
  /** Which Target rate rows are expanded to show per-account lists. */
  const [expandedTargetRates, setExpandedTargetRates] = useState<number[]>([]);

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
  const [accountInstitution, setAccountInstitution] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('rrsp');
  const [accountInitialBalance, setAccountInitialBalance] = useState('');

  const [showSnapForm, setShowSnapForm] = useState(false);
  const [showBalancesWizard, setShowBalancesWizard] = useState(false);
  const [snapDate, setSnapDate] = useState(toYmd(new Date()));
  const [snapBalance, setSnapBalance] = useState('');
  const [snapDateLocked, setSnapDateLocked] = useState(false);
  const [editingSnapshotId, setEditingSnapshotId] = useState<number | null>(null);
  const snapBalanceRef = useRef<TextInput>(null);
  const [pendingDeleteStream, setPendingDeleteStream] = useState<IncomeStream | null>(null);
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState<MoneyAccount | null>(null);
  const [pendingDeleteSnapshot, setPendingDeleteSnapshot] = useState<AccountSnapshot | null>(null);
  const [pendingDeleteOcc, setPendingDeleteOcc] = useState<IncomeOccurrence | null>(null);
  const [showAmounts, setShowAmounts] = useState(false);
  const [demoPortfolio, setDemoPortfolio] = useState(false);
  const [expandedStreamIds, setExpandedStreamIds] = useState<number[]>([]);
  const [expandedIncomeMonth, setExpandedIncomeMonth] = useState<string | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null);
  const [ytdAccountsExpanded, setYtdAccountsExpanded] = useState(false);
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
      setExpandedStreamIds([]);
      setExpandedIncomeMonth(null);
      setExpandedAccountId(null);
      setYtdAccountsExpanded(false);
      setExpandedTargetRates([]);
      void loadDemoPortfolioPref();
    }, [loadDemoPortfolioPref])
  );

  useEffect(() => {
    const t = String(params.tab || '');
    if (
      t === 'accounts' ||
      t === 'income' ||
      t === 'calendar' ||
      t === 'ytd' ||
      t === 'target' ||
      t === 'returns' ||
      t === 'forecast'
    ) {
      if (t === 'forecast' || t === 'returns') {
        setTab('ytd');
      } else if (t === 'calendar') {
        setTab('income');
        setIncomeSubTab('calendar');
      } else {
        setTab(t);
        if (t === 'income') setIncomeSubTab('calendar');
      }
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

  const incomeViewYear = incomeViewMonth.getFullYear();

  const yearMonthRows = useMemo(() => {
    const y = incomeViewYear;
    const rows: {
      key: string;
      label: string;
      occs: IncomeOccurrence[];
      total: number;
    }[] = [];
    for (let m = 0; m < 12; m++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const prefix = `${key}-`;
      const occs = occurrences
        .filter((o) => o.due_date.startsWith(prefix))
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.stream - b.stream);
      let total = 0;
      for (const o of occs) {
        const raw = o.actual_amount ?? o.estimated_amount;
        const boosted = withDemoIncome(raw, streamTypeById.get(o.stream), demoPortfolio);
        total += boosted ?? 0;
      }
      rows.push({
        key,
        label: new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long' }),
        occs,
        total,
      });
    }
    return rows;
  }, [occurrences, incomeViewYear, streamTypeById, demoPortfolio]);

  const yearIncomeTotal = useMemo(
    () => yearMonthRows.reduce((sum, row) => sum + row.total, 0),
    [yearMonthRows]
  );

  const occsByStream = useMemo(() => {
    const map = new Map<number, IncomeOccurrence[]>();
    const sorted = [...occurrences].sort(
      (a, b) => a.due_date.localeCompare(b.due_date) || a.stream - b.stream
    );
    for (const o of sorted) {
      const list = map.get(o.stream) || [];
      list.push(o);
      map.set(o.stream, list);
    }
    return map;
  }, [occurrences]);

  const toggleStreamExpanded = (streamId: number) => {
    setSelectedStreamId(streamId);
    setExpandedStreamIds((prev) =>
      prev.includes(streamId) ? prev.filter((id) => id !== streamId) : [...prev, streamId]
    );
  };

  const toggleAccountExpanded = (accountId: number) => {
    setExpandedAccountId((prev) => (prev === accountId ? null : accountId));
  };

  const institutionGroupTotal = (groupAccounts: MoneyAccount[]) =>
    groupAccounts.reduce((sum, a) => {
      const bal = withDemoBalance(a.latest_balance, a.account_type, demoPortfolio);
      return sum + (bal ?? 0);
    }, 0);

  const snapshotsForAccount = (accountId: number) =>
    snapshots
      .filter((s) => s.account === accountId)
      .sort((a, b) => b.as_of_date.localeCompare(a.as_of_date));

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

  const accountInstitutionGroups = useMemo(
    () => groupAccountsByInstitution(accounts),
    [accounts]
  );

  const returnsYearOptions = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    for (const s of snapshots) {
      const y = parseInt(s.as_of_date.slice(0, 4), 10);
      if (!Number.isNaN(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [snapshots]);

  // By account on YTD stays collapsed whenever you land on that tab.
  useEffect(() => {
    if (tab === 'ytd') setYtdAccountsExpanded(false);
  }, [tab]);

  const yearReturnRows = useMemo(
    () => buildYearReturnRows(accounts, snapshots, returnsYear, demoPortfolio),
    [accounts, snapshots, returnsYear, demoPortfolio]
  );

  const toggleTargetRateExpanded = (rate: number) => {
    setExpandedTargetRates((prev) =>
      prev.includes(rate) ? prev.filter((r) => r !== rate) : [...prev, rate]
    );
  };

  /** Target tab totals (boosted starts); YTD hero uses ytdHeroTotals for correct demo %. */
  const yearReturnTotals = useMemo(() => sumReturnRows(yearReturnRows), [yearReturnRows]);

  const ytdHeroTotals = useMemo(
    () => ytdPortfolioTotals(accounts, snapshots, returnsYear, demoPortfolio),
    [accounts, snapshots, returnsYear, demoPortfolio]
  );

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
  }, [tab, incomeSubTab, streams, incomeViewMonth, ensureYearSchedule]);

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
    setAccountInstitution('');
    setAccountType('rrsp');
    setAccountInitialBalance('');
    setShowAccountForm(true);
  };

  const openEditAccount = (a: MoneyAccount) => {
    setEditingAccount(a);
    setAccountName(a.name);
    setAccountInstitution(a.institution || '');
    setAccountType(a.account_type);
    setAccountInitialBalance('');
    setShowAccountForm(true);
  };

  const saveAccount = async () => {
    if (!selectedFamily || !accountName.trim()) return;
    const institution = accountInstitution.trim() || null;
    setSaving(true);
    try {
      if (editingAccount) {
        await moneyService.updateAccount(editingAccount.id, {
          name: accountName.trim(),
          institution,
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
          institution,
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

  const openSnapForm = (account: MoneyAccount, snap?: AccountSnapshot) => {
    setSelectedAccountId(account.id);
    if (snap) {
      setSnapDate(snap.as_of_date);
      setSnapBalance(formatMoneyDisplay(Number(snap.balance)));
      setSnapDateLocked(true);
      setEditingSnapshotId(snap.id);
    } else {
      setSnapDate(toYmd(new Date()));
      setSnapBalance(
        account.latest_balance != null ? formatMoneyDisplay(account.latest_balance) : ''
      );
      setSnapDateLocked(false);
      setEditingSnapshotId(null);
    }
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
      if (editingSnapshotId != null) {
        await moneyService.updateSnapshot(editingSnapshotId, { balance: bal });
      } else {
        await moneyService.upsertSnapshot({
          account: selectedAccountId,
          as_of_date: snapDate,
          balance: bal,
        });
      }
      setShowSnapForm(false);
      setSnapDateLocked(false);
      setEditingSnapshotId(null);
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

  const goToThisYear = () => {
    const next = new Date();
    next.setDate(1);
    setIncomeViewMonth(next);
    setExpandedIncomeMonth(null);
  };

  const shiftYear = (deltaYears: number) => {
    setIncomeViewMonth((d) => new Date(d.getFullYear() + deltaYears, d.getMonth(), 1));
    setExpandedIncomeMonth(null);
  };

  const renderYearNav = () => (
    <>
      <View style={styles.calNav}>
        <TouchableOpacity
          style={styles.calNavBtn}
          onPress={() => shiftYear(-1)}
          accessibilityLabel="Previous year"
        >
          <FontAwesome name="chevron-left" size={14} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.calNavLabel, { color: colors.text, fontSize: 16 }]} numberOfLines={1}>
          {incomeViewYear}
        </Text>
        <TouchableOpacity
          style={styles.calNavBtn}
          onPress={() => shiftYear(1)}
          accessibilityLabel="Next year"
        >
          <FontAwesome name="chevron-right" size={14} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.calNavSecondary}>
        <TouchableOpacity
          style={[styles.todayBtn, { borderColor: colors.primary }]}
          onPress={goToThisYear}
          accessibilityLabel="Go to this year"
        >
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>This year</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderIncomeStreams = () => {
    if (streams.length === 0) {
      return (
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
      );
    }

    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 12, gap: 10 }}>
        <View style={styles.sectionHeaderInline}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Streams ({streams.length})
          </Text>
          <TooltipButton tooltip="Add income stream" onPress={openNewStream}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Add</Text>
          </TooltipButton>
        </View>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          All streams listed below. Expand one to see every payment; edit the stream or mark
          actuals on each item.
        </Text>

        {streams.map((s) => {
          const expanded = expandedStreamIds.includes(s.id);
          const color = streamColor(s.id);
          const items = occsByStream.get(s.id) || [];
          return (
            <View
              key={s.id}
              style={[
                styles.streamList,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <TouchableOpacity
                style={styles.streamCollapseHeader}
                onPress={() => toggleStreamExpanded(s.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={expanded ? `Collapse ${s.name}` : `Expand ${s.name}`}
              >
                <FontAwesome
                  name={expanded ? 'chevron-down' : 'chevron-right'}
                  size={12}
                  color={colors.textSecondary}
                />
                <View style={[styles.colorBar, { backgroundColor: color }]} />
                <View style={styles.flex}>
                  <View style={styles.streamCardTop}>
                    <Text
                      style={[styles.streamCardName, { color: colors.text, fontWeight: '600' }]}
                      numberOfLines={1}
                    >
                      {s.name}
                    </Text>
                    <Text style={[styles.streamCardAmt, { color: colors.text }]}>
                      {displayIncomeMoney(s.default_estimate, s.stream_type)}
                    </Text>
                  </View>
                  <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {typeLabel(s.stream_type)} · {freqLabel(s.frequency)} · {items.length} payments
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

              {expanded ? (
                items.length === 0 ? (
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
                    No payments yet. Check the stream start/end dates, or open Calendar to generate
                    the schedule.
                  </Text>
                ) : (
                  <>
                    <View
                      style={[
                        styles.itemTableHeader,
                        {
                          borderTopColor: colors.border,
                          backgroundColor: colors.surface,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.itemTableColDate, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        Date
                      </Text>
                      <Text
                        style={[styles.itemTableColAmt, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        Est
                      </Text>
                      <Text
                        style={[styles.itemTableColAmt, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        Actual
                      </Text>
                      <Text
                        style={[styles.itemTableColStatus, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        Status
                      </Text>
                      <View style={styles.itemTableColActions} />
                    </View>
                    {items.map((o) => (
                      <View
                        key={o.id}
                        style={[
                          styles.itemTableRow,
                          {
                            borderTopColor: colors.border,
                            backgroundColor: colors.card,
                          },
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.itemTableColDate}
                          onPress={() => openOcc(o)}
                          accessibilityLabel={`Edit payment on ${formatShortDate(o.due_date)}`}
                        >
                          <Text style={[styles.rowTitle, { color: colors.text, fontSize: 13 }]} numberOfLines={1}>
                            {formatShortDate(o.due_date)}
                          </Text>
                        </TouchableOpacity>
                        <Text
                          style={[styles.itemTableColAmt, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {displayIncomeMoney(o.estimated_amount, s.stream_type)}
                        </Text>
                        <Text
                          style={[styles.itemTableColAmt, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {o.actual_amount != null
                            ? displayIncomeMoney(o.actual_amount, s.stream_type)
                            : '—'}
                        </Text>
                        <View style={styles.itemTableColStatus}>
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
                                fontSize: 10,
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
                        </View>
                        <View style={styles.itemTableColActions}>
                          <TooltipButton
                            tooltip="Edit payment"
                            style={styles.iconAction}
                            onPress={() => openOcc(o)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <FontAwesome name="pencil" size={13} color={colors.primary} />
                          </TooltipButton>
                          <TooltipButton
                            tooltip="Delete payment"
                            style={styles.iconAction}
                            onPress={() => setPendingDeleteOcc(o)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <FontAwesome
                              name="trash"
                              size={13}
                              color={colors.error || '#ef4444'}
                            />
                          </TooltipButton>
                        </View>
                      </View>
                    ))}
                  </>
                )
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderCalendar = () => {
    if (streams.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
            Add an income stream first, then monthly income will show here.
          </Text>
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 12, gap: 8 }}>
        {renderYearNav()}

        <View
          style={[styles.streamList, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <View style={styles.portfolioHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 15 }]}>
                {incomeViewYear} income
              </Text>
              <Text style={[styles.amount, { color: colors.primary, fontSize: 15, marginTop: 2 }]}>
                {displayMoney(yearIncomeTotal)}
              </Text>
            </View>
          </View>

          {yearMonthRows.map((row) => {
            const expanded = expandedIncomeMonth === row.key;
            return (
              <View key={row.key}>
                <TouchableOpacity
                  style={[styles.monthListRow, { borderTopColor: colors.border }]}
                  onPress={() =>
                    setExpandedIncomeMonth((prev) => (prev === row.key ? null : row.key))
                  }
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={
                    expanded ? `Collapse ${row.label}` : `Expand ${row.label}`
                  }
                >
                  <FontAwesome
                    name={expanded ? 'chevron-down' : 'chevron-right'}
                    size={12}
                    color={colors.textSecondary}
                    style={{ marginRight: 4 }}
                  />
                  <View style={styles.flex}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      {row.label} ({row.occs.length})
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: colors.primary }]}>
                    {displayMoney(row.total)}
                  </Text>
                </TouchableOpacity>

                {expanded ? (
                  <View
                    style={[
                      styles.yearMonthPanel,
                      { borderTopColor: colors.border, backgroundColor: colors.surface },
                    ]}
                  >
                    {row.occs.length === 0 ? (
                      <Text style={[styles.meta, { color: colors.textSecondary }]}>
                        No payments this month.
                      </Text>
                    ) : (
                      row.occs.map((o) => {
                        const color = streamColor(o.stream);
                        const st = streamTypeById.get(o.stream);
                        return (
                          <View
                            key={o.id}
                            style={[
                              styles.yearPayRow,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.card,
                              },
                            ]}
                          >
                            <View style={[styles.yearPayBar, { backgroundColor: color }]} />
                            <TouchableOpacity style={styles.flex} onPress={() => openOcc(o)}>
                              <Text
                                style={[styles.yearPayName, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {o.stream_name ||
                                  streams.find((s) => s.id === o.stream)?.name ||
                                  'Stream'}
                              </Text>
                              <Text
                                style={[styles.yearPayMeta, { color: colors.textSecondary }]}
                                numberOfLines={1}
                              >
                                {formatShortDate(o.due_date)} · Est{' '}
                                {displayIncomeMoney(o.estimated_amount, st)}
                                {o.actual_amount != null ? (
                                  <>
                                    {' · Act '}
                                    <Text style={{ color: colors.success || '#10b981', fontWeight: '700' }}>
                                      {displayIncomeMoney(o.actual_amount, st)}
                                    </Text>
                                  </>
                                ) : null}
                              </Text>
                            </TouchableOpacity>
                            <TooltipButton
                              tooltip="Edit payment"
                              style={styles.iconActionCompact}
                              onPress={() => openOcc(o)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <FontAwesome name="pencil" size={12} color={colors.primary} />
                            </TooltipButton>
                            <TooltipButton
                              tooltip="Delete payment"
                              style={styles.iconActionCompact}
                              onPress={() => setPendingDeleteOcc(o)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <FontAwesome
                                name="trash"
                                size={12}
                                color={colors.error || '#ef4444'}
                              />
                            </TooltipButton>
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
      </ScrollView>
    );
  };

  const renderIncome = () => (
    <View style={styles.flex}>
      <View
        style={[
          styles.incomeSubTabBar,
          { borderBottomColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        {(
          [
            { id: 'calendar' as const, label: 'Year', icon: 'calendar' as const },
            { id: 'streams' as const, label: 'Streams', icon: 'list' as const },
          ] as const
        ).map((t) => {
          const selected = incomeSubTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.incomeSubTab,
                selected && { borderBottomColor: colors.primary },
              ]}
              onPress={() => setIncomeSubTab(t.id)}
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
                  styles.incomeSubTabText,
                  { color: selected ? colors.primary : colors.textSecondary },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {incomeSubTab === 'streams' ? renderIncomeStreams() : renderCalendar()}
    </View>
  );

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
          <View
            style={[styles.streamList, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={styles.portfolioHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 15 }]}>
                  Portfolio ({accounts.length})
                </Text>
                <Text style={[styles.amount, { color: colors.primary, fontSize: 15, marginTop: 2 }]}>
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
            </View>

            {accountInstitutionGroups.map((group) => {
              const groupKey = group.key || '__other';
              const groupTotal = institutionGroupTotal(group.accounts);
              return (
                <View key={groupKey}>
                  <View
                    style={[styles.institutionHeaderRow, { borderTopColor: colors.border }]}
                  >
                    <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 14, flex: 1 }]}>
                      {group.label} ({group.accounts.length})
                    </Text>
                    <Text style={[styles.amount, { color: colors.primary, fontSize: 14 }]}>
                      {displayMoney(groupTotal)}
                    </Text>
                  </View>

                  {group.accounts.map((a) => {
                    const expanded = expandedAccountId === a.id;
                    const history = expanded ? snapshotsForAccount(a.id) : [];
                    return (
                      <View key={a.id}>
                        <TouchableOpacity
                          style={[
                            styles.monthListRow,
                            {
                              borderTopColor: colors.border,
                              backgroundColor: colors.card,
                            },
                          ]}
                          onPress={() => toggleAccountExpanded(a.id)}
                          accessibilityRole="button"
                          accessibilityState={{ expanded }}
                          accessibilityLabel={
                            expanded
                              ? `Collapse ${a.name} history`
                              : `Expand ${a.name} history`
                          }
                        >
                          <FontAwesome
                            name={expanded ? 'chevron-down' : 'chevron-right'}
                            size={12}
                            color={colors.textSecondary}
                            style={{ marginRight: 4 }}
                          />
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
                            <FontAwesome
                              name="trash"
                              size={13}
                              color={colors.error || '#ef4444'}
                            />
                          </TooltipButton>
                        </TouchableOpacity>

                        {expanded ? (
                          <View
                            style={[
                              styles.accountHistoryPanel,
                              { borderTopColor: colors.border, backgroundColor: colors.surface },
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
                                    { borderColor: colors.border, backgroundColor: colors.card },
                                  ]}
                                >
                                  <View style={styles.flex}>
                                    <Text style={[styles.meta, { color: colors.text }]}>
                                      {formatShortDate(s.as_of_date)}
                                    </Text>
                                    <Text style={[styles.amount, { color: colors.text, fontSize: 14 }]}>
                                      {displayAccountMoney(s.balance, a.account_type)}
                                    </Text>
                                  </View>
                                  <TooltipButton
                                    tooltip="Edit this balance"
                                    onPress={() => openSnapForm(a, s)}
                                    style={styles.iconAction}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <FontAwesome name="pencil" size={14} color={colors.primary} />
                                  </TooltipButton>
                                  <TooltipButton
                                    tooltip="Delete this balance"
                                    onPress={() => setPendingDeleteSnapshot(s)}
                                    style={styles.iconAction}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <FontAwesome
                                      name="trash"
                                      size={13}
                                      color={colors.error || '#ef4444'}
                                    />
                                  </TooltipButton>
                                </View>
                              ))
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );

  const returnsDeltaColor = (n: number | null) => {
    if (n == null || n === 0) return colors.textSecondary;
    return n > 0 ? colors.success : colors.error;
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

  const renderYearChips = () => (
    <View style={styles.chipWrap}>
      {returnsYearOptions.map((y) => {
        const active = y === returnsYear;
        return (
          <TouchableOpacity
            key={y}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.primary : colors.card,
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setReturnsYear(y)}
          >
            <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]}>{y}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderYtd = () => {
    const hasRows = yearReturnRows.length > 0;
    const ytdLines: { key: string; label: string; totals: typeof ytdHeroTotals.invested }[] = [
      { key: 'invested', label: 'Investments', totals: ytdHeroTotals.invested },
      { key: 'cash', label: 'Cash', totals: ytdHeroTotals.cash },
    ];

    return (
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 10 }}>
        {renderYearChips()}

        {!hasRows ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Add accounts and balance snapshots to see YTD returns.
          </Text>
        ) : (
          <>
            <View
              style={[
                styles.portfolioHeroCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.ytdCardTitle, { color: colors.primary }]} numberOfLines={1}>
                {returnsYear} Performance{' '}
                <Text style={styles.ytdCardTitleSuffix}>(YEAR TO DATE)</Text>
              </Text>
              {ytdLines.map((line, idx) => (
                <View
                  key={line.key}
                  style={[
                    styles.ytdSplitBlock,
                    idx > 0
                      ? {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border,
                          marginTop: 12,
                          paddingTop: 12,
                        }
                      : { marginTop: 8 },
                  ]}
                >
                  <Text style={[styles.ytdSplitLabel, { color: colors.text }]}>{line.label}</Text>
                  <View style={styles.ytdTotalsRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                        Amount
                      </Text>
                      <Text
                        style={[
                          styles.ytdTotalValue,
                          { color: returnsDeltaColor(line.totals.delta), fontSize: 22 },
                        ]}
                      >
                        {fmtSignedMoney(line.totals.delta)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                        Return
                      </Text>
                      <Text
                        style={[
                          styles.ytdTotalValue,
                          { color: returnsDeltaColor(line.totals.returnPct), fontSize: 22 },
                        ]}
                      >
                        {fmtReturnPct(line.totals.returnPct)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.portfolioHeroMetrics, { marginTop: 4 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                        Year start
                      </Text>
                      <Text style={[styles.portfolioHeroNow, { color: colors.text, fontSize: 15 }]}>
                        {displayMoney(line.totals.start)}
                      </Text>
                    </View>
                    <FontAwesome
                      name="long-arrow-right"
                      size={14}
                      color={colors.textSecondary}
                      style={{ marginTop: 16, marginHorizontal: 6 }}
                    />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                        Latest
                      </Text>
                      <Text
                        style={[styles.portfolioHeroProjected, { color: colors.text, fontSize: 16 }]}
                      >
                        {displayMoney(line.totals.latest)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
              <View
                style={[
                  styles.ytdSplitBlock,
                  {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                    marginTop: 12,
                    paddingTop: 12,
                  },
                ]}
              >
                <Text style={[styles.ytdSplitLabel, { color: colors.text }]}>Total</Text>
                <View style={styles.ytdTotalsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                      Amount
                    </Text>
                    <Text
                      style={[
                        styles.ytdTotalValue,
                        {
                          color: returnsDeltaColor(ytdHeroTotals.all.delta),
                          fontSize: 22,
                          fontWeight: '800',
                        },
                      ]}
                    >
                      {fmtSignedMoney(ytdHeroTotals.all.delta)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                      Return
                    </Text>
                    <Text
                      style={[
                        styles.ytdTotalValue,
                        {
                          color: returnsDeltaColor(ytdHeroTotals.all.returnPct),
                          fontSize: 22,
                          fontWeight: '800',
                        },
                      ]}
                    >
                      {fmtReturnPct(ytdHeroTotals.all.returnPct)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.portfolioHeroMetrics, { marginTop: 4 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                      Year start
                    </Text>
                    <Text style={[styles.portfolioHeroNow, { color: colors.text, fontSize: 15 }]}>
                      {displayMoney(ytdHeroTotals.all.start)}
                    </Text>
                  </View>
                  <FontAwesome
                    name="long-arrow-right"
                    size={14}
                    color={colors.textSecondary}
                    style={{ marginTop: 16, marginHorizontal: 6 }}
                  />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={[styles.forecastCompareLabel, { color: colors.textSecondary }]}>
                      Latest
                    </Text>
                    <Text
                      style={[styles.portfolioHeroProjected, { color: colors.text, fontSize: 16 }]}
                    >
                      {displayMoney(ytdHeroTotals.all.latest)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.monthList,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <TouchableOpacity
                style={styles.streamCollapseHeader}
                onPress={() => setYtdAccountsExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: ytdAccountsExpanded }}
                accessibilityLabel={
                  ytdAccountsExpanded ? 'Collapse YTD by account' : 'Expand YTD by account'
                }
              >
                <FontAwesome
                  name={ytdAccountsExpanded ? 'chevron-down' : 'chevron-right'}
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={[styles.sectionTitle, { color: colors.text, flex: 1, fontSize: 15 }]}>
                  By account ({yearReturnRows.length})
                </Text>
              </TouchableOpacity>
              {ytdAccountsExpanded
                ? yearReturnRows.map((row) => (
                    <View
                      key={`ytd-${row.id}`}
                      style={[
                        styles.forecastAccountCompact,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          borderWidth: 0,
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderRadius: 0,
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
                          <Text
                            style={[styles.meta, { color: colors.textSecondary }]}
                            numberOfLines={1}
                          >
                            {ACCOUNT_TYPES.find((t) => t.value === row.accountType)?.label ||
                              row.accountType}
                            {row.startDate
                              ? ` · from ${formatShortDate(row.startDate)}`
                              : ' · no start'}
                            {row.latestDate ? ` → ${formatShortDate(row.latestDate)}` : ''}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: returnsDeltaColor(row.returnPct),
                            fontSize: 12,
                            fontWeight: '800',
                          }}
                        >
                          {fmtReturnPct(row.returnPct)}
                        </Text>
                      </View>
                      <View style={styles.forecastAccountCompactAmounts}>
                        <Text style={[styles.forecastCompactNow, { color: colors.text }]}>
                          {displayMoney(row.startBalance)}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>→</Text>
                        <Text style={[styles.forecastCompactProjected, { color: colors.text }]}>
                          {displayMoney(row.latestBalance)}
                        </Text>
                        <Text
                          style={{
                            marginLeft: 'auto',
                            color: returnsDeltaColor(row.delta),
                            fontSize: 12,
                            fontWeight: '700',
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {fmtSignedMoney(row.delta)}
                        </Text>
                      </View>
                    </View>
                  ))
                : null}
            </View>
          </>
        )}
      </ScrollView>
    );
  };

  const renderTarget = () => {
    const hasRows = yearReturnRows.some((r) => r.startBalance != null && r.startBalance > 0);
    const startTotal = yearReturnTotals.start;
    const investedRows = yearReturnRows.filter((r) => !r.isCash);
    const cashRows = yearReturnRows.filter((r) => r.isCash);
    const cashYearEnd = portfolioTargetAtRate(cashRows, 0);

    return (
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 10 }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Year-end target</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Investments grow at the rate; cash stays flat. Expand a rate for accounts.
        </Text>
        {renderYearChips()}

        {startTotal > 0 ? (
          <Text style={[styles.meta, { color: colors.text }]}>
            Year start {displayMoney(startTotal)}
          </Text>
        ) : null}

        {!hasRows ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Add accounts and a year-start balance to see targets.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[
              styles.monthList,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={{ minWidth: '100%' }}>
            <View
              style={[
                styles.targetTableHeader,
                { borderBottomColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.targetTableHeaderText, { color: colors.textSecondary, width: 52 }]}>
                Return
              </Text>
              <Text style={[styles.targetTableHeaderText, { color: colors.textSecondary, width: 88 }]}>
                Invest
              </Text>
              <Text style={[styles.targetTableHeaderText, { color: colors.textSecondary, width: 80 }]}>
                Cash
              </Text>
              <Text style={[styles.targetTableHeaderText, { color: colors.textSecondary, width: 88 }]}>
                Portfolio
              </Text>
              <Text
                style={[
                  styles.targetTableHeaderText,
                  { color: colors.textSecondary, width: 72, textAlign: 'right' },
                ]}
              >
                Growth
              </Text>
            </View>
            {TARGET_RATES.map((rate) => {
              const expanded = expandedTargetRates.includes(rate);
              const investYearEnd = portfolioTargetAtRate(investedRows, rate);
              const portfolioTotal = investYearEnd + cashYearEnd;
              const growth = portfolioTotal - startTotal;
              return (
                <View key={rate}>
                  <TouchableOpacity
                    style={[styles.targetRateRow, { borderTopColor: colors.border }]}
                    onPress={() => toggleTargetRateExpanded(rate)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${rate}% year-end target`}
                  >
                    <FontAwesome
                      name={expanded ? 'chevron-down' : 'chevron-right'}
                      size={12}
                      color={colors.textSecondary}
                      style={{ width: 16 }}
                    />
                    <Text style={[styles.targetRatePct, { color: colors.text, width: 36 }]}>
                      {rate}%
                    </Text>
                    <Text style={[styles.targetRateValue, { color: colors.text, width: 88 }]}>
                      {displayMoney(investYearEnd)}
                    </Text>
                    <Text style={[styles.targetRateValue, { color: colors.textSecondary, width: 80 }]}>
                      {displayMoney(cashYearEnd)}
                    </Text>
                    <Text style={[styles.targetRateValue, { color: colors.primary, width: 88 }]}>
                      {displayMoney(portfolioTotal)}
                    </Text>
                    <Text
                      style={[
                        styles.targetRateGrowth,
                        { color: colors.success, width: 72, textAlign: 'right' },
                      ]}
                    >
                      {fmtSignedMoney(growth)}
                    </Text>
                  </TouchableOpacity>
                  {expanded
                    ? yearReturnRows.map((row) => {
                        const acctTarget =
                          row.startBalance != null && row.startBalance > 0
                            ? yearEndTarget(row.startBalance, rate, row.isCash)
                            : null;
                        const acctGrowth =
                          acctTarget != null && row.startBalance != null
                            ? acctTarget - row.startBalance
                            : null;
                        return (
                          <View
                            key={`tgt-${rate}-${row.id}`}
                            style={[
                              styles.forecastAccountCompact,
                              {
                                backgroundColor: colors.surface,
                                borderColor: colors.border,
                                borderWidth: 0,
                                borderTopWidth: StyleSheet.hairlineWidth,
                                borderRadius: 0,
                                paddingLeft: 28,
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
                                <Text
                                  style={[styles.meta, { color: colors.textSecondary }]}
                                  numberOfLines={1}
                                >
                                  {row.isCash ? 'Cash · no growth' : `${rate}% full year`}
                                </Text>
                              </View>
                              <Text
                                style={{
                                  color:
                                    acctGrowth != null && acctGrowth > 0
                                      ? colors.success
                                      : colors.textSecondary,
                                  fontSize: 13,
                                  fontWeight: '800',
                                  fontVariant: ['tabular-nums'],
                                }}
                              >
                                {fmtSignedMoney(acctGrowth)}
                              </Text>
                            </View>
                            <View style={styles.forecastAccountCompactAmounts}>
                              <Text style={[styles.forecastCompactNow, { color: colors.text }]}>
                                {displayMoney(row.startBalance)}
                              </Text>
                              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>→</Text>
                              <Text
                                style={[styles.forecastCompactProjected, { color: colors.primary }]}
                              >
                                {displayMoney(acctTarget)}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    : null}
                </View>
              );
            })}
            </View>
          </ScrollView>
        )}
      </ScrollView>
    );
  };

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
              { id: 'ytd' as const, label: 'YTD', icon: 'line-chart' as const },
              { id: 'income' as const, label: 'Income', icon: 'usd' as const },
              { id: 'accounts' as const, label: 'Accounts', icon: 'university' as const },
              { id: 'target' as const, label: 'Target', icon: 'bullseye' as const },
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
                onPress={() => {
                  setTab(t.id);
                  if (t.id === 'income') setIncomeSubTab('calendar');
                }}
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
      ) : tab === 'ytd' ? (
        renderYtd()
      ) : (
        renderTarget()
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
          <Text style={[styles.label, { color: colors.text }]}>Institution</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={accountInstitution}
            onChangeText={setAccountInstitution}
            placeholder="BMO, Sun Life…"
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

      {formModal(
        snapDateLocked ? 'Edit history balance' : 'Update balance',
        showSnapForm,
        () => {
          setShowSnapForm(false);
          setSnapDateLocked(false);
          setEditingSnapshotId(null);
        },
        () => void saveSnap(),
        (
          <>
            <Text style={[styles.label, { color: colors.text }]}>Balance</Text>
            <TextInput
              ref={snapBalanceRef}
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.card },
              ]}
              value={snapBalance}
              onChangeText={(t) => setSnapBalance(onMoneyChange(t))}
              keyboardType="decimal-pad"
              placeholder="$0.00"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            {snapDateLocked ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                As of {formatShortDate(snapDate)} (history entry)
              </Text>
            ) : (
              <ThemeAwareDatePicker value={snapDate} onChange={setSnapDate} label="As of" />
            )}
          </>
        )
      )}

      <UpdateBalancesWizard
        visible={showBalancesWizard}
        accounts={accounts}
        defaultAsOf={firstOfMonthYmd()}
        onClose={() => setShowBalancesWizard(false)}
        onSaved={() => {
          void load();
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
        visible={!!pendingDeleteOcc}
        title="Delete payment?"
        message={
          pendingDeleteOcc
            ? `Delete the payment due ${formatShortDate(pendingDeleteOcc.due_date)}?`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onConfirm={async () => {
          if (!pendingDeleteOcc) return;
          try {
            await moneyService.deleteOccurrence(pendingDeleteOcc.id);
            setPendingDeleteOcc(null);
            await load();
          } catch (err: any) {
            setError(err.message || 'Delete failed');
            setPendingDeleteOcc(null);
          }
        }}
        onClose={() => setPendingDeleteOcc(null)}
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
            setExpandedAccountId(null);
            await load();
          } catch (err: any) {
            setError(err.message || 'Delete failed');
            setPendingDeleteAccount(null);
          }
        }}
        onClose={() => setPendingDeleteAccount(null)}
      />
      <AlertModal
        visible={!!pendingDeleteSnapshot}
        title="Delete balance?"
        message={
          pendingDeleteSnapshot
            ? `Delete the balance for ${formatShortDate(pendingDeleteSnapshot.as_of_date)}?`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onConfirm={async () => {
          if (!pendingDeleteSnapshot) return;
          try {
            await moneyService.deleteSnapshot(pendingDeleteSnapshot.id);
            setPendingDeleteSnapshot(null);
            await load();
          } catch (err: any) {
            setError(err.message || 'Delete failed');
            setPendingDeleteSnapshot(null);
          }
        }}
        onClose={() => setPendingDeleteSnapshot(null)}
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
  portfolioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  institutionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accountHistoryPanel: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  yearMonthPanel: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  yearPayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  yearPayBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    minHeight: 28,
  },
  yearPayName: { fontSize: 13, fontWeight: '600' },
  yearPayMeta: { fontSize: 11, marginTop: 1 },
  iconActionCompact: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTitle: { fontSize: 13, fontWeight: '700' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
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
  incomeSubTabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  incomeSubTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  incomeSubTabText: {
    fontSize: 13,
    fontWeight: '600',
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
  itemTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemTableColDate: {
    flex: 1.2,
    minWidth: 0,
  },
  itemTableColAmt: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  itemTableColStatus: {
    width: 72,
    alignItems: 'center',
  },
  itemTableColActions: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 56,
    justifyContent: 'flex-end',
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
  ytdTotalsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ytdCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  ytdCardTitleSuffix: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  ytdSplitBlock: {
    gap: 2,
  },
  ytdSplitLabel: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  ytdTotalValue: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  targetTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingLeft: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  targetTableHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  targetRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  targetRatePct: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  targetRateValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  targetRateGrowth: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
