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
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

// Conditionally import DraggableFlatList to handle cases where reanimated isn't initialized
let DraggableFlatList: any = null;
let ScaleDecorator: any = null;
let RenderItemParams: any = null;

if (Platform.OS !== 'web') {
  try {
    const DraggableFlatListModule = require('react-native-draggable-flatlist');
    DraggableFlatList = DraggableFlatListModule.default;
    ScaleDecorator = DraggableFlatListModule.ScaleDecorator;
    RenderItemParams = DraggableFlatListModule.RenderItemParams;
  } catch (error) {
    console.warn('react-native-draggable-flatlist not available (reanimated may not be initialized):', error);
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
import ConfirmModal from '../../../components/ConfirmModal';
import DraggableListItem from '../../../components/lists/DraggableListItem';
import { APIError } from '../../../services/api';
import apiClient from '../../../services/api';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';
import { speak } from '../../../utils/voiceFeedback';
import { parseAddItem, parseDeleteItem, parseUpdateItem, findMatchingItems } from '../../../utils/voiceCommands';
import VoiceButton from '../../../components/VoiceButton';
import ThemeAwarePicker from '../../../components/lists/ThemeAwarePicker';

export default function ListDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const listId = params.id ? parseInt(params.id as string, 10) : null;
  const { colors, theme } = useTheme();
  const { selectedFamily } = useFamily();
  const [list, setList] = useState<List | null>(null);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [categories, setCategories] = useState<GroceryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
  const [deleteRecipeConfirm, setDeleteRecipeConfirm] = useState<{
    isOpen: boolean;
    recipeName: string;
    itemCount: number;
  }>({
    isOpen: false,
    recipeName: '',
    itemCount: 0,
  });
  const [deletingRecipeItems, setDeletingRecipeItems] = useState(false);
  const [moveItemModal, setMoveItemModal] = useState<{
    isOpen: boolean;
    item: ListItem | null;
  }>({
    isOpen: false,
    item: null,
  });
  const [availableLists, setAvailableLists] = useState<List[]>([]);
  const [selectedTargetListId, setSelectedTargetListId] = useState<number | null>(null);
  const [movingItem, setMovingItem] = useState(false);
  const [moveItemResultModal, setMoveItemResultModal] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error';
  }>({
    visible: false,
    message: '',
    type: 'success',
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
  const isShoppingList = list?.list_type === 'shopping';
  const isTodoList = list?.list_type === 'todo';
  const isIdeasList = list?.list_type === 'ideas';
  const isOtherList = list?.list_type === 'other';
  // Lists that support drag and drop, reordering, and move item features
  const supportsDragAndDrop = isTodoList || isIdeasList || isOtherList;

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

  // Initialize collapsed categories only when list changes (new list loaded)
  // Preserve accordion state when items are added/removed
  const lastListIdRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (isGroceryList && listItems.length > 0) {
      const currentListId = list?.id;

      // Only reset collapsed categories if this is a new list
      if (currentListId !== lastListIdRef.current) {
        lastListIdRef.current = currentListId || null;
        // Compute categories from listItems and collapse all for new list
        const categoryIds = new Set<string>();
        listItems.forEach((item) => {
          const categoryId = item.category ? String(item.category) : 'uncategorized';
          categoryIds.add(categoryId);
        });
        setCollapsedCategories(categoryIds);
      } else {
        // For the same list, just clean up categories that no longer exist
        setCollapsedCategories((prev) => {
          const currentCategoryIds = new Set<string>();
          listItems.forEach((item) => {
            const categoryId = item.category ? String(item.category) : 'uncategorized';
            currentCategoryIds.add(categoryId);
          });

          // Remove categories that no longer exist, but keep the rest
          const newSet = new Set(prev);
          prev.forEach((categoryId) => {
            if (!currentCategoryIds.has(categoryId)) {
              newSet.delete(categoryId);
            }
          });
          return newSet;
        });
      }
    }
  }, [list?.id, isGroceryList, listItems]); // Include listItems to clean up removed categories, but preserve state

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


  const fetchList = async (skipLoading = false) => {
    if (!listId) return;

    try {
      if (!skipLoading) {
        setLoading(true);
      }
      const fetchedList = await ListService.getList(listId);
      setList(fetchedList);
    } catch (err) {
      console.error('Error fetching list:', err);
      if (!skipLoading) {
        router.back();
      }
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  };

  const fetchListItems = async (skipLoading = false) => {
    if (!list) return;

    try {
      if (!skipLoading) {
        setLoadingItems(true);
      }
      const items = await ListService.getListItems(list.id);
      setListItems(items);
    } catch (err) {
      console.error('Error fetching list items:', err);
    } finally {
      if (!skipLoading) {
        setLoadingItems(false);
      }
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

  const handleRefresh = useCallback(async () => {
    if (!listId || !selectedFamily) return;

    setRefreshing(true);
    try {
      // Refresh list, categories, and items in parallel
      await Promise.all([
        fetchList(true), // Skip loading state
        fetchCategories(),
        ListService.getListItems(listId).then(items => setListItems(items)),
      ]);
    } catch (err) {
      console.error('Error refreshing list detail:', err);
    } finally {
      setRefreshing(false);
    }
  }, [listId, selectedFamily]);

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
    if (editingItem && (Platform.OS === 'web' || !supportsDragAndDrop)) {
      items = items.filter((item) => item.id !== editingItem.id);
    }

    return items;
  }, [listItems, selectedRecipeFilter, editingItem, supportsDragAndDrop, Platform.OS]);

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

  // Compute sorted category IDs - memoized and called before early returns
  const sortedCategoryIds = useMemo(() => {
    if (!isGroceryList) return [];
    return Object.keys(groupedItems).sort((a, b) => {
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
    });
  }, [isGroceryList, groupedItems, categories]);

  // Compute areAllCollapsed - memoized and called before early returns
  const areAllCollapsed = useMemo(() => {
    if (!isGroceryList || sortedCategoryIds.length === 0) return true;
    return sortedCategoryIds.every((categoryId) => collapsedCategories.has(categoryId));
  }, [isGroceryList, sortedCategoryIds, collapsedCategories]);

  // Memoize list color to prevent flashing during re-renders
  const listColor = useMemo(() => {
    return list?.color || undefined;
  }, [list?.color]);

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

  const expandAllCategories = () => {
    setCollapsedCategories(new Set());
  };

  const collapseAllCategories = () => {
    if (isGroceryList && listItems.length > 0) {
      const categoryIds = new Set<string>();
      listItems.forEach((item) => {
        const categoryId = item.category ? String(item.category) : 'uncategorized';
        categoryIds.add(categoryId);
      });
      setCollapsedCategories(categoryIds);
    }
  };

  const getCategoryName = (categoryId: string) => {
    if (categoryId === 'uncategorized') return 'Uncategorized';
    const categoryIdNum = parseInt(categoryId, 10);
    const category = categories.find((c) => c.id === categoryIdNum);
    return category ? category.name : 'Unknown';
  };

  const toggleItemComplete = async (item: ListItem) => {
    // For grocery lists, completing an item will delete it and save to history
    if (isGroceryList && !item.completed) {
      // Optimistic update - remove item immediately
      setListItems((prevItems) => prevItems.filter((prevItem) => prevItem.id !== item.id));

      try {
        await ListService.toggleItemComplete(item.id, true);
        // Refresh list items to ensure sync
        await fetchListItems(true);
      } catch (err) {
        console.error('Error completing grocery item:', err);
        // Revert on error - re-add the item
        setListItems((prevItems) => {
          const newItems = [...prevItems, item];
          // Sort by order to maintain position
          return newItems.sort((a, b) => (a.order || 0) - (b.order || 0));
        });
      }
    } else {
      // For non-grocery lists or uncompleting items, use normal toggle
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

  const handleDeleteRecipeItems = () => {
    if (!selectedRecipeFilter) return;

    // Count items that match the recipe filter
    const recipeItems = listItems.filter(
      (item) => item.notes && item.notes === `From recipe: ${selectedRecipeFilter}`
    );

    setDeleteRecipeConfirm({
      isOpen: true,
      recipeName: selectedRecipeFilter,
      itemCount: recipeItems.length,
    });
  };

  const confirmDeleteRecipeItems = async () => {
    if (!selectedRecipeFilter) return;

    try {
      setDeletingRecipeItems(true);

      // Get all items that match the recipe filter
      const recipeItems = listItems.filter(
        (item) => item.notes && item.notes === `From recipe: ${selectedRecipeFilter}`
      );

      // Delete all items in parallel
      await Promise.all(
        recipeItems.map((item) => ListService.deleteListItem(item.id))
      );

      // Refresh the list and clear the filter
      await fetchListItems();
      setSelectedRecipeFilter('');
      setDeleteRecipeConfirm({ isOpen: false, recipeName: '', itemCount: 0 });
    } catch (err) {
      console.error('Error deleting recipe items:', err);
      alert('Failed to delete some items. Please try again.');
    } finally {
      setDeletingRecipeItems(false);
    }
  };

  const handleDragEnd = async (draggedId: string, droppedId: string) => {
    if (!supportsDragAndDrop) return;

    const sortedItems = [...filteredItems].sort((a, b) => {
      if (a.order !== b.order) {
        return (a.order || 0) - (b.order || 0);
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const draggedIndex = sortedItems.findIndex((item) => item.id.toString() === draggedId);
    const droppedIndex = sortedItems.findIndex((item) => item.id.toString() === droppedId);

    if (draggedIndex === -1 || droppedIndex === -1) return;

    // Reorder items
    const newItems = [...sortedItems];
    const [movedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(droppedIndex, 0, movedItem);

    // Update order values
    const updatePromises = newItems.map((item, index) =>
      ListService.updateListItem(item.id, { order: index })
    );

    try {
      await Promise.all(updatePromises);
      await fetchListItems();
    } catch (err) {
      console.error('Error reordering items:', err);
      await fetchListItems(); // Revert by refetching
    }
  };

  // Mobile drag-and-drop handler for DraggableFlatList
  const handleMobileDragEnd = async (data: ListItem[]) => {
    if (!supportsDragAndDrop) return;

    // Update order values based on new positions
    const updatePromises = data.map((item, index) =>
      ListService.updateListItem(item.id, { order: index })
    );

    try {
      await Promise.all(updatePromises);
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
  const handleOpenMoveModal = async (item: ListItem) => {
    if (!selectedFamily) return;

    try {
      // Fetch all lists for the family (excluding the current list)
      const allLists = await ListService.getLists(selectedFamily.id);
      const otherLists = allLists.filter((l) => l.id !== list?.id);
      setAvailableLists(otherLists);
      setSelectedTargetListId(null);
      setMoveItemModal({ isOpen: true, item });
    } catch (err) {
      console.error('Error fetching lists for move:', err);
      setMoveItemResultModal({
        visible: true,
        message: 'Failed to load lists. Please try again.',
        type: 'error',
      });
    }
  };

  const handleMoveItemToList = async () => {
    if (!moveItemModal.item || !selectedTargetListId) return;

    setMovingItem(true);
    try {
      // Update the item's list property - backend serializer includes 'list' in fields
      await apiClient.patch(`/list-items/${moveItemModal.item.id}/`, {
        list: selectedTargetListId,
      });

      // Refresh list items to remove the moved item
      await fetchListItems();

      // Get the target list name for the success message
      const targetList = availableLists.find((l) => l.id === selectedTargetListId);
      const targetListName = targetList?.name || 'the selected list';

      // Close move modal
      setMoveItemModal({ isOpen: false, item: null });
      setSelectedTargetListId(null);

      // Show success message in modal
      setMoveItemResultModal({
        visible: true,
        message: `"${moveItemModal.item.name}" has been moved to "${targetListName}" successfully.`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Error moving item:', err);
      setMoveItemResultModal({
        visible: true,
        message: err?.message || 'Failed to move item. Please try again.',
        type: 'error',
      });
    } finally {
      setMovingItem(false);
    }
  };

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

  const renderItem = ({ item, index, useDraxView = false }: { item: ListItem; index: number; useDraxView?: boolean }) => {
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
            isShoppingList={isShoppingList}
            isTodoList={isTodoList}
            loading={updatingItem}
          />
        </View>
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
        onMove={() => handleOpenMoveModal(item)}
        isGroceryList={isGroceryList}
        isTodoList={isTodoList}
        showDragHandle={useDraxView}
        onMoveUp={!useDraxView && Platform.OS !== 'web' && supportsDragAndDrop ? () => {
          handleMoveItem(item.id, 'up');
        } : undefined}
        onMoveDown={!useDraxView && Platform.OS !== 'web' && supportsDragAndDrop ? () => {
          handleMoveItem(item.id, 'down');
        } : undefined}
      />
    );
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
        <View style={styles.actionsBarTop}>
          <View style={styles.actionButtons}>
            {isSupported && !showAddItem && !editingItem && (
              <VoiceButton
                onPress={handleVoiceClick}
                isListening={isListening}
                disabled={adding || updatingItem}
              />
            )}
            {!showAddItem && !editingItem ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddItem(true);
                  }}
                  style={[styles.addButton, { backgroundColor: colors.primary }]}
                >
                  {Platform.OS === 'web' && <FontAwesome name="plus" size={16} color="#fff" />}
                  <Text style={styles.addButtonText}>
                    {Platform.OS === 'web' ? 'Add Item' : '+Add'}
                  </Text>
                </TouchableOpacity>
                {isGroceryList && (
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/lists/completed')}
                    style={[styles.historyButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    accessibilityLabel="View completed items history"
                    accessibilityHint="Opens the history of completed grocery items"
                  >
                    <FontAwesome name="history" size={16} color={colors.primary} />
                    <Text style={[styles.historyButtonText, { color: colors.textSecondary }]}>History</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : editingItem && !supportsDragAndDrop ? (
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
          {isGroceryList && sortedCategoryIds.length > 0 && (
            <TouchableOpacity
              onPress={areAllCollapsed ? expandAllCategories : collapseAllCategories}
              style={[styles.expandCollapseButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <FontAwesome
                name={areAllCollapsed ? 'chevron-down' : 'chevron-up'}
                size={14}
                color={colors.textSecondary}
              />
              <Text
                style={[styles.expandCollapseButtonText, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {areAllCollapsed ? 'Expand' : 'Collapse'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {isGroceryList && availableRecipes.length > 0 && (
          <View style={styles.recipeFilterRow}>
            <FontAwesome name="filter" size={16} color={colors.textSecondary} />
            <View style={styles.pickerWrapper}>
              <ThemeAwarePicker
                selectedValue={selectedRecipeFilter}
                onValueChange={(value) => setSelectedRecipeFilter(value as string)}
                options={[
                  { label: 'All items', value: '' },
                  ...availableRecipes.map(recipe => ({ label: recipe, value: recipe })),
                ]}
                placeholder="All items"
              />
            </View>
            {selectedRecipeFilter && (
              <View style={styles.deleteButtonWrapper}>
                <TouchableOpacity
                  onPress={handleDeleteRecipeItems}
                  style={[styles.deleteRecipeButton, { backgroundColor: '#E06C75' }]}
                  disabled={deletingRecipeItems}
                >
                  {deletingRecipeItems ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <FontAwesome name="trash" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Divider after filter */}
      {isGroceryList && availableRecipes.length > 0 && (
        <View style={[styles.filterDivider, { borderBottomColor: colors.border }]} />
      )}

      {showAddItem && !editingItem && (
        <ScrollView
          style={[styles.addItemFormContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          keyboardShouldPersistTaps="handled"
        >
          <AddItemForm
            onSubmit={(data) => {
              handleAddItem(data as CreateListItemData);
            }}
            onCancel={() => {
              setShowAddItem(false);
            }}
            listId={list.id}
            categories={categories}
            isGroceryList={isGroceryList}
            isShoppingList={isShoppingList}
            isTodoList={isTodoList}
            loading={adding}
          />
        </ScrollView>
      )}

      {editingItem && (
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
                  style={styles.modalContentScroll}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.modalContentContainer}
                >
                  <AddItemForm
                    editingItem={editingItem}
                    onSubmit={(data) => {
                      handleUpdateItem(data as UpdateListItemData);
                    }}
                    onCancel={() => {
                      setEditingItem(null);
                    }}
                    listId={list.id}
                    categories={categories}
                    isGroceryList={isGroceryList}
                    isShoppingList={isShoppingList}
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
                style={styles.modalContentScroll}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalContentContainer}
              >
                <AddItemForm
                  editingItem={editingItem}
                  onSubmit={(data) => {
                    handleUpdateItem(data as UpdateListItemData);
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
      ) : isGroceryList && listColor ? (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {sortedCategoryIds.map((categoryId) => {
            const categoryItems = groupedItems[categoryId];
            const categoryName = getCategoryName(categoryId);
            const isCollapsed = collapsedCategories.has(categoryId);
            const isUncategorized = categoryId === 'uncategorized';

            // Only render if we have a valid listColor to prevent flashing
            if (!listColor) return null;

            return (
              <CategoryGroup
                key={categoryId}
                categoryId={categoryId}
                categoryName={categoryName}
                items={categoryItems}
                isCollapsed={isCollapsed}
                listColor={listColor}
                onToggleCollapse={() => toggleCategory(categoryId)}
                onToggleItemComplete={toggleItemComplete}
                onEditItem={(item) => {
                  setEditingItem(item);
                }}
                onDeleteItem={handleDeleteItem}
                onMoveItem={handleOpenMoveModal}
                isUncategorized={isUncategorized}
              />
            );
          })}
        </ScrollView>
      ) : Platform.OS === 'web' && supportsDragAndDrop ? (
        // Web drag-and-drop: Use FlatList with DraggableListItem
        <FlatList
          data={[...filteredItems].sort((a, b) => {
            if (a.order !== b.order) {
              return (a.order || 0) - (b.order || 0);
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          renderItem={({ item, index }) => (
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
              onMove={() => handleOpenMoveModal(item)}
              isGroceryList={isGroceryList}
              isTodoList={isTodoList}
            />
          )}
          contentContainerStyle={styles.itemsContainer}
        />
      ) : Platform.OS !== 'web' && supportsDragAndDrop && DraggableFlatList ? (
        // Mobile drag-and-drop: Use DraggableFlatList (if available)
        <DraggableFlatList
          data={[...filteredItems].sort((a, b) => {
            if (a.order !== b.order) {
              return (a.order || 0) - (b.order || 0);
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })}
          keyExtractor={(item: ListItem) => item.id.toString()}
          onDragEnd={({ data }: { data: ListItem[] }) => handleMobileDragEnd(data)}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          renderItem={({ item, drag }: any) => (
            <ScaleDecorator>
              <ListItemComponent
                item={item}
                onToggleComplete={() => toggleItemComplete(item)}
                onEdit={() => {
                  setEditingItem(item);
                }}
                onDelete={() => handleDeleteItem(item)}
                onMove={() => handleOpenMoveModal(item)}
                isGroceryList={isGroceryList}
                isTodoList={isTodoList}
                onDrag={drag}
                showDragHandle={true}
              />
            </ScaleDecorator>
          )}
          contentContainerStyle={styles.itemsContainer}
        />
      ) : (
        // Mobile without drag-and-drop: Use regular FlatList (for Grocery/Shopping lists)
        <FlatList
          data={[...filteredItems].sort((a, b) => {
            if (a.order !== b.order) {
              return (a.order || 0) - (b.order || 0);
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          renderItem={({ item }) => (
            <ListItemComponent
              item={item}
              onToggleComplete={() => toggleItemComplete(item)}
              onEdit={() => {
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
      <ConfirmModal
        visible={deleteRecipeConfirm.isOpen}
        title="Delete Recipe Items"
        message={`Are you sure you want to delete all ${deleteRecipeConfirm.itemCount} item(s) from "${deleteRecipeConfirm.recipeName}"? This action cannot be undone.`}
        type="danger"
        onClose={() => setDeleteRecipeConfirm({ isOpen: false, recipeName: '', itemCount: 0 })}
        onConfirm={confirmDeleteRecipeItems}
        confirmText="Delete All"
        cancelText="Cancel"
      />
      <Modal
        visible={moveItemModal.isOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMoveItemModal({ isOpen: false, item: null })}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
          <View style={[styles.modalContentSecondary, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeaderSecondary}>
              <Text style={[styles.modalTitleSecondary, { color: colors.text }]}>Move Item</Text>
              <TouchableOpacity
                onPress={() => setMoveItemModal({ isOpen: false, item: null })}
                style={styles.modalCloseButtonSecondary}
              >
                <FontAwesome name="times" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {moveItemModal.item && (
              <>
                <View style={[styles.itemPreview, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.itemPreviewName, { color: colors.text }]}>
                    {moveItemModal.item.name}
                  </Text>
                  {moveItemModal.item.quantity && (
                    <Text style={[styles.itemPreviewQuantity, { color: colors.textSecondary }]}>
                      Quantity: {moveItemModal.item.quantity}
                    </Text>
                  )}
                  {moveItemModal.item.notes && !moveItemModal.item.notes.startsWith('From recipe:') && (
                    <Text style={[styles.itemPreviewNotes, { color: colors.textSecondary }]}>
                      {moveItemModal.item.notes}
                    </Text>
                  )}
                </View>

                <View style={styles.pickerContainer}>
                  <Text style={[styles.pickerLabel, { color: colors.text }]}>Move to list:</Text>
                  <ThemeAwarePicker
                    selectedValue={selectedTargetListId}
                    onValueChange={(value) => {
                      if (value === null || value === '') {
                        setSelectedTargetListId(null);
                      } else {
                        setSelectedTargetListId(Number(value));
                      }
                    }}
                    options={availableLists.map((l) => ({
                      label: l.name,
                      value: l.id,
                    }))}
                    placeholder="Select a list"
                    enabled={true}
                  />
                </View>

                <View style={[styles.modalButtons, { marginTop: 24 }]}>
                  <TouchableOpacity
                    onPress={() => setMoveItemModal({ isOpen: false, item: null })}
                    style={[styles.modalButton, styles.cancelButtonSecondary, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleMoveItemToList}
                    disabled={!selectedTargetListId || movingItem}
                    style={[
                      styles.modalButton,
                      styles.confirmButton,
                      { backgroundColor: colors.primary },
                      (!selectedTargetListId || movingItem) && styles.disabledButton,
                    ]}
                  >
                    {movingItem ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalButtonTextWhite}>Move</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      <AlertModal
        visible={moveItemResultModal.visible}
        title={moveItemResultModal.type === 'success' ? 'Item Moved' : 'Error'}
        message={moveItemResultModal.message}
        type={moveItemResultModal.type}
        onClose={() => setMoveItemResultModal({ visible: false, message: '', type: 'success' })}
        confirmText="OK"
      />
    </View>
  );
}

// @ts-ignore - Web-specific styles cause type conflicts
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
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'web' ? 16 : 0, // No bottom padding on mobile
    borderBottomWidth: 1,
    gap: 0,
  },
  actionsBarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Platform.OS === 'web' ? 12 : 8, // Reduced margin on mobile
    gap: 8,
    flexWrap: Platform.OS === 'web' ? 'nowrap' : 'wrap',
  },
  recipeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.OS === 'web' ? 12 : 8,
    width: '100%',
    paddingHorizontal: Platform.OS === 'web' ? 0 : 0, // No horizontal padding since actionsBar has it
    marginTop: 0, // No top margin - actionsBarTop marginBottom handles spacing
    marginBottom: 0, // No bottom margin
    flexWrap: 'nowrap',
  },
  filterDivider: {
    borderBottomWidth: 1,
    marginHorizontal: Platform.OS === 'web' ? 0 : 16,
    marginVertical: 0, // No vertical margin
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web'
      ? { minWidth: 120, flexShrink: 0 }
      : {
        width: '100%',
        marginBottom: 4,
      }
    ),
  },
  pickerWrapper: {
    ...(Platform.OS === 'web'
      ? { flex: 1, minWidth: 150 }
      : {
        flex: 2, // Give more flex space to dropdown
        minWidth: 200, // Increased width to prevent text wrapping
        minHeight: 40, // Smaller height for mobile
        marginRight: 8, // Add spacing before delete button if present
        marginBottom: 0, // No bottom margin
        flexShrink: 1,
      }
    ),
  },
  spacer: {
    ...(Platform.OS === 'web'
      ? {}
      : {
        height: 16, // Explicit spacer to push delete button down
        width: '100%',
      }
    ),
  },
  deleteButtonWrapper: {
    ...(Platform.OS === 'web'
      ? {}
      : {
        flexShrink: 0, // Don't shrink delete button
        marginLeft: 8, // Add spacing from dropdown
        alignItems: 'flex-start', // Align button to left, not full width
      }
    ),
  },
  deleteRecipeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    ...(Platform.OS === 'web'
      ? { flexShrink: 0 }
      : {
        alignSelf: 'flex-start', // Don't stretch to full width
        marginTop: 0,
      }
    ),
  },
  deleteRecipeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    flex: Platform.OS === 'web' ? 1 : 0,
    ...(Platform.OS !== 'web' ? { minWidth: 0 } : {}),
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    gap: 6,
    flexShrink: 0,
  },
  addButtonText: {
    color: '#fff',
    fontSize: Platform.OS === 'web' ? 14 : 13,
    fontWeight: '600',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    gap: 6,
    flexShrink: 0,
    borderWidth: 1,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  historyButtonText: {
    fontSize: Platform.OS === 'web' ? 14 : 13,
    fontWeight: '600',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    gap: 6,
    flexShrink: 0,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: Platform.OS === 'web' ? 14 : 13,
    fontWeight: '600',
  },
  // @ts-ignore - Web-specific styles in Platform.select
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    // @ts-ignore - Web-specific styles
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
  // @ts-ignore - Web-specific styles in Platform.select
  modalContainer: {
    // @ts-ignore - Web-specific styles
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
  // @ts-ignore - Web-specific styles in Platform.select
  modalContentScroll: {
    // @ts-ignore - Web-specific styles
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
    ...(Platform.OS !== 'web' ? {
      zIndex: 200,
      position: 'relative',
    } : {}),
  },
  itemsContainer: {
    padding: 16,
    ...(Platform.OS !== 'web' ? {
      zIndex: 200,
    } : {}),
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
  expandCollapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    flexShrink: 0,
    flexWrap: 'nowrap',
  },
  expandCollapseButtonText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 0,
  },
  modalOverlaySecondary: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContentSecondary: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    ...Platform.select({
      web: {
        // @ts-ignore - web-specific boxShadow
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
  },
  modalHeaderSecondary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitleSecondary: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalCloseButtonSecondary: {
    padding: 4,
  },
  itemPreview: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  itemPreviewName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemPreviewQuantity: {
    fontSize: 14,
    marginTop: 4,
  },
  itemPreviewNotes: {
    fontSize: 14,
    marginTop: 4,
  },
  pickerContainer: {
    marginBottom: 20,
  },
  pickerLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButtonSecondary: {
    borderWidth: 1,
  },
  confirmButton: {
    // backgroundColor set inline
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextWhite: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
}) as any; // Type assertion to bypass web-specific style type errors

