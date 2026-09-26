import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface EmailChecklistModalProps {
  visible: boolean;
  listName: string;
  defaultEmail: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (email: string) => void;
}

function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  // Practical client-side check; server validates with Django
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export default function EmailChecklistModal({
  visible,
  listName,
  defaultEmail,
  saving,
  onCancel,
  onConfirm,
}: EmailChecklistModalProps) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (visible) {
      setEmail((defaultEmail || '').trim());
    }
  }, [visible, defaultEmail]);

  const valid = looksLikeEmail(email);

  const submit = () => {
    const trimmed = email.trim();
    if (!looksLikeEmail(trimmed)) return;
    onConfirm(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onCancel}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.centerArea}>
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={saving ? undefined : onCancel}
            accessibilityLabel="Dismiss"
          />
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.text }]}>Email checklist</Text>
              <TouchableOpacity onPress={saving ? undefined : onCancel} accessibilityLabel="Close">
                <FontAwesome name="times" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Send a professional HTML copy of “{listName}” with completed and incomplete items.
            </Text>
            <Text style={[styles.label, { color: colors.text }]}>To</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor={colors.textSecondary}
              editable={!saving}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={submit}
              maxLength={254}
              selectTextOnFocus
              {...(Platform.OS === 'web' ? { outlineStyle: 'none' as const } : {})}
            />
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, { borderColor: colors.border }]}
                onPress={onCancel}
                disabled={saving}
              >
                <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  { backgroundColor: colors.primary },
                  (!valid || saving) && styles.btnDisabled,
                ]}
                onPress={submit}
                disabled={!valid || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  centerArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    zIndex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnSecondary: {
    borderWidth: 1,
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  btnPrimary: {},
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
