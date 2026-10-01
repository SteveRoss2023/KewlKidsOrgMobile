import React, { useEffect, useMemo, useState } from 'react';
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
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeAwarePicker from '../lists/ThemeAwarePicker';
import ThemeAwareDatePicker from '../ThemeAwareDatePicker';
import expenseService from '../../services/expenseService';
import { takePhoto, pickFromGallery, ReceiptCaptureResult } from '../../utils/receiptCapture';
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
import {
  ExpenseCategory,
  PaymentMethod,
  Receipt,
  ReceiptParseResult,
} from '../../types/expenses';

interface ReceiptScanWizardProps {
  visible: boolean;
  familyId: number;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => void;
}

type Phase = 'choose' | 'uploading' | 'review';

const PAYMENT_METHODS: { label: string; value: PaymentMethod }[] = [
  { label: 'Cash', value: 'cash' },
  { label: 'Credit Card', value: 'credit_card' },
  { label: 'Debit Card', value: 'debit_card' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'E-Transfer', value: 'e_transfer' },
  { label: 'Check', value: 'check' },
  { label: 'Other', value: 'other' },
];

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

/** True on native Android, or web browser on an Android phone (PWA). */
function isAndroidDevice(): boolean {
  if (Platform.OS === 'android') return true;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return /Android/i.test(navigator.userAgent || '');
  }
  return false;
}

