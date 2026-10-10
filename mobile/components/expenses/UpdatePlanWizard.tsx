import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import expenseService from '../../services/expenseService';
import { RecurringExpense, SyncPlanResult } from '../../types/expenses';
import { formatCurrency } from '../../utils/moneyInput';

type Phase = 'review' | 'preview' | 'done';

interface UpdatePlanWizardProps {
  visible: boolean;
  familyId: number;
  bills: RecurringExpense[];
  onClose: () => void;
  onApplied: () => void;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function UpdatePlanWizard({
  visible,
  familyId,
  bills,
  onClose,
  onApplied,
}: UpdatePlanWizardProps) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('review');
  const [analyzeExpenses, setAnalyzeExpenses] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<SyncPlanResult | null>(null);
  const [applied, setApplied] = useState<SyncPlanResult | null>(null);

  useEffect(() => {
    if (!visible) {
      setPhase('review');
      setAnalyzeExpenses(false);
      setLoading(false);
      setError('');
      setPreview(null);
      setApplied(null);
    }
  }, [visible]);

  const activeBills = useMemo(() => bills.filter((b) => b.is_active), [bills]);
  const inactiveBills = useMemo(() => bills.filter((b) => !b.is_active), [bills]);

  const startMonthLabels = useMemo(() => {
    const months = new Map<string, number>();
    for (const bill of activeBills) {
      if (!bill.start_date) continue;
      const key = bill.start_date.slice(0, 7);
      months.set(key, (months.get(key) || 0) + 1);
    }
    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, count]) => {
        const [y, m] = ym.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        });
        return `${count} bill${count === 1 ? '' : 's'} start in ${label}`;
      });
  }, [activeBills]);

  const runPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await expenseService.syncPlan(familyId, {
        dryRun: true,
        analyzeExpenses,
      });
      setPreview(result);
      setPhase('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to preview plan');
    } finally {
      setLoading(false);
    }
  };

  const runApply = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await expenseService.syncPlan(familyId, {
        dryRun: false,
        analyzeExpenses,
      });
      setApplied(result);
      setPhase('done');
      onApplied();
    } catch (err: any) {
      setError(err.message || 'Failed to update plan');
    } finally {
      setLoading(false);
    }
  };

  const budgetChanges = (preview || applied)?.budgets.by_category.filter(
    (row) => row.action !== 'skipped'
  ) || [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Update plan</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <FontAwesome name="times" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }}>
            {error ? (
              <Text style={[styles.error, { color: colors.error || '#c0392b' }]}>{error}</Text>
            ) : null}

            {phase === 'review' && (
              <>
                <Text style={[styles.lead, { color: colors.text }]}>
                  Bills drive unpaid expenses and category budgets. Paid expenses stay as-is.
                </Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Your bills</Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {activeBills.length} active · {inactiveBills.length} inactive
                  </Text>
                  {startMonthLabels.slice(0, 4).map((line) => (
                    <Text key={line} style={[styles.meta, { color: colors.textSecondary }]}>
                      {line}
                    </Text>
                  ))}
                  {inactiveBills.length > 0 && (
                    <Text style={[styles.warn, { color: colors.textSecondary }]}>
                      Inactive bills are skipped until you turn them back on.
                    </Text>
                  )}
                </View>
                <View style={[styles.row, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Analyze expenses</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      Suggest variable category limits (e.g. Food) from past spend. Does not
                      overwrite existing those budgets.
                    </Text>
                  </View>
                  <Switch
                    value={analyzeExpenses}
                    onValueChange={setAnalyzeExpenses}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
              </>
            )}

            {phase === 'preview' && preview && (
              <>
                <Text style={[styles.lead, { color: colors.text }]}>{preview.message}</Text>

                <Text style={[styles.section, { color: colors.text }]}>Expenses</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {preview.expenses.message}
                </Text>
                {(preview.expenses.created || []).slice(0, 8).map((item, idx) => (
                  <Text
                    key={`c-${idx}-${item.expense_date}`}
                    style={[styles.line, { color: colors.textSecondary }]}
                  >
                    + {item.description} · {formatCurrency(item.amount)} ·{' '}
                    {formatShortDate(item.expense_date)}
                  </Text>
                ))}
                {(preview.expenses.updated || []).slice(0, 6).map((item, idx) => (
                  <Text
                    key={`u-${idx}-${item.expense_date}`}
                    style={[styles.line, { color: colors.textSecondary }]}
                  >
                    ~ {item.description} · {formatCurrency(item.amount)} ·{' '}
                    {formatShortDate(item.expense_date)}
                  </Text>
                ))}
                {(preview.expenses.skipped || []).filter((s) => (s as any).reason?.includes?.('paid') || (s as any).is_paid).length >
                  0 && (
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    Paid rows are never overwritten.
                  </Text>
                )}

                <Text style={[styles.section, { color: colors.text }]}>Budgets</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {preview.budgets.message}
                </Text>
                {budgetChanges.length === 0 ? (
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    No budget changes needed.
                  </Text>
                ) : (
                  budgetChanges.map((row) => (
                    <View key={`${row.category_id}-${row.action}`} style={styles.budgetRow}>
                      <Text style={[styles.line, { color: colors.text }]}>
                        {row.category_name || `Category ${row.category_id}`} · {row.action.replace(/_/g, ' ')}
                      </Text>
                      {(row.changes || []).map((c) => (
                        <Text key={c} style={[styles.meta, { color: colors.textSecondary }]}>
                          {c}
                        </Text>
                      ))}
                    </View>
                  ))
                )}
              </>
            )}

            {phase === 'done' && applied && (
              <>
                <FontAwesome
                  name="check-circle"
                  size={40}
                  color={colors.primary}
                  style={{ alignSelf: 'center', marginVertical: 12 }}
                />
                <Text style={[styles.lead, { color: colors.text, textAlign: 'center' }]}>
                  {applied.message}
                </Text>
                <Text style={[styles.meta, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Expenses and budgets are aligned with your active bills.
                </Text>
              </>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {phase === 'review' && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
                onPress={runPreview}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="eye" size={16} color="#fff" />
                    <Text style={styles.primaryText}>Preview changes</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {phase === 'preview' && (
              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { borderColor: colors.border }]}
                  onPress={() => setPhase('review')}
                  disabled={loading}
                >
                  <Text style={[styles.secondaryText, { color: colors.text }]}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: colors.primary, flex: 1, opacity: loading ? 0.6 : 1 },
                  ]}
                  onPress={runApply}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <FontAwesome name="magic" size={16} color="#fff" />
                      <Text style={styles.primaryText}>Apply</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
            {phase === 'done' && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={onClose}
              >
                <Text style={styles.primaryText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
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
    maxHeight: '92%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingTop: 12 },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 13, lineHeight: 18 },
  warn: { fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  section: { fontSize: 16, fontWeight: '700', marginTop: 14, marginBottom: 4 },
  line: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  budgetRow: { marginTop: 8 },
  error: { marginBottom: 8, fontSize: 14 },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 16, fontWeight: '600' },
});
