import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ListItem } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';

interface ListItemComponentProps {
  item: ListItem;
  onToggleComplete: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMove?: () => void; // For moving item to different list
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
  onMove,
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
  const editButtonRef = useRef<any>(null);
  const moveButtonRef = useRef<any>(null);
  const deleteButtonRef = useRef<any>(null);
  const editButtonWebRef = useRef<any>(null);
  const moveButtonWebRef = useRef<any>(null);
  const deleteButtonWebRef = useRef<any>(null);

  const isOverdue = isTodoList && item.due_date && !item.completed && new Date(item.due_date) < new Date();

  // Set title attribute on web for tooltips
  useEffect(() => {
    if (Platform.OS === 'web') {
      const setTitle = (ref: any, title: string) => {
        if (ref?.current) {
          const getDOMNode = (node: any): HTMLElement | null => {
            if (!node) return null;
            if (node.nodeType === 1) return node;
            if (node._nativeNode) return node._nativeNode;
            if (node._internalFiberInstanceHandleDEV) {
              const fiber = node._internalFiberInstanceHandleDEV;
              if (fiber && fiber.stateNode) {
                const stateNode = fiber.stateNode;
                if (stateNode.nodeType === 1) return stateNode;
                if (stateNode._nativeNode) return stateNode._nativeNode;
              }
            }
            return null;
          };
          const domNode = getDOMNode(ref.current);
          if (domNode) {
            domNode.setAttribute('title', title);
          }
        }
      };

      if (onEdit) setTitle(editButtonRef, 'Edit item');
      if (onMove) setTitle(moveButtonRef, 'Move item to another list');
      if (onDelete) setTitle(deleteButtonRef, 'Delete item');
      if (onEdit) setTitle(editButtonWebRef, 'Edit item');
      if (onMove) setTitle(moveButtonWebRef, 'Move item to another list');
      if (onDelete) setTitle(deleteButtonWebRef, 'Delete item');
    }
  }, [onEdit, onMove, onDelete]);

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
        <View style={styles.itemHeader}>
          <View style={styles.itemNameRow}>
            <Text
              style={[
                styles.itemName,
                { color: colors.text },
                item.completed && styles.itemNameCompleted,
              ]}
              numberOfLines={Platform.OS === 'web' ? 2 : 2}
            >
              {item.name}
            </Text>
            {/* Edit, Move, and Delete buttons on same line as name on mobile */}
            {Platform.OS !== 'web' && (
              <View style={styles.itemActionsInline}>
                {onEdit && (
                  <TouchableOpacity
                    ref={editButtonRef}
                    style={styles.actionButton}
                    onPress={onEdit}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="Edit item"
                    accessibilityHint="Opens the edit form for this item"
                  >
                    <FontAwesome name="edit" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
                {onMove && (
                  <TouchableOpacity
                    ref={moveButtonRef}
                    style={styles.actionButton}
                    onPress={onMove}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="Move item"
                    accessibilityHint="Move this item to a different list"
                  >
                    <FontAwesome name="arrows-alt" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}
                {onDelete && (
                  <TouchableOpacity
                    ref={deleteButtonRef}
                    style={styles.actionButton}
                    onPress={onDelete}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="Delete item"
                    accessibilityHint="Permanently delete this item"
                  >
                    <FontAwesome name="trash" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          {/* Quantity on mobile - show below name for grocery lists */}
          {item.quantity && isGroceryList && Platform.OS !== 'web' && (
            <Text style={[styles.quantityMobile, { color: colors.textSecondary }]}>
              Qty: {item.quantity}
            </Text>
          )}
          {/* Quantity on web or for non-grocery lists - show inline */}
          {item.quantity && Platform.OS === 'web' && (
            <Text style={[styles.quantity, { color: colors.textSecondary }]}>
              Qty: {item.quantity}
            </Text>
          )}
        </View>
        
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

      {/* Actions on web - show on the right */}
      {Platform.OS === 'web' && (
        <View style={styles.itemActions}>
          {showCategorySelect && isGroceryList && categories.length > 0 && (
            <View style={styles.categorySelect}>
              <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>Category:</Text>
              {/* Category dropdown would go here - simplified for now */}
            </View>
          )}
          {onEdit && (
            <TouchableOpacity
              ref={editButtonWebRef}
              style={styles.actionButton}
              onPress={onEdit}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Edit item"
              accessibilityHint="Opens the edit form for this item"
              // @ts-ignore - web-specific props
              {...({
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
          {onMove && (
            <TouchableOpacity
              ref={moveButtonWebRef}
              style={styles.actionButton}
              onPress={onMove}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Move item"
              accessibilityHint="Move this item to a different list"
              // @ts-ignore - web-specific props
              {...({
                'data-no-drag': 'true',
                onMouseDown: (e: any) => {
                  // Stop propagation to prevent drag when clicking move button
                  e.stopPropagation();
                },
              })}
            >
              <FontAwesome name="arrows-alt" size={16} color={colors.primary} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              ref={deleteButtonWebRef}
              style={styles.actionButton}
              onPress={onDelete}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Delete item"
              accessibilityHint="Permanently delete this item"
              // @ts-ignore - web-specific props
              {...({
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
      )}
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
    ...(Platform.OS !== 'web' ? {
      minHeight: 80, // Ensure minimum height on mobile
    } : {}),
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
    minWidth: 0, // Allow text to wrap properly
  },
  itemHeader: {
    flexDirection: 'column',
    marginBottom: Platform.OS !== 'web' ? 4 : 0,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Platform.OS !== 'web' ? 4 : 0,
    gap: 8,
  },
  itemName: {
    fontSize: Platform.OS !== 'web' ? 16 : 16,
    fontWeight: '500',
    flex: 1,
    lineHeight: Platform.OS !== 'web' ? 22 : 20,
  },
  itemActionsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  itemNameCompleted: {
    textDecorationLine: 'line-through',
  },
  itemNotes: {
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
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
    marginTop: 2,
  },
  quantityMobile: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '400',
    opacity: 0.7,
  },
  actionButton: {
    padding: Platform.OS !== 'web' ? 8 : 4,
    minWidth: Platform.OS !== 'web' ? 40 : undefined,
    minHeight: Platform.OS !== 'web' ? 40 : undefined,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
