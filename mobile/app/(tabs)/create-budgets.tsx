import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import expenseService from '../../services/expenseService';
import { CreateBudgetsFromRecurringResult } from '../../types/expenses';
import { formatCurrency } from '../../utils/moneyInput';
import AlertModal from '../../components/AlertModal';

export default function CreateBudgetsScreen() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const router = useRouter();

  const [dryRun, setDryRun] = useState(true);
  const [analyzeExpenses, setAnalyzeExpenses] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreateBudgetsFromRecurringResult | null>(null);
  const [error, setError] = useState('');

  const runCreate = async (dryRunOverride?: boolean) => {
    if (!selectedFamily) {
      setError('Select a family first');
      return;
    }
    const useDryRun = dryRunOverride ?? dryRun;
    setLoading(true);
    setError('');
    try {
      const data = await expenseService.createBudgetsFromRecurring(selectedFamily.id, {
        dryRun: useDryRun,
        analyzeExpenses,
      });
      setResult(data);
      if (!useDryRun) {
        setDryRun(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create budgets');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Create Budgets</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Builds one monthly budget per category from active recurring (and optional expense
          analysis). New budgets start this month; open-ended recurring stays every month going
          forward. Expense-analysis budgets end Dec 31 of this year.
        </Text>

        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Dry run</Text>
            <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
              Preview only — nothing is saved
            </Text>
          </View>
          <Switch
            value={dryRun}
            onValueChange={setDryRun}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Analyze expenses</Text>
            <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
              Suggest budgets from recent spending too
            </Text>
          </View>
          <Switch
            value={analyzeExpenses}
            onValueChange={setAnalyzeExpenses}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            { backgroundColor: dryRun ? colors.textSecondary : colors.primary },
          ]}
          onPress={() => void runCreate()}
          disabled={loading || !selectedFamily}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <FontAwesome name={dryRun ? 'eye' : 'magic'} size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {dryRun ? 'Preview budgets' : 'Create budgets'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {result && (
          <View style={[styles.results, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.resultsTitle, { color: colors.text }]}>
              {result.dry_run ? 'Preview' : 'Applied'}
            </Text>
            <Text style={[styles.resultsMessage, { color: colors.textSecondary }]}>
              {result.message}
            </Text>

            <View style={styles.statsRow}>
              <Text style={[styles.stat, { color: colors.text }]}>
                {result.dry_run ? 'Would create' : 'Created'}:{' '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>{result.created_count}</Text>
              </Text>
              <Text style={[styles.stat, { color: colors.text }]}>
                {result.dry_run ? 'Would update' : 'Updated'}:{' '}
                <Text style={{ fontWeight: '700' }}>{result.updated_count}</Text>
              </Text>
              <Text style={[styles.stat, { color: colors.text }]}>
                Skipped: <Text style={{ fontWeight: '700' }}>{result.skipped_count}</Text>
              </Text>
              {(result.deactivated_count ?? 0) > 0 && (
                <Text style={[styles.stat, { color: colors.text }]}>
                  {result.dry_run ? 'Would remove' : 'Removed'}:{' '}
                  <Text style={{ fontWeight: '700' }}>{result.deactivated_count}</Text>
                </Text>
              )}
            </View>

            {result.by_category.map((item) => {
              const sourceLabel =
                item.sources === 'both'
                  ? 'Recurring + expenses'
                  : item.sources === 'expenses'
                    ? 'Expenses'
                    : item.sources === 'recurring'
                      ? 'Recurring'
                      : null;
              const actionLabel =
                item.action === 'would_create'
                  ? 'Would create'
                  : item.action === 'created'
                    ? 'Created'
                    : item.action === 'would_update'
                      ? 'Would update'
                      : item.action === 'updated'
                        ? 'Updated'
                        : item.action === 'would_reactivate'
                          ? 'Would reactivate'
                          : item.action === 'reactivated'
                            ? 'Reactivated'
                            : item.action === 'would_deactivate'
                              ? 'Would remove'
                              : item.action === 'deactivated'
                                ? 'Removed'
                                : item.reason || 'Skipped';
              const changeLines =
                item.changes && item.changes.length > 0
                  ? item.changes
                  : item.action === 'skipped'
                    ? []
                    : item.old_amount != null &&
                        Math.abs((item.old_amount ?? 0) - item.amount) >= 0.005
                      ? [`amount ${formatCurrency(item.old_amount)} → ${formatCurrency(item.amount)}`]
                      : [];

              return (
              <View
                key={`${item.category_id}-${item.action}`}
                style={[styles.resultRow, { borderBottomColor: colors.border }]}
              >
                <FontAwesome
                  name={
                    item.action === 'would_create' || item.action === 'created'
                      ? 'plus-circle'
                      : item.action === 'would_update' ||
                          item.action === 'updated' ||
                          item.action === 'would_reactivate' ||
                          item.action === 'reactivated'
                        ? 'refresh'
                        : item.action === 'would_deactivate' || item.action === 'deactivated'
                          ? 'trash-o'
                          : 'minus-circle'
                  }
                  size={14}
                  color={
                    item.action === 'skipped' ||
                    item.action === 'deactivated' ||
                    item.action === 'would_deactivate'
                      ? colors.textSecondary
                      : colors.primary
                  }
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.category_name || `Category ${item.category_id}`}
                    {item.has_yearly && item.amount === 0
                      ? ' · yearly (due month only)'
                      : ` · ${formatCurrency(item.amount)}/mo`}
                  </Text>
                  <Text style={[styles.resultMeta, { color: colors.textSecondary }]}>
                    {actionLabel}
                    {sourceLabel ? ` · ${sourceLabel}` : ''}
                  </Text>
                  {changeLines.map((line) => (
                    <Text
                      key={line}
                      style={[styles.resultChange, { color: colors.text }]}
                    >
                      {line}
                    </Text>
                  ))}
                  {item.action === 'skipped' && item.reason ? (
                    <Text style={[styles.resultChange, { color: colors.textSecondary }]}>
                      {item.reason}
                      {item.old_start_date
                        ? ` · start ${item.old_start_date.slice(0, 10)}`
                        : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
              );
            })}

            {result.by_category.length === 0 && (
              <Text style={[styles.resultMeta, { color: colors.textSecondary, marginTop: 8 }]}>
                Nothing to suggest. Add recurring templates or turn on Analyze expenses.
              </Text>
            )}

            {result.dry_run &&
              (result.created_count > 0 ||
                result.updated_count > 0 ||
                (result.deactivated_count ?? 0) > 0) && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
                  onPress={() => {
                    setDryRun(false);
                    void runCreate(false);
                  }}
                  disabled={loading}
                >
                  <FontAwesome name="magic" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Run for real</Text>
                </TouchableOpacity>
              )}

            {!result.dry_run && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border, marginTop: 16 }]}
                onPress={() => router.back()}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                  Back to budgets
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <AlertModal
        visible={!!error}
        title="Error"
        message={error}
        onClose={() => setError('')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowHint: {
    fontSize: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    minHeight: 48,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  results: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
  },
  resultsTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  resultsMessage: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  stat: {
    fontSize: 13,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  resultMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  resultChange: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '500',
  },
});
