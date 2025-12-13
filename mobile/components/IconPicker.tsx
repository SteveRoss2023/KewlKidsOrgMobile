import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

// Emoji map for food categories - colorful and recognizable
export const emojiMap: Record<string, string> = {
  // Fruits
  'EmApple': '🍎',
  'EmBanana': '🍌',
  'EmOrange': '🍊',
  'EmGrapes': '🍇',
  'EmStrawberry': '🍓',
  'EmCherry': '🍒',
  'EmKiwi': '🥝',
  'EmPeach': '🍑',
  'EmPear': '🍐',
  'EmPineapple': '🍍',
  'EmWatermelon': '🍉',
  'EmMango': '🥭',
  'EmLemon': '🍋',
  'EmAvocado': '🥑',
  'EmTomato': '🍅',
  'EmCoconut': '🥥',
  
  // Vegetables
  'EmCarrot': '🥕',
  'EmBroccoli': '🥦',
  'EmCorn': '🌽',
  'EmCucumber': '🥒',
  'EmPepper': '🫑',
  'EmMushroom': '🍄',
  'EmOnion': '🧅',
  'EmPotato': '🥔',
  'EmLettuce': '🥬',
  'EmSpinach': '🥬',
  'EmEggplant': '🍆',
  'EmGarlic': '🧄',
  'EmPeas': '🫛',
  
  // Meat & Protein
  'EmChicken': '🍗',
  'EmBacon': '🥓',
  'EmMeat': '🥩',
  'EmFish': '🐟',
  'EmShrimp': '🦐',
  'EmCrab': '🦀',
  'EmLobster': '🦞',
  'EmEgg': '🥚',
  'EmTofu': '🧈',
  
  // Dairy
  'EmCheese': '🧀',
  'EmMilk': '🥛',
  'EmButter': '🧈',
  'EmYogurt': '🥛',
  
  // Bakery
  'EmBread': '🍞',
  'EmCroissant': '🥐',
  'EmBagel': '🥯',
  'EmPretzel': '🥨',
  'EmCake': '🍰',
  'EmCookie': '🍪',
  'EmDonut': '🍩',
  'EmMuffin': '🧁',
  'EmPancakes': '🥞',
  'EmWaffle': '🧇',
  
  // Beverages
  'EmCoffee': '☕',
  'EmTea': '🫖',
  'EmWine': '🍷',
  'EmBeer': '🍺',
  'EmCocktail': '🍸',
  'EmJuice': '🧃',
  'EmSoda': '🥤',
  'EmWater': '💧',
  'EmMilkBottle': '🥛',
  'EmSmoothie': '🥤',
  
  // Snacks & Sweets
  'EmCandy': '🍬',
  'EmChocolate': '🍫',
  'EmIceCream': '🍦',
  'EmPopcorn': '🍿',
  'EmChips': '🍟',
  'EmNuts': '🥜',
  'EmCracker': '🍘',
  'EmRiceCracker': '🍘',
  'EmLollipop': '🍭',
  'EmHoney': '🍯',
  
  // Prepared Foods
  'EmHamburger': '🍔',
  'EmPizza': '🍕',
  'EmHotdog': '🌭',
  'EmTaco': '🌮',
  'EmBurrito': '🌯',
  'EmSandwich': '🥪',
  'EmFries': '🍟',
  'EmSoup': '🍲',
  'EmSalad': '🥗',
  'EmRice': '🍚',
  'EmPasta': '🍝',
  'EmNoodles': '🍜',
  'EmSushi': '🍣',
  'EmDumpling': '🥟',
  'EmOmelette': '🍳',
  'EmFriedEgg': '🍳',
  'EmStew': '🍲',
  'EmCurry': '🍛',
  'EmBento': '🍱',
  'EmPaella': '🥘',
  
  // Spices & Condiments
  'EmSalt': '🧂',
  'EmPepper': '🌶️',
  'EmHotPepper': '🌶️',
  'EmOlive': '🫒',
  'EmPickle': '🥒',
  
  // Kitchen & Utensils
  'EmForkKnife': '🍴',
  'EmSpoon': '🥄',
  'EmBowl': '🥣',
  'EmPlate': '🍽️',
  'EmCup': '☕',
  'EmBottle': '🍼',
  
  // Shopping
  'EmShoppingCart': '🛒',
  'EmShoppingBag': '🛍️',
  'EmBasket': '🧺',
};

// Helper function to get emoji
export const getIconDisplay = (iconName: string): string | null => {
  return emojiMap[iconName] || null;
};

