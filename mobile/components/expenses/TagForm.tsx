import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ExpenseTag, CreateExpenseTagData, UpdateExpenseTagData } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import ColorPicker from '../ColorPicker';

interface TagFormProps {
  visible: boolean;
  tag?: ExpenseTag | null;
  familyId: number;
  onSubmit: (data: CreateExpenseTagData | UpdateExpenseTagData) => void;
  onCancel: () => void;
  loading?: boolean;
}

const DEFAULT_TAG_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#f43f5e', '#94a3b8',
];

export default function TagForm({
  visible,
  tag,
  familyId,
  onSubmit,
  onCancel,
  loading = false,
}: TagFormProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [tagColor, setTagColor] = useState('#3b82f6');

  useEffect(() => {
    if (!visible) {
      setName('');
      setTagColor('#3b82f6');
      return;
    }

    if (tag) {
      setName(tag.name);
      setTagColor(tag.color || '#3b82f6');
    } else {
      setName('');
      setTagColor('#3b82f6');
    }
  }, [tag, visible]);

  const handleSubmit = () => {
    if (!name.trim()) {
      return;
    }

    if (tag) {
      onSubmit({
        name: name.trim(),
        color: tagColor || null,
      });
    } else {
      onSubmit({
        family: familyId,
        name: name.trim(),
        color: tagColor || null,
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {tag ? 'Edit Tag' : 'Add Tag'}
            </Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
              <FontAwesome name="times" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Business, Personal, Tax Deductible"
                placeholderTextColor={colors.textSecondary}
                editable={!loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Color</Text>
              <ColorPicker
                value={tagColor}
                onChange={setTagColor}
                colors={DEFAULT_TAG_COLORS}
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
              style={[styles.submitButton, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
              disabled={loading || !name.trim()}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Saving...' : tag ? 'Update' : 'Add'}
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
});
