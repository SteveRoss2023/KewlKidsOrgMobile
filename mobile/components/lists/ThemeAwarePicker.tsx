import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface PickerOption {
  label: string;
  value: string | number | null;
}

interface ThemeAwarePickerProps {
  selectedValue: string | number | null;
  onValueChange: (value: string | number | null) => void;
  options: PickerOption[];
  placeholder?: string;
  enabled?: boolean;
}

export default function ThemeAwarePicker({
  selectedValue,
  onValueChange,
  options,
  placeholder = 'Select an option',
  enabled = true,
}: ThemeAwarePickerProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  // Convert options to dropdown picker format
  const items = options.map((option) => ({
    label: option.label,
    value: String(option.value ?? ''),
  }));

  // Use native HTML select on web - simple and clean
  if (Platform.OS === 'web') {
    return (
      <select
        value={selectedValue ?? ''}
        onChange={(e) => {
          const value = e.target.value;
          const option = options.find(opt => String(opt.value ?? '') === value);
          onValueChange(option ? option.value : null);
        }}
        disabled={!enabled}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.background,
          color: colors.text,
          fontSize: '16px',
          cursor: enabled ? 'pointer' : 'not-allowed',
          opacity: enabled ? 1 : 0.5,
          minHeight: '50px',
          outline: 'none',
        }}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={String(option.value ?? 'null')}
            value={String(option.value ?? '')}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  // Use react-native-dropdown-picker on mobile
  return (
    <View style={styles.container}>
      <DropDownPicker
        open={open}
        value={selectedValue ? String(selectedValue) : null}
        items={items}
        setOpen={setOpen}
        onSelectItem={(item) => {
          const option = options.find(opt => String(opt.value ?? '') === String(item.value ?? ''));
          onValueChange(option ? option.value : null);
        }}
        placeholder={placeholder}
        disabled={!enabled}
        listMode="FLATLIST"
        dropDownDirection="AUTO"
        style={[
          styles.dropdown,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            minHeight: 50,
          },
        ]}
        textStyle={{
          color: colors.text,
          fontSize: 16,
        }}
        placeholderStyle={{
          color: colors.textSecondary,
        }}
        dropDownContainerStyle={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          maxHeight: 200,
          zIndex: 1000,
          elevation: 5, // Android shadow
        }}
        selectedItemLabelStyle={{
          color: colors.text,
        }}
        itemSeparatorStyle={{
          backgroundColor: colors.border,
        }}
        listItemLabelStyle={{
          color: colors.text,
        }}
        ArrowUpIconComponent={() => <FontAwesome name="chevron-up" size={16} color={colors.textSecondary} />}
        ArrowDownIconComponent={() => <FontAwesome name="chevron-down" size={16} color={colors.textSecondary} />}
        TickIconComponent={() => <FontAwesome name="check" size={16} color={colors.primary} />}
        CloseIconComponent={() => <FontAwesome name="times" size={16} color={colors.textSecondary} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 8,
  },
});
