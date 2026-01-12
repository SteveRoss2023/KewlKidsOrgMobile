import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import DateTimePicker from '@react-native-community/datetimepicker';

interface ThemeAwareDatePickerProps {
  value: string; // YYYY-MM-DD format
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
}

export default function ThemeAwareDatePicker({
  value,
  onChange,
  label,
  placeholder = 'Select date',
  minimumDate,
  maximumDate,
  disabled = false,
}: ThemeAwareDatePickerProps) {
  const { colors, theme } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  const dateValue = value ? new Date(value + 'T00:00:00') : new Date();

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (selectedDate) {
      onChange(formatDate(selectedDate));
    }
  };

  const displayValue = value || placeholder;
  const isPlaceholder = !value;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {label && (
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        )}
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="web-date-input"
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.background,
            color: colors.text,
            fontSize: '16px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            minHeight: '50px',
            outline: 'none',
          }}
        />
        <style>{`
          .web-date-input::-webkit-calendar-picker-indicator {
            filter: ${theme === 'dark' ? 'invert(1) brightness(1.5)' : 'invert(0)'};
            cursor: pointer;
            opacity: ${disabled ? '0.5' : '1'};
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
    );
  }

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      )}
      <TouchableOpacity
        style={[
          styles.dateButton,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
          disabled && styles.disabled,
        ]}
        onPress={() => !disabled && setShowPicker(true)}
        disabled={disabled}
      >
        <FontAwesome name="calendar" size={16} color={colors.textSecondary} />
        <Text
          style={[
            styles.dateText,
            { color: isPlaceholder ? colors.textSecondary : colors.text },
          ]}
        >
          {displayValue}
        </Text>
        <FontAwesome name="chevron-down" size={14} color={colors.textSecondary} />
      </TouchableOpacity>

      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          textColor={colors.text}
          themeVariant={theme === 'dark' ? 'dark' : 'light'}
        />
      )}

      {Platform.OS === 'ios' && showPicker && (
        <>
          <DateTimePicker
            value={dateValue}
            mode="date"
            display="spinner"
            onChange={handleDateChange}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            textColor={colors.text}
            themeVariant={theme === 'dark' ? 'dark' : 'light'}
          />
          <View style={[styles.iosPickerContainer, { backgroundColor: colors.surface }]}>
            <View style={styles.iosPickerActions}>
              <TouchableOpacity
                onPress={() => setShowPicker(false)}
                style={[styles.iosPickerButton, { backgroundColor: colors.border }]}
              >
                <Text style={[styles.iosPickerButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowPicker(false)}
                style={[styles.iosPickerButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.iosPickerButtonTextWhite}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  dateText: {
    flex: 1,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.5,
  },
  iosPickerContainer: {
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  iosPickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  iosPickerButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  iosPickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  iosPickerButtonTextWhite: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
