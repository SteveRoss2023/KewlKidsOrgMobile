import React, { useEffect, useMemo, useState } from 'react';
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

type Phase = 'edit' | 'done';

interface UpdateBalancesWizardProps {
  visible: boolean;
  accounts: MoneyAccount[];
  /** YYYY-MM-DD default as-of (usually the 1st of the month). */
  defaultAsOf: string;
  onClose: () => void;
  onSaved: () => void;
}

function firstOfMonthYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export { firstOfMonthYmd };

export default function UpdateBalancesWizard({
  visible,
  accounts,
  defaultAsOf,
  onClose,
  onSaved,
}: UpdateBalancesWizardProps) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('edit');
  const [asOf, setAsOf] = useState(defaultAsOf || firstOfMonthYmd());
  const [balances, setBalances] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState(0);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.is_active !== false),
    [accounts]
  );

  useEffect(() => {
    if (!visible) {
      setPhase('edit');
      setError('');
      setSaving(false);
      setSavedCount(0);
      return;
    }
    setAsOf(defaultAsOf || firstOfMonthYmd());
    const next: Record<number, string> = {};
    for (const a of accounts.filter((x) => x.is_active !== false)) {
      next[a.id] =
        a.latest_balance != null ? formatMoneyDisplay(a.latest_balance) : '';
    }
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
    for (const a of activeAccounts) {
      const parsed = parseMoneyDisplay(balances[a.id] || '');
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
      setPhase('done');
      onSaved();
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
                Monthly check-in · as of the 1st
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
                  Enter each balance after month-end deposits have cleared. Defaults to the 1st of
                  the month.
                </Text>
                <ThemeAwareDatePicker value={asOf} onChange={setAsOf} label="As of date" />

                {activeAccounts.length === 0 ? (
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    Add an account first.
                  </Text>
                ) : (
                  activeAccounts.map((a) => (
                    <View
                      key={a.id}
                      style={[styles.accountBlock, { borderColor: colors.border, backgroundColor: colors.card }]}
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
                        value={balances[a.id] || ''}
                        onChangeText={(t) =>
                          setBalances((prev) => ({ ...prev, [a.id]: onMoneyChange(t) }))
                        }
                        keyboardType="decimal-pad"
                        placeholder="$0.00"
                        placeholderTextColor={colors.textSecondary}
                      />
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
