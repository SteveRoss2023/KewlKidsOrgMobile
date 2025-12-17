import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import FamilyService from '../../../services/familyService';
import { APIError } from '../../../../services/api';
import { useTheme } from '../../../contexts/ThemeContext';

const COLORS = [
  '#10b981', // Emerald Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#84cc16', // Lime Green
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#a855f7', // Violet
];

export default function CreateFamilyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a family name');
      return;
    }

    try {
      setLoading(true);
      await FamilyService.createFamily({
        name: name.trim(),
        color: selectedColor,
      });
      // Navigate to families list page after successful creation
      router.replace('/(tabs)/families');
    } catch (error) {
      const apiError = error as APIError;
      Alert.alert('Error', apiError.message || 'Failed to create family');
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.form, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.text }]}>Family Name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder="Enter family name"
          placeholderTextColor={colors.textSecondary}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <Text style={[styles.label, { color: colors.text }]}>Color</Text>
        <View style={styles.colorPicker}>
          {COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorOption,
                { backgroundColor: color },
                selectedColor === color && { borderColor: colors.text },
              ]}
              onPress={() => setSelectedColor(color)}
            >
              {selectedColor === color && (
                <Text style={styles.checkmark}>âœ“</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.primary }, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create Family</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  form: {
    borderRadius: 12,
    padding: 20,
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
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    // Applied inline
  },
  checkmark: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  createButton: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
