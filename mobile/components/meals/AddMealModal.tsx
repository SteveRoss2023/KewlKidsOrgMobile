import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { Recipe } from '../../services/mealsService';
import ThemeAwarePicker from '../lists/ThemeAwarePicker';

interface AddMealModalProps {
  visible: boolean;
  recipes: Recipe[];
  onClose: () => void;
  onAdd: (meal: number | string) => void;
  loading?: boolean;
}

export default function AddMealModal({
  visible,
  recipes,
  onClose,
  onAdd,
  loading = false,
}: AddMealModalProps) {
  const { colors } = useTheme();
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [customMeal, setCustomMeal] = useState('');
  const [mode, setMode] = useState<'recipe' | 'custom'>('recipe');

  const handleAdd = () => {
    if (mode === 'recipe' && selectedRecipeId) {
      onAdd(parseInt(selectedRecipeId, 10));
    } else if (mode === 'custom' && customMeal.trim()) {
      onAdd(customMeal.trim());
    }
  };

  const handleClose = () => {
    setSelectedRecipeId('');
    setCustomMeal('');
    setMode('recipe');
    onClose();
  };

  const canAdd = mode === 'recipe' ? !!selectedRecipeId : !!customMeal.trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Add Meal</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <FontAwesome name="times" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.modeSelector}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  mode === 'recipe' && { backgroundColor: colors.primary },
                  { borderColor: colors.border },
                ]}
                onPress={() => setMode('recipe')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    { color: mode === 'recipe' ? '#fff' : colors.text },
                  ]}
                >
                  Recipe
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  mode === 'custom' && { backgroundColor: colors.primary },
                  { borderColor: colors.border },
                ]}
                onPress={() => setMode('custom')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    { color: mode === 'custom' ? '#fff' : colors.text },
                  ]}
                >
                  Custom Meal
                </Text>
              </TouchableOpacity>
            </View>

            {mode === 'recipe' ? (
              <View style={styles.recipeSection}>
                <Text style={[styles.label, { color: colors.text }]}>Select Recipe</Text>
                <ThemeAwarePicker
                  selectedValue={selectedRecipeId}
                  onValueChange={setSelectedRecipeId}
                  options={[
                    { label: 'Select a recipe...', value: '' },
                    ...recipes.map(recipe => ({ label: recipe.title, value: recipe.id.toString() })),
                  ]}
                  placeholder="Select a recipe..."
                />
              </View>
            ) : (
              <View style={styles.customSection}>
                <Text style={[styles.label, { color: colors.text }]}>Meal Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                  ]}
                  value={customMeal}
                  onChangeText={setCustomMeal}
                  placeholder="Enter meal name..."
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.addButton,
                { backgroundColor: colors.primary },
                (!canAdd || loading) && styles.addButtonDisabled,
              ]}
              onPress={handleAdd}
              disabled={!canAdd || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <FontAwesome name="plus" size={16} color="#fff" />
                  <Text style={styles.addButtonText}>Add Meal</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  recipeSection: {
    marginBottom: 24,
  },
  customSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 50,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});




