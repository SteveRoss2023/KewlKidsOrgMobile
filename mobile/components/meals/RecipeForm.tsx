import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import MealsService, { CreateRecipeData } from '../../services/mealsService';

interface RecipeFormProps {
  selectedFamily: { id: number; name: string };
  onClose: () => void;
  onSuccess: () => void;
  recipe?: any; // For editing, not implemented yet
}

export default function RecipeForm({ selectedFamily, onClose, onSuccess, recipe }: RecipeFormProps) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(recipe?.title || '');
  const [servings, setServings] = useState(recipe?.servings?.toString() || '');
  const [prepTime, setPrepTime] = useState(recipe?.prep_time_minutes?.toString() || '');
  const [cookTime, setCookTime] = useState(recipe?.cook_time_minutes?.toString() || '');
  const [imageUrl, setImageUrl] = useState(recipe?.image_url || '');
  const [sourceUrl, setSourceUrl] = useState(recipe?.source_url || '');
  const [notes, setNotes] = useState(recipe?.notes || '');
  const [ingredients, setIngredients] = useState<string[]>(recipe?.ingredients || ['']);
  const [instructions, setInstructions] = useState<string[]>(recipe?.instructions || ['']);
  const [creating, setCreating] = useState(false);

  const addIngredient = () => {
    setIngredients([...ingredients, '']);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = value;
    setIngredients(newIngredients);
  };

  const addInstruction = () => {
    setInstructions([...instructions, '']);
  };

  const removeInstruction = (index: number) => {
    setInstructions(instructions.filter((_, i) => i !== index));
  };

  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...instructions];
    newInstructions[index] = value;
    setInstructions(newInstructions);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      return;
    }

    const filteredIngredients = ingredients.filter(i => i.trim());
    const filteredInstructions = instructions.filter(i => i.trim());

    if (filteredIngredients.length === 0 || filteredInstructions.length === 0) {
      return;
    }

    setCreating(true);
    try {
      const data: CreateRecipeData = {
        family: selectedFamily.id,
        title: title.trim(),
        ingredients: filteredIngredients,
        instructions: filteredInstructions,
        servings: servings ? parseInt(servings, 10) : undefined,
        prep_time_minutes: prepTime ? parseInt(prepTime, 10) : undefined,
        cook_time_minutes: cookTime ? parseInt(cookTime, 10) : undefined,
        image_url: imageUrl.trim() || undefined,
        source_url: sourceUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      await MealsService.createRecipe(data);
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating recipe:', err);
      // Error handling would go here
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <FontAwesome name="times" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Create Recipe</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={creating || !title.trim()}
            style={[styles.saveButton, { opacity: creating || !title.trim() ? 0.5 : 1 }]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.saveButtonText, { color: colors.primary }]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Recipe title"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, styles.halfField]}>
              <Text style={[styles.label, { color: colors.text }]}>Servings</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                value={servings}
                onChangeText={setServings}
                placeholder="4"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.field, styles.halfField]}>
              <Text style={[styles.label, { color: colors.text }]}>Prep Time (min)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                value={prepTime}
                onChangeText={setPrepTime}
                placeholder="15"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Cook Time (min)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={cookTime}
              onChangeText={setCookTime}
              placeholder="30"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Image URL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Source URL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, { color: colors.text }]}>Ingredients *</Text>
              <TouchableOpacity onPress={addIngredient} style={styles.addButton}>
                <FontAwesome name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addButtonText, { color: colors.primary }]}>Add</Text>
              </TouchableOpacity>
            </View>
            {ingredients.map((ingredient, index) => (
              <View key={index} style={styles.listItem}>
                <TextInput
                  style={[styles.input, styles.listInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={ingredient}
                  onChangeText={(value) => updateIngredient(index, value)}
                  placeholder={`Ingredient ${index + 1}`}
                  placeholderTextColor={colors.textSecondary}
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity onPress={() => removeIngredient(index)} style={styles.removeButton}>
                    <FontAwesome name="trash" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View style={styles.field}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, { color: colors.text }]}>Instructions *</Text>
              <TouchableOpacity onPress={addInstruction} style={styles.addButton}>
                <FontAwesome name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addButtonText, { color: colors.primary }]}>Add</Text>
              </TouchableOpacity>
            </View>
            {instructions.map((instruction, index) => (
              <View key={index} style={styles.listItem}>
                <TextInput
                  style={[styles.input, styles.listInput, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={instruction}
                  onChangeText={(value) => updateInstruction(index, value)}
                  placeholder={`Step ${index + 1}`}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
                {instructions.length > 1 && (
                  <TouchableOpacity onPress={() => removeInstruction(index)} style={styles.removeButton}>
                    <FontAwesome name="trash" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    padding: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  field: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  listInput: {
    flex: 1,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  removeButton: {
    padding: 8,
    marginTop: 2,
  },
});
