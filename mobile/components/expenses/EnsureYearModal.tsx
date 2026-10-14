import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { formatCurrency } from '../../utils/moneyInput';
import type { EnsureYearResult, EnsureYearItem } from '../../types/expenses';

interface EnsureYearModalProps {
  visible: boolean;
  preview: EnsureYearResult | null;
  applying?: boolean;
  onCancel: () => void;
  onApply: () => void;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function ItemLine({
  item,
  prefix,
  color,
}: {
  item: EnsureYearItem;
  prefix: string;
  color: string;
}) {
  return (
    <Text style={[styles.line, { color }]} numberOfLines={2}>
      {prefix} {item.description}
      {item.category_name ? ` · ${item.category_name}` : ''} · {formatCurrency(item.amount)} ·{' '}
      {formatShortDate(item.expense_date)}
    </Text>
  );
}

export default function EnsureYearModal({
  visible,
  preview,
  applying = false,
  onCancel,
  onApply,
}: EnsureYearModalProps) {
  const { colors } = useTheme();

  const created = preview?.created_items || [];
  const updated = preview?.updated_items || [];
  const removed = preview?.removed_items || [];

  const summary = useMemo(() => {
    if (!preview) return '';
    const parts: string[] = [];
    if (preview.created) parts.push(`create ${preview.created}`);
    if (preview.updated) parts.push(`update ${preview.updated}`);
    if (preview.removed) parts.push(`remove ${preview.removed}`);
    return parts.length
      ? `Year ${preview.through_year}: would ${parts.join(', ')}.`
      : `Year ${preview.through_year}: no changes.`;
  }, [preview]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              Bill expenses for {preview?.through_year ?? '…'}
            </Text>
            <TouchableOpacity onPress={onCancel} accessibilityLabel="Cancel" disabled={applying}>
              <FontAwesome name="times" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={[styles.lead, { color: colors.text }]}>{summary}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Review the list below. Cancel leaves everything unchanged. Apply performs exactly
              these creates, updates, and removals. Paid expenses are never changed.
            </Text>

            {created.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.text }]}>
                  Create ({created.length})
                </Text>
                {created.map((item, idx) => (
                  <ItemLine
                    key={`c-${idx}-${item.expense_date}-${item.recurring_id}`}
                    item={item}
                    prefix="+"
                    color={colors.textSecondary}
                  />
                ))}
              </>
            ) : null}

            {updated.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.text }]}>
                  Update ({updated.length})
                </Text>
                {updated.map((item, idx) => (
                  <ItemLine
                    key={`u-${idx}-${item.expense_date}-${item.recurring_id}`}
                    item={item}
                    prefix="~"
                    color={colors.textSecondary}
                  />
                ))}
              </>
            ) : null}

            {removed.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.error || '#c0392b' }]}>
                  Remove ({removed.length})
                </Text>
                {removed.map((item, idx) => (
                  <ItemLine
                    key={`r-${idx}-${item.expense_date}-${item.recurring_id}`}
                    item={item}
                    prefix="−"
                    color={colors.error || '#c0392b'}
                  />
                ))}
              </>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.border }]}
              onPress={onCancel}
              disabled={applying}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: colors.primary, opacity: applying ? 0.6 : 1 },
              ]}
              onPress={onApply}
              disabled={applying}
            >
              {applying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.btnText, { color: '#fff' }]}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '700', flex: 1, paddingRight: 12 },
  body: { paddingHorizontal: 16, paddingTop: 12 },
  lead: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  meta: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
  section: { fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  line: { fontSize: 12, marginBottom: 4, lineHeight: 16 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnText: { fontSize: 15, fontWeight: '700' },
});
