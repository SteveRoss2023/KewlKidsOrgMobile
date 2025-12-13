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

  // Use native select on web for better UX
  if (Platform.OS === 'web') {
    return (
      <select
        value={selectedValue ?? ''}
        onChange={(e) => {
          e.stopPropagation();
          const value = e.target.value;
          const option = options.find(opt => String(opt.value ?? '') === value);
          onValueChange(option ? option.value : null);
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        disabled={!enabled}
        style={{
          flex: 1,
          padding: '12px',
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.background,
          color: colors.text,
          fontSize: '16px',
          cursor: enabled ? 'pointer' : 'not-allowed',
          opacity: enabled ? 1 : 0.5,
          minHeight: '50px',
        }}
      >
        {options.map((option) => (
          <option
            key={String(option.value ?? 'null')}
            value={String(option.value ?? '')}
            style={{
              backgroundColor: colors.surface,
              color: colors.text,
            }}
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
          zIndex: Platform.OS === 'web' ? 2000 : 50,
          elevation: Platform.OS === 'android' ? 2 : undefined,
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
        zIndex={Platform.OS === 'web' ? 3000 : 100}
        zIndexInverse={Platform.OS === 'web' ? 1000 : 1}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    zIndex: Platform.OS === 'web' ? 3000 : 100,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 8,
  },
});
