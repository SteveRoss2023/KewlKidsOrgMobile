import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
// Import draggable flatlist conditionally to avoid worklets issues
let DraggableFlatList: any = null;
let ScaleDecorator: any = null;
let RenderItemParams: any = null;
let GestureHandlerRootView: any = null;

try {
  const draggableModule = require('react-native-draggable-flatlist');
  DraggableFlatList = draggableModule.default;
  ScaleDecorator = draggableModule.ScaleDecorator;
  RenderItemParams = draggableModule.RenderItemParams;
  const gestureModule = require('react-native-gesture-handler');
  GestureHandlerRootView = gestureModule.GestureHandlerRootView;
} catch (e) {
  console.warn('DraggableFlatList not available, using regular FlatList');
}
import GlobalNavBar from '../../../components/GlobalNavBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { useFamily } from '../../../contexts/FamilyContext';
import ListService from '../../../services/listService';
import { List, ListItem, GroceryCategory, CreateListItemData, UpdateListItemData } from '../../../types/lists';
import ListItemComponent from '../../../components/lists/ListItemComponent';
import CategoryGroup from '../../../components/lists/CategoryGroup';
import AddItemForm from '../../../components/lists/AddItemForm';
import AlertModal from '../../../components/AlertModal';
import { APIError } from '../../../services/api';

