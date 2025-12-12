import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import GlobalNavBar from '../../../components/GlobalNavBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { useFamily } from '../../../contexts/FamilyContext';
import ListService from '../../../services/listService';
import { List, ListItem, GroceryCategory, CreateListItemData, UpdateListItemData } from '../../../types/lists';
import ListItemComponent from '../../../components/lists/ListItemComponent';
import CategoryGroup from '../../../components/lists/CategoryGroup';
import AddItemForm from '../../../components/lists/AddItemForm';
import AlertModal from '../../../components/AlertModal';
import DraggableListItem from '../../../components/lists/DraggableListItem';
import { APIError } from '../../../services/api';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';
import { speak } from '../../../utils/voiceFeedback';
import { parseAddItem, parseDeleteItem, parseUpdateItem, findMatchingItems } from '../../../utils/voiceCommands';
import VoiceButton from '../../../components/VoiceButton';

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
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Voice recognition
  const { isListening, transcript, start, stop, reset, isSupported } = useVoiceRecognition();
  const lastProcessedTranscriptRef = useRef('');
  const [awaitingNumberSelection, setAwaitingNumberSelection] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<ListItem[]>([]);
  const [pendingAction, setPendingAction] = useState<'delete' | 'update' | null>(null);

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
    if (isGroceryList && listItems.length > 0) {
      // Compute categories from listItems directly
      const categoryIds = new Set<string>();
      listItems.forEach((item) => {
        const categoryId = item.category ? String(item.category) : 'uncategorized';
        categoryIds.add(categoryId);
      });
      setCollapsedCategories(categoryIds);
    }
  }, [list?.id, isGroceryList, listItems.length]);

  // Handle voice commands
  useEffect(() => {
    if (!transcript || !isSupported || !list) return;

    // Prevent duplicate processing of the same transcript
    if (transcript === lastProcessedTranscriptRef.current) return;
    lastProcessedTranscriptRef.current = transcript;

    const handleVoiceCommand = async () => {
      const text = transcript.toLowerCase().trim();

      try {
        // Handle number selection for multiple matches
        if (awaitingNumberSelection) {
          const number = parseInt(text);
          if (number >= 1 && number <= pendingMatches.length) {
            const selected = pendingMatches[number - 1];
            stop();

            if (pendingAction === 'delete') {
              try {
                await ListService.deleteListItem(selected.id);
                await fetchListItems();
                speak('Item deleted successfully.');
              } catch (err) {
                console.error('Error deleting item:', err);
                speak('Sorry, I could not delete the item.');
              }
            } else if (pendingAction === 'update') {
              speak('Please use the update command with both old and new names.');
            }
            setAwaitingNumberSelection(false);
            setPendingMatches([]);
            setPendingAction(null);
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          } else {
            speak('Invalid selection. Please try again.');
            setAwaitingNumberSelection(false);
            setPendingMatches([]);
            setPendingAction(null);
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
        }

        // Ignore transcripts that look like feedback messages
        const feedbackPatterns = [
          'added successfully',
          'deleted successfully',
          'updated successfully',
          'could not add',
          'could not delete',
          'could not update',
          'could not find',
          'please use',
          'sorry',
          'error',
          'try again',
          'please specify',
        ];
        if (feedbackPatterns.some((pattern) => text.includes(pattern))) {
          console.log('🎤 [LIST DETAIL] Ignoring feedback message:', text);
          lastProcessedTranscriptRef.current = '';
          reset();
          stop();
          return;
        }

        // Parse add item command
        const addItemCmd = parseAddItem(text);
        if (addItemCmd) {
          stop();

          try {
            await ListService.createListItem({
              list: list.id,
              name: addItemCmd.name,
            });
            await fetchListItems();
            speak('Item added successfully.');
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          } catch (err) {
            console.error('Error adding item:', err);
            speak('Sorry, I could not add the item. Please try again.');
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
        }

        // Parse delete item command
        const deleteItemCmd = parseDeleteItem(text);
        if (deleteItemCmd) {
          stop();

          const matches = findMatchingItems(listItems, deleteItemCmd.name, (item) => item.name);
          if (matches.length === 0) {
            speak('Sorry, I could not find that item.');
          } else if (matches.length === 1) {
            try {
              await ListService.deleteListItem(matches[0].id);
              await fetchListItems();
              speak('Item deleted successfully.');
            } catch (err) {
              console.error('Error deleting item:', err);
              speak('Sorry, I could not delete the item.');
            }
          } else {
            // Multiple matches - ask for clarification
            let message = 'I found multiple matching items. Please specify which one to delete: ';
            matches.forEach((item, index) => {
              message += `${index + 1}: ${item.name}. `;
            });
            setPendingMatches(matches);
            setPendingAction('delete');
            setAwaitingNumberSelection(true);
            lastProcessedTranscriptRef.current = '';
            speak(message, () => {
              setTimeout(() => {
                start();
              }, 500);
            });
            return;
          }
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        // Parse update item command
        const updateItemCmd = parseUpdateItem(text);
        if (updateItemCmd) {
          stop();

          const matches = findMatchingItems(listItems, updateItemCmd.oldName, (item) => item.name);
          if (matches.length === 0) {
            speak('Sorry, I could not find that item.');
          } else if (matches.length === 1) {
            try {
              await ListService.updateListItem(matches[0].id, {
                name: updateItemCmd.newName,
              });
              await fetchListItems();
              speak('Item updated successfully.');
            } catch (err) {
              console.error('Error updating item:', err);
              speak('Sorry, I could not update the item. Please try again.');
            }
          } else {
            // Multiple matches - ask for clarification
            let message = 'I found multiple matching items. Please specify which one to update: ';
            matches.forEach((item, index) => {
              message += `${index + 1}: ${item.name}. `;
            });
            setPendingMatches(matches);
            setPendingAction('update');
            setAwaitingNumberSelection(true);
            lastProcessedTranscriptRef.current = '';
            speak(message, () => {
              setTimeout(() => {
                start();
              }, 500);
            });
            return;
          }
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        // No command matched
        speak('Please use one of these commands: add item name, delete item name, or update item name to new name');
        lastProcessedTranscriptRef.current = '';
        reset();
      } catch (error) {
        console.error('Error processing voice command:', error);
        speak('Sorry, there was an error. Please try again.');
        reset();
      }
    };

    handleVoiceCommand();
  }, [transcript, list, listItems, awaitingNumberSelection, pendingMatches, pendingAction, isSupported]);

  const handleVoiceClick = () => {
    if (isListening) {
      stop();
      reset();
      return;
    }

    if (Platform.OS === 'web' && !isSupported) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    // Reset state
    reset();
    setAwaitingNumberSelection(false);
    setPendingMatches([]);
    setPendingAction(null);

    // Start recognition briefly to capture user gesture (required for permission)
    // Then stop it, speak instruction, and restart after instruction finishes
    try {
      start();
      setTimeout(() => {
        stop();
        speak(
          'Please say add followed by your item to add an item, delete followed by the item name to delete, or update followed by the item name and new name to update',
          () => {
            setTimeout(() => {
              start();
            }, 100);
          }
        );
      }, 50);
    } catch (err) {
      console.error('Error starting recognition:', err);
      alert('Unable to start voice recognition. Please check your microphone permissions.');
    }
  };


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
      const newItem = await ListService.createListItem(data);
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
      return;
    }

    try {
      setUpdatingItem(true);
      await ListService.updateListItem(editingItem.id, data);
      // Close the modal immediately to prevent showing stale data
      setEditingItem(null);
      await fetchListItems();
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

  // Web drag-and-drop handlers
  const handleWebDragStart = (itemId: number) => {
    setDraggedItemId(itemId);
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

    if (draggedItemId === null) {
      return;
    }

    const sortedItems = [...filteredItems].sort((a, b) => {
      if (a.order !== b.order) {
        return (a.order || 0) - (b.order || 0);
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const draggedItem = sortedItems.find((item) => item.id === draggedItemId);
    if (!draggedItem) return;

    const dragIndex = sortedItems.findIndex((item) => item.id === draggedItemId);
    if (dragIndex === -1 || dragIndex === dropIndex) {
      setDraggedItemId(null);
      return;
    }

    // Reorder items
    const newItems = [...sortedItems];
    newItems.splice(dragIndex, 1);
    newItems.splice(dropIndex, 0, draggedItem);

    // Update order values
    const updatePromises = newItems.map((item, index) =>
      ListService.updateListItem(item.id, { order: index })
    );

    try {
      await Promise.all(updatePromises);
      setListItems(newItems);
      await fetchListItems();
    } catch (err) {
      console.error('Error reordering items:', err);
      await fetchListItems(); // Revert by refetching
    }

    setDraggedItemId(null);
  };

  const handleWebDragEnd = () => {
    setDraggedItemId(null);
    setDragOverIndex(null);
  };

  // Simple move functions for mobile when DraggableFlatList is not available
  const handleMoveItem = async (itemId: number, direction: 'up' | 'down') => {
    const sortedItems = [...filteredItems].sort((a, b) => {
      if (a.order !== b.order) {
        return (a.order || 0) - (b.order || 0);
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const currentIndex = sortedItems.findIndex((item) => item.id === itemId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sortedItems.length) return;

    // Swap items
    const newItems = [...sortedItems];
    [newItems[currentIndex], newItems[newIndex]] = [newItems[newIndex], newItems[currentIndex]];

    // Update order values
    const updatePromises = newItems.map((item, index) =>
      ListService.updateListItem(item.id, { order: index })
    );

    try {
      await Promise.all(updatePromises);
      await fetchListItems();
    } catch (err) {
      console.error('Error moving item:', err);
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
          setEditingItem(item);
        }}
        onDelete={() => handleDeleteItem(item)}
        isGroceryList={isGroceryList}
        isTodoList={isTodoList}
        onDrag={drag ? () => {
          drag();
        } : undefined}
        onMoveUp={!DraggableFlatList && Platform.OS !== 'web' && isTodoList ? () => {
          handleMoveItem(item.id, 'up');
        } : undefined}
        onMoveDown={!DraggableFlatList && Platform.OS !== 'web' && isTodoList ? () => {
          handleMoveItem(item.id, 'down');
        } : undefined}
      />
    );

    if (isTodoList && ScaleDecorator && drag && Platform.OS !== 'web') {
      return (
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={() => {
              drag();
            }}
            disabled={isActive}
            activeOpacity={0.7}
            style={isActive ? { opacity: 0.5 } : undefined}
            delayLongPress={300} // Reduce delay to 300ms for better UX
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
          {isSupported && !showAddItem && !editingItem && (
            <VoiceButton
              onPress={handleVoiceClick}
              isListening={isListening}
              disabled={adding || updatingItem}
            />
          )}
          {!showAddItem && !editingItem ? (
            <TouchableOpacity
              onPress={() => {
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
              handleAddItem(data);
            }}
            onCancel={() => {
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
                      handleUpdateItem(data);
                    }}
                    onCancel={() => {
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
                      handleUpdateItem(data);
                    }}
                    onCancel={() => {
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
                  setEditingItem(item);
                }}
                onDeleteItem={handleDeleteItem}
                isUncategorized={isUncategorized}
              />
            );
          })}
        </ScrollView>
      ) : isTodoList && DraggableFlatList && GestureHandlerRootView && Platform.OS !== 'web' ? (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <DraggableFlatList
            data={[...filteredItems].sort((a, b) => {
              if (a.order !== b.order) {
                return (a.order || 0) - (b.order || 0);
              }
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            })}
            onDragEnd={(params) => {
              handleDragEnd(params);
            }}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={styles.itemsContainer}
          />
        </GestureHandlerRootView>
      ) : (
        <FlatList
          data={[...filteredItems].sort((a, b) => {
            if (a.order !== b.order) {
              return (a.order || 0) - (b.order || 0);
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item, index }) => {
            if (Platform.OS === 'web' && isTodoList) {
              return (
                <DraggableListItem
                  item={item}
                  index={index}
                  draggedItemId={draggedItemId}
                  dragOverIndex={dragOverIndex}
                  onDragStart={handleWebDragStart}
                  onDragOver={handleWebDragOver}
                  onDragLeave={handleWebDragLeave}
                  onDrop={handleWebDrop}
                  onDragEnd={handleWebDragEnd}
                  onToggleComplete={() => toggleItemComplete(item)}
                  onEdit={() => {
                    setEditingItem(item);
                  }}
                  onDelete={() => handleDeleteItem(item)}
                  isGroceryList={isGroceryList}
                  isTodoList={isTodoList}
                />
              );
            }
            
            return (
              <ListItemComponent
                item={item}
                onToggleComplete={() => toggleItemComplete(item)}
                onEdit={() => {
                  setEditingItem(item);
                }}
                onDelete={() => handleDeleteItem(item)}
                isGroceryList={isGroceryList}
                isTodoList={isTodoList}
                onMoveUp={!DraggableFlatList && Platform.OS !== 'web' && isTodoList ? () => {
                  handleMoveItem(item.id, 'up');
                } : undefined}
                onMoveDown={!DraggableFlatList && Platform.OS !== 'web' && isTodoList ? () => {
                  handleMoveItem(item.id, 'down');
                } : undefined}
              />
            );
          }}
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
  draggingItem: {
    opacity: 0.5,
    // @ts-ignore - web-specific cursor style
    ...(Platform.OS === 'web' && { cursor: 'grabbing' }),
  },
  dragOverItem: {
    borderTopWidth: 2,
    borderTopColor: '#007AFF',
    // @ts-ignore - web-specific border style
    ...(Platform.OS === 'web' && { borderTopStyle: 'solid' }),
  },
});

