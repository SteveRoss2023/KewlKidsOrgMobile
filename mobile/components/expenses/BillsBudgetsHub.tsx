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
import expenseService from '../../services/expenseService';
import {
  Budget,
  ExpenseCategory,
  RecurringExpense,
  CreateRecurringExpenseData,
  UpdateRecurringExpenseData,
} from '../../types/expenses';
import RecurringExpenseRow from './RecurringExpenseRow';
import RecurringExpenseForm from './RecurringExpenseForm';
import UpdatePlanWizard from './UpdatePlanWizard';
import YearBudgetOverview from './YearBudgetOverview';
import AlertModal from '../AlertModal';

type HubTab = 'bills' | 'year';

interface BillsBudgetsHubProps {
  /** When embedded in Expenses Bills tab */
  embedded?: boolean;
  /** Initial sub-tab */
  initialTab?: HubTab;
  /** When false, hide Year Budget sub-tab (new hub puts Budgets top-level). */
  yearTabEnabled?: boolean;
  /** Called after Update plan successfully applies (parent can refresh Budgets/Expenses). */
  onPlanApplied?: () => void;
}

export default function BillsBudgetsHub({
  embedded = false,
  initialTab = 'bills',
  yearTabEnabled = true,
  onPlanApplied,
}: BillsBudgetsHubProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();

  const [hubTab, setHubTab] = useState<HubTab>(
    yearTabEnabled ? initialTab : 'bills'
  );
  const [yearKey, setYearKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<RecurringExpense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [error, setError] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringExpense | null>(null);
  const [saving, setSaving] = useState(false);
  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;

  const clearBillsState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setBills([]);
    setBudgets([]);
    setCategories([]);
    setError('');
    setShowBillForm(false);
    setEditingBill(null);
    setShowWizard(false);
    setLoading(true);
  }, []);

  const load = useCallback(async () => {
    if (!selectedFamily) {
      clearBillsState();
      setLoading(false);
      return;
    }
    const familyId = selectedFamily.id;
    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setError('');
    try {
      const [billsData, budgetsData, cats] = await Promise.all([
        expenseService.getRecurringExpenses(familyId),
        expenseService.getBudgets(familyId, true),
        expenseService.getCategories(familyId),
      ]);
      if (
        generation !== fetchGenerationRef.current ||
        selectedFamilyIdRef.current !== familyId
      ) {
        return;
      }
      setBills(billsData);
      setBudgets(budgetsData);
      setCategories(cats);
    } catch (err: any) {
      if (
        generation !== fetchGenerationRef.current ||
        selectedFamilyIdRef.current !== familyId
      ) {
        return;
      }
      setError(err.message || 'Failed to load bills and budgets');
      setBills([]);
      setBudgets([]);
      setCategories([]);
    } finally {
      if (
        generation === fetchGenerationRef.current &&
        selectedFamilyIdRef.current === familyId
      ) {
        setLoading(false);
      }
    }
  }, [selectedFamily, clearBillsState]);

  useEffect(() => {
    clearBillsState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const activeBills = useMemo(
    () =>
      [
        ...bills.filter(
          (b) =>
            b.is_active &&
            (!selectedFamily || Number(b.family) === Number(selectedFamily.id))
        ),
      ].sort((a, b) => a.description.localeCompare(b.description)),
    [bills, selectedFamily]
  );
  const inactiveBills = useMemo(
    () =>
      [
        ...bills.filter(
          (b) =>
            !b.is_active &&
            (!selectedFamily || Number(b.family) === Number(selectedFamily.id))
        ),
      ].sort((a, b) => a.description.localeCompare(b.description)),
    [bills, selectedFamily]
  );

  const thisMonthBudgetTotal = useMemo(
    () => budgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0),
    [budgets]
  );

  const handleSaveBill = async (
    data: CreateRecurringExpenseData | UpdateRecurringExpenseData
  ) => {
    if (!selectedFamily) return;
    setSaving(true);
    setError('');
    try {
      if (editingBill) {
        await expenseService.updateRecurringExpense(
          editingBill.id,
          data as UpdateRecurringExpenseData
        );
      } else {
        await expenseService.createRecurringExpense(data as CreateRecurringExpenseData);
      }
      setShowBillForm(false);
      setEditingBill(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBill = async (id: number) => {
    setError('');
    try {
      await expenseService.deleteRecurringExpense(id);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to delete bill');
    }
  };

  if (!selectedFamily) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Select a family to manage bills.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const hubTabOptions = (
    [
      { id: 'bills' as const, label: 'Bills', icon: 'repeat' as const },
      ...(yearTabEnabled
        ? [{ id: 'year' as const, label: 'Year Budget', icon: 'calendar' as const }]
        : []),
    ] as const
  );

  const hubTabs = yearTabEnabled ? (
    <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
      {hubTabOptions.map((tab) => {
        const selected = hubTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.hubTab,
              selected && { backgroundColor: colors.primary },
              { borderColor: colors.border },
            ]}
            onPress={() => setHubTab(tab.id)}
            activeOpacity={0.7}
          >
            <FontAwesome
              name={tab.icon}
              size={14}
              color={selected ? '#fff' : colors.textSecondary}
            />
            <Text
              style={[styles.hubTabText, { color: selected ? '#fff' : colors.textSecondary }]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  ) : null;

  const sharedHeader = (
    <>
      {error ? (
        <Text style={[styles.error, { color: colors.error || '#c0392b' }]}>{error}</Text>
      ) : null}

      <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{activeBills.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Active bills</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{budgets.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Category budgets
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>
            {displayMoney(thisMonthBudgetTotal)}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            This month limits
          </Text>
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      {hubTab === 'year' ? (
        <View style={styles.root}>
          <View style={styles.headerBlock}>{sharedHeader}</View>
          {hubTabs}
          <YearBudgetOverview key={yearKey} compact />
        </View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
          {sharedHeader}
          {hubTabs}

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your bills</Text>
            <View style={styles.sectionActions}>
              <TouchableOpacity
                style={[styles.primaryCta, { backgroundColor: colors.primary }]}
                onPress={() => setShowWizard(true)}
              >
                <FontAwesome name="magic" size={12} color="#fff" />
                <Text style={styles.primaryCtaText}>Update plan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.infoBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => setShowHowItWorks(true)}
                accessibilityLabel="How bills and budgets work"
                accessibilityRole="button"
              >
                <FontAwesome name="info" size={13} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setEditingBill(null);
                  setShowBillForm(true);
                }}
                style={styles.addBtn}
              >
                <FontAwesome name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add bill</Text>
              </TouchableOpacity>
            </View>
          </View>

          {activeBills.length === 0 && inactiveBills.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No bills yet. Add rent, utilities, and subscriptions, then run Update plan.
            </Text>
          ) : null}

          {activeBills.map((bill) => (
            <RecurringExpenseRow
              key={bill.id}
              recurring={bill}
              onPress={() => {
                setEditingBill(bill);
                setShowBillForm(true);
              }}
              onDelete={() => handleDeleteBill(bill.id)}
            />
          ))}

          {inactiveBills.length > 0 && (
            <>
              <Text style={[styles.inactiveHeader, { color: colors.textSecondary }]}>
                Inactive ({inactiveBills.length})
              </Text>
              {inactiveBills.map((bill) => (
                <RecurringExpenseRow
                  key={bill.id}
                  recurring={bill}
                  badge={{ label: 'Inactive', color: '#94a3b8' }}
                  onPress={() => {
                    setEditingBill(bill);
                    setShowBillForm(true);
                  }}
                  onDelete={() => handleDeleteBill(bill.id)}
                />
              ))}
            </>
          )}

          {!embedded && yearTabEnabled ? (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Switch to Year Budget to review monthly category limits.
            </Text>
          ) : null}
        </ScrollView>
      )}

      <UpdatePlanWizard
        visible={showWizard}
        familyId={selectedFamily.id}
        bills={bills}
        onClose={() => setShowWizard(false)}
        onApplied={() => {
          void load();
          setYearKey((k) => k + 1);
          onPlanApplied?.();
        }}
      />

      <AlertModal
        visible={showHowItWorks}
        title="Bills drive the plan"
        message="Active bills keep unpaid expenses and category budgets in sync. Use Update plan after bigger changes, or when setting up for the first time."
        onClose={() => setShowHowItWorks(false)}
      />

      <RecurringExpenseForm
        visible={showBillForm}
        recurringExpense={editingBill}
        categories={categories}
        familyId={selectedFamily.id}
        onSubmit={handleSaveBill}
        onCancel={() => {
          setShowBillForm(false);
          setEditingBill(null);
        }}
        loading={saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  headerBlock: { paddingBottom: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingBottom: 4,
  },
  hubTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hubTabText: { fontSize: 14, fontWeight: '700' },
  error: { marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  primaryCtaText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  infoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  summaryLabel: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  sectionHeader: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flex: 1,
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  addBtnText: { fontSize: 14, fontWeight: '600' },
  empty: { marginHorizontal: 16, marginVertical: 12, fontSize: 14 },
  inactiveHeader: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    marginHorizontal: 16,
    marginTop: 20,
    fontSize: 13,
    textAlign: 'center',
  },
});
