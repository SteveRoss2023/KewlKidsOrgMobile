import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Expense } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import { resolveMediaUrl } from '../../utils/mediaUrl';

interface ExpenseCardProps {
  expense: Expense;
  onPress?: () => void;
  onDelete?: () => void;
}

export default function ExpenseCard({ expense, onPress, onDelete }: ExpenseCardProps) {
  const { colors } = useTheme();
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const receiptUrl = resolveMediaUrl(expense.receipt_url);
  const isGenerated = !!(expense.is_recurring && expense.recurring_expense);

  const formatDate = (dateString: string): string => {
    try {
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return new Date(dateString).toLocaleDateString();
    }
  };

  const openReceipt = () => {
    if (!receiptUrl) return;
    setImageLoading(true);
    setReceiptVisible(true);
  };

  useEffect(() => {
    if (!receiptVisible || !receiptUrl) return;
    setImageLoading(true);
    const t = setTimeout(() => setImageLoading(false), 1500);
    return () => clearTimeout(t);
  }, [receiptVisible, receiptUrl]);

  const openReceiptExternally = async () => {
    if (!receiptUrl) return;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(receiptUrl, '_blank');
      } else {
        await Linking.openURL(receiptUrl);
      }
    } catch {
      // ignore
    }
  };

  const metaParts = [
    formatDate(expense.expense_date),
    expense.category_name || null,
  ].filter(Boolean);

  return (
    <>
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.65}
        accessibilityRole="button"
        accessibilityLabel={`${expense.description}, $${expense.amount.toFixed(2)}`}
      >
        <View style={styles.main}>
          <View style={styles.topLine}>
            <Text style={[styles.description, { color: colors.text }]} numberOfLines={1}>
              {expense.description}
            </Text>
            <Text style={[styles.amount, { color: colors.primary }]}>
              ${expense.amount.toFixed(2)}
            </Text>
          </View>

          <View style={styles.bottomLine}>
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {metaParts.join(' · ')}
            </Text>
            <View style={styles.chips}>
              {isGenerated && (
                <View style={[styles.chip, { backgroundColor: '#10b98122' }]}>
                  <FontAwesome name="refresh" size={9} color="#10b981" />
                  <Text style={[styles.chipText, { color: '#10b981' }]}>Recurring</Text>
                </View>
              )}
              {!!receiptUrl && (
                <TouchableOpacity
                  style={[styles.chip, styles.receiptChip]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    openReceipt();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="View receipt"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <FontAwesome name="file-image-o" size={9} color="#fff" />
                  <Text style={styles.receiptChipText}>Receipt</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {onDelete && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityLabel="Delete expense"
          >
            <FontAwesome name="trash-o" size={16} color={colors.error || '#ef4444'} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <Modal
        visible={receiptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptVisible(false)}
      >
        <View style={styles.receiptOverlay}>
          <View style={[styles.receiptSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.receiptHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.receiptTitle, { color: colors.text }]} numberOfLines={1}>
                Receipt — {expense.description}
              </Text>
              <TouchableOpacity
                onPress={() => setReceiptVisible(false)}
                accessibilityLabel="Close receipt"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.receiptBody}>
              {imageLoading && (
                <ActivityIndicator
                  size="large"
                  color={colors.primary}
                  style={styles.receiptSpinner}
                />
              )}
              {receiptUrl ? (
                <Image
                  source={{ uri: receiptUrl }}
                  style={[styles.receiptImage, imageLoading && styles.receiptImageLoading]}
                  resizeMode="contain"
                  onLoad={() => setImageLoading(false)}
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => setImageLoading(false)}
                />
              ) : null}
            </View>
            <View style={[styles.receiptFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.receiptFooterBtn, { borderColor: colors.border }]}
                onPress={() => setReceiptVisible(false)}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.receiptFooterBtn, { backgroundColor: colors.primary }]}
                onPress={() => void openReceiptExternally()}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Open full size</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  description: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 18,
  },
  meta: {
    flexShrink: 1,
    fontSize: 12,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  receiptChip: {
    backgroundColor: '#0ea5e9',
  },
  receiptChipText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  deleteBtn: {
    paddingLeft: 10,
    paddingVertical: 8,
  },
  receiptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  receiptSheet: {
    borderRadius: 12,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  receiptTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  receiptBody: {
    minHeight: 280,
    maxHeight: Platform.OS === 'web' ? 520 : 420,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  receiptSpinner: {
    position: 'absolute',
    zIndex: 1,
  },
  receiptImage: {
    width: '100%',
    height: '100%',
    minHeight: 280,
  },
  receiptImageLoading: {
    opacity: 0.35,
  },
  receiptFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
  receiptFooterBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
