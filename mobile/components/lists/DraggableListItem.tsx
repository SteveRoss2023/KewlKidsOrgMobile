import React, { useRef, useEffect } from 'react';
import { View, Platform } from 'react-native';
import ListItemComponent from './ListItemComponent';
import { ListItem } from '../../types/lists';

interface DraggableListItemProps {
  item: ListItem;
  index: number;
  draggedItemId: number | null;
  dragOverIndex: number | null;
  onDragStart: (itemId: number) => void;
  onDragOver: (e: any, index: number) => void;
  onDragLeave: () => void;
  onDrop: (e: any, index: number) => void;
  onDragEnd: () => void;
  onToggleComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove?: () => void;
  isGroceryList: boolean;
  isTodoList: boolean;
}

export default function DraggableListItem({
  item,
  index,
  draggedItemId,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onToggleComplete,
  onEdit,
  onDelete,
  onMove,
  isGroceryList,
  isTodoList,
}: DraggableListItemProps) {
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
        domNode.style.cursor = draggedItemId === item.id ? 'grabbing' : 'grab';
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
            e.dataTransfer.setData('text/plain', item.id.toString());
            // Also set a custom data type for easier identification
            e.dataTransfer.setData('application/x-item-id', item.id.toString());
          }
          onDragStart(item.id);
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
          if (draggedItemId !== item.id) {
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
  }, [item.id, index, draggedItemId, dragOverIndex, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd]);

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
        domNode.style.cursor = draggedItemId === item.id ? 'grabbing' : 'grab';
      }
    }
  }, [draggedItemId, item.id]);

  return (
    <View
      ref={viewRef}
      style={{
        opacity: draggedItemId === item.id ? 0.5 : 1,
        borderTopWidth: dragOverIndex === index ? 2 : 0,
        borderTopColor: dragOverIndex === index ? '#007AFF' : 'transparent',
        // @ts-ignore - web-specific styles
        ...(Platform.OS === 'web' && {
          cursor: draggedItemId === item.id ? 'grabbing' : 'grab',
          userSelect: 'none',
          // Add a subtle shadow when dragging for better visual feedback
          boxShadow: draggedItemId === item.id ? '0 4px 8px rgba(0,0,0,0.2)' : 'none',
        }),
      }}
    >
      <ListItemComponent
        item={item}
        onToggleComplete={onToggleComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onMove={onMove}
        isGroceryList={isGroceryList}
        isTodoList={isTodoList}
      />
    </View>
  );
}
