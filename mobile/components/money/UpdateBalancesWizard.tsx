import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeAwareDatePicker from '../ThemeAwareDatePicker';
import moneyService from '../../services/moneyService';
import { MoneyAccount } from '../../types/money';
import { formatCurrency, formatMoneyDisplay, onMoneyChange, parseMoneyDisplay } from '../../utils/moneyInput';
import { groupAccountsByInstitution, sortAccountsByInstitution } from '../../utils/moneyAccounts';

type Phase = 'edit' | 'done';

interface UpdateBalancesWizardProps {
  visible: boolean;
  accounts: MoneyAccount[];
  /** YYYY-MM-DD. The form opens on this date; callers should pass today. */
  defaultAsOf: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function todayYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export { todayYmd };

export default function UpdateBalancesWizard({
  visible,
  accounts,
  defaultAsOf,
  onClose,
  onSaved,
}: UpdateBalancesWizardProps) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('edit');
  const [asOf, setAsOf] = useState(defaultAsOf || todayYmd());
  const [balances, setBalances] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const openedRef = useRef(false);
  const dirtyRef = useRef(false);
  const draftsRef = useRef<Record<number, string>>({});

  const activeAccounts = useMemo(
    () => sortAccountsByInstitution(accounts.filter((a) => a.is_active !== false)),
    [accounts]
  );

  const activeGroups = useMemo(
    () => groupAccountsByInstitution(activeAccounts),
    [activeAccounts]
  );

  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      dirtyRef.current = false;
      setPhase('edit');
      setError('');
      setSaving(false);
      setSavedCount(0);
      return;
    }
    // Reloading accounts while this form is open must not replace what was typed.
    if (openedRef.current || dirtyRef.current) return;
    openedRef.current = true;
    setAsOf(defaultAsOf || todayYmd());
    const next: Record<number, string> = {};
    for (const a of accounts.filter((x) => x.is_active !== false)) {
      next[a.id] = formatMoneyDisplay(0);
    }
    draftsRef.current = next;
    setBalances(next);
    setPhase('edit');
  }, [visible, defaultAsOf, accounts]);

  const asOfLabel = useMemo(() => {
    try {
      const [y, m, d] = asOf.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return asOf;
    }
  }, [asOf]);

  const saveAll = async () => {
    setError('');
    const rows: { account: number; balance: number }[] = [];
    const drafts = draftsRef.current;
    for (const a of activeAccounts) {
      const parsed = parseMoneyDisplay(drafts[a.id] ?? balances[a.id] ?? '');
      if (parsed == null) {
        setError(`Enter a balance for ${a.name}`);
        return;
      }
      rows.push({ account: a.id, balance: parsed });
    }
    if (rows.length === 0) {
      setError('No accounts to update');
      return;
    }
    setSaving(true);
    try {
      for (const row of rows) {
        await moneyService.upsertSnapshot({
          account: row.account,
          as_of_date: asOf,
          balance: row.balance,
        });
      }
      setSavedCount(rows.length);
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save balances');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: colors.text }]}>Update balances</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Monthly check-in
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <FontAwesome name="times" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {phase === 'done' ? (
            <View style={styles.doneBody}>
              <View style={[styles.doneIcon, { backgroundColor: `${colors.primary}22` }]}>
                <FontAwesome name="check" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.doneTitle, { color: colors.text }]}>All set</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                Saved {savedCount} account{savedCount === 1 ? '' : 's'} as of {asOfLabel}.
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={onClose}
              >
                <Text style={styles.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  Enter each new balance. The last amount is shown under the account name.
                </Text>
                <ThemeAwareDatePicker value={asOf} onChange={setAsOf} label="As of date" />

                {activeAccounts.length === 0 ? (
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    Add an account first.
                  </Text>
                ) : (
                  activeGroups.map((group) => (
                    <View key={group.key || '__other'}>
                      <Text style={[styles.institutionHeader, { color: colors.textSecondary }]}>
                        {group.label}
                      </Text>
                      {group.accounts.map((a) => (
                        <View
                          key={a.id}
                          style={[
                            styles.accountBlock,
                            { borderColor: colors.border, backgroundColor: colors.card },
                          ]}
                        >
                          <Text style={[styles.accountName, { color: colors.text }]}>{a.name}</Text>
                          <Text style={[styles.meta, { color: colors.textSecondary }]}>
                            {a.latest_balance != null
                              ? `Last: ${formatCurrency(a.latest_balance)}${
                                  a.latest_as_of ? ` (${a.latest_as_of})` : ''
                                }`
                              : 'No previous balance'}
                          </Text>
                          <TextInput
                            style={[
                              styles.input,
                              {
                                color: colors.text,
                                borderColor: colors.border,
                                backgroundColor: colors.surface,
                              },
                            ]}
                            value={balances[a.id] ?? ''}
                            onChangeText={(t) => {
                              const formatted = onMoneyChange(t);
                              dirtyRef.current = true;
                              const next = { ...draftsRef.current, [a.id]: formatted };
                              draftsRef.current = next;
                              setBalances(next);
                            }}
                            keyboardType="decimal-pad"
                            placeholder="$0.00"
                            placeholderTextColor={colors.textSecondary}
                          />
                        </View>
                      ))}
                    </View>
                  ))
                )}
                {error ? (
                  <Text style={{ color: colors.error || '#ef4444', fontSize: 13 }}>{error}</Text>
                ) : null}
              </ScrollView>

              <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <TouchableOpacity onPress={onClose} disabled={saving}>
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 },
                  ]}
                  onPress={() => void saveAll()}
                  disabled={saving || activeAccounts.length === 0}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      Save all ({activeAccounts.length})
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '92%',
    minHeight: '55%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  flex: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  body: { padding: 16, gap: 12, paddingBottom: 24 },
  hint: { fontSize: 13, lineHeight: 18 },
  institutionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 2,
  },
  accountBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  accountName: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  doneBody: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  doneTitle: { fontSize: 20, fontWeight: '700' },
});
