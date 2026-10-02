import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import expenseService from '../../services/expenseService';
import {
  Budget,
  ExpenseCategory,
  CreateBudgetData,
  UpdateBudgetData,
} from '../../types/expenses';
import BudgetForm from '../../components/expenses/BudgetForm';
import AlertModal from '../../components/AlertModal';
import { formatCurrency } from '../../utils/moneyInput';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function toAmt(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

export default function ManageBudgetsScreen() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const router = useRouter();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [expandedMonth, setExpandedMonth] = useState<number>(-1);
  const [budgetsByMonth, setBudgetsByMonth] = useState<Record<string, Budget[]>>({});
  const [yearLoading, setYearLoading] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const loadYear = useCallback(
    async (y: number) => {
      if (!selectedFamily) return;
      setYearLoading(true);
      try {
        const results = await Promise.all(
          Array.from({ length: 12 }, async (_, monthIndex) => {
            const key = monthKey(y, monthIndex);
            const asOf = `${key}-01`;
            const data = await expenseService.getBudgets(selectedFamily.id, true, { asOf });
            return [key, data] as const;
          })
        );
        const next: Record<string, Budget[]> = {};
        for (const [key, data] of results) {
          next[key] = data;
        }
        setBudgetsByMonth(next);
      } catch (err: any) {
        setError(err.message || 'Failed to load budgets');
      } finally {
        setYearLoading(false);
      }
    },
    [selectedFamily]
  );

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) return;
      let cancelled = false;
      (async () => {
        try {
          const cats = await expenseService.getCategories(selectedFamily.id);
          if (!cancelled) setCategories(cats);
        } catch (err: any) {
          if (!cancelled) setError(err.message || 'Failed to load categories');
        }
        if (!cancelled) {
          await loadYear(year);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [selectedFamily?.id, year, loadYear])
  );

  const toggleMonth = (monthIndex: number) => {
    setExpandedMonth((prev) => (prev === monthIndex ? -1 : monthIndex));
  };

  const handleCreate = async (data: CreateBudgetData) => {
    setSaving(true);
    try {
      await expenseService.createBudget(data);
      setShowBudgetForm(false);
      setEditingBudget(null);
      await loadYear(year);
    } catch (err: any) {
      setError(err.message || 'Failed to create budget');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: UpdateBudgetData) => {
    if (!editingBudget) return;
    setSaving(true);
    try {
      await expenseService.updateBudget(editingBudget.id, data);
      setShowBudgetForm(false);
      setEditingBudget(null);
      await loadYear(year);
    } catch (err: any) {
      setError(err.message || 'Failed to update budget');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (budgetId: number) => {
    try {
      await expenseService.deleteBudget(budgetId);
      setConfirmDeleteId(null);
      await loadYear(year);
    } catch (err: any) {
      setError(err.message || 'Failed to delete budget');
      setConfirmDeleteId(null);
    }
  };

  const months = useMemo(() => MONTH_NAMES.map((name, index) => ({ name, index })), []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back">
          <FontAwesome name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Budgets</Text>
        <View style={{ width: 40 }} />
      </View>

      {!selectedFamily ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Select a family first</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/(tabs)/create-budgets')}
            >
              <FontAwesome name="magic" size={14} color="#fff" />
              <Text style={styles.actionBtnText}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
              onPress={() => {
                setEditingBudget(null);
                setShowBudgetForm(true);
              }}
            >
              <FontAwesome name="plus" size={14} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.primary }]}>Add</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.yearRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.yearArrow}
              onPress={() => setYear((y) => y - 1)}
              accessibilityLabel="Previous year"
            >
              <FontAwesome name="chevron-left" size={14} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.yearLabel, { color: colors.text }]}>{year}</Text>
            <TouchableOpacity
              style={styles.yearArrow}
              onPress={() => setYear((y) => y + 1)}
              accessibilityLabel="Next year"
            >
              <FontAwesome name="chevron-right" size={14} color={colors.text} />
            </TouchableOpacity>
          </View>

          {yearLoading && Object.keys(budgetsByMonth).length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : null}

          {months.map(({ name, index }) => {
            const key = monthKey(year, index);
            const list = budgetsByMonth[key];
            const total = list ? list.reduce((s, b) => s + toAmt(b.amount), 0) : null;
            const open = expandedMonth === index;

            return (
              <View
                key={key}
                style={[styles.monthBlock, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <TouchableOpacity
                  style={styles.monthHeader}
                  onPress={() => toggleMonth(index)}
                  activeOpacity={0.7}
                >
                  <FontAwesome
                    name={open ? 'chevron-down' : 'chevron-right'}
                    size={12}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.monthName, { color: colors.text }]}>{name}</Text>
                  <Text style={[styles.monthTotal, { color: colors.primary }]}>
                    {total == null ? (yearLoading ? '…' : '—') : formatCurrency(total)}
                  </Text>
                </TouchableOpacity>

                {open && (
                  <View style={[styles.categoryList, { borderTopColor: colors.border }]}>
                    {!list ? (
                      <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
                    ) : list.length === 0 ? (
                      <Text style={[styles.emptyCats, { color: colors.textSecondary }]}>
                        No budgets for this month
                      </Text>
                    ) : (
                      [...list]
                        .sort((a, b) =>
                          (a.category_name || '').localeCompare(b.category_name || '', undefined, {
                            sensitivity: 'base',
                          })
                        )
                        .map((budget) => (
                          <View
                            key={budget.id}
                            style={[styles.categoryRow, { borderTopColor: colors.border }]}
                          >
                            <TouchableOpacity
                              style={styles.categoryMain}
                              onPress={() => {
                                setEditingBudget(budget);
                                setShowBudgetForm(true);
                              }}
                            >
                              <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
                                {budget.category_name || 'Category'}
                              </Text>
                              <Text style={[styles.categoryMeta, { color: colors.textSecondary }]}>
                                {budget.period}
                                {toAmt(budget.spent_amount) > 0
                                  ? ` · spent ${formatCurrency(budget.spent_amount)}`
                                  : ''}
                              </Text>
                            </TouchableOpacity>
                            <Text style={[styles.categoryAmt, { color: colors.primary }]}>
                              {formatCurrency(budget.amount)}
                            </Text>
                            <TouchableOpacity
                              style={styles.iconBtn}
                              onPress={() => setConfirmDeleteId(budget.id)}
                              accessibilityLabel="Delete budget"
                            >
                              <FontAwesome name="trash-o" size={14} color={colors.error || '#ef4444'} />
                            </TouchableOpacity>
                          </View>
                        ))
                    )}
                  </View>
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.helpHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setHelpOpen((o) => !o)}
            activeOpacity={0.7}
          >
            <FontAwesome
              name={helpOpen ? 'chevron-down' : 'chevron-right'}
              size={12}
              color={colors.textSecondary}
            />
            <FontAwesome name="info-circle" size={14} color={colors.primary} />
            <Text style={[styles.helpTitle, { color: colors.text }]}>How this works</Text>
          </TouchableOpacity>
          {helpOpen && (
            <View style={[styles.helpBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                Budgets are monthly category limits. On the Expenses tab you see paid spending against
                these limits.
              </Text>
              <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                Create builds or updates limits from active Recurring (and optional expense analysis).
                New budgets start this month. Open-ended recurring stays every month going forward;
                if every recurring item in a category has an end date, the budget ends then too.
                Expense-analysis-only budgets end Dec 31 of the year they were created/synced.
              </Text>
              <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                Yearly and other dues only count in their due months, so month totals can differ.
              </Text>
              <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                Add creates a single manual category budget without running the full wizard.
              </Text>
              <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                Day-to-day paid toggles, receipts, and expense details live on Expenses — not here.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {selectedFamily && (
        <BudgetForm
          visible={showBudgetForm}
          budget={editingBudget}
          categories={categories}
          familyId={selectedFamily.id}
          onSubmit={editingBudget ? handleUpdate : handleCreate}
          onCancel={() => {
            setShowBudgetForm(false);
            setEditingBudget(null);
          }}
          loading={saving}
        />
      )}

      <AlertModal
        visible={!!error}
        title="Error"
        message={error}
        onClose={() => setError('')}
      />
      <AlertModal
        visible={confirmDeleteId != null}
        title="Delete budget?"
        message="This removes the category budget limit. Expenses are not deleted."
        type="warning"
        confirmText="Delete"
        cancelText="Cancel"
        showCancel
        onConfirm={() => {
          if (confirmDeleteId != null) void handleDelete(confirmDeleteId);
        }}
        onClose={() => setConfirmDeleteId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 40, gap: 10 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  yearArrow: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  yearLabel: { fontSize: 16, fontWeight: '700' },
  monthBlock: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  monthName: { flex: 1, fontSize: 14, fontWeight: '600' },
  monthTotal: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  categoryList: { borderTopWidth: StyleSheet.hairlineWidth },
  emptyCats: { padding: 12, fontSize: 12 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  categoryMain: { flex: 1, minWidth: 0, gap: 2 },
  categoryName: { fontSize: 13, fontWeight: '600' },
  categoryMeta: { fontSize: 11 },
  categoryAmt: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  iconBtn: { padding: 6 },
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  helpTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  helpBody: {
    marginTop: -4,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  helpText: { fontSize: 13, lineHeight: 18 },
});
