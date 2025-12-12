import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ListItem } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';

interface ListItemComponentProps {
  item: ListItem;
  onToggleComplete: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCategoryChange?: (categoryId: number | null) => void;
  showCategorySelect?: boolean;
  categories?: Array<{ id: number; name: string }>;
  isGroceryList?: boolean;
  isTodoList?: boolean;
  onDrag?: () => void; // For mobile drag-and-drop
  onMoveUp?: () => void; // For simple mobile reordering
  onMoveDown?: () => void; // For simple mobile reordering
}

export default function ListItemComponent({
  item,
  onToggleComplete,
  onEdit,
  onDelete,
  onCategoryChange,
  showCategorySelect = false,
  categories = [],
  isGroceryList = false,
  isTodoList = false,
  onDrag,
  onMoveUp,
  onMoveDown,
}: ListItemComponentProps) {
  const { colors } = useTheme();

  const isOverdue = isTodoList && item.due_date && !item.completed && new Date(item.due_date) < new Date();

  return (
    <View
      style={[
        styles.item,
        { backgroundColor: colors.surface, borderColor: colors.border },
        item.completed && styles.itemCompleted,
        !item.category && isGroceryList && styles.uncategorizedItem,
      ]}
    >
      {isTodoList && (
        <View style={styles.dragHandleContainer}>
          {onDrag ? (
            <TouchableOpacity
              style={styles.dragHandle}
              onLongPress={onDrag}
              disabled={false}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FontAwesome name="bars" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.dragHandle}>
              <FontAwesome name="bars" size={14} color={colors.textSecondary} />
            </View>
          )}
          {(onMoveUp || onMoveDown) && (
            <View style={styles.moveButtons}>
              {onMoveUp && (
                <TouchableOpacity
                  style={styles.moveButton}
                  onPress={onMoveUp}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="chevron-up" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
              {onMoveDown && (
                <TouchableOpacity
                  style={styles.moveButton}
                  onPress={onMoveDown}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="chevron-down" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={onToggleComplete}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        // @ts-ignore - web-specific props
        {...(Platform.OS === 'web' && {
          'data-no-drag': 'true',
          onMouseDown: (e: any) => {
            // Stop propagation to prevent drag when clicking checkbox
            e.stopPropagation();
          },
        })}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: item.completed ? colors.primary : colors.border },
            item.completed && { backgroundColor: colors.primary },
          ]}
        >
          {item.completed && <FontAwesome name="check" size={12} color="#fff" />}
        </View>
      </TouchableOpacity>

      <View style={styles.itemContent}>
        <Text
          style={[
            styles.itemName,
            { color: colors.text },
            item.completed && styles.itemNameCompleted,
          ]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        {item.notes && !item.notes.startsWith('From recipe:') && (
          <Text style={[styles.itemNotes, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
        {item.notes && item.notes.startsWith('From recipe:') && (
          <View style={styles.recipeBadge}>
            <Text style={[styles.recipeText, { color: colors.primary }]}>
              {item.notes.replace('From recipe: ', '')}
            </Text>
          </View>
        )}
        {isTodoList && item.due_date && (
          <Text
            style={[
              styles.dueDate,
              { color: isOverdue ? '#FF3B30' : colors.textSecondary },
            ]}
          >
            Due: {new Date(item.due_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        )}
      </View>

      <View style={styles.itemActions}>
        {showCategorySelect && isGroceryList && categories.length > 0 && (
          <View style={styles.categorySelect}>
            <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>Category:</Text>
            {/* Category dropdown would go here - simplified for now */}
          </View>
        )}
        {item.quantity && (
          <Text style={[styles.quantity, { color: colors.textSecondary }]}>
            Qty: {item.quantity}
          </Text>
        )}
        {onEdit && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onEdit}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            // @ts-ignore - web-specific props
            {...(Platform.OS === 'web' && {
              'data-no-drag': 'true',
              onMouseDown: (e: any) => {
                // Stop propagation to prevent drag when clicking edit button
                e.stopPropagation();
              },
            })}
          >
            <FontAwesome name="edit" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onDelete}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            // @ts-ignore - web-specific props
            {...(Platform.OS === 'web' && {
              'data-no-drag': 'true',
              onMouseDown: (e: any) => {
                // Stop propagation to prevent drag when clicking delete button
                e.stopPropagation();
              },
            })}
          >
            <FontAwesome name="trash" size={16} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'flex-start',
    gap: 12,
  },
  dragHandleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -4,
    marginTop: 2,
  },
  dragHandle: {
    padding: 4,
    ...Platform.select({
      web: {
        cursor: 'grab',
      },
    }),
  },
  moveButtons: {
    flexDirection: 'column',
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moveButton: {
    padding: 6,
    marginVertical: 2,
    minWidth: 24,
    minHeight: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemCompleted: {
    opacity: 0.6,
  },
  uncategorizedItem: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF9500',
  },
  checkboxContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  itemNameCompleted: {
    textDecorationLine: 'line-through',
  },
  itemNotes: {
    fontSize: 14,
    marginTop: 4,
  },
  recipeBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignSelf: 'flex-start',
  },
  recipeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dueDate: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  categorySelect: {
    marginRight: 8,
  },
  categoryLabel: {
    fontSize: 12,
  },
  quantity: {
    fontSize: 12,
    marginRight: 8,
  },
  actionButton: {
    padding: 4,
  },
});

