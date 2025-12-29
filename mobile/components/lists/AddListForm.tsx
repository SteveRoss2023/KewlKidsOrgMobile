import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import ColorPicker from '../ColorPicker';
import ThemeAwarePicker from './ThemeAwarePicker';
import { List, ListType, CreateListData, UpdateListData } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';

interface AddListFormProps {
  editingList?: List | null;
  onSubmit: (data: CreateListData | UpdateListData) => void;
  onCancel: () => void;
  familyId: number;
  loading?: boolean;
  defaultListType?: ListType;
}

const LIST_TYPES: { label: string; value: ListType }[] = [
  { label: 'Shopping', value: 'shopping' },
  { label: 'Grocery', value: 'grocery' },
  { label: 'To-Do', value: 'todo' },
  { label: 'Ideas', value: 'ideas' },
  { label: 'Other', value: 'other' },
];

const DEFAULT_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7',
];

export default function AddListForm({
  editingList,
  onSubmit,
  onCancel,
  familyId,
  loading = false,
  defaultListType = 'shopping',
}: AddListFormProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [listType, setListType] = useState<ListType>(defaultListType);
  const [color, setColor] = useState('#10b981');

  useEffect(() => {
    if (editingList) {
      setName(editingList.name);
      setDescription(editingList.description || '');
      setListType(editingList.list_type);
      setColor(editingList.color);
    } else {
      // Reset form when creating new list
      setName('');
      setDescription('');
      setListType(defaultListType);
      setColor('#10b981');
    }
  }, [editingList, defaultListType]);

  const handleSubmit = () => {
    if (!name.trim()) {
      return;
    }

    if (editingList) {
      onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        list_type: listType,
        color,
      });
    } else {
      onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        list_type: listType,
        color,
        family: familyId,
      });
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.text }]}>List Name *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Grocery Shopping, Weekend Tasks"
          placeholderTextColor={colors.textSecondary}
          editable={!loading}
        />

        <Text style={[styles.label, { color: colors.text }]}>Description</Text>
        <TextInput
          style={[
            styles.textArea,
            { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional description"
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={3}
          editable={!loading}
        />

        <Text style={[styles.label, { color: colors.text }]}>Type</Text>
        <ThemeAwarePicker
          selectedValue={listType}
          onValueChange={(value) => setListType(value as ListType)}
          options={LIST_TYPES.map((type) => ({ label: type.label, value: type.value }))}
          placeholder="Select list type"
          enabled={!loading}
        />

        <Text style={[styles.label, { color: colors.text }]}>Color</Text>
        <ColorPicker value={color} onChange={setColor} colors={DEFAULT_COLORS} />

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton, { backgroundColor: colors.border }]}
            onPress={onCancel}
            disabled={loading}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              styles.submitButton,
              { backgroundColor: colors.primary },
              (!name.trim() || loading) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!name.trim() || loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? (editingList ? 'Updating...' : 'Creating...') : editingList ? 'Update List' : 'Create List'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
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
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    // Styled via backgroundColor
  },
  submitButton: {
    // Styled via backgroundColor
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

