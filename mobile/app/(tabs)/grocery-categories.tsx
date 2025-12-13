import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
// Import draggable flatlist conditionally to avoid worklets issues
// In Expo Go, these modules cause worklets version mismatch errors
// In development builds (eas build or expo run), they should work properly
let DraggableFlatList: any = null;
let ScaleDecorator: any = null;
let RenderItemParams: any = null;
let GestureHandlerRootView: any = null;

// Try to load these modules on mobile (not web, since we use HTML5 drag-and-drop there)
// If they fail to load (e.g., in Expo Go), we'll gracefully fall back to move buttons
if (Platform.OS !== 'web') {
  try {
    const DraggableFlatListModule = require('react-native-draggable-flatlist');
    DraggableFlatList = DraggableFlatListModule.default;
    ScaleDecorator = DraggableFlatListModule.ScaleDecorator;
    RenderItemParams = DraggableFlatListModule.RenderItemParams;
    
    const GestureHandlerModule = require('react-native-gesture-handler');
    GestureHandlerRootView = GestureHandlerModule.GestureHandlerRootView;
  } catch (error) {
    // Modules not available (likely Expo Go) - will use move button fallback
    // This is expected and handled gracefully by the UI
  }
}
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import ListService from '../../services/listService';
import { GroceryCategory, CreateGroceryCategoryData, UpdateGroceryCategoryData } from '../../types/lists';
import AlertModal from '../../components/AlertModal';
import IconPicker, { getIconDisplay } from '../../components/IconPicker';
import { APIError } from '../../services/api';
import DraggableCategoryItem from '../../components/lists/DraggableCategoryItem';

