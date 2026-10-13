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
import { useIsWideLayout } from '../../hooks/useIsWideLayout';
import expenseService from '../../services/expenseService';
import {
  Budget,
  ExpenseCategory,
  RecurringExpense,
  CreateRecurringExpenseData,
  UpdateRecurringExpenseData,
} from '../../types/expenses';
import { forFamily } from '../../utils/familyScope';
import RecurringExpenseRow from './RecurringExpenseRow';
import RecurringExpenseForm from './RecurringExpenseForm';
import UpdatePlanWizard from './UpdatePlanWizard';
import DonutChart from './charts/DonutChart';
import AlertModal from '../AlertModal';

function toAmt(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

interface BillsDashboardProps {
  onPlanApplied?: () => void;
  refreshKey?: number;
}

export default function BillsDashboard({
  onPlanApplied,
  refreshKey = 0,
}: BillsDashboardProps) {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const { displayMoney } = useShowAmounts();
  const isWide = useIsWideLayout();

  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<RecurringExpense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [error, setError] = useState('');
  const [dataFamilyId, setDataFamilyId] = useState<number | null>(null);

  const [showWizard, setShowWizard] = useState(false);
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringExpense | null>(null);
  const [saving, setSaving] = useState(false);
  const [billPendingDelete, setBillPendingDelete] = useState<RecurringExpense | null>(null);
  const [activeOpen, setActiveOpen] = useState(false);
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const fetchGenerationRef = useRef(0);
  const selectedFamilyIdRef = useRef<number | null>(selectedFamily?.id ?? null);
  selectedFamilyIdRef.current = selectedFamily?.id ?? null;

  const activeColor = colors.success || '#10b981';
  const inactiveColor = '#94a3b8';

  const clearState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setBills([]);
    setBudgets([]);
    setCategories([]);
    setError('');
    setDataFamilyId(null);
    setShowBillForm(false);
    setEditingBill(null);
    setShowWizard(false);
    setBillPendingDelete(null);
    setLoading(true);
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
        setBills(forFamily(billsData, familyId));
        setBudgets(forFamily(budgetsData, familyId));
        setCategories(forFamily(cats, familyId));
        setDataFamilyId(familyId);
      } catch (err: any) {
        if (
          generation !== fetchGenerationRef.current ||
          selectedFamilyIdRef.current !== familyId
        ) {
          return;
        }
        setError(err.message || 'Failed to load bills');
        setBills([]);
        setBudgets([]);
        setCategories([]);
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
    [selectedFamily, clearState]
  );

  useEffect(() => {
    clearState();
    if (!selectedFamily) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!selectedFamily) {
        setLoading(false);
        return;
      }
      const sameFamily = dataFamilyId === selectedFamily.id;
      void load({ soft: sameFamily && bills.length > 0 });
    }, [selectedFamily?.id, load, dataFamilyId, bills.length])
  );

  useEffect(() => {
    if (!selectedFamily || refreshKey === 0) return;
    void load({ soft: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const activeBills = useMemo(
    () =>
      [...bills.filter((b) => b.is_active)].sort((a, b) =>
        a.description.localeCompare(b.description)
      ),
    [bills]
  );
  const inactiveBills = useMemo(
    () =>
      [...bills.filter((b) => !b.is_active)].sort((a, b) =>
        a.description.localeCompare(b.description)
      ),
    [bills]
  );

  const thisMonthBudgetTotal = useMemo(
    () => budgets.reduce((sum, b) => sum + toAmt(b.amount), 0),
    [budgets]
  );

  const activeAmount = useMemo(
    () => activeBills.reduce((sum, b) => sum + toAmt(b.amount), 0),
    [activeBills]
  );
  const inactiveAmount = useMemo(
    () => inactiveBills.reduce((sum, b) => sum + toAmt(b.amount), 0),
    [inactiveBills]
  );

  const donutSlices = useMemo(() => {
    if (activeAmount <= 0 && inactiveAmount <= 0) {
      if (activeBills.length === 0 && inactiveBills.length === 0) {
        return [] as { key: string; label: string; amount: number; color: string }[];
      }
      return [
        { key: 'active', label: 'Active', amount: activeBills.length, color: activeColor },
        {
          key: 'inactive',
          label: 'Inactive',
          amount: inactiveBills.length,
          color: inactiveColor,
        },
      ].filter((s) => s.amount > 0);
    }
    return [
      { key: 'active', label: 'Active', amount: activeAmount, color: activeColor },
      { key: 'inactive', label: 'Inactive', amount: inactiveAmount, color: inactiveColor },
    ].filter((s) => s.amount > 0);
  }, [
    activeAmount,
    inactiveAmount,
    activeBills.length,
    inactiveBills.length,
    activeColor,
    inactiveColor,
  ]);

  const usingCounts =
    activeAmount <= 0 &&
    inactiveAmount <= 0 &&
    (activeBills.length > 0 || inactiveBills.length > 0);

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
      await load({ soft: true });
      onPlanApplied?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const bill = billPendingDelete;
    setBillPendingDelete(null);
    if (!bill) return;
    setError('');
    try {
      await expenseService.deleteRecurringExpense(bill.id);
      await load({ soft: true });
      onPlanApplied?.();
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

  const hero = (
    <View
      style={[
        styles.heroCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>
        Bills drive the plan
      </Text>
      <View style={styles.heroGrid}>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Active bills
          </Text>
          <Text style={[styles.heroValue, { color: colors.text }]}>
            {activeBills.length}
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            Category budgets
          </Text>
          <Text style={[styles.heroValue, { color: colors.text }]}>
            {budgets.length}
          </Text>
        </View>
        <View style={styles.heroCell}>
          <Text style={[styles.heroCaption, { color: colors.textSecondary }]}>
            This month limits
          </Text>
          <Text style={[styles.heroValue, { color: colors.primary }]}>
            {displayMoney(thisMonthBudgetTotal)}
          </Text>
        </View>
      </View>
    </View>
  );

  const donut = (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Active vs inactive</Text>
      {donutSlices.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No bills to chart yet
        </Text>
      ) : (
        <View style={styles.donutBlock}>
          <DonutChart
            slices={donutSlices}
            textColor={colors.text}
            mutedColor={colors.textSecondary}
            trackColor={colors.border}
            centerLabel={
              usingCounts
                ? String(activeBills.length + inactiveBills.length)
                : displayMoney(activeAmount + inactiveAmount)
            }
            centerSubLabel={usingCounts ? 'Bills' : 'Total'}
          />
          <View style={styles.donutLegend}>
            {donutSlices.map((s) => (
              <View key={s.key} style={styles.donutLegendRow}>
                <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
                <Text style={[styles.donutLegendLabel, { color: colors.text }]}>
                  {s.label}
                </Text>
                <Text
                  style={[styles.donutLegendAmt, { color: colors.textSecondary }]}
                >
                  {usingCounts ? String(s.amount) : displayMoney(s.amount)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  const actionButtons = (
    <View style={styles.actionRow}>
      <TouchableOpacity
        style={[styles.primaryAction, { backgroundColor: colors.primary }]}
        onPress={() => setShowWizard(true)}
        accessibilityLabel="Update plan"
      >
        <FontAwesome name="magic" size={14} color="#fff" />
        <Text style={styles.primaryActionText}>Update plan</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.secondaryAction,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={() => {
          setEditingBill(null);
          setShowBillForm(true);
        }}
        accessibilityLabel="Add bill"
      >
        <FontAwesome name="plus" size={14} color={colors.primary} />
        <Text style={[styles.secondaryActionText, { color: colors.primary }]}>
          Add bill
        </Text>
      </TouchableOpacity>
    </View>
  );

  const activeBillsList = (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={() => setActiveOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: activeOpen }}
      >
        <FontAwesome
          name={activeOpen ? 'chevron-down' : 'chevron-right'}
          size={12}
          color={colors.textSecondary}
        />
        <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>
          Active
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}
        >
          {activeBills.length}
        </Text>
      </TouchableOpacity>
      {activeOpen ? (
        loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
        ) : activeBills.length === 0 && inactiveBills.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No bills yet. Add rent, utilities, and subscriptions, then run Update plan.
          </Text>
        ) : activeBills.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No active bills
          </Text>
        ) : (
          activeBills.map((bill) => (
            <RecurringExpenseRow
              key={bill.id}
              recurring={bill}
              onPress={() => {
                setEditingBill(bill);
                setShowBillForm(true);
              }}
              onDelete={() => setBillPendingDelete(bill)}
            />
          ))
        )
      ) : null}
    </View>
  );

  const inactiveBillsList =
    inactiveBills.length > 0 ? (
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() => setInactiveOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: inactiveOpen }}
        >
          <FontAwesome
            name={inactiveOpen ? 'chevron-down' : 'chevron-right'}
            size={12}
            color={colors.textSecondary}
          />
          <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>
            Inactive
          </Text>
          <Text
            style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}
          >
            {inactiveBills.length}
          </Text>
        </TouchableOpacity>
        {inactiveOpen
          ? inactiveBills.map((bill) => (
              <RecurringExpenseRow
                key={bill.id}
                recurring={bill}
                badge={{ label: 'Inactive', color: inactiveColor }}
                onPress={() => {
                  setEditingBill(bill);
                  setShowBillForm(true);
                }}
                onDelete={() => setBillPendingDelete(bill)}
              />
            ))
          : null}
      </View>
    ) : null;

  const help = (
    <>
      <TouchableOpacity
        style={[
          styles.helpHeader,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={() => setHelpOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <FontAwesome
          name={helpOpen ? 'chevron-down' : 'chevron-right'}
          size={12}
          color={colors.textSecondary}
        />
        <Text style={[styles.helpTitle, { color: colors.text }]}>How this works</Text>
      </TouchableOpacity>
      {helpOpen ? (
        <View
          style={[
            styles.helpBody,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            1. Active bills keep unpaid expenses and category budgets in sync. Paid
            expenses stay as-is.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            2. When you add or change a bill, the app syncs that bill’s unpaid expenses
            and refreshes that category’s budget for you.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            3. Use Update plan for a full refresh across all bills (first setup, lots of
            changes) or to preview what will be created/updated before applying.
          </Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            4. Manual budget edits on Budgets can be overwritten the next time that
            category is synced from bills.
          </Text>
        </View>
      ) : null}
    </>
  );

  return (
    <>
      <View style={styles.flex}>
        {error ? (
          <Text style={[styles.errorBanner, { color: colors.error || '#c0392b' }]}>{error}</Text>
        ) : null}

        {loading && dataFamilyId !== selectedFamily.id ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isWide ? (
              <View style={styles.wideRow}>
                <View style={styles.wideCol}>
                  {hero}
                  {donut}
                  {actionButtons}
                  {help}
                </View>
                <View style={styles.wideCol}>
                  {activeBillsList}
                  {inactiveBillsList}
                </View>
              </View>
            ) : (
              <>
                {hero}
                {donut}
                {actionButtons}
                {activeBillsList}
                {inactiveBillsList}
                {help}
              </>
            )}
          </ScrollView>
        )}
      </View>

      <UpdatePlanWizard
        visible={showWizard}
        familyId={selectedFamily.id}
        bills={bills}
        onClose={() => setShowWizard(false)}
        onApplied={() => {
          void load({ soft: true });
          onPlanApplied?.();
        }}
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

      <AlertModal
        visible={!!billPendingDelete}
        title="Delete bill?"
        message={
          billPendingDelete
            ? `Delete “${billPendingDelete.description}” (${displayMoney(billPendingDelete.amount)})? This cannot be undone.`
            : ''
        }
        type="warning"
        showCancel
        cancelText="Cancel"
        confirmText="Delete"
        onClose={() => setBillPendingDelete(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </>
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
  heroCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroCell: { flexGrow: 1, flexBasis: '28%', minWidth: 88, gap: 2 },
  heroCaption: { fontSize: 11, fontWeight: '600' },
  heroValue: { fontSize: 16, fontWeight: '800' },
  sectionCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionHint: { fontSize: 12, fontWeight: '500', marginTop: -4 },
  donutBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  donutLegend: { flexShrink: 1, gap: 8 },
  donutLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  donutLegendLabel: { fontSize: 13, fontWeight: '600' },
  donutLegendAmt: { fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryActionText: { fontSize: 14, fontWeight: '800' },
  empty: { fontSize: 13, paddingVertical: 12 },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  helpTitle: { fontSize: 14, fontWeight: '700' },
  helpBody: {
    marginTop: -6,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  helpText: { fontSize: 13, lineHeight: 18 },
});
