import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import ListService from '../../services/listService';
import { List, ListType, CreateListData, UpdateListData } from '../../types/lists';
import ListCard from '../../components/lists/ListCard';
import AddListForm from '../../components/lists/AddListForm';
import AlertModal from '../../components/AlertModal';
import { APIError } from '../../services/api';

type ActiveTab = 'todo' | 'grocery' | 'shopping' | 'other';

export default function ListsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('todo');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
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

  // Load lists when family changes or screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (selectedFamily) {
        fetchLists();
      } else {
        setLists([]);
      }
    }, [selectedFamily])
  );

  const fetchLists = async () => {
    if (!selectedFamily) return;

    try {
      setLoading(true);
      setError('');
      const fetchedLists = await ListService.getLists(selectedFamily.id);
      setLists(fetchedLists);
    } catch (err) {
      console.error('Error fetching lists:', err);
      const apiError = err as APIError;
      setError(apiError.message || 'Failed to load lists. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async (data: CreateListData) => {
    if (!selectedFamily) return;

    try {
      setCreating(true);
      setError('');
      await ListService.createList(data);
      await fetchLists();
      setShowCreateForm(false);
      // Switch to the tab of the newly created list
      setActiveTab(data.list_type as ActiveTab);
    } catch (err) {
      console.error('Error creating list:', err);
      const apiError = err as APIError;
      setError(apiError.message || 'Failed to create list. Please try again.');
    } finally {
      setCreating(false);
    }
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
      setError('Failed to delete list. Please try again.');
    }
  };

  const handleEditList = (list: List) => {
    setEditingList(list);
    setShowCreateForm(false);
  };

  const handleCancelEdit = () => {
    setEditingList(null);
    setError('');
  };

  const handleListPress = (listId: number) => {
    router.push(`/(tabs)/lists/${listId}`);
  };

  const filteredLists = lists.filter((list) => list.list_type === activeTab);

  if (!selectedFamily) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.emptyState}>
          <FontAwesome name="list" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Please select a family to view lists
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          Lists - {selectedFamily.name}
        </Text>
        <TouchableOpacity
          onPress={() => {
            setEditingList(null);
            setShowCreateForm(!showCreateForm);
          }}
          style={[styles.createButton, { backgroundColor: colors.primary }]}
        >
          <FontAwesome name={showCreateForm ? 'times' : 'plus'} size={16} color="#fff" />
          <Text style={styles.createButtonText}>
            {showCreateForm ? 'Cancel' : 'Create List'}
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={[styles.errorContainer, { backgroundColor: '#FF3B3020' }]}>
          <Text style={[styles.errorText, { color: '#FF3B30' }]}>{error}</Text>
        </View>
      ) : null}

      {(showCreateForm || editingList) && (
        <Modal
          visible={true}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            if (editingList) {
              handleCancelEdit();
            } else {
              setShowCreateForm(false);
            }
          }}
        >
          <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingList ? 'Edit List' : 'Create New List'}
              </Text>
              {editingList && (
                <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelEditButton}>
                  <Text style={[styles.cancelEditText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
            <AddListForm
              editingList={editingList}
              onSubmit={editingList ? handleUpdateList : handleCreateList}
              onCancel={() => {
                if (editingList) {
                  handleCancelEdit();
                } else {
                  setShowCreateForm(false);
                }
              }}
              familyId={selectedFamily.id}
              loading={creating || updating}
            />
          </View>
        </Modal>
      )}

      <View style={[styles.tabsContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {(['todo', 'grocery', 'shopping', 'other'] as ActiveTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab,
                activeTab === tab && { backgroundColor: colors.primary },
                { borderColor: colors.border },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab ? '#fff' : colors.text },
                ]}
              >
                {tab === 'todo' ? 'To-Do' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading lists...</Text>
        </View>
      ) : filteredLists.length === 0 ? (
        <View style={styles.emptyState}>
          <FontAwesome name="list-ul" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No {activeTab} lists yet. Create your first list!
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredLists}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <ListCard
              list={item}
              onPress={() => handleListPress(item.id)}
              onEdit={() => handleEditList(item)}
              onDelete={() => handleDeleteList(item)}
            />
          )}
          contentContainerStyle={styles.listsContainer}
          refreshing={loading}
          onRefresh={fetchLists}
        />
      )}

      <AlertModal
        visible={deleteConfirm.isOpen}
        title="Delete List"
        message={`Are you sure you want to delete "${deleteConfirm.listName}"? This will permanently delete the list and all ${deleteConfirm.itemCount} item(s) associated with it. This action cannot be undone.`}
        type="error"
        onClose={() => setDeleteConfirm({ isOpen: false, listId: null, listName: '', itemCount: 0 })}
        onConfirm={confirmDeleteList}
        confirmText="Delete List"
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
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
    fontWeight: 'bold',
  },
  cancelEditButton: {
    padding: 8,
  },
  cancelEditText: {
    fontSize: 16,
  },
  tabsContainer: {
    borderBottomWidth: 1,
  },
  tabs: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
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
  listsContainer: {
    padding: 16,
  },
});