// Organized categories for better UX
const iconCategories: Record<string, string[]> = {
  '🍎 Fruits': [
    'EmApple', 'EmBanana', 'EmOrange', 'EmGrapes', 'EmStrawberry', 'EmCherry',
    'EmKiwi', 'EmPeach', 'EmPear', 'EmPineapple', 'EmWatermelon', 'EmMango',
    'EmLemon', 'EmAvocado', 'EmTomato', 'EmCoconut'
  ],
  '🥕 Vegetables': [
    'EmCarrot', 'EmBroccoli', 'EmCorn', 'EmCucumber', 'EmPepper', 'EmMushroom',
    'EmOnion', 'EmPotato', 'EmLettuce', 'EmSpinach', 'EmEggplant', 'EmGarlic', 'EmPeas'
  ],
  '🍗 Meat & Protein': [
    'EmChicken', 'EmBacon', 'EmMeat', 'EmFish', 'EmShrimp', 'EmCrab', 'EmLobster',
    'EmEgg', 'EmTofu'
  ],
  '🧀 Dairy': [
    'EmCheese', 'EmMilk', 'EmButter', 'EmYogurt'
  ],
  '🍞 Bakery': [
    'EmBread', 'EmCroissant', 'EmBagel', 'EmPretzel', 'EmCake', 'EmCookie',
    'EmDonut', 'EmMuffin', 'EmPancakes', 'EmWaffle'
  ],
  '☕ Beverages': [
    'EmCoffee', 'EmTea', 'EmWine', 'EmBeer', 'EmCocktail', 'EmJuice', 'EmSoda',
    'EmWater', 'EmMilkBottle', 'EmSmoothie'
  ],
  '🍬 Snacks & Sweets': [
    'EmCandy', 'EmChocolate', 'EmIceCream', 'EmPopcorn', 'EmChips', 'EmNuts',
    'EmCracker', 'EmRiceCracker', 'EmLollipop', 'EmHoney'
  ],
  '🍔 Prepared Foods': [
    'EmHamburger', 'EmPizza', 'EmHotdog', 'EmTaco', 'EmBurrito', 'EmSandwich',
    'EmFries', 'EmSoup', 'EmSalad', 'EmRice', 'EmPasta', 'EmNoodles', 'EmSushi',
    'EmDumpling', 'EmOmelette', 'EmFriedEgg', 'EmStew', 'EmCurry', 'EmBento', 'EmPaella'
  ],
  '🌶️ Spices & Condiments': [
    'EmSalt', 'EmPepper', 'EmHotPepper', 'EmOlive', 'EmPickle'
  ],
  '🍴 Kitchen & Utensils': [
    'EmForkKnife', 'EmSpoon', 'EmBowl', 'EmPlate', 'EmCup', 'EmBottle'
  ],
  '🛒 Shopping': [
    'EmShoppingCart', 'EmShoppingBag', 'EmBasket'
  ]
};

interface IconPickerProps {
  value: string | null;
  onChange: (iconName: string | null) => void;
  disabled?: boolean;
}

export default function IconPicker({ value, onChange, disabled = false }: IconPickerProps) {
  const { colors } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState('🍎 Fruits');
  const [searchTerm, setSearchTerm] = useState('');

  const handleIconSelect = (iconName: string) => {
    if (value === iconName) {
      onChange(null); // Deselect if clicking the same icon
    } else {
      onChange(iconName);
    }
  };

  // Filter icons based on search - show ALL icons when searching
  const filteredIcons = searchTerm
    ? Object.keys(emojiMap).filter(name =>
        name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : iconCategories[selectedCategory] || [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.text }]}>Icon</Text>
        {value && (
          <View style={styles.selectedIconPreview}>
            <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Selected:</Text>
            <View style={[styles.iconPreview, { backgroundColor: colors.background }]}>
              <Text style={styles.emojiPreview}>{getIconDisplay(value)}</Text>
              <Text style={[styles.iconName, { color: colors.text }]}>
                {value.replace('Em', '')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => onChange(null)}
              disabled={disabled}
              style={styles.clearButton}
            >
              <Text style={[styles.clearButtonText, { color: colors.error }]}>×</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TextInput
        style={[styles.searchInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
        placeholder="Search icons..."
        placeholderTextColor={colors.textSecondary}
        value={searchTerm}
        onChangeText={setSearchTerm}
        editable={!disabled}
      />

      {!searchTerm && (
        <View style={styles.categoryTabsContainer}>
          <View style={styles.categoryTabs}>
            {Object.keys(iconCategories).map(category => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryTab,
                  selectedCategory === category && { backgroundColor: colors.primary },
                  { borderColor: colors.border }
                ]}
                onPress={() => setSelectedCategory(category)}
                disabled={disabled}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    { color: selectedCategory === category ? '#fff' : colors.text }
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.iconGrid}>
        {filteredIcons.length > 0 ? (
          <View style={styles.iconGridContent}>
            {filteredIcons.map(iconName => {
              const emoji = getIconDisplay(iconName);
              if (!emoji) return null;

              const isSelected = value === iconName;

              return (
                <TouchableOpacity
                  key={iconName}
                  style={[
                    styles.iconOption,
                    isSelected && { backgroundColor: colors.primary + '20', borderColor: colors.primary },
                    { borderColor: colors.border }
                  ]}
                  onPress={() => handleIconSelect(iconName)}
                  disabled={disabled}
                >
                  <Text style={styles.emojiIcon}>{emoji}</Text>
                  <Text
                    style={[
                      styles.iconOptionName,
                      { color: isSelected ? colors.primary : colors.text }
                    ]}
                    numberOfLines={1}
                  >
                    {iconName.replace('Em', '')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.noIconsFound}>
            <Text style={[styles.noIconsText, { color: colors.textSecondary }]}>
              No icons found matching "{searchTerm}"
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectedIconPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  previewLabel: {
    fontSize: 14,
  },
  iconPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    gap: 8,
  },
  iconName: {
    fontSize: 14,
  },
  emojiPreview: {
    fontSize: 24,
  },
  emojiIcon: {
    fontSize: 36,
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    fontSize: 16,
  },
  categoryTabsContainer: {
    marginBottom: 12,
  },
  categoryTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  iconGrid: {
    minHeight: 300,
    maxHeight: 500,
  },
  iconGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 20,
  },
  iconOption: {
    width: 70,
    height: 70,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  iconOptionName: {
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  noIconsFound: {
    padding: 20,
    alignItems: 'center',
  },
  noIconsText: {
    fontSize: 14,
  },
});
