import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import ThemeAwarePicker from './ThemeAwarePicker';
import { ListItem, CreateListItemData, UpdateListItemData, GroceryCategory } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';

interface AddItemFormProps {
  editingItem?: ListItem | null;
  onSubmit: (data: CreateListItemData | UpdateListItemData) => void;
  onCancel: () => void;
  listId: number;
  categories?: GroceryCategory[];
  isGroceryList?: boolean;
  isShoppingList?: boolean;
  isTodoList?: boolean;
  loading?: boolean;
}

export default function AddItemForm({
  editingItem,
  onSubmit,
  onCancel,
  listId,
  categories = [],
  isGroceryList = false,
  isShoppingList = false,
  isTodoList = false,
  loading = false,
}: AddItemFormProps) {
  const { colors, theme } = useTheme();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setNotes(editingItem.notes || '');
      setQuantity(editingItem.quantity || '');
      setCategory(editingItem.category);
      setDueDate(editingItem.due_date ? new Date(editingItem.due_date) : null);
    } else if (isTodoList && !editingItem) {
      // Set default due date to today for new todo items
      setDueDate(new Date());
    }
    // Only reset when editingItem changes, not on every render
  }, [editingItem?.id, isTodoList]);

  const handleSubmit = () => {
    console.log('AddItemForm handleSubmit called, name:', name);
    if (!name.trim()) {
      console.log('Name is empty, not submitting');
      return;
    }

    const data: any = {
      name: name.trim(),
    };

    if (notes.trim()) {
      data.notes = notes.trim();
    }
    if (quantity.trim()) {
      data.quantity = quantity.trim();
    }
    if (isGroceryList) {
      data.category = category;
    }
    if (isTodoList && dueDate) {
      data.due_date = dueDate.toISOString().split('T')[0];
      console.log('Setting due_date for todo list:', data.due_date);
    }

    if (editingItem) {
      console.log('Updating item with data:', data);
      onSubmit(data);
      // Don't reset form on update - let parent close modal immediately
    } else {
      data.list = listId;
      console.log('Creating item with data:', data);
      onSubmit(data);
      // Reset form after create
      setName('');
      setNotes('');
      setQuantity('');
      setCategory(null);
      setDueDate(isTodoList ? new Date() : null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.text }]}>Item Name *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
          value={name}
          onChangeText={setName}
          placeholder="Item name"
          placeholderTextColor={colors.textSecondary}
          editable={!loading}
          autoFocus={!editingItem}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        {isGroceryList && categories.length > 0 && (
          <>
            <Text style={[styles.label, { color: colors.text }]}>Category</Text>
            <ThemeAwarePicker
              selectedValue={category}
              onValueChange={(value) => setCategory(value as number | null)}
              options={[
                { label: 'Uncategorized', value: null },
                ...categories.map((cat) => ({ label: cat.name, value: cat.id })),
              ]}
              placeholder="Select category"
              enabled={!loading}
            />
          </>
        )}

        {(isGroceryList || isShoppingList) && (
          <>
            <Text style={[styles.label, { color: colors.text }]}>Quantity</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="Optional quantity"
              placeholderTextColor={colors.textSecondary}
              editable={!loading}
            />
          </>
        )}

        {isTodoList && (
          <>
            <Text style={[styles.label, { color: colors.text }]}>Due Date</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.webDateInputContainer}>
                {/* @ts-ignore - web-specific HTML input */}
                <input
                  type="date"
                  value={dueDate ? dueDate.toISOString().split('T')[0] : ''}
                  onChange={(e: any) => {
                    if (e.target.value) {
                      setDueDate(new Date(e.target.value));
                    } else {
                      setDueDate(null);
                    }
                  }}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: 12,
                    fontSize: 16,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    borderStyle: 'solid',
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                  // @ts-ignore - web-specific CSS
                  className="web-date-input"
                />
                <style>{`
                  .web-date-input::-webkit-calendar-picker-indicator {
                    filter: ${theme === 'dark' ? 'invert(1) brightness(1.5)' : 'invert(0)'};
                    cursor: pointer;
                    opacity: ${loading ? '0.5' : '1'};
                    width: 20px;
                    height: 20px;
                    padding: 4px;
                  }
                  .web-date-input::-webkit-inner-spin-button,
                  .web-date-input::-webkit-outer-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                  }
                  .web-date-input::-webkit-datetime-edit-text {
                    color: ${colors.text};
                  }
                  .web-date-input::-webkit-datetime-edit-month-field,
                  .web-date-input::-webkit-datetime-edit-day-field,
                  .web-date-input::-webkit-datetime-edit-year-field {
                    color: ${colors.text};
                  }
                `}</style>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.dateButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setShowDatePicker(true)}
                  disabled={loading}
                >
                  <FontAwesome name="calendar" size={16} color={colors.textSecondary} style={styles.dateIcon} />
                  <Text style={[styles.dateText, { color: colors.text }]}>
                    {dueDate ? dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select date'}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <View style={[styles.datePickerContainer, { backgroundColor: colors.surface }]}>
                    <DateTimePicker
                      value={dueDate || new Date()}
                      mode="date"
                      display="default"
                      textColor={colors.text}
                      accentColor={colors.primary}
                      themeVariant={theme === 'dark' ? 'dark' : 'light'}
                      onChange={(event, selectedDate) => {
                        if (event.type === 'set' && selectedDate) {
                          setDueDate(selectedDate);
                        }
                        setShowDatePicker(false);
                      }}
                    />
                  </View>
                )}
              </>
            )}
          </>
        )}

        <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
        <TextInput
          style={[
            styles.textArea,
            { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
          ]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes"
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={3}
          editable={!loading}
        />

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
              {loading ? (editingItem ? 'Saving...' : 'Adding...') : editingItem ? 'Save' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
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
  dateButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateIcon: {
    marginRight: 4,
  },
  dateText: {
    fontSize: 16,
    flex: 1,
  },
  webDateInputContainer: {
    width: '100%',
  },
  datePickerContainer: {
    overflow: 'hidden',
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    padding: 8,
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

