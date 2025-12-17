import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import MealsService, { Recipe } from '../../services/mealsService';
import ListService from '../../services/listService';
import { List, ListItem } from '../../types/lists';
import ThemeAwarePicker from '../lists/ThemeAwarePicker';

interface RecipeCardProps {
  recipe: Recipe;
  shoppingLists: List[];
  onPress: () => void;
  onAddToList: (recipeId: number, listId: number, recipeTitle?: string) => void;
  onDelete: (recipeId: number, recipeTitle: string) => void;
}

export default function RecipeCard({ recipe, shoppingLists, onPress, onAddToList, onDelete }: RecipeCardProps) {
  const { colors } = useTheme();
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [addingToList, setAddingToList] = useState(false);
  const [addedToList, setAddedToList] = useState<{ id: number; name: string } | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    checkRecipeInLists();
    // Reset image error when recipe changes
    setImageError(false);
    // Set image URI when recipe changes
    if (recipe.image_url && recipe.image_url.trim()) {
      const url = normalizeImageUrl(recipe.image_url);
      setImageUri(url);
    } else {
      setImageUri(null);
    }
  }, [recipe, shoppingLists]);

  const normalizeImageUrl = (url: string): string => {
    if (!url) return url;
    let normalized = url.trim();
    // Convert HTTP to HTTPS for better mobile compatibility
    if (normalized.startsWith('http://')) {
      normalized = normalized.replace('http://', 'https://');
    }
    return normalized;
  };

  const checkRecipeInLists = async () => {
    if (shoppingLists.length === 0) return;

    for (const list of shoppingLists) {
      try {
        const items = await ListService.getListItems(list.id);
        const hasRecipeItems = items.some(item =>
          item.notes && item.notes.includes(`From recipe: ${recipe.title}`)
        );

        if (hasRecipeItems) {
          setAddedToList({ id: list.id, name: list.name });
          return;
        }
      } catch (err) {
        console.error(`Error checking items for list ${list.id}:`, err);
      }
    }
    setAddedToList(null);
  };

  const handleAddToList = async () => {
    if (!selectedListId) return;

    setAddingToList(true);
    try {
      await onAddToList(recipe.id, parseInt(selectedListId, 10), recipe.title);
      const selectedList = shoppingLists.find(list => list.id === parseInt(selectedListId, 10));
      if (selectedList) {
        setAddedToList({ id: selectedList.id, name: selectedList.name });
        setSelectedListId('');
      }
    } catch (err) {
      // Error handled by parent
    } finally {
      setAddingToList(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {imageUri && !imageError ? (
        <Image 
          source={{ uri: imageUri }} 
          style={styles.image} 
          resizeMode="cover"
          onError={(error) => {
            const errorMessage = error.nativeEvent?.error || 'Unknown error';
            console.log('Image failed to load:', imageUri);
            console.log('Error details:', errorMessage);
            console.log('Platform:', Platform.OS);
            setImageError(true);
          }}
          onLoadStart={() => {
            // Reset error state when starting to load a new image
            if (imageError) {
              setImageError(false);
            }
          }}
        />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: colors.border }]}>
          <FontAwesome name="image" size={32} color={colors.textSecondary} />
        </View>
      )}

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {recipe.title}
        </Text>

        {recipe.servings && (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Serves {recipe.servings}
          </Text>
        )}

        {(recipe.prep_time_minutes || recipe.cook_time_minutes) && (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {recipe.prep_time_minutes && `${recipe.prep_time_minutes}m prep`}
            {recipe.prep_time_minutes && recipe.cook_time_minutes && ' • '}
            {recipe.cook_time_minutes && `${recipe.cook_time_minutes}m cook`}
          </Text>
        )}

        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}
          </Text>
        )}

        {shoppingLists.length > 0 && (
          <View
            style={styles.addToListContainer}
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
          >
            {addedToList ? (
              <View style={[styles.addedMessage, { backgroundColor: colors.success + '20' }]}>
                <FontAwesome name="check" size={12} color={colors.success} />
                <Text style={[styles.addedText, { color: colors.success }]}>
                  In {addedToList.name}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.pickerWrapper}>
                  <ThemeAwarePicker
                    selectedValue={selectedListId}
                    onValueChange={setSelectedListId}
                    options={[
                      { label: 'Add to list...', value: '' },
                      ...(shoppingLists || []).map(list => ({ label: list.name, value: list.id.toString() })),
                    ]}
                    placeholder="Add to list..."
                  />
                </View>
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
                    <Text style={styles.addButtonText}>Add</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={(e) => {
              e.stopPropagation();
              onDelete(recipe.id, recipe.title);
            }}
          >
            <FontAwesome name="trash" size={14} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '47%',
    margin: 6,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 200,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  meta: {
    fontSize: 12,
    marginTop: 2,
  },
  addToListContainer: {
    marginTop: 8,
    gap: 6,
  },
  pickerWrapper: {
    flex: 1,
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  addedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  addedText: {
    fontSize: 11,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  deleteButton: {
    padding: 4,
  },
});
