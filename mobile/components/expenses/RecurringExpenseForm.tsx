import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { RecurringExpense, ExpenseCategory, RecurringFrequency, PaymentMethod, CreateRecurringExpenseData, UpdateRecurringExpenseData } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeAwarePicker from '../lists/ThemeAwarePicker';
import ThemeAwareDatePicker from '../ThemeAwareDatePicker';

interface RecurringExpenseFormProps {
  visible: boolean;
  recurringExpense?: RecurringExpense | null;
  categories: ExpenseCategory[];
  familyId: number;
  onSubmit: (data: CreateRecurringExpenseData | UpdateRecurringExpenseData) => void;
  onCancel: () => void;
  loading?: boolean;
}

const FREQUENCIES: { label: string; value: RecurringFrequency }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
];

const PAYMENT_METHODS: { label: string; value: PaymentMethod }[] = [
  { label: 'Cash', value: 'cash' },
  { label: 'Credit Card', value: 'credit_card' },
  { label: 'Debit Card', value: 'debit_card' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'E-Transfer', value: 'e_transfer' },
  { label: 'Check', value: 'check' },
  { label: 'Other', value: 'other' },
];

export default function RecurringExpenseForm({
  visible,
  recurringExpense,
  categories,
  familyId,
  onSubmit,
  onCancel,
  loading = false,
}: RecurringExpenseFormProps) {
  const { colors } = useTheme();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [nextDueDate, setNextDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Calculate next_due_date from start_date and frequency
  const calculateNextDueDate = (start: string, freq: RecurringFrequency): string => {
    if (!start) return new Date().toISOString().split('T')[0];

    // Parse the date string manually to avoid timezone issues
    const parts = start.split('-');
    if (parts.length !== 3) {
      console.error('Invalid date format:', start);
      return new Date().toISOString().split('T')[0];
    }

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      console.error('Invalid date values:', { year, month, day });
      return new Date().toISOString().split('T')[0];
    }

    let nextYear = year;
    let nextMonth = month;
    let nextDay = day;

    if (freq === 'daily') {
      // Add 1 day
      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() + 1);
      nextYear = date.getFullYear();
      nextMonth = date.getMonth() + 1;
      nextDay = date.getDate();
    } else if (freq === 'weekly') {
      // Add 7 days
      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() + 7);
      nextYear = date.getFullYear();
      nextMonth = date.getMonth() + 1;
      nextDay = date.getDate();
    } else if (freq === 'monthly') {
      // Add 1 month, keep the day the same if possible
      if (month === 12) {
        nextYear = year + 1;
        nextMonth = 1;
      } else {
        nextYear = year;
        nextMonth = month + 1;
      }
      // Check if the day exists in the next month (e.g., Jan 31 -> Feb 31 doesn't exist)
      const daysInNextMonth = new Date(nextYear, nextMonth, 0).getDate();
      nextDay = Math.min(day, daysInNextMonth);
    } else if (freq === 'yearly') {
      // Add 1 year, keep month and day the same
      nextYear = year + 1;
      nextMonth = month;
      nextDay = day;
    }

    // Format as YYYY-MM-DD
    const result = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
    console.log('calculateNextDueDate result:', { start, freq, year, month, day, nextYear, nextMonth, nextDay, result });
    return result;
  };

  useEffect(() => {
    if (!visible) {
      // Reset form when modal closes
      setDescription('');
      setAmount('');
      setCategoryId(null);
      setFrequency('monthly');
      setPaymentMethod('credit_card');
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate('');
      setNextDueDate(calculateNextDueDate(today, 'monthly'));
      setNotes('');
      setIsActive(true);
      return;
    }

    if (recurringExpense) {
      setDescription(recurringExpense.description);
      setAmount(recurringExpense.amount.toString());
      setCategoryId(recurringExpense.category);
      setFrequency(recurringExpense.frequency);
      setPaymentMethod(recurringExpense.payment_method);
      setStartDate(recurringExpense.start_date);
      setEndDate(recurringExpense.end_date || '');
      // Always calculate next_due_date from start_date and frequency, don't use stored value
      setNextDueDate(calculateNextDueDate(recurringExpense.start_date, recurringExpense.frequency));
      setNotes(recurringExpense.notes || '');
      setIsActive(recurringExpense.is_active);
    } else {
      setDescription('');
      setAmount('');
      setCategoryId(categories.length > 0 ? categories[0].id : null);
      setFrequency('monthly');
      setPaymentMethod('credit_card');
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate('');
      setNextDueDate(calculateNextDueDate(today, 'monthly'));
      setNotes('');
      setIsActive(true);
    }
  }, [recurringExpense, categories, visible]);

  // Update next_due_date when start_date or frequency changes
  // This runs after the initial form setup and whenever user changes startDate or frequency
  useEffect(() => {
    if (startDate && visible) {
      const calculated = calculateNextDueDate(startDate, frequency);
      console.log('Calculating next due date:', { startDate, frequency, calculated });
      setNextDueDate(calculated);
    }
  }, [startDate, frequency, visible]);

  const handleSubmit = () => {
    // Validate required fields
    if (!description.trim()) {
      Alert.alert('Validation Error', 'Please enter a description');
      return;
    }
    if (!amount.trim()) {
      Alert.alert('Validation Error', 'Please enter an amount');
      return;
    }
    if (!categoryId) {
      Alert.alert('Validation Error', 'Please select a category');
      return;
    }
    if (!startDate) {
      Alert.alert('Validation Error', 'Please select a start date');
      return;
    }
    // next_due_date is calculated automatically, no need to validate

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount greater than 0');
      return;
    }

    // next_due_date is calculated automatically from start_date + frequency, don't send it
    if (recurringExpense) {
      onSubmit({
        category: categoryId,
        amount: amountNum,
        description: description.trim(),
        frequency,
        payment_method: paymentMethod,
        start_date: startDate,
        end_date: endDate.trim() || null,
        notes: notes.trim() || undefined,
        is_active: isActive,
      });
    } else {
      onSubmit({
        family: familyId,
        category: categoryId,
        amount: amountNum,
        description: description.trim(),
        frequency,
        payment_method: paymentMethod,
        start_date: startDate,
        end_date: endDate.trim() || null,
        notes: notes.trim() || undefined,
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {recurringExpense ? 'Edit Recurring Expense' : 'Add Recurring Expense'}
            </Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
              <FontAwesome name="times" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Description *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g., Netflix Subscription, Rent, Gym Membership"
                placeholderTextColor={colors.textSecondary}
                editable={!loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Amount *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                editable={!loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Category *</Text>
              <ThemeAwarePicker
                selectedValue={categoryId?.toString() || ''}
                onValueChange={(value) => setCategoryId(value ? parseInt(value) : null)}
                options={categories && categories.length > 0 ? categories.map((cat) => ({
                  label: cat.name,
                  value: cat.id.toString(),
                })) : []}
                placeholder="Select category"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Frequency *</Text>
              <ThemeAwarePicker
                selectedValue={frequency}
                onValueChange={(value) => setFrequency(value as RecurringFrequency)}
                options={FREQUENCIES.map((f) => ({
                  label: f.label,
                  value: f.value,
                }))}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Payment Method</Text>
              <ThemeAwarePicker
                selectedValue={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                options={PAYMENT_METHODS.map((method) => ({
                  label: method.label,
                  value: method.value,
                }))}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemeAwareDatePicker
                value={startDate}
                onChange={(date) => {
                  console.log('Start date changed:', date);
                  setStartDate(date);
                }}
                label="Start Date *"
                placeholder="Select start date"
                disabled={loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Next Due Date (Calculated)</Text>
              <View style={[styles.readOnlyField, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.readOnlyText, { color: colors.text }]}>
                  {nextDueDate || 'Calculating...'}
                </Text>
                <Text style={[styles.readOnlyHint, { color: colors.textSecondary }]}>
                  Automatically calculated from start date and frequency
                </Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <ThemeAwareDatePicker
                value={endDate}
                onChange={setEndDate}
                label="End Date (Optional)"
                placeholder="Select end date"
                minimumDate={new Date(startDate || new Date().toISOString().split('T')[0])}
                disabled={loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional notes..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                editable={!loading}
              />
            </View>

            {recurringExpense && (
              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={[styles.checkboxContainer, { borderColor: colors.border }]}
                  onPress={() => setIsActive(!isActive)}
                  disabled={loading}
                >
                  <View style={[styles.checkbox, { backgroundColor: isActive ? colors.primary : 'transparent', borderColor: colors.border }]}>
                    {isActive && <FontAwesome name="check" size={14} color="#fff" />}
                  </View>
                  <Text style={[styles.checkboxLabel, { color: colors.text }]}>Active</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: colors.border }]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: colors.primary,
                  opacity: (loading || !description.trim() || !amount.trim() || !categoryId || !startDate) ? 0.5 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading || !description.trim() || !amount.trim() || !categoryId || !startDate}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Saving...' : recurringExpense ? 'Update' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  form: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  readOnlyField: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  readOnlyText: {
    fontSize: 16,
    fontWeight: '500',
  },
  readOnlyHint: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
