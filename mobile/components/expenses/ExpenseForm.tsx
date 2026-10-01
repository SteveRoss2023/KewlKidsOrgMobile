import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Expense, ExpenseCategory, ExpenseTag, PaymentMethod, CreateExpenseData, UpdateExpenseData, Receipt } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeAwarePicker from '../lists/ThemeAwarePicker';
import ThemeAwareDatePicker from '../ThemeAwareDatePicker';
import expenseService from '../../services/expenseService';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import {
  formatMoneyDisplay,
  onMoneyChange,
  parseMoneyDisplay,
} from '../../utils/moneyInput';
import LineItemsEditor, {
  DraftLineItem,
  draftLinesFromExpenseItems,
  toLineItemsInput,
} from './LineItemsEditor';

interface ExpenseFormProps {
  visible: boolean;
  expense?: Expense | null;
  categories: ExpenseCategory[];
  tags: ExpenseTag[];
  familyId: number;
  onSubmit: (
    data: CreateExpenseData | UpdateExpenseData,
    options?: { stayOpen?: boolean }
  ) => void | Promise<Expense | void>;
  onCancel: () => void;
  onExpenseCreated?: (expenseId: number) => void;
  loading?: boolean;
}

const PAYMENT_METHODS: { label: string; value: PaymentMethod }[] = [
  { label: 'Cash', value: 'cash' },
  { label: 'Credit Card', value: 'credit_card' },
  { label: 'Debit Card', value: 'debit_card' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'E-Transfer', value: 'e_transfer' },
  { label: 'Check', value: 'check' },
  { label: 'Other', value: 'other' },
];

