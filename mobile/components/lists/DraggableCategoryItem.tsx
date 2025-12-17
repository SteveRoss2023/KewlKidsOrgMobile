import React, { useRef, useEffect } from 'react';
import { View, Platform, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { GroceryCategory } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';
import { getIconDisplay } from '../IconPicker';

interface DraggableCategoryItemProps {
  category: GroceryCategory;
  index: number;
  draggedCategoryId: number | null;
  dragOverIndex: number | null;
  onDragStart: (categoryId: number) => void;
  onDragOver: (e: any, index: number) => void;
  onDragLeave: () => void;
  onDrop: (e: any, index: number) => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  reordering: boolean;
}

export default function DraggableCategoryItem({
  category,
  index,
  draggedCategoryId,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onEdit,
  onDelete,
  reordering,
}: DraggableCategoryItemProps) {
  const { colors } = useTheme();
  const viewRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && viewRef.current) {
      // Get the actual DOM element from React Native Web View
      const getDOMNode = (node: any): HTMLElement | null => {
        if (!node) return null;
        // React Native Web stores the DOM node in different places
        if (node.nodeType === 1) return node; // Already a DOM element
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

      const domNode = getDOMNode(viewRef.current);
      
      if (domNode) {
        // Set draggable attribute
        domNode.setAttribute('draggable', 'true');
        domNode.style.cursor = draggedCategoryId === category.id ? 'grabbing' : 'grab';
        domNode.style.userSelect = 'none';

        const handleDragStart = (e: DragEvent) => {
          const target = e.target as HTMLElement;
          
          // Check if the click originated from a button or no-drag element
          const isButton = target.closest('[data-no-drag="true"], button, [role="button"]');
          
          if (isButton) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', category.id.toString());
            e.dataTransfer.setData('application/x-category-id', category.id.toString());
          }
          onDragStart(category.id);
        };

        const handleDragOver = (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
          }
          if (dragOverIndex !== index) {
            onDragOver(e as any, index);
          }
        };

        const handleDragLeave = (e: DragEvent) => {
          const relatedTarget = e.relatedTarget as HTMLElement;
          if (!relatedTarget || !domNode.contains(relatedTarget)) {
            if (dragOverIndex === index) {
              onDragLeave();
            }
          }
        };

        const handleDrop = (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop(e as any, index);
        };

        const handleDragEnd = () => {
          onDragEnd();
        };

        // Add mousedown handler to help with drag initiation
        const handleMouseDown = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          const isButton = target.closest('[data-no-drag="true"], button, [role="button"]');
          
          if (!isButton) {
            // Set cursor to grabbing immediately
            domNode.style.cursor = 'grabbing';
          }
        };

        const handleMouseUp = () => {
          if (draggedCategoryId !== category.id) {
            domNode.style.cursor = 'grab';
          }
        };

        domNode.addEventListener('mousedown', handleMouseDown);
        domNode.addEventListener('mouseup', handleMouseUp);
        domNode.addEventListener('dragstart', handleDragStart);
        domNode.addEventListener('dragover', handleDragOver);
        domNode.addEventListener('dragleave', handleDragLeave);
        domNode.addEventListener('drop', handleDrop);
        domNode.addEventListener('dragend', handleDragEnd);

        return () => {
          domNode.removeAttribute('draggable');
          domNode.removeEventListener('mousedown', handleMouseDown);
          domNode.removeEventListener('mouseup', handleMouseUp);
          domNode.removeEventListener('dragstart', handleDragStart);
          domNode.removeEventListener('dragover', handleDragOver);
          domNode.removeEventListener('dragleave', handleDragLeave);
          domNode.removeEventListener('drop', handleDrop);
          domNode.removeEventListener('dragend', handleDragEnd);
        };
      }
    }
  }, [category.id, index, draggedCategoryId, dragOverIndex, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd]);

  useEffect(() => {
    if (Platform.OS === 'web' && viewRef.current) {
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

      const domNode = getDOMNode(viewRef.current);
      if (domNode) {
        domNode.style.cursor = draggedCategoryId === category.id ? 'grabbing' : 'grab';
      }
    }
  }, [draggedCategoryId, category.id]);

  return (
    <View
      ref={viewRef}
      style={[
        styles.categoryItem,
        { backgroundColor: colors.surface, borderColor: colors.border },
        {
          opacity: draggedCategoryId === category.id ? 0.5 : 1,
          borderTopWidth: dragOverIndex === index ? 2 : 0,
          borderTopColor: dragOverIndex === index ? '#007AFF' : 'transparent',
          // @ts-ignore - web-specific styles
          ...(Platform.OS === 'web' && {
            cursor: draggedCategoryId === category.id ? 'grabbing' : 'grab',
            userSelect: 'none',
            boxShadow: draggedCategoryId === category.id ? '0 4px 8px rgba(0,0,0,0.2)' : 'none',
          }),
        },
      ]}
    >
      <View style={styles.dragHandleContainer}>
        <View style={styles.dragHandle}>
          <FontAwesome name="bars" size={14} color={colors.textSecondary} />
        </View>
      </View>
      <View style={styles.categoryItemInfo}>
        <View style={styles.categoryNameRow}>
          {category.icon && (() => {
            const emoji = getIconDisplay(category.icon);
            if (!emoji) return null;
            
            return <Text style={styles.categoryIconEmoji}>{emoji}</Text>;
          })()}
          <Text style={[styles.categoryName, { color: colors.text }]}>{category.name}</Text>
          {category.is_default && (
            <FontAwesome name="check-circle" size={14} color="#10b981" style={styles.defaultCheckmark} />
          )}
        </View>
        {category.description && (
          <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>
            {category.description}
          </Text>
        )}
      </View>
      <View style={styles.categoryItemActions}>
        <TouchableOpacity
          onPress={onEdit}
          style={[styles.editButton, { borderColor: colors.border }]}
          disabled={reordering}
          data-no-drag="true"
        >
          <FontAwesome name="edit" size={16} color={colors.text} />
        </TouchableOpacity>
        {!category.is_default && (
          <TouchableOpacity
            onPress={onDelete}
            style={[styles.deleteButton, { borderColor: colors.border }]}
            disabled={reordering}
            data-no-drag="true"
          >
            <FontAwesome name="trash" size={16} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  dragHandleContainer: {
    marginRight: 12,
    justifyContent: 'center',
  },
  dragHandle: {
    padding: 4,
  },
  categoryItemInfo: {
    flex: 1,
  },
  categoryNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryIconEmoji: {
    marginRight: 8,
    fontSize: 20,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
  },
  defaultCheckmark: {
    marginLeft: 8,
  },
  categoryDescription: {
    fontSize: 14,
    marginBottom: 4,
  },
  categoryItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
});
