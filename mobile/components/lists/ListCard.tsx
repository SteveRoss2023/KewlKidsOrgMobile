import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { List } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';

interface ListCardProps {
  list: List;
  onPress: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function ListCard({ list, onPress, onEdit, onDelete }: ListCardProps) {
  const { colors } = useTheme();

  const getListTypeIcon = (type: string) => {
    switch (type) {
      case 'todo':
        return 'check-square-o';
      case 'grocery':
        return 'shopping-basket';
      case 'shopping':
        return 'shopping-cart';
      default:
        return 'list';
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderLeftColor: list.color }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        <View style={[styles.colorIndicator, { backgroundColor: list.color }]} />
        <View style={styles.cardInfo}>
          <View style={styles.cardHeader}>
            <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>
              {list.name}
            </Text>
            {onEdit && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="edit" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="trash" size={16} color="#FF3B30" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.metaItem}>
              <FontAwesome name={getListTypeIcon(list.list_type)} size={14} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {list.list_type}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <FontAwesome name="list-ul" size={14} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {list.item_count || 0} items
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  colorIndicator: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  listName: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    textTransform: 'capitalize',
  },
});



