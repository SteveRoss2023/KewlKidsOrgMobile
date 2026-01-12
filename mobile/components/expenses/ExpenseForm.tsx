import React, { useState, useEffect } from 'react';
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

interface ExpenseFormProps {
  visible: boolean;
  expense?: Expense | null;
  categories: ExpenseCategory[];
  tags: ExpenseTag[];
  familyId: number;
  onSubmit: (data: CreateExpenseData | UpdateExpenseData) => void;
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
      return;
    }

    if (expense) {
      setDescription(expense.description);
      setAmount(expense.amount.toString());
      setCategoryId(expense.category);
      setPaymentMethod(expense.payment_method);
      setExpenseDate(expense.expense_date);
      setNotes(expense.notes || '');
      setSelectedTags(expense.tags || []);
      // If expense has receipt_url, create a receipt object for display
      if (expense.receipt_url) {
        setReceipt({
          id: 0,
          expense: expense.id,
          file_name: 'Receipt',
          file_url: expense.receipt_url,
          uploaded_at: '',
        } as Receipt);
      } else {
        setReceipt(null);
      }
    } else {
      setDescription('');
      setAmount('');
      setCategoryId(categories.length > 0 ? categories[0].id : null);
      setPaymentMethod('credit_card');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setSelectedTags([]);
      setReceipt(null);
    }
  }, [expense, categories, visible]);

  const handlePickReceipt = async () => {
    try {
      // Request permissions for image picker
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload receipts.');
        return;
      }

      // Show action sheet to choose between camera and gallery
      Alert.alert(
        'Select Receipt',
        'Choose an option',
        [
          { text: 'Camera', onPress: handleTakePhoto },
          { text: 'Gallery', onPress: handlePickImage },
          { text: 'Document', onPress: handlePickDocument },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (err: any) {
      console.error('Error picking receipt:', err);
      Alert.alert('Error', 'Failed to pick receipt. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
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
    try {
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
    if (!expense?.id) {
      // If expense doesn't exist yet, we need to create it first
      Alert.alert('Info', 'Please save the expense first, then upload the receipt.');
      return;
    }

    setUploadingReceipt(true);
    try {
      const uploadedReceipt = await expenseService.uploadReceipt(expense.id, fileUri, fileName, mimeType);
      setReceipt(uploadedReceipt);
      Alert.alert('Success', 'Receipt uploaded successfully');
    } catch (err: any) {
      console.error('Error uploading receipt:', err);
      Alert.alert('Error', err.message || 'Failed to upload receipt. Please try again.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleViewReceipt = async () => {
    if (!receipt?.file_url) return;

    try {
      if (Platform.OS === 'web') {
        window.open(receipt.file_url, '_blank');
      } else {
        const { Linking } = require('react-native');
        await Linking.openURL(receipt.file_url);
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
    if (!expenseDate) {
      Alert.alert('Validation Error', 'Please select a date');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount greater than 0');
      return;
    }

    if (expense) {
      onSubmit({
        description: description.trim(),
        amount: amountNum,
        category: categoryId,
        payment_method: paymentMethod,
        expense_date: expenseDate,
        notes: notes.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
    } else {
      onSubmit({
        family: familyId,
        description: description.trim(),
        amount: amountNum,
        category: categoryId,
        payment_method: paymentMethod,
        expense_date: expenseDate,
        notes: notes.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      });
      // If onExpenseCreated callback is provided, it will be called after expense is created
      // This allows the parent to handle receipt upload after expense creation
    }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {expense ? 'Edit Expense' : 'Add Expense'}
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
                {loading ? 'Saving...' : expense ? 'Update' : 'Add'}
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
});
