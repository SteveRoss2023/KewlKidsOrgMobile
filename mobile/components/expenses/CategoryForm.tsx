import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ExpenseCategory, CreateExpenseCategoryData, UpdateExpenseCategoryData } from '../../types/expenses';
import { useTheme } from '../../contexts/ThemeContext';
import ColorPicker from '../ColorPicker';
import IconPicker from '../IconPicker';

interface CategoryFormProps {
  visible: boolean;
  category?: ExpenseCategory | null;
  familyId: number;
  onSubmit: (data: CreateExpenseCategoryData | UpdateExpenseCategoryData) => void;
  onCancel: () => void;
  loading?: boolean;
}

const DEFAULT_COLORS = [
  '#f97316', '#3b82f6', '#eab308', '#8b5cf6', '#ec4899', '#ef4444',
  '#06b6d4', '#10b981', '#f59e0b', '#6366f1', '#f43f5e', '#94a3b8',
];

export default function CategoryForm({
  visible,
  category,
  familyId,
  onSubmit,
  onCancel,
  loading = false,
}: CategoryFormProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('#3b82f6');

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description || '');
      setIcon(category.icon || '');
      setColor(category.color);
    } else {
      setName('');
      setDescription('');
      setIcon('');
      setColor('#3b82f6');
    }
  }, [category]);

  const handleSubmit = () => {
    // Validate required fields
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter a category name');
      return;
    }

    if (category) {
      onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon || undefined,
        color,
      });
    } else {
      onSubmit({
        family: familyId,
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon || undefined,
        color,
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {category ? 'Edit Category' : 'Add Category'}
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
                placeholder="e.g., Food & Dining, Transportation"
                placeholderTextColor={colors.textSecondary}
                editable={!loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
                editable={!loading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Icon</Text>
              <IconPicker
                selectedIcon={icon}
                onIconSelect={setIcon}
                colors={colors}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Color</Text>
              <ColorPicker
                value={color}
                onChange={setColor}
                colors={DEFAULT_COLORS}
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
                  opacity: (loading || !name.trim()) ? 0.5 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading || !name.trim()}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Saving...' : category ? 'Update' : 'Add'}
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
    minHeight: 80,
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
});
