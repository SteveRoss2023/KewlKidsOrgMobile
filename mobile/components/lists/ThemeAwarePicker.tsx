import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native';
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
  const [modalVisible, setModalVisible] = useState(false);

  const selectedOption = options.find((opt) => opt.value === selectedValue);

  const handleSelect = (value: string | number | null) => {
    onValueChange(value);
    setModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.pickerButton,
          { 
            backgroundColor: colors.background, 
            borderColor: colors.border,
            opacity: enabled ? 1 : 0.5,
          },
        ]}
        onPress={() => enabled && setModalVisible(true)}
        disabled={!enabled}
      >
        <Text style={[styles.pickerText, { color: selectedOption ? colors.text : colors.textSecondary }]}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <FontAwesome name="chevron-down" size={14} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Option</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <FontAwesome name="times" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value ?? 'null')}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    { 
                      backgroundColor: item.value === selectedValue ? `${colors.primary}20` : 'transparent',
                      borderBottomColor: colors.border,
                    },
                  ]}
                  onPress={() => handleSelect(item.value)}
                >
                  <Text style={[styles.optionText, { color: colors.text }]}>
                    {item.label}
                  </Text>
                  {item.value === selectedValue && (
                    <FontAwesome name="check" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 50,
  },
  pickerText: {
    fontSize: 16,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 16,
    flex: 1,
  },
});



