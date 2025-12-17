import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import MealsService, { Recipe, MealPlan } from '../../services/mealsService';
import AddMealModal from './AddMealModal';

interface MealPlanningTabProps {
  mealPlans: MealPlan[];
  recipes: Recipe[];
  selectedFamily: { id: number; name: string };
  onRefresh: () => void;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'];

export default function MealPlanningTab({
  mealPlans,
  recipes,
  selectedFamily,
  onRefresh,
}: MealPlanningTabProps) {
  const { colors } = useTheme();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    const weekStart = new Date(today.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  });
  const [showAddMealModal, setShowAddMealModal] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string>('');
  const [selectedMealType, setSelectedMealType] = useState<string>('');
  const [addingMeal, setAddingMeal] = useState(false);

  const getWeekEnd = () => {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    return end;
  };

  const getCurrentMealPlan = () => {
    const weekStartStr = currentWeekStart.toISOString().split('T')[0];
    return mealPlans.find(mp => mp.week_start_date === weekStartStr);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeekStart(newDate);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDayDate = (dayIndex: number) => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + dayIndex);
    return date;
  };

  const handleAddMealClick = (dayKey: string, mealType: string) => {
    setSelectedDayKey(dayKey);
    setSelectedMealType(mealType);
    setShowAddMealModal(true);
  };

  const handleAddMeal = async (meal: number | string) => {
    if (!selectedDayKey || !selectedMealType) return;

    setAddingMeal(true);
    try {
      const weekStartStr = currentWeekStart.toISOString().split('T')[0];
      let mealPlan = getCurrentMealPlan();

      // Get current meals or initialize empty structure
      const currentMeals = mealPlan?.meals || {};

      // Ensure the day and meal type exist in the structure
      if (!currentMeals[selectedDayKey]) {
        currentMeals[selectedDayKey] = {};
      }
      if (!currentMeals[selectedDayKey][selectedMealType]) {
        currentMeals[selectedDayKey][selectedMealType] = [];
      }

      // Add the new meal
      currentMeals[selectedDayKey][selectedMealType].push(meal);

      if (mealPlan) {
        // Update existing meal plan
        await MealsService.updateMealPlan(mealPlan.id, {
          meals: currentMeals,
        });
      } else {
        // Create new meal plan
        await MealsService.createMealPlan({
          family: selectedFamily.id,
          week_start_date: weekStartStr,
          meals: currentMeals,
        });
      }

      setShowAddMealModal(false);
      setSelectedDayKey('');
      setSelectedMealType('');
      onRefresh();
    } catch (error: any) {
      console.error('Error adding meal:', error);
      Alert.alert('Error', 'Failed to add meal. Please try again.');
    } finally {
      setAddingMeal(false);
    }
  };

  const handleDeleteMeal = async (dayKey: string, mealType: string, mealIndex: number) => {
    try {
      const weekStartStr = currentWeekStart.toISOString().split('T')[0];
      const mealPlan = getCurrentMealPlan();

      if (!mealPlan) {
        return;
      }

      // Get current meals
      const currentMeals = { ...mealPlan.meals };

      // Ensure the day and meal type exist
      if (!currentMeals[dayKey] || !currentMeals[dayKey][mealType]) {
        return;
      }

      // Remove the meal at the specified index
      currentMeals[dayKey][mealType] = currentMeals[dayKey][mealType].filter(
        (_, idx) => idx !== mealIndex
      );

      // Clean up empty arrays
      if (currentMeals[dayKey][mealType].length === 0) {
        delete currentMeals[dayKey][mealType];
      }
      if (Object.keys(currentMeals[dayKey]).length === 0) {
        delete currentMeals[dayKey];
      }

      // Update the meal plan
      await MealsService.updateMealPlan(mealPlan.id, {
        meals: currentMeals,
      });

      onRefresh();
    } catch (error: any) {
      console.error('Error deleting meal:', error);
      Alert.alert('Error', 'Failed to delete meal. Please try again.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.weekNavigation, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigateWeek('prev')} style={styles.navButton}>
          <FontAwesome name="chevron-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.weekInfo}>
          <Text style={[styles.weekText, { color: colors.text }]}>
            {formatDate(currentWeekStart)} - {formatDate(getWeekEnd())}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigateWeek('next')} style={styles.navButton}>
          <FontAwesome name="chevron-right" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.grid}>
          {DAYS.map((day, dayIndex) => {
            const dayDate = getDayDate(dayIndex);
            const dayKey = dayDate.toISOString().split('T')[0];
            const mealPlan = getCurrentMealPlan();
            const dayMeals = mealPlan?.meals[dayKey] || {};

            return (
              <View key={day} style={[styles.dayColumn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.dayHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.dayName, { color: colors.text }]}>{day}</Text>
                  <Text style={[styles.dayDate, { color: colors.textSecondary }]}>
                    {formatDate(dayDate)}
                  </Text>
                </View>

                {MEAL_TYPES.map((mealType) => {
                  const meals = dayMeals[mealType] || [];
                  return (
                    <View key={mealType} style={styles.mealSlot}>
                      <Text style={[styles.mealTypeLabel, { color: colors.textSecondary }]}>
                        {mealType}
                      </Text>
                      <View style={styles.mealsList}>
                        {meals.length === 0 ? (
                          <Text style={[styles.emptyMeal, { color: colors.textSecondary }]}>
                            No meal planned
                          </Text>
                        ) : (
                          meals.map((meal, idx) => {
                            if (typeof meal === 'number') {
                              const recipe = recipes.find(r => r.id === meal);
                              return (
                                <View key={idx} style={[styles.mealItem, { backgroundColor: colors.background }]}>
                                  <Text style={[styles.mealText, { color: colors.text, flex: 1 }]}>
                                    {recipe?.title || 'Unknown recipe'}
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() => handleDeleteMeal(dayKey, mealType, idx)}
                                    style={styles.deleteButton}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  >
                                    <FontAwesome name="times" size={12} color={colors.textSecondary} />
                                  </TouchableOpacity>
                                </View>
                              );
                            } else {
                              return (
                                <View key={idx} style={[styles.mealItem, { backgroundColor: colors.background }]}>
                                  <Text style={[styles.mealText, { color: colors.text, flex: 1 }]}>
                                    {meal}
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() => handleDeleteMeal(dayKey, mealType, idx)}
                                    style={styles.deleteButton}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  >
                                    <FontAwesome name="times" size={12} color={colors.textSecondary} />
                                  </TouchableOpacity>
                                </View>
                              );
                            }
                          })
                        )}
                      </View>
                      <TouchableOpacity
                        style={[styles.addMealButton, { borderColor: colors.border }]}
                        onPress={() => handleAddMealClick(dayKey, mealType)}
                      >
                        <FontAwesome name="plus" size={12} color={colors.primary} />
                        <Text style={[styles.addMealText, { color: colors.primary }]}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <AddMealModal
        visible={showAddMealModal}
        recipes={recipes}
        onClose={() => {
          setShowAddMealModal(false);
          setSelectedDayKey('');
          setSelectedMealType('');
        }}
        onAdd={handleAddMeal}
        loading={addingMeal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  navButton: {
    padding: 8,
  },
  weekInfo: {
    flex: 1,
    alignItems: 'center',
  },
  weekText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    padding: 8,
  },
  dayColumn: {
    flex: 1,
    margin: 4,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dayHeader: {
    padding: 8,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  dayName: {
    fontSize: 14,
    fontWeight: '600',
  },
  dayDate: {
    fontSize: 11,
    marginTop: 2,
  },
  mealSlot: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  mealTypeLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  mealsList: {
    minHeight: 40,
  },
  mealItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 4,
    marginBottom: 4,
    gap: 8,
  },
  deleteButton: {
    padding: 4,
  },
  mealText: {
    fontSize: 12,
  },
  emptyMeal: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  addMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 4,
    gap: 4,
  },
  addMealText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