export default function ExpenseForm({
  visible,
  expense,
  categories,
  tags,
  familyId,
  onSubmit,
  onCancel,
  onExpenseCreated,
  loading = false,
}: ExpenseFormProps) {
  const { colors } = useTheme();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [showReceiptSourcePicker, setShowReceiptSourcePicker] = useState(false);
  const [lines, setLines] = useState<DraftLineItem[]>([]);
  const [boundExpenseId, setBoundExpenseId] = useState<number | null>(null);
  const boundExpenseIdRef = useRef<number | null>(null);

  const activeExpenseId = expense?.id ?? boundExpenseId;
  const isExisting = !!activeExpenseId;
  const defaultCategoryId = useMemo(
    () => categories.find((c) => c.is_default)?.id ?? categories[0]?.id ?? null,
    [categories]
  );

  useEffect(() => {
    boundExpenseIdRef.current = activeExpenseId;
  }, [activeExpenseId]);

  const setBoundId = (id: number | null) => {
    boundExpenseIdRef.current = id;
    setBoundExpenseId(id);
  };

  useEffect(() => {
    if (!visible) {
      // Reset form when modal closes
      setDescription('');
      setAmount('');
      setCategoryId(null);
      setPaymentMethod('credit_card');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setSelectedTags([]);
      setReceipt(null);
      setLines([]);
      setBoundId(null);
      setShowReceiptSourcePicker(false);
      return;
    }

    if (expense) {
      setBoundId(expense.id);
      setDescription(expense.description);
      setAmount(formatMoneyDisplay(expense.amount));
      setCategoryId(expense.category);
      setPaymentMethod(expense.payment_method);
      setExpenseDate(expense.expense_date);
      setNotes(expense.notes || '');
      setSelectedTags(expense.tags || []);
      setLines((prev) => {
        const hasNamed = prev.some((l) => l.name.trim());
        if (hasNamed) return prev;
        return draftLinesFromExpenseItems(expense.line_items);
      });
      if (expense.receipt_url) {
        setReceipt({
          id: expense.receipt_id || 0,
          expense: expense.id,
          family: expense.family,
          file: '',
          receipt_url: expense.receipt_url,
          file_size: 0,
          mime_type: null,
          uploaded_by: null,
          uploaded_by_username: null,
          created_at: '',
          updated_at: '',
        });
      }
    } else if (!boundExpenseId) {
      setDescription('');
      setAmount('');
      setCategoryId(defaultCategoryId);
      setPaymentMethod('credit_card');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setSelectedTags([]);
      setReceipt(null);
      setLines([]);
    }
  }, [visible, expense?.id, defaultCategoryId]);

  const validateForm = (): CreateExpenseData | UpdateExpenseData | null => {
    if (!description.trim()) {
      Alert.alert('Validation Error', 'Please enter a description');
      return null;
    }
    if (!amount.trim()) {
      Alert.alert('Validation Error', 'Please enter an amount');
      return null;
    }
    if (!categoryId) {
      Alert.alert('Validation Error', 'Please select a category');
      return null;
    }
    if (!expenseDate) {
      Alert.alert('Validation Error', 'Please select a date');
      return null;
    }

    const amountNum = parseMoneyDisplay(amount);
    if (amountNum == null || amountNum <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount greater than 0');
      return null;
    }

    if (isExisting) {
      return {
        description: description.trim(),
        amount: amountNum,
        category: categoryId,
        payment_method: paymentMethod,
        expense_date: expenseDate,
        notes: notes.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        line_items_input: toLineItemsInput(lines),
      };
    }

    return {
      family: familyId,
      description: description.trim(),
      amount: amountNum,
      category: categoryId,
      payment_method: paymentMethod,
      expense_date: expenseDate,
      notes: notes.trim() || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      line_items_input: toLineItemsInput(lines),
    };
  };

  /** Always opens the source chooser — no form fields required first. */
  const handleReceiptButtonPress = () => {
    if (!categories.length) {
      Alert.alert('No categories', 'Create a category first, then attach a receipt.');
      return;
    }
    setShowReceiptSourcePicker((open) => !open);
  };

  const handleTakePhoto = async () => {
    setShowReceiptSourcePicker(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permissions to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadReceiptFile(
          result.assets[0].uri,
          result.assets[0].fileName || 'receipt.jpg',
          result.assets[0].mimeType || 'image/jpeg'
        );
      }
    } catch (err: any) {
      console.error('Error taking photo:', err);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handlePickImage = async () => {
    setShowReceiptSourcePicker(false);
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Please grant camera roll permissions to upload receipts.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadReceiptFile(
          result.assets[0].uri,
          result.assets[0].fileName || 'receipt.jpg',
          result.assets[0].mimeType || 'image/jpeg'
        );
      }
    } catch (err: any) {
      console.error('Error picking image:', err);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handlePickDocument = async () => {
    setShowReceiptSourcePicker(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadReceiptFile(
          result.assets[0].uri,
          result.assets[0].name,
          result.assets[0].mimeType || 'application/octet-stream'
        );
      }
    } catch (err: any) {
      console.error('Error picking document:', err);
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
  };

  const uploadReceiptFile = async (fileUri: string, fileName: string, mimeType: string) => {
    const existingId = boundExpenseIdRef.current ?? activeExpenseId;
    const categoryForSave = categoryId || defaultCategoryId;

    setUploadingReceipt(true);
    try {
      // Upload first (no expense required). OCR fills the form, then we create/update quietly.
      const uploadedReceipt = await expenseService.uploadReceipt({
        familyId,
        fileUri,
        fileName,
        mimeType,
        expenseId: existingId || undefined,
      });
      setReceipt(uploadedReceipt);

      let parsed: Awaited<ReturnType<typeof expenseService.parseReceipt>> | null = null;
      try {
        parsed = await expenseService.parseReceipt(uploadedReceipt.id);
      } catch (err: any) {
        console.error('Receipt OCR failed:', err);
      }

      const nextDescription =
        (parsed?.merchant || description.trim() || 'Receipt').trim() || 'Receipt';
      const nextAmount =
        parsed?.total != null
          ? parsed.total
          : parseMoneyDisplay(amount);
      const nextDate = parsed?.expense_date || expenseDate || new Date().toISOString().split('T')[0];
      const draft = parsed?.line_items?.length
        ? draftLinesFromExpenseItems(parsed.line_items)
        : lines.filter((l) => l.name.trim());

      setDescription(nextDescription);
      if (nextAmount != null && nextAmount > 0) {
        setAmount(formatMoneyDisplay(nextAmount));
      }
      setExpenseDate(nextDate);
      if (!categoryId && categoryForSave) {
        setCategoryId(categoryForSave);
      }
      if (draft.length) {
        setLines(draft);
      }

      let ocrNote = 'Receipt uploaded.';
      if (parsed?.error || parsed?.ocr_available === false) {
        ocrNote =
          parsed.error ||
          'Receipt uploaded, but OCR is not available. Fill in details and save.';
      } else if (parsed) {
        const n = draft.length;
        ocrNote =
          n > 0 && nextAmount != null
            ? `Receipt read. Amount ${formatMoneyDisplay(nextAmount)}, ${n} line item${n === 1 ? '' : 's'} — review before closing.`
            : nextAmount != null
              ? `Receipt read. Amount set to ${formatMoneyDisplay(nextAmount)} — review before closing.`
              : 'Receipt uploaded. Could not read the total — enter an amount and save.';
      }

      if (!categoryForSave) {
        Alert.alert('Receipt', `${ocrNote} Create a category, then save.`);
        return;
      }

      if (!existingId) {
        if (nextAmount == null || nextAmount <= 0) {
          Alert.alert('Receipt', ocrNote);
          return;
        }
        const saved = await Promise.resolve(
          onSubmit(
            {
              family: familyId,
              category: categoryForSave,
              amount: nextAmount,
              description: nextDescription,
              expense_date: nextDate,
              payment_method: paymentMethod,
              notes: notes.trim() || undefined,
              tags: selectedTags.length > 0 ? selectedTags : undefined,
              line_items_input: toLineItemsInput(draft),
            },
            { stayOpen: true }
          )
        );
        if (saved?.id) {
          setBoundId(saved.id);
          onExpenseCreated?.(saved.id);
          try {
            await expenseService.attachReceiptToExpense(uploadedReceipt.id, saved.id);
          } catch (attachErr) {
            console.warn('Receipt attach failed', attachErr);
          }
        }
      } else {
        try {
          await expenseService.updateExpense(existingId, {
            description: nextDescription,
            ...(nextAmount != null && nextAmount > 0 ? { amount: nextAmount } : {}),
            expense_date: nextDate,
            ...(categoryForSave ? { category: categoryForSave } : {}),
            line_items_input: toLineItemsInput(draft),
          });
        } catch {
          // Form still has OCR values locally
        }
      }

      Alert.alert('Receipt', ocrNote);
    } catch (err: any) {
      console.error('Error uploading receipt:', err);
      Alert.alert('Error', err.message || 'Failed to upload receipt. Please try again.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleViewReceipt = async () => {
    const raw = receipt?.receipt_url || (receipt as any)?.file_url;
    const url = resolveMediaUrl(raw);
    if (!url) return;

    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        const { Linking } = require('react-native');
        await Linking.openURL(url);
      }
    } catch (err: any) {
      console.error('Error viewing receipt:', err);
      Alert.alert('Error', 'Failed to open receipt. Please try again.');
    }
  };

  const handleDeleteReceipt = async () => {
    if (!receipt?.id) return;

    Alert.alert(
      'Delete Receipt',
      'Are you sure you want to delete this receipt?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await expenseService.deleteReceipt(receipt.id);
              setReceipt(null);
              Alert.alert('Success', 'Receipt deleted successfully');
            } catch (err: any) {
              console.error('Error deleting receipt:', err);
              Alert.alert('Error', err.message || 'Failed to delete receipt. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSubmit = () => {
    const data = validateForm();
    if (!data) return;
    void Promise.resolve(onSubmit(data));
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {isExisting ? 'Edit Expense' : 'Add Expense'}
            </Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
              <FontAwesome name="times" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.form}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Description *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g., Groceries, Gas, Restaurant"
                placeholderTextColor={colors.textSecondary}
                editable={!loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Amount *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={amount}
                onChangeText={(t) => setAmount(onMoneyChange(t))}
                placeholder="$0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
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
                value={expenseDate}
                onChange={setExpenseDate}
                label="Date"
                placeholder="Select date"
                disabled={loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Tags</Text>
              <View style={styles.tagsContainer}>
                {tags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.id);
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      style={[
                        styles.tagChip,
                        {
                          backgroundColor: isSelected ? (tag.color || colors.primary) : colors.border,
                          borderColor: tag.color || colors.primary,
                        },
                      ]}
                      onPress={() => {
                        if (isSelected) {
                          setSelectedTags(selectedTags.filter((id) => id !== tag.id));
                        } else {
                          setSelectedTags([...selectedTags, tag.id]);
                        }
                      }}
                      disabled={loading}
                    >
                      <Text
                        style={[
                          styles.tagChipText,
                          { color: isSelected ? '#fff' : colors.text },
                        ]}
                      >
                        {tag.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {tags.length === 0 && (
                  <Text style={[styles.noTagsText, { color: colors.textSecondary }]}>
                    No tags available. Create tags to categorize expenses.
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Receipt</Text>
              {receipt?.receipt_url || (receipt as any)?.file_url ? (
                <View style={[styles.receiptContainer, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <View style={styles.receiptInfo}>
                    <FontAwesome name="file-image-o" size={18} color={colors.primary} />
                    <Text style={[styles.receiptName, { color: colors.text }]} numberOfLines={1}>
                      Receipt attached
                    </Text>
                  </View>
                  <View style={styles.receiptActions}>
                    <TouchableOpacity
                      style={styles.receiptActionButton}
                      onPress={handleViewReceipt}
                      disabled={loading || uploadingReceipt}
                    >
                      <Text style={[styles.receiptActionText, { color: colors.primary }]}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.receiptActionButton}
                      onPress={handleDeleteReceipt}
                      disabled={loading || uploadingReceipt || !receipt?.id}
                    >
                      <Text style={[styles.receiptActionText, { color: colors.error || '#ef4444' }]}>
                        {uploadingReceipt ? '…' : 'Remove'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <TouchableOpacity
                    style={[styles.uploadButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                    onPress={handleReceiptButtonPress}
                    disabled={loading || uploadingReceipt}
                  >
                    <FontAwesome name="camera" size={16} color={colors.primary} />
                    <Text style={[styles.uploadButtonText, { color: colors.text }]}>
                      {uploadingReceipt
                        ? 'Reading receipt…'
                        : showReceiptSourcePicker
                          ? 'Hide options'
                          : 'Add receipt photo'}
                    </Text>
                  </TouchableOpacity>
                  {showReceiptSourcePicker && (
                    <View style={[styles.receiptSourcePicker, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      <TouchableOpacity
                        style={styles.receiptSourceOption}
                        onPress={() => void handleTakePhoto()}
                        disabled={loading || uploadingReceipt}
                      >
                        <FontAwesome name="camera" size={16} color={colors.primary} />
                        <Text style={[styles.receiptSourceOptionText, { color: colors.text }]}>Camera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.receiptSourceOption}
                        onPress={() => void handlePickImage()}
                        disabled={loading || uploadingReceipt}
                      >
                        <FontAwesome name="image" size={16} color={colors.primary} />
                        <Text style={[styles.receiptSourceOptionText, { color: colors.text }]}>Gallery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.receiptSourceOption}
                        onPress={() => void handlePickDocument()}
                        disabled={loading || uploadingReceipt}
                      >
                        <FontAwesome name="file-o" size={16} color={colors.primary} />
                        <Text style={[styles.receiptSourceOptionText, { color: colors.text }]}>Document</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>

            <View style={styles.formGroup}>
              <LineItemsEditor
                lines={lines}
                onChange={setLines}
                disabled={loading}
                hint="Optional. Add products from the receipt (name, qty, price)."
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
                  opacity: (loading || !description.trim() || !amount.trim() || !categoryId || !expenseDate) ? 0.5 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading || !description.trim() || !amount.trim() || !categoryId || !expenseDate}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Saving...' : isExisting ? 'Update' : 'Add'}
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
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  noTagsText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  receiptContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  receiptInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  receiptName: {
    fontSize: 14,
    fontWeight: '500',
  },
  receiptActions: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  receiptActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  receiptSourcePicker: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  receiptSourceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  receiptSourceOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