export default function ListDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const listId = params.id ? parseInt(params.id as string, 10) : null;
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [list, setList] = useState<List | null>(null);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [categories, setCategories] = useState<GroceryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<ListItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [updatingItem, setUpdatingItem] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    itemId: number | null;
    itemName: string;
  }>({
    isOpen: false,
    itemId: null,
    itemName: '',
  });
  const [selectedRecipeFilter, setSelectedRecipeFilter] = useState<string>('');

  const isGroceryList = list?.list_type === 'grocery';
  const isTodoList = list?.list_type === 'todo';

  // Load list and categories when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (listId && selectedFamily) {
        fetchList();
        fetchCategories();
      }
    }, [listId, selectedFamily])
  );

  // Load items when list changes
  useEffect(() => {
    if (list) {
      fetchListItems();
    }
  }, [list]);

  // Collapse all categories by default when list or items change
  useEffect(() => {
    if (isGroceryList && groupedItems && Object.keys(groupedItems).length > 0) {
      const allCategoryIds = new Set(Object.keys(groupedItems));
      setCollapsedCategories(allCategoryIds);
    }
  }, [list?.id, isGroceryList]);

  // Debug: Log when editingItem changes
  useEffect(() => {
    console.log('editingItem changed:', editingItem);
    console.log('isTodoList:', isTodoList);
    console.log('DraggableFlatList available:', !!DraggableFlatList);
    console.log('GestureHandlerRootView available:', !!GestureHandlerRootView);
    console.log('Should show edit form:', editingItem && (Platform.OS === 'web' || !isTodoList || !DraggableFlatList || !GestureHandlerRootView));
  }, [editingItem, isTodoList]);

  const fetchList = async () => {
    if (!listId) return;

    try {
      setLoading(true);
      const fetchedList = await ListService.getList(listId);
      setList(fetchedList);
    } catch (err) {
      console.error('Error fetching list:', err);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchListItems = async () => {
    if (!list) return;

    try {
      setLoadingItems(true);
      const items = await ListService.getListItems(list.id);
      setListItems(items);
    } catch (err) {
      console.error('Error fetching list items:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  const fetchCategories = async () => {
    if (!selectedFamily) return;

    try {
      const fetchedCategories = await ListService.getGroceryCategories(selectedFamily.id);
      setCategories(fetchedCategories);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  // Extract unique recipe names from items
  const availableRecipes = useMemo(() => {
    const recipes = new Set<string>();
    listItems.forEach((item) => {
      if (item.notes && item.notes.startsWith('From recipe: ')) {
        const recipeName = item.notes.replace('From recipe: ', '');
        if (recipeName) {
          recipes.add(recipeName);
        }
      }
    });
    return Array.from(recipes).sort();
  }, [listItems]);

  // Filter items by selected recipe and exclude editing item (for non-draggable lists)
  const filteredItems = useMemo(() => {
    let items = listItems;
    
    // Filter by recipe if selected
    if (selectedRecipeFilter) {
      items = items.filter(
        (item) => item.notes && item.notes === `From recipe: ${selectedRecipeFilter}`
      );
    }
    
    // Filter out editing item when using the main edit form (not inline in draggable list)
    if (editingItem && (Platform.OS === 'web' || !isTodoList || !DraggableFlatList || !GestureHandlerRootView)) {
      items = items.filter((item) => item.id !== editingItem.id);
    }
    
    return items;
  }, [listItems, selectedRecipeFilter, editingItem, isTodoList, DraggableFlatList, GestureHandlerRootView, Platform.OS]);

  // Group items by category
  const groupedItems = useMemo(() => {
    if (!isGroceryList) {
      return { uncategorized: filteredItems };
    }

    const grouped: Record<string, ListItem[]> = {};
    filteredItems.forEach((item) => {
      const categoryId = item.category ? String(item.category) : 'uncategorized';
      if (!grouped[categoryId]) {
        grouped[categoryId] = [];
      }
      grouped[categoryId].push(item);
    });

    return grouped;
  }, [filteredItems, isGroceryList]);

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const getCategoryName = (categoryId: string) => {
    if (categoryId === 'uncategorized') return 'Uncategorized';
    const categoryIdNum = parseInt(categoryId, 10);
    const category = categories.find((c) => c.id === categoryIdNum);
    return category ? category.name : 'Unknown';
  };

  const toggleItemComplete = async (item: ListItem) => {
    // Optimistic update
    setListItems((prevItems) =>
      prevItems.map((prevItem) =>
        prevItem.id === item.id ? { ...prevItem, completed: !prevItem.completed } : prevItem
      )
    );

    try {
      await ListService.toggleItemComplete(item.id, !item.completed);
    } catch (err) {
      console.error('Error updating item:', err);
      // Revert on error
      setListItems((prevItems) =>
        prevItems.map((prevItem) =>
          prevItem.id === item.id ? { ...prevItem, completed: item.completed } : prevItem
        )
      );
    }
  };

  const handleAddItem = async (data: CreateListItemData) => {
    try {
      setAdding(true);
      console.log('Adding item with data:', data);
      const newItem = await ListService.createListItem(data);
      console.log('Item created successfully:', newItem);
      await fetchListItems();
      setShowAddItem(false);
    } catch (err) {
      console.error('Error adding item:', err);
      const apiError = err as APIError;
      alert(apiError.message || 'Failed to add item. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateItem = async (data: UpdateListItemData) => {
    if (!editingItem) {
      console.log('handleUpdateItem called but editingItem is null');
      return;
    }

    console.log('handleUpdateItem called with:', data, 'editingItem:', editingItem);
    try {
      setUpdatingItem(true);
      await ListService.updateListItem(editingItem.id, data);
      // Close the modal immediately to prevent showing stale data
      setEditingItem(null);
      await fetchListItems();
      console.log('Item updated successfully');
    } catch (err) {
      console.error('Error updating item:', err);
      const apiError = err as APIError;
      alert(apiError.message || 'Failed to update item. Please try again.');
    } finally {
      setUpdatingItem(false);
    }
  };

  const handleDeleteItem = (item: ListItem) => {
    setDeleteConfirm({
      isOpen: true,
      itemId: item.id,
      itemName: item.name,
    });
  };

  const confirmDeleteItem = async () => {
    if (!deleteConfirm.itemId) return;

    try {
      await ListService.deleteListItem(deleteConfirm.itemId);
      await fetchListItems();
      setDeleteConfirm({ isOpen: false, itemId: null, itemName: '' });
    } catch (err) {
      console.error('Error deleting item:', err);
      setDeleteConfirm({ isOpen: false, itemId: null, itemName: '' });
      alert('Failed to delete item. Please try again.');
    }
  };

  const handleDragEnd = async ({ data }: { data: ListItem[] }) => {
    if (!isTodoList) return;

    // Update order values
    const updatePromises = data.map((item, index) =>
      ListService.updateListItem(item.id, { order: index })
    );

    try {
      await Promise.all(updatePromises);
      setListItems(data);
      await fetchListItems();
    } catch (err) {
      console.error('Error reordering items:', err);
      await fetchListItems(); // Revert by refetching
    }
  };

  const renderItem = ({ item, drag, isActive }: any) => {
    // On web, use modal instead of inline editing
    if (editingItem && editingItem.id === item.id && Platform.OS !== 'web') {
      return (
        <View style={[styles.itemContainer, { backgroundColor: colors.surface }]}>
          <AddItemForm
            editingItem={editingItem}
            onSubmit={handleUpdateItem}
            onCancel={() => setEditingItem(null)}
            listId={list!.id}
            categories={categories}
            isGroceryList={isGroceryList}
            isTodoList={isTodoList}
            loading={updatingItem}
          />
        </View>
      );
    }

    const itemComponent = (
      <ListItemComponent
        item={item}
        onToggleComplete={() => toggleItemComplete(item)}
        onEdit={() => {
          console.log('Edit button clicked for item:', item);
          setEditingItem(item);
        }}
        onDelete={() => handleDeleteItem(item)}
        isGroceryList={isGroceryList}
        isTodoList={isTodoList}
      />
    );

    if (isTodoList && ScaleDecorator && drag) {
      return (
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            activeOpacity={0.7}
          >
            {itemComponent}
          </TouchableOpacity>
        </ScaleDecorator>
      );
    }

    return itemComponent;
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!list) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>List not found</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/lists')} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back to Lists</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sortedCategoryIds = isGroceryList
    ? Object.keys(groupedItems).sort((a, b) => {
        if (a === 'uncategorized') return 1;
        if (b === 'uncategorized') return -1;
        const categoryA = categories.find((c) => c.id === parseInt(a, 10));
        const categoryB = categories.find((c) => c.id === parseInt(b, 10));
        if (!categoryA && !categoryB) return 0;
        if (!categoryA) return 1;
        if (!categoryB) return -1;
        if (categoryA.order !== categoryB.order) {
          return (categoryA.order || 0) - (categoryB.order || 0);
        }
        return (categoryA.name || '').localeCompare(categoryB.name || '');
      })
    : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/lists')} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
            {list.name}
          </Text>
          {list.description && (
            <Text style={[styles.listDescription, { color: colors.textSecondary }]} numberOfLines={2}>
              {list.description}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.actionsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {isGroceryList && availableRecipes.length > 0 && (
          <View style={styles.recipeFilter}>
            <Text style={[styles.filterLabel, { color: colors.text }]}>Filter by recipe:</Text>
            <View style={[styles.pickerContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {/* Recipe filter dropdown would go here - simplified for now */}
            </View>
          </View>
        )}
        <View style={styles.actionButtons}>
          {!showAddItem && !editingItem ? (
            <TouchableOpacity
              onPress={() => {
                console.log('Add Item button pressed, showAddItem:', showAddItem, 'editingItem:', editingItem);
                setShowAddItem(true);
              }}
              style={[styles.addButton, { backgroundColor: colors.primary }]}
            >
              <FontAwesome name="plus" size={16} color="#fff" />
              <Text style={styles.addButtonText}>Add Item</Text>
            </TouchableOpacity>
          ) : showAddItem && !editingItem ? (
            <TouchableOpacity
              onPress={() => {
                console.log('Cancel Add Item button pressed');
                setShowAddItem(false);
              }}
              style={[styles.cancelButton, { backgroundColor: colors.textSecondary }]}
            >
              <FontAwesome name="times" size={16} color="#fff" />
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          ) : editingItem && (!isTodoList || !DraggableFlatList || !GestureHandlerRootView) ? (
            <TouchableOpacity
              onPress={() => {
                console.log('Cancel Edit Item button pressed');
                setEditingItem(null);
              }}
              style={[styles.cancelButton, { backgroundColor: colors.textSecondary }]}
            >
              <FontAwesome name="times" size={16} color="#fff" />
              <Text style={styles.cancelButtonText}>Cancel Edit</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {showAddItem && !editingItem && (
        <ScrollView 
          style={[styles.addItemFormContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          keyboardShouldPersistTaps="handled"
        >
          <AddItemForm
            onSubmit={(data) => {
              console.log('AddItemForm onSubmit called with:', data);
              handleAddItem(data);
            }}
            onCancel={() => {
              console.log('AddItemForm onCancel called');
              setShowAddItem(false);
            }}
            listId={list.id}
            categories={categories}
            isGroceryList={isGroceryList}
            isTodoList={isTodoList}
            loading={adding}
          />
        </ScrollView>
      )}

      {editingItem && (Platform.OS === 'web' || !isTodoList || !DraggableFlatList || !GestureHandlerRootView) && (
        <Modal
          visible={true}
          animationType="fade"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : Platform.OS === 'web' ? 'overFullScreen' : 'fullScreen'}
          onRequestClose={() => setEditingItem(null)}
          transparent={Platform.OS === 'web'}
        >
          {Platform.OS === 'web' ? (
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setEditingItem(null)}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
                style={[styles.modalContainer, { backgroundColor: colors.surface }]}
              >
                <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Item</Text>
                  <TouchableOpacity
                    onPress={() => setEditingItem(null)}
                    style={styles.modalCloseButton}
                  >
                    <FontAwesome name="times" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView 
                  style={styles.modalContent}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.modalContentContainer}
                >
                  <AddItemForm
                    editingItem={editingItem}
                    onSubmit={(data) => {
                      console.log('AddItemForm edit onSubmit called with:', data);
                      handleUpdateItem(data);
                    }}
                    onCancel={() => {
                      console.log('AddItemForm edit onCancel called');
                      setEditingItem(null);
                    }}
                    listId={list.id}
                    categories={categories}
                    isGroceryList={isGroceryList}
                    isTodoList={isTodoList}
                    loading={updatingItem}
                  />
                </ScrollView>
              </TouchableOpacity>
            </TouchableOpacity>
          ) : (
            <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Item</Text>
                <TouchableOpacity
                  onPress={() => setEditingItem(null)}
                  style={styles.modalCloseButton}
                >
                  <FontAwesome name="times" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView 
                style={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalContentContainer}
              >
                <AddItemForm
                  editingItem={editingItem}
                  onSubmit={(data) => {
                    console.log('AddItemForm edit onSubmit called with:', data);
                    handleUpdateItem(data);
                  }}
                  onCancel={() => {
                    console.log('AddItemForm edit onCancel called');
                    setEditingItem(null);
                  }}
                  listId={list.id}
                  categories={categories}
                  isGroceryList={isGroceryList}
                  isTodoList={isTodoList}
                  loading={updatingItem}
                />
              </ScrollView>
            </View>
          )}
        </Modal>
      )}

      {loadingItems ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading items...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyState}>
          <FontAwesome name="list-ul" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {selectedRecipeFilter ? `No items found for recipe "${selectedRecipeFilter}".` : 'No items yet. Add your first item!'}
          </Text>
        </View>
      ) : isGroceryList ? (
        <ScrollView style={styles.scrollView}>
          {sortedCategoryIds.map((categoryId) => {
            const categoryItems = groupedItems[categoryId];
            const categoryName = getCategoryName(categoryId);
            const isCollapsed = collapsedCategories.has(categoryId);
            const isUncategorized = categoryId === 'uncategorized';

            return (
              <CategoryGroup
                key={categoryId}
                categoryId={categoryId}
                categoryName={categoryName}
                items={categoryItems}
                isCollapsed={isCollapsed}
                onToggleCollapse={() => toggleCategory(categoryId)}
                onToggleItemComplete={toggleItemComplete}
                onEditItem={(item) => {
                  console.log('onEditItem called for item:', item);
                  setEditingItem(item);
                }}
                onDeleteItem={handleDeleteItem}
                isUncategorized={isUncategorized}
              />
            );
          })}
        </ScrollView>
      ) : isTodoList && DraggableFlatList && GestureHandlerRootView ? (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <DraggableFlatList
            data={[...filteredItems].sort((a, b) => {
              if (a.order !== b.order) {
                return (a.order || 0) - (b.order || 0);
              }
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            })}
            onDragEnd={handleDragEnd}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={styles.itemsContainer}
          />
        </GestureHandlerRootView>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <ListItemComponent
              item={item}
              onToggleComplete={() => toggleItemComplete(item)}
              onEdit={() => {
          console.log('Edit button clicked for item:', item);
          setEditingItem(item);
        }}
              onDelete={() => handleDeleteItem(item)}
              isGroceryList={isGroceryList}
              isTodoList={isTodoList}
            />
          )}
          contentContainerStyle={styles.itemsContainer}
        />
      )}

      <AlertModal
        visible={deleteConfirm.isOpen}
        title="Delete Item"
        message={`Are you sure you want to delete "${deleteConfirm.itemName}"? This action cannot be undone.`}
        type="error"
        onClose={() => setDeleteConfirm({ isOpen: false, itemId: null, itemName: '' })}
        onConfirm={confirmDeleteItem}
        confirmText="Delete"
        cancelText="Cancel"
        showCancel={true}
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
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  listDescription: {
    fontSize: 14,
    marginTop: 4,
  },
  actionsBar: {
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  recipeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterLabel: {
    fontSize: 14,
  },
  pickerContainer: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        width: '100vw',
        height: '100vh',
        display: 'flex',
      },
    }),
  },
  modalContainer: {
    ...Platform.select({
      web: {
        borderRadius: 12,
        width: '100%',
        maxWidth: 600,
        maxHeight: '90vh',
        minHeight: 200,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fff',
        position: 'relative',
        zIndex: 1001,
      },
      default: {
        flex: 1,
        backgroundColor: '#fff',
      },
    }),
  },
  modalContainerWeb: {
    // Additional web-specific styles if needed
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalContent: {
    ...Platform.select({
      web: {
        maxHeight: 'calc(90vh - 80px)',
        overflowY: 'auto',
      },
      default: {
        flex: 1,
      },
    }),
  },
  modalContentContainer: {
    padding: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  editFormTitle: {
    fontSize: 18,
    fontWeight: '600',
    padding: 16,
    paddingBottom: 8,
  },
  addItemFormContainer: {
    padding: 16,
    borderBottomWidth: 1,
  },
  scrollView: {
    flex: 1,
  },
  itemsContainer: {
    padding: 16,
  },
  itemContainer: {
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  backButtonText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});

