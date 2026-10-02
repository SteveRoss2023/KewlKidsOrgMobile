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
  Switch,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Expense } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { formatCurrency } from '../../utils/moneyInput';

interface ExpenseCardProps {
  expense: Expense;
  onPress?: () => void;
  onDelete?: () => void;
  onTogglePaid?: (nextPaid: boolean) => void;
  paidToggleDisabled?: boolean;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isNaN(n) ? 0 : n;
}

export default function ExpenseCard({
  expense,
  onPress,
  onDelete,
  onTogglePaid,
  paidToggleDisabled,
}: ExpenseCardProps) {
  const { colors } = useTheme();
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const receiptUrl = resolveMediaUrl(expense.receipt_url);
  const isGenerated = !!(expense.is_recurring && expense.recurring_expense);
  const isPaid = expense.is_paid !== false;
  const lineItems = [...(expense.line_items || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const formatDate = (dateString: string): string => {
    try {
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
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

  return (
    <>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerText}
            onPress={onPress}
            activeOpacity={0.7}
            disabled={!onPress}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${expense.description}`}
          >
            <Text style={[styles.description, { color: colors.text }]} numberOfLines={2}>
              {expense.description}
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {formatDate(expense.expense_date)}
              {expense.category_name ? ` · ${expense.category_name}` : ''}
            </Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            {onPress && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Edit expense"
              >
                <FontAwesome name="pencil" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onDelete}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Delete expense"
              >
                <FontAwesome name="trash-o" size={13} color={colors.error || '#ef4444'} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
          <Text style={[styles.amount, { color: colors.primary }]} numberOfLines={1}>
            {formatCurrency(expense.amount)}
          </Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          {onTogglePaid ? (
            <View style={styles.paidWrap}>
              <Text
                style={[
                  styles.paidLabel,
                  { color: isPaid ? '#10b981' : colors.textSecondary },
                ]}
              >
                {isPaid ? 'Paid' : 'Unpaid'}
              </Text>
              <Switch
                value={isPaid}
                onValueChange={(value) => onTogglePaid(value)}
                disabled={paidToggleDisabled}
                trackColor={{ false: colors.border, true: '#10b981' }}
                thumbColor="#fff"
                style={styles.paidSwitch}
              />
            </View>
          ) : (
            <View style={styles.paidWrap} />
          )}
          <View style={styles.chips}>
            {isGenerated && (
              <View style={[styles.chip, { backgroundColor: '#10b98122' }]}>
                <FontAwesome name="refresh" size={8} color="#10b981" />
                <Text style={[styles.chipText, { color: '#10b981' }]}>Recurring</Text>
              </View>
            )}
            {!!receiptUrl && (
              <TouchableOpacity
                style={[styles.chip, styles.receiptChip]}
                onPress={openReceipt}
                accessibilityRole="button"
                accessibilityLabel="View receipt"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <FontAwesome name="file-image-o" size={8} color="#fff" />
                <Text style={styles.receiptChipText}>Receipt</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.expandToggle, { borderTopColor: colors.border }]}
          onPress={() => setExpanded((open) => !open)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded
              ? `Hide ${lineItems.length} line items`
              : `Show ${lineItems.length} line items`
          }
        >
          <FontAwesome
            name={expanded ? 'chevron-down' : 'chevron-right'}
            size={10}
            color={colors.textSecondary}
          />
          <Text style={[styles.expandToggleText, { color: colors.primary }]}>
            {lineItems.length} {lineItems.length === 1 ? 'item' : 'items'}
          </Text>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.itemsList}>
            {lineItems.length === 0 ? (
              <Text style={[styles.emptyItems, { color: colors.textSecondary }]}>
                No line items
              </Text>
            ) : (
              lineItems.map((item, index) => {
                const qty = toNumber(item.quantity);
                const unit = toNumber(item.unit_price);
                const total = toNumber(item.line_total);
                const metaParts: string[] = [];
                if (qty > 0) metaParts.push(`×${qty}`);
                if (unit > 0) metaParts.push(`@ ${formatCurrency(unit)}`);
                return (
                  <View
                    key={item.id ?? `${item.name}-${index}`}
                    style={[styles.itemRow, { borderTopColor: colors.border }]}
                  >
                    <View style={styles.itemMain}>
                      <Text style={[styles.itemDesc, { color: colors.text }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {metaParts.length > 0 ? (
                        <Text style={[styles.itemMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                          {metaParts.join(' ')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.itemAmt, { color: colors.primary }]} numberOfLines={1}>
                      {formatCurrency(total > 0 ? total : unit * (qty || 1))}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>

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
  card: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 8,
    gap: 5,
    minHeight: 110,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  description: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  meta: {
    fontSize: 10,
    fontWeight: '500',
  },
  iconBtn: {
    padding: 4,
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    flexWrap: 'wrap',
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 9,
    fontWeight: '700',
  },
  paidWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  paidLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  paidSwitch: {
    transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }],
  },
  receiptChip: {
    backgroundColor: '#0ea5e9',
  },
  receiptChipText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    paddingBottom: 4,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemsList: {
    paddingBottom: 4,
  },
  emptyItems: {
    fontSize: 10,
    paddingVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  itemDesc: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: 9,
  },
  itemAmt: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
