import React, { useMemo, useRef, useEffect } from 'react';
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
  onMoveItem?: (item: ListItem) => void;
  isUncategorized?: boolean;
  categoryIcon?: React.ReactNode;
  listColor?: string; // Color from the list
}

// Helper function to determine if a hex color is light or dark
// Returns true if the color is light (should use dark text), false if dark (should use light text)
function isLightColor(hex: string): boolean {
  // Remove # if present
  const color = hex.replace('#', '');
  
  // Handle 8-digit hex (with alpha) - ignore alpha channel
  const rgb = color.length === 8 
    ? color.slice(0, 6)
    : color;
  
  // Convert to RGB
  const r = parseInt(rgb.substring(0, 2), 16);
  const g = parseInt(rgb.substring(2, 4), 16);
  const b = parseInt(rgb.substring(4, 6), 16);
  
  // Calculate relative luminance using WCAG formula
  // https://www.w3.org/WAI/GL/wiki/Relative_luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // If luminance is greater than 0.5, it's a light color
  return luminance > 0.5;
}

const CategoryGroup = React.memo(function CategoryGroup({
  categoryId,
  categoryName,
  items,
  isCollapsed,
  onToggleCollapse,
  onToggleItemComplete,
  onEditItem,
  onDeleteItem,
  onMoveItem,
  isUncategorized = false,
  categoryIcon,
  listColor,
}: CategoryGroupProps) {
  const { colors, theme } = useTheme();
  // Use a ref to track the last known listColor to prevent flashing
  // Initialize immediately with listColor if available
  const stableColorRef = useRef<string | undefined>(listColor);

  // Update ref when listColor is provided - this persists across re-renders
  // Do this synchronously, not in useEffect, to prevent any flash
  if (listColor) {
    stableColorRef.current = listColor;
  }

  // Use list color for header background - same color as the list, no opacity
  // Always use the stable ref to prevent flashing - never show fallback if we've seen a color
  const headerBackgroundColor = useMemo(() => {
    // Always prefer the stable ref (last known color) to prevent flashing
    const colorToUse = stableColorRef.current || listColor;
    if (colorToUse) {
      return colorToUse; // Use the exact list color (e.g., #84cc16 for lime green)
    }
    // Only use fallback if we've never had a listColor
    return isCollapsed 
      ? colors.surface 
      : theme === 'dark' 
        ? '#0A84FF40' // Light blue tint for dark mode (25% opacity)
        : '#E8F2FF'; // Light blue for light mode
  }, [listColor, isCollapsed, colors.surface, theme]);

  // Memoize the header style to prevent recreation
  const headerStyle = useMemo(() => [
    styles.header, 
    { 
      backgroundColor: headerBackgroundColor, 
      borderBottomColor: colors.border 
    }
  ], [headerBackgroundColor, colors.border]);

  // Determine text color based on background color brightness
  const textColor = useMemo(() => {
    // If we have a list color, determine if it's light or dark
    const colorToCheck = stableColorRef.current || listColor;
    if (colorToCheck) {
      return isLightColor(colorToCheck) ? '#000000' : '#FFFFFF';
    }
    // Fallback to theme colors if no list color
    return colors.text;
  }, [listColor, colors.text]);

  const textSecondaryColor = useMemo(() => {
    // If we have a list color, use a slightly transparent version of the text color
    const colorToCheck = stableColorRef.current || listColor;
    if (colorToCheck) {
      const isLight = isLightColor(colorToCheck);
      return isLight ? '#00000080' : '#FFFFFF80'; // 50% opacity
    }
    // Fallback to theme colors if no list color
    return colors.textSecondary;
  }, [listColor, colors.textSecondary]);

  // Check if all items in the category are completed or if category is empty
  const allItemsCompleted = useMemo(() => {
    // Show strikethrough when category is empty OR all items are completed
    if (items.length === 0) return true;
    return items.every(item => item.completed);
  }, [items]);

  return (
    <View style={[styles.group, { borderColor: colors.border }]}>
      <TouchableOpacity
        style={headerStyle}
        onPress={onToggleCollapse}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          {categoryIcon && <View style={styles.iconContainer}>{categoryIcon}</View>}
          <Text style={[
            styles.categoryName, 
            { color: textColor },
            allItemsCompleted && styles.categoryNameCompleted
          ]}>
            {categoryName}
          </Text>
          <Text style={[styles.itemCount, { color: textSecondaryColor }]}>
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
          color={textSecondaryColor}
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
              onMove={onMoveItem ? () => onMoveItem(item) : undefined}
              isGroceryList={true}
            />
          ))}
        </View>
      )}
    </View>
  );
});

export default CategoryGroup;

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
  categoryNameCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  itemCount: {
    fontSize: 14,
  },
  uncategorizedBadge: {
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#FF950019', // 10% opacity orange
  },
  uncategorizedText: {
    fontSize: 12,
    fontWeight: '500',
  },
  itemsContainer: {
    padding: 8,
  },
});

