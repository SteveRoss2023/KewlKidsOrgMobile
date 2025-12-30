import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useFamily } from '../../../contexts/FamilyContext';
import ListService from '../../../services/listService';
import { CompletedListItem, ListType } from '../../../types/lists';
import GlobalNavBar from '../../../components/GlobalNavBar';
import ThemeAwarePicker from '../../../components/lists/ThemeAwarePicker';
import AlertModal from '../../../components/AlertModal';

// Helper function to safely convert value to string
const safeString = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  return '';
};

// Helper function to format date
const formatDate = (dateString: string | null): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
};

// Helper function to format date for grouping
const formatDateForGroup = (dateString: string | null): string => {
  if (!dateString) return 'Invalid Date';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
};

// Sanitize and validate item from API
const sanitizeItem = (item: any): CompletedListItem | null => {
  if (!item || typeof item !== 'object' || !item.id) return null;

  return {
    id: typeof item.id === 'number' ? item.id : parseInt(String(item.id), 10) || 0,
    user: typeof item.user === 'number' ? item.user : parseInt(String(item.user), 10) || 0,
    family: typeof item.family === 'number' ? item.family : parseInt(String(item.family), 10) || 0,
    list_type: typeof item.list_type === 'string' ? item.list_type : String(item.list_type || 'other') as ListType,
    item_name: safeString(item.item_name),
    list_name: safeString(item.list_name),
    category_name: item.category_name ? safeString(item.category_name) : null,
    quantity: item.quantity ? safeString(item.quantity) : null,
    notes: item.notes ? safeString(item.notes) : null,
    recipe_name: item.recipe_name ? safeString(item.recipe_name) : null,
    due_date: item.due_date ? safeString(item.due_date) : null,
    completed_date: safeString(item.completed_date || new Date().toISOString()),
  };
};

