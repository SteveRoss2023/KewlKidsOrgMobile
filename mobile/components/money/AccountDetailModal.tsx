import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { AccountSnapshot, AccountType, MoneyAccount } from '../../types/money';
import { formatCurrency } from '../../utils/moneyInput';
import { withDemoBalance } from '../../utils/moneyDemoPortfolio';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  rrsp: 'RRSP',
  tfsa: 'TFSA',
  non_reg: 'Non-registered',
  cash: 'Cash / savings',
  other: 'Other',
};

interface AccountDetailModalProps {
  visible: boolean;
  account: MoneyAccount | null;
  snapshots: AccountSnapshot[];
  showAmounts: boolean;
  demoPortfolio?: boolean;
  onClose: () => void;
  onUpdateBalance: (account: MoneyAccount) => void;
  onEditSnapshot: (account: MoneyAccount, snapshot: AccountSnapshot) => void;
  onEdit: (account: MoneyAccount) => void;
  onDelete: (account: MoneyAccount) => void;
}

function formatShortDate(ymd: string): string {
  try {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return ymd;
  }
}

export default function AccountDetailModal({
  visible,
  account,
  snapshots,
  showAmounts,
  demoPortfolio = false,
  onClose,
  onUpdateBalance,
  onEditSnapshot,
  onEdit,
  onDelete,
}: AccountDetailModalProps) {
  const { colors } = useTheme();

  const history = useMemo(() => {
    if (!account) return [];
    return snapshots
      .filter((s) => s.account === account.id)
      .sort((a, b) => b.as_of_date.localeCompare(a.as_of_date));
  }, [snapshots, account]);

  const displayMoney = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return '—';
    if (!showAmounts) return '*****';
    const boosted = account
      ? withDemoBalance(value, account.account_type, demoPortfolio)
      : value;
    return formatCurrency(boosted);
  };

  if (!account) return null;

  const typeLabel = ACCOUNT_TYPE_LABELS[account.account_type] || account.account_type;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {account.name}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {[
                  account.institution?.trim() || null,
                  typeLabel,
                  account.latest_as_of
                    ? `latest ${formatShortDate(account.latest_as_of)}`
                    : 'no balance yet',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <FontAwesome name="times" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                Current balance
              </Text>
              <Text style={[styles.balanceValue, { color: colors.primary }]}>
                {displayMoney(account.latest_balance)}
              </Text>
              {demoPortfolio ? (
                <Text style={[styles.demoNote, { color: colors.textSecondary }]}>
                  Includes personal demo overlay (display only)
                </Text>
              ) : null}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => onUpdateBalance(account)}
              >
                <FontAwesome name="plus" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>Update balance</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: colors.border }]}
                onPress={() => onEdit(account)}
              >
                <FontAwesome name="pencil" size={14} color={colors.primary} />
                <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: colors.border }]}
                onPress={() => onDelete(account)}
              >
                <FontAwesome name="trash" size={14} color={colors.error || '#ef4444'} />
                <Text style={[styles.actionBtnOutlineText, { color: colors.error || '#ef4444' }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Balance history ({history.length})
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Tap a row to change the amount or the as-of date. Used for YTD and year-end targets.
            </Text>
            {history.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 8 }]}>
                No snapshots yet. Use Update balances on the Accounts tab.
              </Text>
            ) : (
              history.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.histRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => onEditSnapshot(account, s)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit balance for ${formatShortDate(s.as_of_date)}`}
                >
                  <Text style={{ color: colors.text, flex: 1 }}>{formatShortDate(s.as_of_date)}</Text>
                  <Text style={[styles.histAmt, { color: colors.text }]}>
                    {displayMoney(s.balance)}
                  </Text>
                  <FontAwesome
                    name="pencil"
                    size={12}
                    color={colors.textSecondary}
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  flex: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  balanceCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 16,
    alignItems: 'flex-start',
  },
  balanceLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  balanceValue: { fontSize: 28, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  demoNote: { fontSize: 11, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtnOutlineText: { fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  hint: { fontSize: 12, lineHeight: 17 },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  histAmt: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
