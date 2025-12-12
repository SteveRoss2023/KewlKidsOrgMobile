import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ListItem } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';
import ListItemComponent from './ListItemComponent';

interface CategoryGroupProps {
  categoryId: string;
  categoryName: string;
  items: ListItem[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleItemComplete: (item: ListItem) => void;
  onEditItem?: (item: ListItem) => void;
  onDeleteItem?: (item: ListItem) => void;
  isUncategorized?: boolean;
  categoryIcon?: React.ReactNode;
}

export default function CategoryGroup({
  categoryId,
  categoryName,
  items,
  isCollapsed,
  onToggleCollapse,
  onToggleItemComplete,
  onEditItem,
  onDeleteItem,
  isUncategorized = false,
  categoryIcon,
}: CategoryGroupProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.group, { borderColor: colors.border }]}>
      <TouchableOpacity
        style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        onPress={onToggleCollapse}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          {categoryIcon && <View style={styles.iconContainer}>{categoryIcon}</View>}
          <Text style={[styles.categoryName, { color: colors.text }]}>
            {categoryName}
          </Text>
          <Text style={[styles.itemCount, { color: colors.textSecondary }]}>
            ({items.length})
          </Text>
        </View>
        {isUncategorized && (
          <View style={styles.uncategorizedBadge}>
            <Text style={[styles.uncategorizedText, { color: '#FF9500' }]}>
              Needs categorization
            </Text>
          </View>
        )}
        <FontAwesome
          name={isCollapsed ? 'chevron-down' : 'chevron-up'}
          size={16}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {!isCollapsed && (
        <View style={styles.itemsContainer}>
          {items.map((item) => (
            <ListItemComponent
              key={item.id}
              item={item}
              onToggleComplete={() => onToggleItemComplete(item)}
              onEdit={onEditItem ? () => onEditItem(item) : undefined}
              onDelete={onDeleteItem ? () => onDeleteItem(item) : undefined}
              isGroceryList={true}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    marginRight: 8,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  itemCount: {
    fontSize: 14,
  },
  uncategorizedBadge: {
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
  },
  uncategorizedText: {
    fontSize: 12,
    fontWeight: '500',
  },
  itemsContainer: {
    padding: 8,
  },
});

