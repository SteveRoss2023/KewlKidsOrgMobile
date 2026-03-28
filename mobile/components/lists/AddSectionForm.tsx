import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../contexts/ThemeContext';
import { formatLocalISODate } from '../../utils/sectionSort';

function startOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

interface AddSectionFormProps {
  onSubmit: (data: { title: string; section_date: string }) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function AddSectionForm({ onSubmit, onCancel, loading = false }: AddSectionFormProps) {
  const { colors, theme } = useTheme();
  const [title, setTitle] = useState('');
  const [sectionDate, setSectionDate] = useState(() => startOfLocalDay());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({ title: trimmed, section_date: formatLocalISODate(sectionDate) });
    setTitle('');
    setSectionDate(startOfLocalDay());
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.text }]}>Section name *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
          value={title}
          onChangeText={setTitle}
          placeholder="Section name"
          placeholderTextColor={colors.textSecondary}
          editable={!loading}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <Text style={[styles.label, { color: colors.text }]}>Section date</Text>
        {Platform.OS === 'web' ? (
          <View style={styles.webDateInputContainer}>
            {/* @ts-ignore - web-specific HTML input */}
            <input
              type="date"
              value={formatLocalISODate(sectionDate)}
              onChange={(e: { target: { value: string } }) => {
                if (e.target.value) {
                  setSectionDate(new Date(e.target.value));
                }
              }}
              disabled={loading}
              style={{
                width: '100%',
                padding: 12,
                fontSize: 16,
                backgroundColor: colors.background,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                borderStyle: 'solid',
                fontFamily: 'inherit',
                outline: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box',
              }}
              className="add-section-web-date"
            />
            <style>{`
              .add-section-web-date::-webkit-calendar-picker-indicator {
                filter: ${theme === 'dark' ? 'invert(1) brightness(1.5)' : 'invert(0)'};
                cursor: pointer;
                opacity: ${loading ? '0.5' : '1'};
                width: 20px;
                height: 20px;
                padding: 4px;
              }
              .add-section-web-date::-webkit-datetime-edit-text { color: ${colors.text}; }
              .add-section-web-date::-webkit-datetime-edit-month-field,
              .add-section-web-date::-webkit-datetime-edit-day-field,
              .add-section-web-date::-webkit-datetime-edit-year-field { color: ${colors.text}; }
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
                {sectionDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <View style={[styles.datePickerContainer, { backgroundColor: colors.surface }]}>
                <DateTimePicker
                  value={sectionDate}
                  mode="date"
                  display="default"
                  textColor={colors.text}
                  accentColor={colors.primary}
                  themeVariant={theme === 'dark' ? 'dark' : 'light'}
                  onChange={(event, selectedDate) => {
                    if (event.type === 'set' && selectedDate) {
                      setSectionDate(startOfLocalDay(selectedDate));
                    }
                    setShowDatePicker(false);
                  }}
                />
              </View>
            )}
          </>
        )}

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
              (!title.trim() || loading) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!title.trim() || loading}
          >
            <Text style={styles.submitButtonText}>{loading ? 'Adding…' : 'Add'}</Text>
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
  webDateInputContainer: {
    width: '100%',
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
  cancelButton: {},
  submitButton: {},
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
