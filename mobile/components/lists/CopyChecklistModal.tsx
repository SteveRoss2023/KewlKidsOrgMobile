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

interface CopyChecklistModalProps {
  visible: boolean;
  sourceListName: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}

export default function CopyChecklistModal({
  visible,
  sourceListName,
  saving,
  onCancel,
  onConfirm,
}: CopyChecklistModalProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) {
      setName(`Copy of ${sourceListName}`.trim() || 'Copy');
    }
  }, [visible, sourceListName]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
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
            <Text style={[styles.title, { color: colors.text }]}>Copy checklist</Text>
            <TouchableOpacity onPress={saving ? undefined : onCancel} accessibilityLabel="Close">
              <FontAwesome name="times" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Section dates will be set to today on the new list. You can edit them afterward.
          </Text>
          <Text style={[styles.label, { color: colors.text }]}>New list name</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="List name"
            placeholderTextColor={colors.textSecondary}
            editable={!saving}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            maxLength={200}
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
                (!name.trim() || saving) && styles.btnDisabled,
              ]}
              onPress={submit}
              disabled={!name.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Copy</Text>
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
