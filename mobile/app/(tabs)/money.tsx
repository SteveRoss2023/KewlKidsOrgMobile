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
import { useShowAmounts } from '../../contexts/ShowAmountsContext';
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
import YtdDashboard from '../../components/money/YtdDashboard';
import IncomeDashboard from '../../components/money/IncomeDashboard';
import AccountsDashboard from '../../components/money/AccountsDashboard';
import TargetDashboard from '../../components/money/TargetDashboard';
import TooltipButton from '../../components/TooltipButton';
import { formatMoneyDisplay, onMoneyChange, parseMoneyDisplay } from '../../utils/moneyInput';
import AuthService from '../../services/authService';
import { STORAGE_KEYS, storage } from '../../utils/storage';
import {
  canUseMoneyDemoPortfolio,
  withDemoIncome,
} from '../../utils/moneyDemoPortfolio';
type MoneyTab = 'income' | 'accounts' | 'ytd' | 'forecast';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [streams, setStreams] = useState<IncomeStream[]>([]);
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

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
  const { showAmounts, setShowAmounts, toggleShowAmounts, displayMoney } = useShowAmounts();
  const [demoPortfolio, setDemoPortfolio] = useState(false);
  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;
  /** Family id whose money data is currently in state (null while clearing / loading). */
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(null);
  const [ytdBoardRefreshKey, setYtdBoardRefreshKey] = useState(0);
  const [incomeBoardRefreshKey, setIncomeBoardRefreshKey] = useState(0);
  const [accountsBoardRefreshKey, setAccountsBoardRefreshKey] = useState(0);
  const [targetBoardRefreshKey, setTargetBoardRefreshKey] = useState(0);

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
      void loadDemoPortfolioPref();
    }, [loadDemoPortfolioPref])
  );

  useEffect(() => {
    const t = String(params.tab || '');
    if (
      t === 'accounts' ||
      t === 'accounts-board' ||
      t === 'income' ||
      t === 'income-board' ||
      t === 'calendar' ||
      t === 'ytd' ||
      t === 'target' ||
      t === 'target-board' ||
      t === 'returns' ||
      t === 'forecast'
    ) {
      if (t === 'returns') {
        setTab('ytd');
      } else if (t === 'calendar' || t === 'income-board') {
        setTab('income');
      } else if (t === 'accounts-board') {
        setTab('accounts');
      } else if (t === 'target' || t === 'target-board') {
        setTab('forecast');
      } else {
        setTab(t as MoneyTab);
      }
    }
    if (params.updateBalances === '1' || params.updateBalances === 'true') {
      setTab('accounts');
      setShowBalancesWizard(true);
    }
  }, [params.tab, params.updateBalances]);

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

  const clearMoneyState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setStreams([]);
    setAccounts([]);
    setSnapshots([]);
    setSelectedAccountId(null);
    setShowStreamForm(false);
    setEditingStream(null);
    setEditingOcc(null);
    setShowAccountForm(false);
    setEditingAccount(null);
    setShowSnapForm(false);
    setShowBalancesWizard(false);
    setEditingSnapshotId(null);
    setPendingDeleteStream(null);
    setPendingDeleteAccount(null);
    setPendingDeleteSnapshot(null);
    setPendingDeleteOcc(null);
    setError('');
    setDataFamilyId(null);
    setLoading(true);
  }, []);

  const load = useCallback(async () => {
    if (!selectedFamily) {
      clearMoneyState();
      setLoading(false);
      return;
    }
    const familyId = selectedFamily.id;
    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setError('');
    try {
      // Streams kept for payment-form stream type; Income board loads its own occs.
      const [s, a, sn] = await Promise.all([
        moneyService.getStreams(familyId),
        moneyService.getAccounts(familyId),
        moneyService.getSnapshots(familyId),
      ]);
      if (
        generation !== fetchGenerationRef.current ||
        selectedFamilyIdRef.current !== familyId
      ) {
        return;
      }
      setStreams(s);
      setAccounts(a);
      setSnapshots(sn);
      setSelectedAccountId(a[0]?.id ?? null);
      setDataFamilyId(familyId);
      setYtdBoardRefreshKey((k) => k + 1);
      setIncomeBoardRefreshKey((k) => k + 1);
      setAccountsBoardRefreshKey((k) => k + 1);
      setTargetBoardRefreshKey((k) => k + 1);
    } catch (err: any) {
      if (
        generation !== fetchGenerationRef.current ||
        selectedFamilyIdRef.current !== familyId
      ) {
        return;
      }
      setError(err.message || 'Failed to load money data');
      setStreams([]);
      setAccounts([]);
      setSnapshots([]);
      setSelectedAccountId(null);
      setDataFamilyId(null);
    } finally {
      if (
        generation === fetchGenerationRef.current &&
        selectedFamilyIdRef.current === familyId
      ) {
        setLoading(false);
      }
    }
  }, [selectedFamily, clearMoneyState]);

  useEffect(() => {
    clearMoneyState();
    if (!selectedFamily) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      if (selectedFamily) void load();
      else setLoading(false);
    }, [load, selectedFamily])
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
      const startYear = parseInt(stream.start_date.slice(0, 4), 10) || new Date().getFullYear();
      const horizonYear = Math.max(new Date().getFullYear() + 1, startYear);
      const until = stream.end_date || `${horizonYear}-12-31`;
      await moneyService.generateOccurrences(stream.id, until);
      setShowStreamForm(false);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save stream');
    } finally {
      setSaving(false);
    }
  };

  const openOcc = (o: IncomeOccurrence) => {
    setEditingOcc(o);
    setOccActual(o.actual_amount != null ? formatMoneyDisplay(o.actual_amount) : '');
  };

  const saveOcc = async () => {
    if (!editingOcc) return;
    const act = occActual.trim() ? parseMoneyDisplay(occActual) : null;
    setSaving(true);
    try {
      // Estimate is owned by the stream; payments only set actual deposited amount.
      await moneyService.updateOccurrence(editingOcc.id, {
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
              { id: 'ytd' as const, label: 'YTD', icon: 'pie-chart' as const },
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
      ) : loading || (selectedFamily != null && dataFamilyId !== selectedFamily.id) ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : tab === 'income' ? (
        <IncomeDashboard
          key={selectedFamily?.id ?? 'none'}
          refreshKey={incomeBoardRefreshKey}
          onAddStream={openNewStream}
          onEditStream={openEditStream}
          onEditOccurrence={openOcc}
          onDeleteStream={setPendingDeleteStream}
          onDeleteOccurrence={setPendingDeleteOcc}
        />
      ) : tab === 'accounts' ? (
        <AccountsDashboard
          key={selectedFamily?.id ?? 'none'}
          refreshKey={accountsBoardRefreshKey}
          onUpdateBalances={() => setShowBalancesWizard(true)}
          onAddAccount={openNewAccount}
          onEditAccount={openEditAccount}
          onDeleteAccount={setPendingDeleteAccount}
          onEditSnapshot={openSnapForm}
          onDeleteSnapshot={setPendingDeleteSnapshot}
        />
      ) : tab === 'ytd' ? (
        <YtdDashboard key={selectedFamily?.id ?? 'none'} refreshKey={ytdBoardRefreshKey} />
      ) : (
        <TargetDashboard
          key={selectedFamily?.id ?? 'none'}
          refreshKey={targetBoardRefreshKey}
        />
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
          <Text style={[styles.input, styles.readOnlyValue, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}>
            {editingOcc
              ? displayIncomeMoney(
                  editingOcc.estimated_amount,
                  streamTypeById.get(editingOcc.stream)
                )
              : '—'}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary, marginTop: -4 }]}>
            To change the estimate, edit the stream.
          </Text>
          <Text style={[styles.label, { color: colors.text }]}>Actual (when deposited)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={occActual}
            onChangeText={(t) => setOccActual(onMoneyChange(t))}
            keyboardType="decimal-pad"
            placeholder="Leave blank until deposited"
            placeholderTextColor={colors.textSecondary}
            autoFocus
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
  readOnlyValue: {
    fontWeight: '600',
    overflow: 'hidden',
  },
});
