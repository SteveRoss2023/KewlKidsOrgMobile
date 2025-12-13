import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import MealsService, { Recipe } from '../../services/mealsService';
import { List } from '../../types/lists';
import ThemeAwarePicker from '../lists/ThemeAwarePicker';

interface RecipeDetailProps {
  recipe: Recipe;
  shoppingLists: List[];
  onClose: () => void;
  onAddToList: (recipeId: number, listId: number, recipeTitle?: string) => void;
  onDelete: (recipeId: number, recipeTitle: string) => void;
}

export default function RecipeDetail({
  recipe,
  shoppingLists,
  onClose,
  onAddToList,
  onDelete,
}: RecipeDetailProps) {
  const { colors } = useTheme();
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [addingToList, setAddingToList] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    // Reset image error and set image URI when recipe changes
    setImageError(false);
    if (recipe.image_url && recipe.image_url.trim()) {
      const url = normalizeImageUrl(recipe.image_url);
      setImageUri(url);
    } else {
      setImageUri(null);
    }
  }, [recipe.image_url]);

  const normalizeImageUrl = (url: string): string => {
    if (!url) return url;
    let normalized = url.trim();
    // Convert HTTP to HTTPS for better mobile compatibility
    if (normalized.startsWith('http://')) {
      normalized = normalized.replace('http://', 'https://');
    }
    return normalized;
  };

  const handleAddToList = async () => {
    if (!selectedListId) return;

    setAddingToList(true);
    try {
      await onAddToList(recipe.id, parseInt(selectedListId, 10), recipe.title);
      setSelectedListId('');
    } catch (err) {
      // Error handled by parent
    } finally {
      setAddingToList(false);
    }
  };

  const openURL = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Failed to open URL:', err));
  };

  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <FontAwesome name="times" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Recipe Details</Text>
          <TouchableOpacity
            onPress={() => onDelete(recipe.id, recipe.title)}
            style={styles.deleteButton}
          >
            <FontAwesome name="trash" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {imageUri && !imageError ? (
            <Image 
              source={{ uri: imageUri }} 
              style={styles.image} 
              resizeMode="cover"
              onError={(error) => {
                const errorMessage = error.nativeEvent?.error || 'Unknown error';
                console.log('Image failed to load in detail view:', imageUri);
                console.log('Error details:', errorMessage);
                setImageError(true);
              }}
              onLoadStart={() => {
                // Reset error state when starting to load a new image
                if (imageError) {
                  setImageError(false);
                }
              }}
            />
          ) : null}

          <View style={styles.section}>
            <Text style={[styles.title, { color: colors.text }]}>{recipe.title}</Text>

            <View style={styles.metaRow}>
              {recipe.servings && (
                <View style={styles.metaItem}>
                  <FontAwesome name="users" size={16} color={colors.textSecondary} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    Serves {recipe.servings}
                  </Text>
                </View>
              )}
              {recipe.prep_time_minutes && (
                <View style={styles.metaItem}>
                  <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    {recipe.prep_time_minutes}m prep
                  </Text>
                </View>
              )}
              {recipe.cook_time_minutes && (
                <View style={styles.metaItem}>
                  <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    {recipe.cook_time_minutes}m cook
                  </Text>
                </View>
              )}
            </View>

            {(recipe.image_url || recipe.source_url) && (
              <View style={styles.urlRow}>
                {recipe.image_url && (
                  <TouchableOpacity
                    style={[styles.urlButton, { borderColor: colors.border }]}
                    onPress={() => openURL(recipe.image_url!)}
                  >
                    <FontAwesome name="image" size={14} color={colors.primary} />
                    <Text style={[styles.urlText, { color: colors.primary }]}>View Image</Text>
                  </TouchableOpacity>
                )}
                {recipe.source_url && (
                  <TouchableOpacity
                    style={[styles.urlButton, { borderColor: colors.border }]}
                    onPress={() => openURL(recipe.source_url!)}
                  >
                    <FontAwesome name="external-link" size={14} color={colors.primary} />
                    <Text style={[styles.urlText, { color: colors.primary }]}>Source</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ingredients</Text>
              {recipe.ingredients.map((ingredient, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
                  <Text style={[styles.listItemText, { color: colors.text }]}>{ingredient}</Text>
                </View>
              ))}
            </View>
          )}

          {recipe.instructions && recipe.instructions.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Instructions</Text>
              {recipe.instructions.map((instruction, index) => (
                <View key={index} style={styles.instructionItem}>
                  <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={[styles.instructionText, { color: colors.text }]}>{instruction}</Text>
                </View>
              ))}
            </View>
          )}

          {recipe.notes && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
              <Text style={[styles.notesText, { color: colors.text }]}>{recipe.notes}</Text>
            </View>
          )}

          {shoppingLists.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Add to Shopping List</Text>
              <View style={styles.addToListContainer}>
                <ThemeAwarePicker
                  selectedValue={selectedListId}
                  onValueChange={setSelectedListId}
                  options={[
                    { label: 'Select a list...', value: '' },
                    ...(shoppingLists || []).map(list => ({ label: list.name, value: list.id.toString() })),
                  ]}
                  placeholder="Select a list..."
                />
                <TouchableOpacity
                  style={[
                    styles.addButton,
                    { backgroundColor: colors.primary },
                    (!selectedListId || addingToList) && styles.addButtonDisabled,
                  ]}
                  onPress={handleAddToList}
                  disabled={!selectedListId || addingToList}
                >
                  {addingToList ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.addButtonText}>Add Ingredients</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  deleteButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
  },
  urlRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  urlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  urlText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 16,
    marginRight: 8,
    fontWeight: 'bold',
  },
  listItemText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  instructionItem: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  notesText: {
    fontSize: 15,
    lineHeight: 22,
  },
  addToListContainer: {
    gap: 12,
  },
  addButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
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

