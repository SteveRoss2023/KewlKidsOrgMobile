import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import ListService from '../../services/listService';
import { List, UpdateListData, CreateListData } from '../../types/lists';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import ConfirmModal from '../ConfirmModal';
import AddListForm from '../lists/AddListForm';
import { APIError } from '../../services/api';

interface GroceryListsTabProps {
  selectedFamily: { id: number; name: string };
}

export default function GroceryListsTab({ selectedFamily }: GroceryListsTabProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    listId: number | null;
    listName: string;
    itemCount: number;
  }>({
    isOpen: false,
    listId: null,
    listName: '',
    itemCount: 0,
  });
  const [editingList, setEditingList] = useState<List | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (selectedFamily) {
        fetchLists();
      }
    }, [selectedFamily])
  );

  const fetchLists = async () => {
    try {
      setLoading(true);
      const data = await ListService.getLists(selectedFamily.id, 'grocery');
      setLists(data || []);
    } catch (err) {
      console.error('Error fetching grocery lists:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteList = (list: List) => {
    setDeleteConfirm({
      isOpen: true,
      listId: list.id,
      listName: list.name,
      itemCount: list.item_count || 0,
    });
  };

  const confirmDeleteList = async () => {
    if (!deleteConfirm.listId) return;

    try {
      await ListService.deleteList(deleteConfirm.listId);
      await fetchLists();
      setDeleteConfirm({ isOpen: false, listId: null, listName: '', itemCount: 0 });
    } catch (err) {
      console.error('Error deleting list:', err);
      setDeleteConfirm({ isOpen: false, listId: null, listName: '', itemCount: 0 });
    }
  };

  const handleEditList = (list: List) => {
    setEditingList(list);
    setError('');
  };

  const handleUpdateList = async (data: UpdateListData) => {
    if (!editingList) return;

    try {
      setUpdating(true);
      setError('');
      await ListService.updateList(editingList.id, data);
      await fetchLists();
      setEditingList(null);
    } catch (err) {
      console.error('Error updating list:', err);
      const apiError = err as APIError;
      setError(apiError.message || 'Failed to update list. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingList(null);
    setError('');
  };

  const handleCreateList = async (data: CreateListData) => {
    try {
      setCreating(true);
      setError('');
      // Ensure list type is grocery
      const listData = { ...data, list_type: 'grocery' as const };
      await ListService.createList(listData);
      await fetchLists();
      setShowCreateForm(false);
    } catch (err) {
      console.error('Error creating list:', err);
      const apiError = err as APIError;
      setError(apiError.message || 'Failed to create list. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setError('');
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Grocery Lists</Text>
        <TouchableOpacity
          onPress={() => {
            setEditingList(null);
            setShowCreateForm(!showCreateForm);
          }}
          style={[styles.createButton, { backgroundColor: colors.primary }]}
        >
          <FontAwesome name={showCreateForm ? 'times' : 'plus'} size={16} color="#fff" />
          <Text style={styles.createButtonText}>
            {showCreateForm ? 'Cancel' : 'Add Grocery List'}
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={[styles.errorContainer, { backgroundColor: '#FF3B3020' }]}>
          <Text style={[styles.errorText, { color: '#FF3B30' }]}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={lists}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const listColor = item.color || '#10b981'; // Default to green
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.surface }]}
              onPress={() => router.push(`/(tabs)/lists/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={[styles.verticalDivider, { backgroundColor: listColor }]} />
              <View style={[styles.iconContainer, { backgroundColor: listColor }]}>
                <FontAwesome name="shopping-basket" size={20} color="#fff" />
              </View>
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                <View style={styles.cardMeta}>
                  <View style={[styles.typeBadge, { backgroundColor: colors.background }]}>
                    <Text style={[styles.typeBadgeText, { color: colors.text }]}>Grocery</Text>
                  </View>
                  <Text style={[styles.itemCount, { color: colors.textSecondary }]}>
                    {item.item_count || 0} items
                  </Text>
                </View>
              </View>
              <View style={[styles.actionsDivider, { backgroundColor: colors.border }]} />
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleEditList(item);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="pencil" size={16} color="#61AFEF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDeleteList(item);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="trash" size={16} color="#E06C75" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.text }]}>
              No grocery lists found. Create one from the Lists tab!
            </Text>
          </View>
        }
      />
      <ConfirmModal
        visible={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, listId: null, listName: '', itemCount: 0 })}
        onConfirm={confirmDeleteList}
        title="Delete List"
        message={`Are you sure you want to delete "${deleteConfirm.listName}"? This will permanently delete the list and all ${deleteConfirm.itemCount} item(s) associated with it. This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
      {(showCreateForm || editingList) && (
        <Modal
          visible={true}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            if (editingList) {
              handleCancelEdit();
            } else {
              handleCancelCreate();
            }
          }}
        >
          <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingList ? 'Edit List' : 'Create New Grocery List'}
              </Text>
              <TouchableOpacity
                onPress={editingList ? handleCancelEdit : handleCancelCreate}
                style={styles.cancelEditButton}
              >
                <Text style={[styles.cancelEditText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <AddListForm
              editingList={editingList}
              onSubmit={editingList ? handleUpdateList : handleCreateList}
              onCancel={editingList ? handleCancelEdit : handleCancelCreate}
              familyId={selectedFamily.id}
              loading={editingList ? updating : creating}
              defaultListType="grocery"
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
  },
  list: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 0,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 80,
  },
  verticalDivider: {
    width: 6,
    height: '100%',
    marginRight: 0,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 16,
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
    paddingVertical: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  itemCount: {
    fontSize: 14,
  },
  actionsDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    gap: 16,
  },
  actionButton: {
    padding: 8,
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
  modalContainer: {
    flex: 1,
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
    fontWeight: '600',
  },
  cancelEditButton: {
    padding: 8,
  },
  cancelEditText: {
    fontSize: 16,
  },
});