export default function CompletedItemsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [completedItems, setCompletedItems] = useState<CompletedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedListType, setSelectedListType] = useState<ListType | 'all'>('all');
  const [groupBy, setGroupBy] = useState<'date' | 'category' | 'list' | 'none'>('date');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [addingItems, setAddingItems] = useState<Set<number>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'success' | 'error'>('success');

  const fetchCompletedItems = useCallback(async (skipLoading = false) => {
    if (!selectedFamily) {
      setLoading(false);
      return;
    }

    try {
      if (!skipLoading) {
        setLoading(true);
        setCompletedItems([]);
      }
      setError(null);

      const listType = selectedListType === 'all' ? undefined : selectedListType;
      const items = await ListService.getCompletedListItems(selectedFamily.id, listType);

      // Sanitize and validate all items once
      const validItems: CompletedListItem[] = [];
      if (Array.isArray(items)) {
        for (const item of items) {
          const sanitized = sanitizeItem(item);
          if (sanitized) {
            validItems.push(sanitized);
          }
        }
      }

      setCompletedItems(validItems);
    } catch (err: any) {
      console.error('Error fetching completed items:', err);
      setError(err?.message || 'Failed to load completed items.');
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  }, [selectedFamily, selectedListType]);

  useFocusEffect(
    useCallback(() => {
      if (selectedFamily) {
        fetchCompletedItems();
      }
    }, [selectedFamily, fetchCompletedItems])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCompletedItems(true);
    setRefreshing(false);
  }, [fetchCompletedItems]);

  // Group items
  const groupedItems = useMemo(() => {
    const grouped: Record<string, CompletedListItem[]> = {};

    if (!Array.isArray(completedItems) || completedItems.length === 0) {
      return grouped;
    }

    if (groupBy === 'none') {
      grouped['All Items'] = completedItems;
      return grouped;
    }

    for (const item of completedItems) {
      let groupKey: string;

      if (groupBy === 'date') {
        groupKey = formatDateForGroup(item.completed_date);
      } else if (groupBy === 'category') {
        groupKey = item.category_name || 'Uncategorized';
      } else if (groupBy === 'list') {
        groupKey = item.list_name || 'Unknown List';
      } else {
        groupKey = 'All Items';
      }

      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(item);
    }

    return grouped;
  }, [completedItems, groupBy]);

  // Sort group keys
  const sortedGroupKeys = useMemo(() => {
    const keys = Object.keys(groupedItems);

    if (groupBy === 'date') {
      return keys.sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateB.getTime() - dateA.getTime();
      });
    } else if (groupBy === 'category' || groupBy === 'list') {
      return keys.sort((a, b) => a.localeCompare(b));
    }

    return keys;
  }, [groupedItems, groupBy]);

  // Reset expanded groups when grouping changes
  useEffect(() => {
    setExpandedGroups(new Set());
  }, [groupBy]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const handleAddItemToList = async (item: CompletedListItem) => {
    if (!selectedFamily) return;

    setAddingItems((prev) => new Set(prev).add(item.id));

    try {
      const allLists = await ListService.getLists(selectedFamily.id);
      let targetList = allLists.find(
        (list) => list.name.toLowerCase() === item.list_name.toLowerCase() && list.list_type === item.list_type
      );

      if (!targetList) {
        const colorMap: Record<ListType, string> = {
          grocery: '#10b981',
          shopping: '#3b82f6',
          todo: '#f59e0b',
          ideas: '#8b5cf6',
          other: '#6b7280',
        };
        targetList = await ListService.createList({
          name: item.list_name,
          description: '',
          list_type: item.list_type,
          color: colorMap[item.list_type] || '#10b981',
          family: selectedFamily.id,
        });
      }

      let categoryId: number | null = null;
      if (item.list_type === 'grocery' && item.category_name) {
        const categories = await ListService.getGroceryCategories(selectedFamily.id);
        const category = categories.find((cat) => cat.name === item.category_name);
        if (category) {
          categoryId = category.id;
        }
      }

      const itemData: any = {
        list: targetList.id,
        name: item.item_name,
        quantity: item.quantity || undefined,
        category: categoryId || undefined,
        notes: item.notes || undefined,
        due_date: item.due_date || undefined,
      };

      if (item.recipe_name) {
        itemData.notes = item.notes
          ? `From recipe: ${item.recipe_name}\n${item.notes}`
          : `From recipe: ${item.recipe_name}`;
      }

      await ListService.createListItem(itemData);

      setModalMessage(`"${item.item_name}" has been added to "${item.list_name}"`);
      setModalType('success');
      setModalVisible(true);
    } catch (err: any) {
      console.error('Error adding item to list:', err);
      setModalMessage(err?.message || 'Failed to add item to list');
      setModalType('error');
      setModalVisible(true);
    } finally {
      setAddingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(item.id);
        return newSet;
      });
    }
  };

  // Render a single item card
  const renderItemCard = (item: CompletedListItem, index: number) => {
    return (
      <View
        key={item.id || `item-${index}`}
        style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemNameContainer}>
            <Text style={[styles.itemName, { color: colors.text }]}>
              {item.item_name}
            </Text>
            {item.quantity ? (
              <Text style={[styles.itemQuantity, { color: colors.textSecondary }]}>
                Qty: {item.quantity}
              </Text>
            ) : null}
          </View>
          <View style={styles.addButtonContainer}>
            <TouchableOpacity
              onPress={() => handleAddItemToList(item)}
              disabled={addingItems.has(item.id)}
              style={[styles.addIconButton, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
            >
              {addingItems.has(item.id) ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <FontAwesome name="plus" size={Platform.OS === 'web' ? 12 : 10} color={colors.primary} />
              )}
            </TouchableOpacity>
            <Text style={[styles.addButtonLabel, { color: colors.textSecondary }]}>Add</Text>
          </View>
        </View>
        <View style={styles.itemMeta}>
          {groupBy !== 'category' && item.category_name ? (
            <View style={styles.metaItem}>
              <FontAwesome name="tag" size={12} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {item.category_name}
              </Text>
            </View>
          ) : null}
          {groupBy !== 'list' ? (
            <View style={styles.metaItem}>
              <FontAwesome name="list" size={12} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {item.list_name}
              </Text>
            </View>
          ) : null}
          {groupBy !== 'date' ? (
            <View style={styles.metaItem}>
              <FontAwesome name="calendar" size={12} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {formatDate(item.completed_date)}
              </Text>
            </View>
          ) : null}
          {item.due_date ? (
            <View style={styles.metaItem}>
              <FontAwesome name="clock-o" size={12} color="#f59e0b" />
              <Text style={[styles.metaText, { color: '#f59e0b' }]}>
                Due: {formatDate(item.due_date)}
              </Text>
            </View>
          ) : null}
          {item.recipe_name ? (
            <View style={styles.metaItem}>
              <FontAwesome name="book" size={12} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.primary }]}>
                {item.recipe_name}
              </Text>
            </View>
          ) : null}
        </View>
        {item.notes && !item.notes.startsWith('From recipe:') ? (
          <Text style={[styles.itemNotes, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.notes}
          </Text>
        ) : null}
      </View>
    );
  };

  // Render ungrouped items (groupBy === 'none')
  const renderUngroupedItems = () => {
    const allItems = groupedItems['All Items'] || [];

    if (allItems.length === 0) {
      return null;
    }

    return (
      <View>
        {allItems.map((item, index) => renderItemCard(item, index))}
      </View>
    );
  };

  // Render grouped items with accordions
  const renderGroupedItems = () => {
    if (sortedGroupKeys.length === 0) {
      return null;
    }

    return (
      <View>
        {sortedGroupKeys.map((groupKey) => {
          const items = groupedItems[groupKey] || [];
          if (items.length === 0) return null;

          const isExpanded = expandedGroups.has(groupKey);

          return (
            <View key={groupKey} style={[styles.accordion, { borderColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.accordionHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
                onPress={() => toggleGroup(groupKey)}
                activeOpacity={0.7}
              >
                <View style={styles.accordionHeaderLeft}>
                  <Text style={[styles.accordionHeaderText, { color: colors.text }]}>
                    {groupKey}
                  </Text>
                  <Text style={[styles.accordionItemCount, { color: colors.textSecondary }]}>
                    ({items.length})
                  </Text>
                </View>
                <FontAwesome
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
              {isExpanded ? (
                <View style={styles.accordionContent}>
                  {items.map((item, index) => renderItemCard(item, index))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  // Get title text
  const getTitle = () => {
    if (selectedListType === 'all') return 'Completed Items';
    if (selectedListType === 'todo') return 'Completed To-Do';
    const capitalized = selectedListType.charAt(0).toUpperCase() + selectedListType.slice(1);
    return `Completed ${capitalized}`;
  };

  // Get list type display text
  const getListTypeText = (type: ListType | 'all') => {
    if (type === 'all') return 'All';
    if (type === 'todo') return 'To-Do';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  // Get empty state message
  const getEmptyMessage = () => {
    if (selectedListType === 'all') {
      return 'Complete items from your lists to see them here.';
    }
    const listTypeText = selectedListType === 'todo' ? 'to-do' : selectedListType;
    return `Complete items from your ${listTypeText} lists to see them here.`;
  };

  if (!selectedFamily) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            Please select a family to view completed items
          </Text>
        </View>
      </View>
    );
  }

  if (loading && completedItems.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading completed items...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/lists')}
            style={[styles.backButton, { borderColor: colors.border }]}
            accessibilityLabel="Go back to lists"
            accessibilityHint="Returns to the lists screen"
          >
            <FontAwesome name="arrow-left" size={Platform.OS === 'web' ? 20 : 18} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>
            {getTitle()}
          </Text>
          <View style={{ width: Platform.OS === 'web' ? 44 : 40 }} />
        </View>
        <View style={styles.listTypeTabsContainer}>
          <View style={styles.listTypeTabs}>
            {(['all', 'grocery', 'shopping', 'todo', 'ideas', 'other'] as (ListType | 'all')[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.listTypeTab,
                  styles.listTypeTabMobile,
                  selectedListType === type ? { backgroundColor: colors.primary } : null,
                  { borderColor: colors.border },
                ]}
                onPress={() => setSelectedListType(type)}
              >
                <Text
                  style={[
                    styles.listTypeTabText,
                    styles.listTypeTabTextMobile,
                    { color: selectedListType === type ? '#fff' : colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {getListTypeText(type)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.groupByContainer}>
          <Text style={[styles.groupByLabel, { color: colors.textSecondary }]}>Group by:</Text>
          <ThemeAwarePicker
            selectedValue={groupBy}
            onValueChange={(value) => setGroupBy(value as 'date' | 'category' | 'list' | 'none')}
            options={[
              { label: 'Date', value: 'date' },
              { label: 'Category', value: 'category' },
              { label: 'List', value: 'list' },
              { label: 'None', value: 'none' },
            ]}
            placeholder="Select grouping"
            enabled={true}
          />
        </View>
      </View>
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
        {error ? (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : null}

        {loading && completedItems.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 16 }]}>
              Loading...
            </Text>
          </View>
        ) : completedItems.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="check-circle" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No completed items yet.
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              {getEmptyMessage()}
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            {groupBy === 'none' ? renderUngroupedItems() : renderGroupedItems()}
          </View>
        )}
      </ScrollView>
      <AlertModal
        visible={modalVisible}
        title={modalType === 'success' ? 'Item Added' : 'Error'}
        message={modalMessage}
        type={modalType}
        onClose={() => setModalVisible(false)}
        confirmText="OK"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: Platform.OS === 'web' ? 44 : 40,
    height: Platform.OS === 'web' ? 44 : 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'transparent',
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
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  listTypeTabsContainer: {
    marginBottom: 12,
  },
  listTypeTabs: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listTypeTab: {
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  listTypeTabMobile: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  listTypeTabText: {
    fontSize: Platform.OS === 'web' ? 13 : 10,
    fontWeight: '600',
  },
  listTypeTabTextMobile: {
    fontSize: 10,
  },
  groupByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupByLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 400,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    margin: 16,
  },
  errorText: {
    fontSize: 14,
  },
  content: {
    padding: 16,
  },
  accordion: {
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accordionHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  accordionItemCount: {
    fontSize: 14,
  },
  accordionContent: {
    padding: 8,
  },
  itemCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  itemNameContainer: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
  },
  itemQuantity: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.7,
  },
  addButtonContainer: {
    alignItems: 'center',
    gap: 2,
  },
  addIconButton: {
    width: Platform.OS === 'web' ? 28 : 24,
    height: Platform.OS === 'web' ? 28 : 24,
    borderRadius: 6,
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
  addButtonLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
  itemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  itemNotes: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
    opacity: 0.8,
  },
});