export default function ReceiptScanWizard({
  visible,
  familyId,
  categories,
  onClose,
  onSaved,
}: ReceiptScanWizardProps) {
  const { colors } = useTheme();
  const androidDevice = isAndroidDevice();
  const [phase, setPhase] = useState<Phase>('choose');
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [parseInfo, setParseInfo] = useState<ReceiptParseResult | null>(null);
  const [ocrNote, setOcrNote] = useState('');

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLineItem[]>([]);

  const defaultCategoryId = useMemo(
    () => categories.find((c) => c.is_default)?.id ?? categories[0]?.id ?? null,
    [categories]
  );

  const reset = () => {
    setPhase('choose');
    setSaving(false);
    setPicking(false);
    setLocalImageUri(null);
    setReceipt(null);
    setParseInfo(null);
    setOcrNote('');
    setDescription('');
    setAmount('');
    setCategoryId(defaultCategoryId);
    setPaymentMethod('credit_card');
    setExpenseDate(todayIso());
    setNotes('');
    setLines([]);
  };

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    setCategoryId(defaultCategoryId);
    setPhase('choose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const processCaptured = async (captured: ReceiptCaptureResult) => {
    if (!captured) {
      setPhase('choose');
      setPicking(false);
      return;
    }
    setLocalImageUri(captured.uri);
    setPhase('uploading');
    setPicking(false);
    try {
      const uploaded = await expenseService.uploadReceipt({
        familyId,
        fileUri: captured.uri,
        fileName: captured.fileName,
        mimeType: captured.mimeType,
      });
      setReceipt(uploaded);

      let parsed: ReceiptParseResult | null = null;
      try {
        parsed = await expenseService.parseReceipt(uploaded.id);
      } catch (err: any) {
        setOcrNote(err?.message || 'OCR failed — enter details manually.');
      }

        if (parsed) {
        setParseInfo(parsed);
        if (parsed.error || parsed.ocr_available === false) {
          setOcrNote(
            parsed.error ||
              'Tesseract OCR is not available on the server. Enter details manually; the image is still attached.'
          );
        } else if (parsed.confidence === 'low') {
          setOcrNote('Could not read the receipt clearly — please confirm or fill in the fields.');
        } else {
          const n = parsed.line_items?.length || 0;
          const engine =
            (parsed as any).engine === 'gemini'
              ? 'Gemini'
              : (parsed as any).engine === 'tesseract'
                ? 'Tesseract'
                : 'OCR';
          setOcrNote(
            n > 0
              ? `${engine}: ${parsed.confidence} confidence, ${n} line item${n === 1 ? '' : 's'} — review before saving.`
              : `${engine} confidence: ${parsed.confidence}. Review and edit before saving.`
          );
        }
        if (parsed.merchant) setDescription(parsed.merchant);
        if (parsed.total != null) setAmount(formatMoneyDisplay(parsed.total));
        if (parsed.expense_date) setExpenseDate(parsed.expense_date);
        if (parsed.line_items?.length) {
          setLines(draftLinesFromExpenseItems(parsed.line_items));
        }
      }

      if (!categoryId && defaultCategoryId) setCategoryId(defaultCategoryId);
      setPhase('review');
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Could not upload receipt.');
      setPhase('choose');
    }
  };

  const onChoose = async (mode: 'camera' | 'gallery') => {
    if (picking) return;
    setPicking(true);
    try {
      const captured: ReceiptCaptureResult =
        mode === 'camera' ? await takePhoto() : await pickFromGallery();
      await processCaptured(captured);
    } catch (err: any) {
      Alert.alert('Capture failed', err?.message || 'Could not get a photo.');
      setPicking(false);
      setPhase('choose');
    }
  };

  const handleSave = async () => {
    if (!description.trim() || !amount.trim() || !categoryId || !expenseDate) {
      Alert.alert('Missing fields', 'Description, amount, category, and date are required.');
      return;
    }
    const amountNum = parseMoneyDisplay(amount);
    if (amountNum == null || amountNum < 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount.');
      return;
    }

    setSaving(true);
    try {
      const line_items_input = toLineItemsInput(lines);

      const expense = await expenseService.createExpense({
        family: familyId,
        category: categoryId,
        amount: amountNum,
        description: description.trim(),
        notes: notes.trim() || undefined,
        expense_date: expenseDate,
        payment_method: paymentMethod,
        line_items_input,
      });

      if (receipt?.id) {
        try {
          await expenseService.attachReceiptToExpense(receipt.id, expense.id);
        } catch (attachErr) {
          console.warn('Receipt attach failed', attachErr);
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message || 'Could not save expense.');
    } finally {
      setSaving(false);
    }
  };

  const imageUri = localImageUri || resolveMediaUrl(receipt?.receipt_url) || null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={saving ? undefined : onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Scan receipt</Text>
            <TouchableOpacity onPress={saving ? undefined : onClose} accessibilityLabel="Close">
              <FontAwesome name="times" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {phase === 'choose' && (
            <View style={styles.chooseBox}>
              <FontAwesome name="file-image-o" size={40} color={colors.primary} />
              <Text style={[styles.chooseTitle, { color: colors.text }]}>Add a receipt</Text>

              {androidDevice ? (
                <View style={[styles.scanTip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.scanTipTitle, { color: colors.text }]}>Best quality</Text>
                  <Text style={[styles.chooseHint, { color: colors.textSecondary, textAlign: 'left', marginBottom: 0 }]}>
                    Use your phone Camera → Scan, save the image, then tap Pick from gallery below.
                  </Text>
                </View>
              ) : (
                <Text style={[styles.chooseHint, { color: colors.textSecondary }]}>
                  Pick a receipt photo from Gallery. A flat, well-lit image works best for OCR.
                </Text>
              )}

              {picking ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 16 }} />
              ) : (
                <View style={styles.chooseActions}>
                  <TouchableOpacity
                    style={[styles.chooseBtn, { backgroundColor: colors.primary }]}
                    onPress={() => void onChoose('gallery')}
                  >
                    <FontAwesome name="image" size={18} color="#fff" />
                    <Text style={styles.chooseBtnText}>Pick from gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.chooseBtn,
                      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                    ]}
                    onPress={() => void onChoose('camera')}
                  >
                    <FontAwesome name="camera" size={18} color={colors.primary} />
                    <Text style={[styles.chooseBtnText, { color: colors.text }]}>Take photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chooseBtnOutline, { borderColor: colors.border }]}
                    onPress={onClose}
                  >
                    <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {phase === 'uploading' && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Uploading and reading receipt…
              </Text>
            </View>
          )}

          {phase === 'review' && (
            <>
              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
              >
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
                ) : null}

                {!!ocrNote && (
                  <Text style={[styles.ocrNote, { color: colors.textSecondary, backgroundColor: colors.background }]}>
                    {ocrNote}
                  </Text>
                )}

                <Text style={[styles.label, { color: colors.text }]}>Merchant / description *</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Store name"
                  placeholderTextColor={colors.textSecondary}
                  editable={!saving}
                />

                <Text style={[styles.label, { color: colors.text }]}>Total *</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={amount}
                  onChangeText={(t) => setAmount(onMoneyChange(t))}
                  keyboardType="number-pad"
                  placeholder="$0.00"
                  placeholderTextColor={colors.textSecondary}
                  editable={!saving}
                />

                <Text style={[styles.label, { color: colors.text }]}>Category *</Text>
                <ThemeAwarePicker
                  selectedValue={categoryId?.toString() || ''}
                  onValueChange={(v) => setCategoryId(v ? parseInt(v, 10) : null)}
                  options={categories.map((c) => ({ label: c.name, value: c.id.toString() }))}
                  placeholder="Select category"
                />

                <Text style={[styles.label, { color: colors.text }]}>Payment method</Text>
                <ThemeAwarePicker
                  selectedValue={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                  options={PAYMENT_METHODS.map((m) => ({ label: m.label, value: m.value }))}
                />

                <ThemeAwareDatePicker
                  value={expenseDate}
                  onChange={setExpenseDate}
                  label="Date"
                  placeholder="Select date"
                  disabled={saving}
                />

                <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
                <TextInput
                  style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  placeholder="Optional notes"
                  placeholderTextColor={colors.textSecondary}
                  editable={!saving}
                />

                <LineItemsEditor
                  lines={lines}
                  onChange={setLines}
                  disabled={saving}
                  hint="Filled from the receipt when possible — review, edit, or add items before saving."
                />
              </ScrollView>

              <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.btn, { borderColor: colors.border, borderWidth: 1 }]}
                  onPress={onClose}
                  disabled={saving}
                >
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.btn,
                    { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 },
                  ]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Save expense</Text>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '94%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    minHeight: Platform.OS === 'web' ? 520 : 420,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  chooseBox: {
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  chooseTitle: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  chooseHint: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 8 },
  scanTip: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  scanTipTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  chooseActions: { width: '100%', gap: 10, marginTop: 8 },
  chooseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  chooseBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  chooseBtnOutline: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: { padding: 40, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15 },
  body: { maxHeight: Platform.OS === 'web' ? 560 : 480 },
  bodyContent: { padding: 16, paddingBottom: 24, gap: 8 },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#11182710',
  },
  ocrNote: {
    fontSize: 13,
    lineHeight: 18,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  label: { fontSize: 14, fontWeight: '600', marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 16,
    marginBottom: 4,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