export default function GroceryCategoriesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [categories, setCategories] = useState<GroceryCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingCategory, setEditingCategory] = useState<GroceryCategory | null>(null);
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    description: '',
    icon: '',
    order: 0,
    keywords: [] as string[],
  });
  const [newKeyword, setNewKeyword] = useState('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [duplicateError, setDuplicateError] = useState({ isOpen: false, message: '' });
  const [reordering, setReordering] = useState(false);
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Load categories when family changes or screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (selectedFamily) {
        fetchCategories();
      } else {
        setCategories([]);
      }
    }, [selectedFamily])
  );

  const fetchCategories = async () => {
    if (!selectedFamily) return;

    try {
      setLoading(true);
      const fetchedCategories = await ListService.getGroceryCategories(selectedFamily.id);
      // Sort by order, then by name
      const sorted = [...fetchedCategories].sort((a, b) => {
        if (a.order !== b.order) {
          return (a.order || 0) - (b.order || 0);
        }
        return (a.name || '').localeCompare(b.name || '');
      });
      setCategories(sorted);
    } catch (err) {
      console.error('Error fetching categories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySubmit = async () => {
    if (!categoryFormData.name.trim() || !selectedFamily) return;

    if (editingCategory) {
      // Check for duplicate name (excluding the current category being edited)
      const duplicate = categories.find(
        (cat) =>
          cat.id !== editingCategory.id &&
          cat.name.toLowerCase().trim() === categoryFormData.name.toLowerCase().trim()
      );
      if (duplicate) {
        setDuplicateError({
          isOpen: true,
          message: 'A category with this name already exists. Please choose a different name.',
        });
        return;
      }

      setUpdating(true);
      try {
        await ListService.updateGroceryCategory(editingCategory.id, categoryFormData);
        setEditingCategory(null);
        setCategoryFormData({ name: '', description: '', icon: '', order: 0, keywords: [] });
        setNewKeyword('');
        await fetchCategories();
      } catch (err) {
        console.error('Error updating category:', err);
        const apiError = err as APIError;
        alert(apiError.message || 'Failed to update category. Please try again.');
      } finally {
        setUpdating(false);
      }
    } else {
      // Check for duplicate name
      const duplicate = categories.find(
        (cat) => cat.name.toLowerCase().trim() === categoryFormData.name.toLowerCase().trim()
      );
      if (duplicate) {
        setDuplicateError({
          isOpen: true,
          message: 'A category with this name already exists. Please choose a different name.',
        });
        return;
      }

      setCreating(true);
      try {
        await ListService.createGroceryCategory({
          ...categoryFormData,
          family: selectedFamily.id,
        });
        setCategoryFormData({ name: '', description: '', icon: '', order: 0, keywords: [] });
        setNewKeyword('');
        setShowCreateForm(false);
        await fetchCategories();
      } catch (err) {
        console.error('Error creating category:', err);
        const apiError = err as APIError;
        alert(apiError.message || 'Failed to create category. Please try again.');
      } finally {
        setCreating(false);
      }
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategoryId) return;
    try {
      await ListService.deleteGroceryCategory(deletingCategoryId);
      setDeletingCategoryId(null);
      await fetchCategories();
    } catch (err) {
      console.error('Error deleting category:', err);
      const apiError = err as APIError;
      alert(apiError.message || 'Failed to delete category. It may be in use by items.');
    }
  };

  const handleEditCategory = (category: GroceryCategory) => {
    setEditingCategory(category);
    setShowCreateForm(false);
    setCategoryFormData({
      name: category.name,
      description: category.description || '',
      icon: category.icon || '',
      order: category.order || 0,
      keywords: category.keywords || [],
    });
    setNewKeyword('');
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setCategoryFormData({ name: '', description: '', icon: '', order: 0, keywords: [] });
    setNewKeyword('');
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setCategoryFormData({ name: '', description: '', icon: '', order: 0, keywords: [] });
    setNewKeyword('');
  };

  const handleCreateClick = () => {
    setShowCreateForm(true);
    setEditingCategory(null);
    // Calculate next available order
    const maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.order || 0)) : 0;
    setCategoryFormData({ name: '', description: '', icon: '', order: maxOrder + 1, keywords: [] });
    setNewKeyword('');
  };

  const handleAddKeyword = () => {
    const keyword = newKeyword.trim().toLowerCase();
    if (keyword && !categoryFormData.keywords.includes(keyword)) {
      setCategoryFormData((prev) => ({
        ...prev,
        keywords: [...prev.keywords, keyword],
      }));
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    setCategoryFormData((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((k) => k !== keywordToRemove),
    }));
  };

  const handleMoveCategory = async (categoryId: number, direction: 'up' | 'down') => {
    const categoryIndex = categories.findIndex((c) => c.id === categoryId);
    if (categoryIndex === -1) return;

    const newIndex = direction === 'up' ? categoryIndex - 1 : categoryIndex + 1;
    if (newIndex < 0 || newIndex >= categories.length) return;

    // Create new array with reordered categories
    const newCategories = [...categories];
    const [movedCategory] = newCategories.splice(categoryIndex, 1);
    newCategories.splice(newIndex, 0, movedCategory);

    // Update order values based on new positions (starting from 1)
    const updatedCategories = newCategories.map((cat, index) => ({
      ...cat,
      order: index + 1,
    }));

    // Optimistically update UI
    setCategories(updatedCategories);
    setReordering(true);

    try {
      // Update all affected categories (only those that changed)
      const updatePromises = updatedCategories
        .filter((cat, index) => {
          const originalCategory = categories.find((c) => c.id === cat.id);
          return originalCategory && originalCategory.order !== index + 1;
        })
        .map((cat, index) => {
          const actualIndex = updatedCategories.findIndex((c) => c.id === cat.id);
          return ListService.updateGroceryCategory(cat.id, { order: actualIndex + 1 });
        });

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }
      // Refresh to ensure consistency
      await fetchCategories();
    } catch (err) {
      console.error('Error reordering categories:', err);
      const apiError = err as APIError;
      alert(apiError.message || 'Failed to reorder categories. Please try again.');
      // Revert on error
      await fetchCategories();
    } finally {
      setReordering(false);
    }
  };

  // Mobile drag and drop handler
  const handleDragEnd = async ({ data }: { data: GroceryCategory[] }) => {
    // Update order values based on new positions (starting from 1)
    const updatedCategories = data.map((cat, index) => ({
      ...cat,
      order: index + 1,
    }));

    // Optimistically update UI
    setCategories(updatedCategories);
    setReordering(true);

    try {
      // Update all affected categories
      const updatePromises = updatedCategories.map((cat, index) =>
        ListService.updateGroceryCategory(cat.id, { order: index + 1 })
      );

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }
      // Refresh to ensure consistency
      await fetchCategories();
    } catch (err) {
      console.error('Error reordering categories:', err);
      const apiError = err as APIError;
      alert(apiError.message || 'Failed to reorder categories. Please try again.');
      // Revert on error
      await fetchCategories();
    } finally {
      setReordering(false);
    }
  };

  // Web drag-and-drop handlers
  const handleWebDragStart = (categoryId: number) => {
    setDraggedCategoryId(categoryId);
  };

  const handleWebDragOver = (e: any, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleWebDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleWebDrop = async (e: any, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);

    if (draggedCategoryId === null) {
      return;
    }

    const draggedCategory = categories.find((c) => c.id === draggedCategoryId);
    if (!draggedCategory) return;

    const dragIndex = categories.findIndex((c) => c.id === draggedCategoryId);
    if (dragIndex === -1 || dragIndex === dropIndex) {
      setDraggedCategoryId(null);
      return;
    }

    // Reorder categories
    const newCategories = [...categories];
    newCategories.splice(dragIndex, 1);
    newCategories.splice(dropIndex, 0, draggedCategory);

    // Update order values based on new positions (starting from 1)
    const updatedCategories = newCategories.map((cat, index) => ({
      ...cat,
      order: index + 1,
    }));

    // Optimistically update UI
    setCategories(updatedCategories);
    setReordering(true);

    try {
      // Update all affected categories
      const updatePromises = updatedCategories.map((cat, index) =>
        ListService.updateGroceryCategory(cat.id, { order: index + 1 })
      );

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }
      // Refresh to ensure consistency
      await fetchCategories();
    } catch (err) {
      console.error('Error reordering categories:', err);
      const apiError = err as APIError;
      alert(apiError.message || 'Failed to reorder categories. Please try again.');
      // Revert on error
      await fetchCategories();
    } finally {
      setReordering(false);
    }

    setDraggedCategoryId(null);
  };

  const handleWebDragEnd = () => {
    setDraggedCategoryId(null);
    setDragOverIndex(null);
  };

  if (!selectedFamily) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.emptyState}>
          <FontAwesome name="users" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Please select a family to manage grocery categories
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Grocery Categories</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {!showCreateForm && !editingCategory && (
          <View style={styles.managementHeader}>
            <Text style={[styles.helpText, { color: colors.textSecondary }]}>
              Manage your grocery categories. All categories can be customized with keywords for automatic categorization.
            </Text>
            <TouchableOpacity
              onPress={handleCreateClick}
              style={[styles.createButton, { backgroundColor: colors.primary }]}
              disabled={reordering}
            >
              <FontAwesome name="plus" size={16} color="#fff" />
              <Text style={styles.createButtonText}>Create Category</Text>
            </TouchableOpacity>
          </View>
        )}

        {(showCreateForm || editingCategory) && (
          <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
            <Text style={[styles.formHelpText, { color: colors.textSecondary }]}>
              {editingCategory
                ? `Editing: ${editingCategory.name}`
                : 'Create a new custom category. Order determines display position.'}
            </Text>

            <View style={styles.form}>
              <View style={styles.formField}>
                <Text style={[styles.label, { color: colors.text }]}>Category Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={categoryFormData.name}
                  onChangeText={(text) => setCategoryFormData((prev) => ({ ...prev, name: text }))}
                  placeholder="e.g., Organic Foods, Bulk Items"
                  placeholderTextColor={colors.textSecondary}
                  editable={!creating && !updating}
                />
              </View>

              <View style={styles.formField}>
                <Text style={[styles.label, { color: colors.text }]}>Description (optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={categoryFormData.description}
                  onChangeText={(text) => setCategoryFormData((prev) => ({ ...prev, description: text }))}
                  placeholder="Brief description of this category"
                  placeholderTextColor={colors.textSecondary}
                  editable={!creating && !updating}
                />
              </View>

              <View style={styles.iconPickerField}>
                <Text style={[styles.label, { color: colors.text }]}>Icon (optional)</Text>
                <IconPicker
                  value={categoryFormData.icon || null}
                  onChange={(icon) => setCategoryFormData((prev) => ({ ...prev, icon: icon || '' }))}
                  disabled={creating || updating}
                />
              </View>

              <View style={styles.formField}>
                <Text style={[styles.label, { color: colors.text }]}>Display Order</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={categoryFormData.order.toString()}
                  onChangeText={(text) => setCategoryFormData((prev) => ({ ...prev, order: parseInt(text) || 0 }))}
                  placeholder="0"
                  keyboardType="numeric"
                  editable={!creating && !updating}
                />
                <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                  Lower numbers appear first in lists. Default categories use 1-9.
                </Text>
              </View>

              <View style={styles.formField}>
                <Text style={[styles.label, { color: colors.text }]}>Keywords (optional)</Text>
                <View style={styles.keywordsContainer}>
                  <View style={styles.keywordsTags}>
                    {categoryFormData.keywords.map((keyword, index) => (
                      <View key={index} style={[styles.keywordTag, { backgroundColor: colors.primary + '20' }]}>
                        <Text style={[styles.keywordTagText, { color: colors.primary }]}>{keyword}</Text>
                        <TouchableOpacity
                          onPress={() => handleRemoveKeyword(keyword)}
                          disabled={creating || updating}
                          style={styles.keywordRemove}
                        >
                          <Text style={[styles.keywordRemoveText, { color: colors.primary }]}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                  <View style={styles.keywordsInputRow}>
                    <TextInput
                      style={[styles.keywordInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                      value={newKeyword}
                      onChangeText={setNewKeyword}
                      onSubmitEditing={handleAddKeyword}
                      placeholder="Add keyword (e.g., apple, milk)"
                      placeholderTextColor={colors.textSecondary}
                      editable={!creating && !updating}
                    />
                    <TouchableOpacity
                      onPress={handleAddKeyword}
                      disabled={creating || updating || !newKeyword.trim()}
                      style={[styles.addKeywordButton, { backgroundColor: colors.primary }]}
                    >
                      <Text style={styles.addKeywordButtonText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                  Items containing these keywords will be automatically assigned to this category. Keywords are case-insensitive.
                </Text>
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity
                  onPress={handleCategorySubmit}
                  disabled={creating || updating || !categoryFormData.name.trim()}
                  style={[styles.submitButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.submitButtonText}>
                    {updating ? 'Updating...' : creating ? 'Creating...' : editingCategory ? 'Update' : 'Create'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={editingCategory ? handleCancelEdit : handleCancelCreate}
                  disabled={creating || updating}
                  style={[styles.cancelButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}

        {!showCreateForm && !editingCategory && (
          <View style={styles.categoriesList}>
            <View style={styles.listHeader}>
              <Text style={[styles.listHeaderText, { color: colors.text }]}>
                Existing Categories ({categories.length})
              </Text>
            </View>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading categories...</Text>
              </View>
            ) : categories.length === 0 ? (
              <View style={styles.emptyState}>
                <FontAwesome name="list-ul" size={48} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No categories found. Default categories should be created automatically when you view a grocery list.
                </Text>
                <TouchableOpacity
                  onPress={fetchCategories}
                  style={[styles.refreshButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.refreshButtonText}>Refresh Categories</Text>
                </TouchableOpacity>
              </View>
            ) : Platform.OS === 'web' ? (
              // Web: Use DraggableCategoryItem with up/down arrows
              <ScrollView>
                {categories.map((category, index) => (
                  <DraggableCategoryItem
                    key={category.id}
                    category={category}
                    index={index}
                    draggedCategoryId={draggedCategoryId}
                    dragOverIndex={dragOverIndex}
                    onDragStart={handleWebDragStart}
                    onDragOver={handleWebDragOver}
                    onDragLeave={handleWebDragLeave}
                    onDrop={handleWebDrop}
                    onDragEnd={handleWebDragEnd}
                    onEdit={() => handleEditCategory(category)}
                    onDelete={() => setDeletingCategoryId(category.id)}
                    reordering={reordering}
                  />
                ))}
              </ScrollView>
            ) : DraggableFlatList && GestureHandlerRootView ? (
              // Mobile: Use DraggableFlatList for drag and drop
              <GestureHandlerRootView style={{ flex: 1 }}>
                <DraggableFlatList
                  data={categories}
                  onDragEnd={handleDragEnd}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item, drag, isActive }: any) => {
                    const index = categories.findIndex((c) => c.id === item.id);
                    const categoryComponent = (
                      <View
                        style={[
                          styles.categoryItem,
                          { backgroundColor: colors.surface, borderColor: colors.border },
                          isActive && { opacity: 0.5 },
                        ]}
                      >
                        <View style={styles.dragHandleContainer}>
                          <View style={styles.dragHandle}>
                            <FontAwesome name="bars" size={14} color={colors.textSecondary} />
                          </View>
                        </View>
                        <View style={styles.categoryItemInfo}>
                          <View style={styles.categoryNameRow}>
                            {item.icon && (() => {
                              const emoji = getIconDisplay(item.icon);
                              if (!emoji) return null;
                              
                              return <Text style={styles.categoryIconEmoji}>{emoji}</Text>;
                            })()}
                            <Text style={[styles.categoryName, { color: colors.text }]}>{item.name}</Text>
                            {item.is_default && (
                              <FontAwesome name="check-circle" size={14} color="#10b981" style={styles.defaultCheckmark} />
                            )}
                          </View>
                          {item.description && (
                            <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>
                              {item.description}
                            </Text>
                          )}
                        </View>
                        <View style={styles.categoryItemActions}>
                          <TouchableOpacity
                            onPress={() => handleEditCategory(item)}
                            style={[styles.editButton, { borderColor: colors.border }]}
                            disabled={reordering}
                          >
                            <FontAwesome name="edit" size={16} color={colors.text} />
                          </TouchableOpacity>
                          {!item.is_default && (
                            <TouchableOpacity
                              onPress={() => setDeletingCategoryId(item.id)}
                              style={[styles.deleteButton, { borderColor: colors.border }]}
                              disabled={reordering}
                            >
                              <FontAwesome name="trash" size={16} color={colors.error} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );

                    if (ScaleDecorator && drag) {
                      return (
                        <ScaleDecorator>
                          <TouchableOpacity
                            onLongPress={() => {
                              drag();
                            }}
                            disabled={isActive}
                            activeOpacity={0.7}
                            style={isActive ? { opacity: 0.5 } : undefined}
                            delayLongPress={300}
                          >
                            {categoryComponent}
                          </TouchableOpacity>
                        </ScaleDecorator>
                      );
                    }

                    return categoryComponent;
                  }}
                />
              </GestureHandlerRootView>
            ) : (
              // Mobile fallback: Use ScrollView with up/down arrows if DraggableFlatList is not available
              <ScrollView>
                {categories.map((category, index) => (
                  <View key={category.id} style={[styles.categoryItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.categoryOrderControls}>
                      <Text style={[styles.orderNumber, { color: colors.textSecondary }]}>{category.order || 0}</Text>
                      <View style={styles.orderButtons}>
                        <TouchableOpacity
                          onPress={() => handleMoveCategory(category.id, 'up')}
                          disabled={reordering || index === 0}
                          style={[
                            styles.orderButton,
                            { backgroundColor: colors.background, borderColor: colors.border },
                            (reordering || index === 0) && styles.orderButtonDisabled,
                          ]}
                        >
                          <FontAwesome
                            name="chevron-up"
                            size={12}
                            color={reordering || index === 0 ? colors.textSecondary : colors.text}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleMoveCategory(category.id, 'down')}
                          disabled={reordering || index === categories.length - 1}
                          style={[
                            styles.orderButton,
                            { backgroundColor: colors.background, borderColor: colors.border },
                            (reordering || index === categories.length - 1) && styles.orderButtonDisabled,
                          ]}
                        >
                          <FontAwesome
                            name="chevron-down"
                            size={12}
                            color={reordering || index === categories.length - 1 ? colors.textSecondary : colors.text}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.dragHandleContainer}>
                      <View style={styles.dragHandle}>
                        <FontAwesome name="bars" size={14} color={colors.textSecondary} />
                      </View>
                    </View>
                    <View style={styles.categoryItemInfo}>
                      <View style={styles.categoryNameRow}>
                        {category.icon && (() => {
                          const emoji = getIconDisplay(category.icon);
                          if (!emoji) return null;
                          
                          return <Text style={styles.categoryIconEmoji}>{emoji}</Text>;
                        })()}
                        <Text style={[styles.categoryName, { color: colors.text }]}>{category.name}</Text>
                        {category.is_default && (
                          <FontAwesome name="check-circle" size={14} color="#10b981" style={styles.defaultCheckmark} />
                        )}
                      </View>
                      {category.description && (
                        <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>
                          {category.description}
                        </Text>
                      )}
                    </View>
                    <View style={styles.categoryItemActions}>
                      <TouchableOpacity
                        onPress={() => handleEditCategory(category)}
                        style={[styles.editButton, { borderColor: colors.border }]}
                        disabled={reordering}
                      >
                        <FontAwesome name="edit" size={16} color={colors.text} />
                      </TouchableOpacity>
                      {!category.is_default && (
                        <TouchableOpacity
                          onPress={() => setDeletingCategoryId(category.id)}
                          style={[styles.deleteButton, { borderColor: colors.border }]}
                          disabled={reordering}
                        >
                          <FontAwesome name="trash" size={16} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      <AlertModal
        visible={!!deletingCategoryId}
        title="Delete Category"
        message="Are you sure you want to delete this category? Items using this category will become uncategorized."
        type="error"
        onClose={() => setDeletingCategoryId(null)}
        onConfirm={handleDeleteCategory}
        confirmText="Delete"
        cancelText="Cancel"
        showCancel={true}
      />

      <AlertModal
        visible={duplicateError.isOpen}
        title="Duplicate Category"
        message={duplicateError.message}
        type="error"
        onClose={() => setDuplicateError({ isOpen: false, message: '' })}
      />
    </View>
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
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  managementHeader: {
    marginBottom: 16,
  },
  helpText: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  formHelpText: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignSelf: 'flex-start',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  formContainer: {
    flex: 1,
  },
  form: {
    gap: 16,
  },
  formField: {
    marginBottom: 16,
  },
  iconPickerField: {
    marginBottom: 16,
    minHeight: 450,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  keywordsContainer: {
    gap: 8,
  },
  keywordsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  keywordTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  keywordTagText: {
    fontSize: 14,
  },
  keywordRemove: {
    padding: 2,
  },
  keywordRemoveText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  keywordsInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  keywordInput: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  addKeywordButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addKeywordButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  categoriesList: {
    flex: 1,
  },
  listHeader: {
    marginBottom: 16,
  },
  listHeaderText: {
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  dragHandleContainer: {
    marginRight: 12,
    justifyContent: 'center',
  },
  dragHandle: {
    padding: 4,
  },
  categoryOrderControls: {
    marginRight: 12,
    alignItems: 'center',
    minWidth: 50,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  orderButtons: {
    flexDirection: 'column',
    gap: 4,
  },
  orderButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderButtonDisabled: {
    opacity: 0.3,
  },
  categoryItemInfo: {
    flex: 1,
  },
  categoryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryIconEmoji: {
    marginRight: 8,
    fontSize: 20,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
  },
  defaultCheckmark: {
    marginLeft: 8,
  },
  categoryDescription: {
    fontSize: 14,
    marginBottom: 4,
  },
  categoryItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
});

