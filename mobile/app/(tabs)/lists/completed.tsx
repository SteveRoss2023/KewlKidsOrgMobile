import React, { useState, useCallback } from 'react';
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
import { CompletedGroceryItem } from '../../../types/lists';
import GlobalNavBar from '../../../components/GlobalNavBar';
import ThemeAwarePicker from '../../../components/lists/ThemeAwarePicker';
import AlertModal from '../../../components/AlertModal';

export default function CompletedItemsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [completedItems, setCompletedItems] = useState<CompletedGroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<'date' | 'category' | 'list' | 'none'>('date');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [addingItems, setAddingItems] = useState<Set<number>>(new Set()); // Track items being added
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
      }
      setError(null);
      const items = await ListService.getCompletedGroceryItems(selectedFamily.id);
      // Ensure items is always an array
      setCompletedItems(Array.isArray(items) ? items : []);
    } catch (err: any) {
      console.error('Error fetching completed items:', err);
      setError(err?.message || 'Failed to load completed items.');
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  }, [selectedFamily]);

  // Refresh data when screen comes into focus
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

  // Group items based on selected grouping option
  const groupedItems = React.useMemo(() => {
    const grouped: Record<string, CompletedGroceryItem[]> = {};
    // Safety check: ensure completedItems is an array
    if (!Array.isArray(completedItems)) {
      return grouped;
    }

    if (groupBy === 'none') {
      // No grouping - return all items under a single key
      grouped['All Items'] = completedItems;
      return grouped;
    }

    completedItems.forEach((item) => {
      let groupKey: string;
      
      if (groupBy === 'date') {
        const date = new Date(item.completed_date);
        groupKey = date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
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
    });
    return grouped;
  }, [completedItems, groupBy]);

  const sortedGroupKeys = React.useMemo(() => {
    const keys = Object.keys(groupedItems);
    
    if (groupBy === 'date') {
      // Sort dates descending (newest first)
      return keys.sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateB.getTime() - dateA.getTime();
      });
    } else if (groupBy === 'category' || groupBy === 'list') {
      // Sort alphabetically
      return keys.sort((a, b) => a.localeCompare(b));
    } else {
      // No sorting needed for 'none'
      return keys;
    }
  }, [groupedItems, groupBy]);

  // Initialize expanded groups when grouping changes
  React.useEffect(() => {
    // Start with all groups collapsed by default
    setExpandedGroups(new Set());
  }, [groupBy, sortedGroupKeys]);

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

  const handleAddItemToList = async (item: CompletedGroceryItem) => {
    if (!selectedFamily) return;

    setAddingItems((prev) => new Set(prev).add(item.id));

    try {
      // Get all lists for the family to find if the list exists
      const allLists = await ListService.getLists(selectedFamily.id);
      
      // Find list by name (case-insensitive comparison)
      let targetList = allLists.find(
        (list) => list.name.toLowerCase() === item.list_name.toLowerCase() && list.list_type === 'grocery'
      );

      // If list doesn't exist, create it
      if (!targetList) {
        targetList = await ListService.createList({
          name: item.list_name,
          description: '',
          list_type: 'grocery',
          color: '#10b981', // Default green color
          family: selectedFamily.id,
        });
      }

      // Get categories to find the category ID if category_name exists
      let categoryId: number | null = null;
      if (item.category_name) {
        const categories = await ListService.getGroceryCategories(selectedFamily.id);
        const category = categories.find((cat) => cat.name === item.category_name);
        if (category) {
          categoryId = category.id;
        }
      }

      // Create the list item
      const itemData: any = {
        list: targetList.id,
        name: item.item_name,
        quantity: item.quantity || undefined,
        category: categoryId || undefined,
      };

      // Add recipe name to notes if it exists
      if (item.recipe_name) {
        itemData.notes = `From recipe: ${item.recipe_name}`;
      }

      await ListService.createListItem(itemData);

      // Show success message in modal
      setModalMessage(`"${item.item_name}" has been added to "${item.list_name}"`);
      setModalType('success');
      setModalVisible(true);
    } catch (err: any) {
      console.error('Error adding item to list:', err);
      const errorMessage = err?.message || 'Failed to add item to list';
      setModalMessage(errorMessage);
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
          <Text style={[styles.title, { color: colors.text }]}>Grocery History</Text>
          <View style={{ width: Platform.OS === 'web' ? 44 : 40 }} /> {/* Spacer for alignment */}
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
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {completedItems.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="check-circle" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No completed items yet.
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Complete items from your grocery lists to see them here.
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            {groupBy === 'none' ? (
              // For 'none', show all items without accordions
              groupedItems['All Items']?.map((item) => (
                <View
                  key={item.id}
                  style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.itemHeader}>
                    <View style={styles.itemNameContainer}>
                      <Text style={[styles.itemName, { color: colors.text }]}>{item.item_name}</Text>
                      {item.quantity && (
                        <Text style={[styles.itemQuantity, { color: colors.textSecondary }]}>
                          Qty: {item.quantity}
                        </Text>
                      )}
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
                    {item.category_name && (
                      <View style={styles.metaItem}>
                        <FontAwesome name="tag" size={12} color={colors.textSecondary} />
                        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                          {item.category_name}
                        </Text>
                      </View>
                    )}
                    <View style={styles.metaItem}>
                      <FontAwesome name="list" size={12} color={colors.textSecondary} />
                      <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                        {item.list_name}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <FontAwesome name="calendar" size={12} color={colors.textSecondary} />
                      <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                        {new Date(item.completed_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                    {item.recipe_name && (
                      <View style={styles.metaItem}>
                        <FontAwesome name="book" size={12} color={colors.primary} />
                        <Text style={[styles.metaText, { color: colors.primary }]}>
                          {item.recipe_name}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            ) : (
              // For other groupings, show accordions
              sortedGroupKeys.map((groupKey) => {
                const items = groupedItems[groupKey];
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
                    {isExpanded && (
                      <View style={styles.accordionContent}>
                        {items.map((item) => (
                          <View
                            key={item.id}
                            style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                          >
                            <View style={styles.itemHeader}>
                              <View style={styles.itemNameContainer}>
                                <Text style={[styles.itemName, { color: colors.text }]}>{item.item_name}</Text>
                                {item.quantity && (
                                  <Text style={[styles.itemQuantity, { color: colors.textSecondary }]}>
                                    Qty: {item.quantity}
                                  </Text>
                                )}
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
                              {groupBy !== 'category' && item.category_name && (
                                <View style={styles.metaItem}>
                                  <FontAwesome name="tag" size={12} color={colors.textSecondary} />
                                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                    {item.category_name}
                                  </Text>
                                </View>
                              )}
                              {groupBy !== 'list' && (
                                <View style={styles.metaItem}>
                                  <FontAwesome name="list" size={12} color={colors.textSecondary} />
                                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                    {item.list_name}
                                  </Text>
                                </View>
                              )}
                              {groupBy !== 'date' && (
                                <View style={styles.metaItem}>
                                  <FontAwesome name="calendar" size={12} color={colors.textSecondary} />
                                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                    {new Date(item.completed_date).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </Text>
                                </View>
                              )}
                              {item.recipe_name && (
                                <View style={styles.metaItem}>
                                  <FontAwesome name="book" size={12} color={colors.primary} />
                                  <Text style={[styles.metaText, { color: colors.primary }]}>
                                    {item.recipe_name}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
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
});

