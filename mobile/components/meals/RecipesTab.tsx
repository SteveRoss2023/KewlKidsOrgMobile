import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import MealsService, { Recipe } from '../../services/mealsService';
import ListService from '../../services/listService';
import { List } from '../../types/lists';
import RecipeCard from './RecipeCard';
import RecipeDetail from './RecipeDetail';
import RecipeForm from './RecipeForm';
import ImportRecipeForm from './ImportRecipeForm';
import AlertModal from '../AlertModal';
import ConfirmModal from '../ConfirmModal';

interface RecipesTabProps {
  recipes: Recipe[];
  loading: boolean;
  selectedFamily: { id: number; name: string };
  onRefresh: () => void;
}

export default function RecipesTab({ recipes, loading, selectedFamily, onRefresh }: RecipesTabProps) {
  const { colors } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [shoppingLists, setShoppingLists] = useState<List[]>([]);
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [deleteRecipeConfirm, setDeleteRecipeConfirm] = useState<{
    isOpen: boolean;
    recipeId: number | null;
    recipeTitle: string;
  }>({
    isOpen: false,
    recipeId: null,
    recipeTitle: '',
  });
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
    details?: Array<{ label: string; items: string[] }>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'success',
  });

  useEffect(() => {
    if (selectedFamily) {
      fetchShoppingLists();
    }
  }, [selectedFamily]);

  const fetchShoppingLists = async () => {
    try {
      const data = await ListService.getLists(selectedFamily.id, 'grocery');
      setShoppingLists(data || []);
    } catch (err) {
      console.error('Failed to load grocery lists:', err);
    }
  };

  const handleImportRecipe = async (url: string) => {
    try {
      await MealsService.importRecipe(url, selectedFamily.id);
      await onRefresh();
      setShowImportForm(false);
      setNotification({
        isOpen: true,
        title: 'Recipe Imported Successfully!',
        message: 'Recipe has been imported and added to your collection.',
        type: 'success',
      });
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to import recipe';
      setNotification({
        isOpen: true,
        title: 'Recipe Import Failed',
        message: errorMsg,
        type: 'error',
      });
    }
  };

  const handleDeleteRecipeClick = (recipeId: number, recipeTitle: string) => {
    setDeleteRecipeConfirm({
      isOpen: true,
      recipeId,
      recipeTitle,
    });
  };

  const confirmDeleteRecipe = async () => {
    const { recipeId } = deleteRecipeConfirm;
    if (!recipeId) return;

    try {
      await MealsService.deleteRecipe(recipeId);
      await onRefresh();
      if (selectedRecipe && selectedRecipe.id === recipeId) {
        setSelectedRecipe(null);
      }
      setDeleteRecipeConfirm({ isOpen: false, recipeId: null, recipeTitle: '' });
      setNotification({
        isOpen: true,
        title: 'Success',
        message: 'Recipe deleted successfully.',
        type: 'success',
      });
    } catch (err: any) {
      setNotification({
        isOpen: true,
        title: 'Error',
        message: err.message || 'Failed to delete recipe',
        type: 'error',
      });
      setDeleteRecipeConfirm({ isOpen: false, recipeId: null, recipeTitle: '' });
    }
  };

  const handleAddToList = async (recipeId: number, listId: number, recipeTitle?: string) => {
    try {
      const response = await MealsService.addRecipeToList(recipeId, listId);
      
      let message = response.message || 'Ingredients added to shopping list!';
      if (recipeTitle) {
        message = `${message}${recipeTitle ? ` from "${recipeTitle}"` : ''}`;
      }

      const title = response.skipped_count > 0
        ? 'Ingredients Added (Some Duplicates Skipped)'
        : response.uncategorized_items && response.uncategorized_items.length > 0
        ? 'Ingredients Added (Some Need Categorization)'
        : 'Ingredients Added Successfully!';

      const details: Array<{ label: string; items: string[] }> = [];
      if (response.skipped_items && response.skipped_items.length > 0) {
        details.push({ label: 'Skipped (duplicates)', items: response.skipped_items });
      }
      if (response.uncategorized_item_names && response.uncategorized_item_names.length > 0) {
        details.push({ label: 'Need categorization', items: response.uncategorized_item_names });
      }

      setNotification({
        isOpen: true,
        title,
        message,
        type: response.skipped_count === response.added_count ? 'info' : 'success',
        details: details.length > 0 ? details : undefined,
      });
    } catch (err: any) {
      setNotification({
        isOpen: true,
        title: 'Error',
        message: err.message || 'Failed to add ingredients to list',
        type: 'error',
      });
    }
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && recipes.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading recipes...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerActions, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowImportForm(true)}
        >
          <FontAwesome name="download" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>Import</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowRecipeForm(true)}
        >
          <FontAwesome name="plus" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>Create</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <FontAwesome name="search" size={16} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search recipes..."
          placeholderTextColor={colors.textSecondary}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      {filteredRecipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            No recipes found. {searchTerm ? 'Try a different search term.' : 'Import a recipe from a URL or create a new one!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecipes}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <RecipeCard
              recipe={item}
              shoppingLists={shoppingLists}
              onPress={() => setSelectedRecipe(item)}
              onAddToList={handleAddToList}
              onDelete={handleDeleteRecipeClick}
            />
          )}
        />
      )}

      {showImportForm && (
        <ImportRecipeForm
          onImport={handleImportRecipe}
          onClose={() => setShowImportForm(false)}
        />
      )}

      {showRecipeForm && (
        <RecipeForm
          selectedFamily={selectedFamily}
          onClose={() => setShowRecipeForm(false)}
          onSuccess={onRefresh}
        />
      )}

      {selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          shoppingLists={shoppingLists}
          onClose={() => setSelectedRecipe(null)}
          onAddToList={handleAddToList}
          onDelete={handleDeleteRecipeClick}
        />
      )}

      <AlertModal
        visible={notification.isOpen}
        title={notification.title}
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        details={notification.details}
      />

      <ConfirmModal
        visible={deleteRecipeConfirm.isOpen}
        onClose={() => setDeleteRecipeConfirm({ isOpen: false, recipeId: null, recipeTitle: '' })}
        onConfirm={confirmDeleteRecipe}
        title="Delete Recipe"
        message={`Are you sure you want to delete "${deleteRecipeConfirm.recipeTitle}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 12,
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  grid: {
    padding: 8,
  },
  row: {
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
