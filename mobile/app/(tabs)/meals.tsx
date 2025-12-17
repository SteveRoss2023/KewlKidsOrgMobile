import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import MealsService, { Recipe, MealPlan } from '../../services/mealsService';
import RecipesTab from '../../components/meals/RecipesTab';
import MealPlanningTab from '../../components/meals/MealPlanningTab';
import GroceryListsTab from '../../components/meals/GroceryListsTab';

type ActiveTab = 'recipes' | 'meal-planning' | 'lists';

export default function MealsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [activeTab, setActiveTab] = useState<ActiveTab>('recipes');

  // Set active tab from URL params if provided
  useEffect(() => {
    if (params.tab && ['recipes', 'meal-planning', 'lists'].includes(params.tab)) {
      setActiveTab(params.tab as ActiveTab);
    }
  }, [params.tab]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const fetchRecipes = useCallback(async () => {
    if (!selectedFamily) return;

    setLoading(true);
    setError('');
    try {
      const data = await MealsService.fetchRecipes(selectedFamily.id);
      setRecipes(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load recipes');
      console.error('Error fetching recipes:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedFamily]);

  const fetchMealPlans = useCallback(async () => {
    if (!selectedFamily) return;

    try {
      const data = await MealsService.fetchMealPlans(selectedFamily.id);
      setMealPlans(data);
    } catch (err: any) {
      console.error('Error fetching meal plans:', err);
    }
  }, [selectedFamily]);

  useFocusEffect(
    useCallback(() => {
      if (selectedFamily) {
        fetchRecipes();
        fetchMealPlans();
      }
    }, [selectedFamily, fetchRecipes, fetchMealPlans])
  );

  if (!selectedFamily) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.noFamilyContainer}>
          <Text style={[styles.noFamilyText, { color: colors.text }]}>
            Please select a family to view recipes and meal plans.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Meal Planning & Recipes</Text>
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'lists' && [styles.activeTab, { borderBottomColor: colors.primary }],
          ]}
          onPress={() => setActiveTab('lists')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'lists' ? colors.primary : colors.textSecondary }]}>
            Grocery Lists
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'recipes' && [styles.activeTab, { borderBottomColor: colors.primary }],
          ]}
          onPress={() => setActiveTab('recipes')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'recipes' ? colors.primary : colors.textSecondary }]}>
            Recipes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'meal-planning' && [styles.activeTab, { borderBottomColor: colors.primary }],
          ]}
          onPress={() => setActiveTab('meal-planning')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'meal-planning' ? colors.primary : colors.textSecondary }]}>
            Meal Planning
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}

      {activeTab === 'recipes' && (
        <RecipesTab
          recipes={recipes}
          loading={loading}
          selectedFamily={selectedFamily}
          onRefresh={fetchRecipes}
        />
      )}

      {activeTab === 'meal-planning' && (
        <MealPlanningTab
          mealPlans={mealPlans}
          recipes={recipes}
          selectedFamily={selectedFamily}
          onRefresh={fetchMealPlans}
        />
      )}

      {activeTab === 'lists' && (
        <GroceryListsTab selectedFamily={selectedFamily} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    padding: 16,
  },
  errorText: {
    fontSize: 14,
  },
  noFamilyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  noFamilyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

