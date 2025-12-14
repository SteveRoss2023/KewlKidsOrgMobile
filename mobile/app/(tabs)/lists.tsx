import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';
import { speak } from '../../utils/voiceFeedback';
import { parseCreateList } from '../../utils/voiceCommands';
import VoiceButton from '../../components/VoiceButton';

type ActiveTab = 'todo' | 'grocery' | 'shopping' | 'other';

export default function ListsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  // Voice recognition
  const { isListening, transcript, start, stop, reset, isSupported } = useVoiceRecognition();
  const lastProcessedTranscriptRef = useRef('');
  const [awaitingListType, setAwaitingListType] = useState(false);
  const [pendingListName, setPendingListName] = useState<string | null>(null);

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

  // Handle voice commands
  useEffect(() => {
    if (!transcript || !isSupported || !selectedFamily) return;

    // Prevent duplicate processing of the same transcript
    if (transcript === lastProcessedTranscriptRef.current) return;
    lastProcessedTranscriptRef.current = transcript;

    const handleVoiceCommand = async () => {
      const text = transcript.toLowerCase().trim();

      try {
        // Handle list type selection if we're waiting for it (check this FIRST)
        if (awaitingListType) {
          // Ignore if this looks like the prompt message being repeated back
          if (text.includes('what type of list') || text.includes('say todo') || text.includes('say grocery') || 
              text.includes('say shopping') || text.includes('say other')) {
            console.log('🎤 [LISTS] Ignoring prompt message:', text);
            lastProcessedTranscriptRef.current = '';
            reset();
            // Restart listening
            setTimeout(() => {
              start({ ignoreTranscriptsForMs: 2000 });
            }, 300); // Reduced from 500ms to 300ms
            return;
          }

          const normalizedType = text.toLowerCase().trim();
          let listType: ListType | null = null;
          
          // Normalize "to do" variations
          const normalizedForTodo = normalizedType.replace(/\s+/g, ' '); // Normalize spaces
          
          // Check for exact matches first (most common case)
          // Handle "to do" as two words
          if (normalizedType === 'todo' || normalizedType === 'to do' || normalizedType === 'to-do' || 
              normalizedType === '1' || normalizedType === 'one' || normalizedForTodo === 'to do') {
            listType = 'todo';
          } else if (normalizedType === 'grocery' || normalizedType === '2' || normalizedType === 'two') {
            listType = 'grocery';
          } else if (normalizedType === 'shopping' || normalizedType === '3' || normalizedType === 'three') {
            listType = 'shopping';
          } else if (normalizedType === 'other' || normalizedType === '4' || normalizedType === 'four') {
            listType = 'other';
          } 
          // Check for partial matches (but be careful not to match "say todo" etc.)
          else if (normalizedType.includes('todo') || normalizedType.includes('to do') || normalizedType.includes('to-do')) {
            // Make sure it's not part of "say todo" or similar
            if (!normalizedType.includes('say')) {
              listType = 'todo';
            }
          } else if (normalizedType.includes('grocery') && !normalizedType.includes('say')) {
            listType = 'grocery';
          } else if (normalizedType.includes('shopping') && !normalizedType.includes('say')) {
            listType = 'shopping';
          } else if (normalizedType.includes('other') && !normalizedType.includes('say')) {
            listType = 'other';
          }
          
          if (!listType) {
            // Invalid selection - ask again but don't reset everything
            console.log('🎤 [LISTS] Invalid list type response:', text);
            speak('Invalid selection. Please say: to do, grocery, shopping, or other', () => {
              setTimeout(() => {
                start({ ignoreTranscriptsForMs: 2000 });
              }, 300); // Reduced from 500ms to 300ms
            });
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }

          stop();
          setAwaitingListType(false);
          
          if (pendingListName) {
            try {
              setCreating(true);
              setError('');
              await ListService.createList({
                name: pendingListName,
                description: '',
                list_type: listType,
                color: '#10b981',
                family: selectedFamily.id,
              });

              await fetchLists();
              const listTypeDisplay = listType === 'todo' ? 'to do' : listType;
              speak(`List "${pendingListName}" created successfully as a ${listTypeDisplay} list.`);
              setCreating(false);
              setPendingListName(null);
            } catch (err) {
              console.error('Error creating list:', err);
              const apiError = err as APIError;
              setError(apiError.message || 'Failed to create list. Please try again.');
              speak('Sorry, I could not create the list. Please try again.');
              setCreating(false);
              setPendingListName(null);
            }
          }
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        // Ignore transcripts that look like feedback messages (to prevent feedback loops)
        // But only if we're NOT waiting for list type (to avoid blocking valid responses)
        if (!awaitingListType) {
          const feedbackPatterns = [
            'created successfully',
            'could not create',
            'please use',
            'please say',
            'sorry',
            'error',
            'try again',
            'what type of list',
            'invalid selection',
            'say todo',
            'say grocery',
            'say shopping',
            'say other',
          ];
          if (feedbackPatterns.some((pattern) => text.includes(pattern))) {
            console.log('🎤 [LISTS] Ignoring feedback message:', text);
            lastProcessedTranscriptRef.current = '';
            reset();
            stop();
            return;
          }
        }

        // Parse create list command
        const createListCmd = parseCreateList(text);
        if (createListCmd) {
          // Stop recognition immediately to prevent picking up feedback
          stop();

          // Always prompt for list type
          setPendingListName(createListCmd.name);
          setAwaitingListType(true);
          lastProcessedTranscriptRef.current = '';
          reset(); // Clear transcript before speaking
          speak('What type of list? Say: to do, grocery, shopping, or other', () => {
            // Start listening quickly but ignore the prompt message
            setTimeout(() => {
              start({ ignoreTranscriptsForMs: 2000 }); // Ignore transcripts for 2 seconds after prompt
            }, 300); // Reduced from 1000ms to 300ms
          });
          return;
        }

        // No command matched
        speak('Please use: create list name');
        lastProcessedTranscriptRef.current = '';
        reset();
      } catch (error) {
        console.error('Error processing voice command:', error);
        speak('Sorry, there was an error. Please try again.');
        reset();
      }
    };

    handleVoiceCommand();
  }, [transcript, isSupported, selectedFamily, awaitingListType, pendingListName]);

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
    setAwaitingListType(false);
    setPendingListName(null);

    // Start recognition briefly to capture user gesture (required for permission)
    // Then stop it, speak instruction, and restart after instruction finishes
    try {
      start();
      setTimeout(() => {
        stop();
        speak('Please say create list followed by the list name', () => {
          setTimeout(() => {
            start();
          }, 100);
        });
      }, 50);
    } catch (err) {
      console.error('Error starting recognition:', err);
      alert('Unable to start voice recognition. Please check your microphone permissions.');
    }
  };

  const fetchLists = async (isRefresh = false) => {
    if (!selectedFamily) return;

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      const fetchedLists = await ListService.getLists(selectedFamily.id);
      setLists(fetchedLists);
    } catch (err) {
      console.error('Error fetching lists:', err);
      const apiError = err as APIError;
      setError(apiError.message || 'Failed to load lists. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchLists(true);
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
        <View style={styles.headerActions}>
          <View style={styles.iconButtonContainer}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              accessibilityLabel="Go back"
              accessibilityHint="Returns to the previous screen"
            >
              <FontAwesome name="arrow-left" size={Platform.OS === 'web' ? 20 : 18} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.iconLabel, { color: colors.textSecondary }]}>Back</Text>
          </View>
          {isSupported && (
            <View style={styles.iconButtonContainer}>
              <View style={[styles.iconButton, { backgroundColor: isListening ? colors.error : colors.primary }]}>
                <TouchableOpacity
                  onPress={handleVoiceClick}
                  disabled={creating || updating}
                  style={styles.iconButtonInner}
                  accessibilityLabel="Voice Command"
                  accessibilityHint="Press to start or stop voice recognition"
                >
                  <FontAwesome
                    name="microphone"
                    size={Platform.OS === 'web' ? 20 : 18}
                    color="#fff"
                  />
                </TouchableOpacity>
              </View>
              <Text style={[styles.iconLabel, { color: colors.textSecondary }]}>Mic</Text>
            </View>
          )}
          <View style={styles.iconButtonContainer}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/lists/completed')}
              style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              accessibilityLabel="View completed items history"
              accessibilityHint="Opens the history of completed grocery items"
              // @ts-ignore - web-specific prop
              {...(Platform.OS === 'web' && { title: 'View completed items history' })}
            >
              <FontAwesome name="history" size={Platform.OS === 'web' ? 20 : 18} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.iconLabel, { color: colors.textSecondary }]}>History</Text>
          </View>
          <View style={styles.iconButtonContainer}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/meals?tab=recipes')}
              style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              accessibilityLabel="Recipes"
              accessibilityHint="Opens the recipes screen"
              // @ts-ignore - web-specific prop
              {...(Platform.OS === 'web' && { title: 'Recipes' })}
            >
              <FontAwesome name="book" size={Platform.OS === 'web' ? 20 : 18} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.iconLabel, { color: colors.textSecondary }]}>Recipes</Text>
          </View>
          <View style={styles.iconButtonContainer}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/meals?tab=meal-planning')}
              style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              accessibilityLabel="Meal Planning"
              accessibilityHint="Opens the meal planning screen"
              // @ts-ignore - web-specific prop
              {...(Platform.OS === 'web' && { title: 'Meal Planning' })}
            >
              <FontAwesome name="calendar" size={Platform.OS === 'web' ? 20 : 18} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.iconLabel, { color: colors.textSecondary }]}>Meals</Text>
          </View>
          <View style={styles.iconButtonContainer}>
            <TouchableOpacity
              onPress={() => {
                setEditingList(null);
                setShowCreateForm(!showCreateForm);
              }}
              style={[styles.iconButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              accessibilityLabel={showCreateForm ? 'Cancel' : 'Create List'}
              accessibilityHint={showCreateForm ? 'Cancels creating a new list' : 'Opens form to create a new list'}
            >
              <FontAwesome name={showCreateForm ? 'times' : 'plus'} size={Platform.OS === 'web' ? 20 : 18} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.iconLabel, { color: colors.textSecondary }]}>
              {showCreateForm ? 'Cancel' : 'Add Item'}
            </Text>
          </View>
        </View>
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
          refreshing={refreshing}
          onRefresh={handleRefresh}
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  iconButtonContainer: {
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: Platform.OS === 'web' ? 44 : 40,
    height: Platform.OS === 'web' ? 44 : 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  iconButtonInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLabel: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
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

