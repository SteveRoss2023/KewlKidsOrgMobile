import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import GlobalNavBar from '../../components/GlobalNavBar';
import CalendarService, { Event } from '../../services/calendarService';
import ListService, { ListItem } from '../../services/listService';
import MealsService, { Recipe, MealPlan } from '../../services/mealsService';
import { speak } from '../../utils/voiceFeedback';
import VoiceButton from '../../components/VoiceButton';

type ActiveTab = 'today' | 'week';

interface TodoItem extends ListItem {
  list_name?: string;
  list_id?: number;
}

export default function TodayScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
  const [events, setEvents] = useState<Event[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [meals, setMeals] = useState<{ [dayName: string]: { [mealType: string]: (number | string)[] } }>({});
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>('');

  // Helper functions
  const isToday = (date: string | Date | null): boolean => {
    if (!date) return false;
    const d = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  };

  const isOverdue = (date: string | Date | null): boolean => {
    if (!date) return false;
    const d = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d < today;
  };

  const getWeekStart = (date: Date = new Date()): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0); // Set to midnight to avoid timezone issues
    return weekStart;
  };

  const getWeekEnd = (date: Date = new Date()): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  };

  const isInCurrentWeek = (date: string | Date | null): boolean => {
    if (!date) return false;
    const d = typeof date === 'string' ? new Date(date) : new Date(date);
    // Normalize the date to midnight to avoid timezone/time component issues
    d.setHours(0, 0, 0, 0);
    const weekStart = getWeekStart();
    const weekEnd = getWeekEnd();
    return d >= weekStart && d <= weekEnd;
  };

  const getTodayDayName = (): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  };

  const formatTime = (dateString: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Data fetching functions
  const fetchEvents = useCallback(async () => {
    if (!selectedFamily) {
      setEvents([]);
      return;
    }

    try {
      const allEvents = await CalendarService.getEvents(selectedFamily.id);

      let filteredEvents: Event[];
      if (activeTab === 'today') {
        filteredEvents = allEvents.filter(event => isToday(event.starts_at));
      } else {
        filteredEvents = allEvents.filter(event => isInCurrentWeek(event.starts_at));
      }

      // Sort by start time
      filteredEvents.sort((a, b) => {
        const dateA = new Date(a.starts_at).getTime();
        const dateB = new Date(b.starts_at).getTime();
        return dateA - dateB;
      });

      setEvents(filteredEvents);
    } catch (err: any) {
      console.error('Error fetching events:', err);
      setError(err.response?.data?.detail || 'Failed to load events');
    }
  }, [selectedFamily, activeTab]);

  const fetchTodos = useCallback(async () => {
    if (!selectedFamily) {
      setTodos([]);
      return;
    }

    try {
      // Get all todo-type lists
      const todoLists = await ListService.getLists(selectedFamily.id, 'todo');

      const allTodoItems: TodoItem[] = [];

      // Get items from each todo list
      for (const list of todoLists) {
        try {
          const items = await ListService.getListItems(list.id);

          // Filter for incomplete items and add list info
          items.forEach(item => {
            if (!item.completed) {
              allTodoItems.push({
                ...item,
                list_name: list.name,
                list_id: list.id,
              });
            }
          });
        } catch (err) {
          console.error(`Error fetching items for list ${list.id}:`, err);
        }
      }

      // Filter by date based on active tab
      let filteredTodos: TodoItem[];
      if (activeTab === 'today') {
        filteredTodos = allTodoItems.filter(item => {
          if (!item.due_date) return false;
          const dueDate = new Date(item.due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          dueDate.setHours(0, 0, 0, 0);
          return dueDate <= today;
        });
      } else {
        // For week view, show todos due within the current week
        const weekStart = getWeekStart();
        const weekEnd = getWeekEnd();
        // Get date strings for comparison (YYYY-MM-DD format)
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        if (__DEV__) {
          console.log('[Today] Week filter - Week range:', {
            weekStart: weekStartStr,
            weekEnd: weekEndStr,
            totalTodos: allTodoItems.length,
            todosWithDueDates: allTodoItems.filter(item => item.due_date).length,
          });
        }

        filteredTodos = allTodoItems.filter(item => {
          if (!item.due_date) {
            if (__DEV__) {
              console.log('[Today] Todo without due_date:', item.name);
            }
            return false;
          }

          // due_date is already in YYYY-MM-DD format from the API
          // Extract just the date part in case it includes time
          const dueDateStr = item.due_date.split('T')[0];

          // Compare date strings directly to avoid timezone issues
          const isInWeek = dueDateStr >= weekStartStr && dueDateStr <= weekEndStr;

          if (__DEV__) {
            console.log('[Today] Todo check:', {
              name: item.name,
              due_date: item.due_date,
              dueDateStr,
              weekStartStr,
              weekEndStr,
              isInWeek,
            });
          }

          return isInWeek;
        });

        if (__DEV__) {
          console.log('[Today] Week todos result:', {
            total: allTodoItems.length,
            filtered: filteredTodos.length,
            filteredNames: filteredTodos.map(t => t.name),
          });
        }
      }

      setTodos(filteredTodos);
    } catch (err: any) {
      console.error('Error fetching todos:', err);
      setError(err.response?.data?.detail || 'Failed to load todos');
    }
  }, [selectedFamily, activeTab]);

  const fetchRecipes = useCallback(async () => {
    if (!selectedFamily) {
      setRecipes([]);
      return;
    }

    try {
      const recipeList = await MealsService.fetchRecipes(selectedFamily.id);
      setRecipes(recipeList);
    } catch (err) {
      console.error('Error fetching recipes:', err);
    }
  }, [selectedFamily]);

  const fetchMeals = useCallback(async () => {
    if (!selectedFamily) {
      setMeals({});
      return;
    }

    try {
      const planList = await MealsService.fetchMealPlans(selectedFamily.id);

      const weekStart = getWeekStart();
      // Format as YYYY-MM-DD string directly to avoid timezone issues
      const year = weekStart.getFullYear();
      const month = String(weekStart.getMonth() + 1).padStart(2, '0');
      const day = String(weekStart.getDate()).padStart(2, '0');
      const weekStartStr = `${year}-${month}-${day}`;

      // Find meal plan for current week
      let currentMealPlan = planList.find(plan => {
        // Compare dates as strings (YYYY-MM-DD) to avoid timezone issues
        // week_start_date from API is already in YYYY-MM-DD format
        const planDateStr = typeof plan.week_start_date === 'string'
          ? plan.week_start_date.split('T')[0] // Handle ISO datetime strings
          : new Date(plan.week_start_date).toISOString().split('T')[0];
        return planDateStr === weekStartStr;
      });

      // Debug logging
      if (__DEV__) {
        console.log('[Today] Looking for meal plan with week_start:', weekStartStr);
        console.log('[Today] Available meal plans:', planList.map(p => {
          const planDateStr = typeof p.week_start_date === 'string'
            ? p.week_start_date.split('T')[0]
            : new Date(p.week_start_date).toISOString().split('T')[0];
          return {
            id: p.id,
            week_start: planDateStr,
            matches: planDateStr === weekStartStr,
          };
        }));

        if (!currentMealPlan && planList.length > 0) {
          console.log('[Today] No exact match found for week starting:', weekStartStr);
          // Try to find the most recent plan as fallback
          const sortedPlans = [...planList].sort((a, b) => {
            const dateA = typeof a.week_start_date === 'string'
              ? new Date(a.week_start_date.split('T')[0])
              : new Date(a.week_start_date);
            const dateB = typeof b.week_start_date === 'string'
              ? new Date(b.week_start_date.split('T')[0])
              : new Date(b.week_start_date);
            return dateB.getTime() - dateA.getTime(); // Most recent first
          });
          console.log('[Today] Most recent plan:', sortedPlans[0]?.id, 'week_start:', sortedPlans[0]?.week_start_date);
        } else if (currentMealPlan) {
          console.log('[Today] Found meal plan:', currentMealPlan.id, 'for week starting:', weekStartStr);
        }
      }

      // Fallback: if no exact match, use the most recent meal plan
      if (!currentMealPlan && planList.length > 0) {
        const sortedPlans = [...planList].sort((a, b) => {
          const dateA = typeof a.week_start_date === 'string'
            ? new Date(a.week_start_date.split('T')[0])
            : new Date(a.week_start_date);
          const dateB = typeof b.week_start_date === 'string'
            ? new Date(b.week_start_date.split('T')[0])
            : new Date(b.week_start_date);
          return dateB.getTime() - dateA.getTime(); // Most recent first
        });
        currentMealPlan = sortedPlans[0];
        if (__DEV__) {
          console.log('[Today] Using most recent meal plan as fallback:', currentMealPlan.id);
        }
      }

      if (!currentMealPlan || !currentMealPlan.meals) {
        if (__DEV__) {
          console.log('[Today] No meal plan available or meals object is empty');
        }
        setMeals({});
        return;
      }

      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      if (activeTab === 'today') {
        // Get today's date string (YYYY-MM-DD) - meal plans use date strings as keys, not day names
        const today = new Date();
        const todayDateStr = today.toISOString().split('T')[0];
        const todayDayName = getTodayDayName();
        const todayMeals = currentMealPlan.meals[todayDateStr] || {};

        // Debug logging
        if (__DEV__) {
          console.log('[Today] Today date string:', todayDateStr);
          console.log('[Today] Day name:', todayDayName);
          console.log('[Today] Meals found for today:', todayMeals);
          console.log('[Today] All meals in plan:', JSON.stringify(currentMealPlan.meals, null, 2));
          console.log('[Today] Meal plan keys:', Object.keys(currentMealPlan.meals || {}));
          if (todayMeals && Object.keys(todayMeals).length > 0) {
            console.log('[Today] Today meal types:', Object.keys(todayMeals));
            console.log('[Today] Dinner items:', todayMeals.Dinner || todayMeals.dinner || 'not found');
          } else {
            console.log('[Today] No meals found for date:', todayDateStr);
          }
        }

        setMeals({ [todayDayName]: todayMeals });
      } else {
        // For week view, convert date keys to day names for display
        const weekMeals: { [dayName: string]: { [mealType: string]: (number | string)[] } } = {};
        const weekStart = getWeekStart();

        days.forEach((day, dayIndex) => {
          // Calculate the date for this day of the week
          const dayDate = new Date(weekStart);
          dayDate.setDate(weekStart.getDate() + dayIndex);
          const dayDateStr = dayDate.toISOString().split('T')[0];

          // Check if meals exist for this date
          if (currentMealPlan.meals[dayDateStr]) {
            weekMeals[day] = currentMealPlan.meals[dayDateStr];
          }
        });
        setMeals(weekMeals);
      }
    } catch (err) {
      console.error('[Today] Error fetching meals:', err);
    }
  }, [selectedFamily, activeTab]);

  // Load all data
  const loadData = useCallback(async () => {
    if (!selectedFamily) {
      setEvents([]);
      setTodos([]);
      setMeals({});
      setRecipes([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await Promise.all([
        fetchEvents(),
        fetchTodos(),
        fetchRecipes(),
        fetchMeals(),
      ]);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedFamily, fetchEvents, fetchTodos, fetchRecipes, fetchMeals]);

  // Load data when family or tab changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  // Voice summary generation
  const getRecipeName = (recipeId: number | string): string => {
    if (typeof recipeId === 'string' && !recipeId.match(/^\d+$/)) {
      return recipeId;
    }
    const recipe = recipes.find(r => r.id === parseInt(String(recipeId)));
    return recipe ? recipe.title : `Recipe ${recipeId}`;
  };

  const generateTodaySummary = (): string => {
    let summary = "Here's your summary for today. ";

    if (events.length === 0) {
      summary += "You have no events scheduled. ";
    } else {
      summary += `You have ${events.length} event${events.length > 1 ? 's' : ''}. `;
      events.forEach(event => {
        const time = event.is_all_day ? 'all day' : formatTime(event.starts_at);
        summary += `At ${time}, you have ${event.title}. `;
      });
    }

    const overdueTodos = todos.filter(todo => isOverdue(todo.due_date));
    if (todos.length === 0) {
      summary += "You have no to do's. ";
    } else {
      summary += `You have ${todos.length} to do${todos.length > 1 ? "'s" : ''}: `;
      todos.forEach((todo, index) => {
        if (index > 0) summary += ', ';
        summary += todo.name;
      });
      summary += '. ';
      if (overdueTodos.length > 0) {
        summary += `Note that ${overdueTodos.length} item${overdueTodos.length > 1 ? 's are' : ' is'} overdue. `;
      }
    }

    const todayDayName = getTodayDayName();
    const todayMeals = meals[todayDayName] || {};
    const mealTypes = ['Breakfast', 'Lunch', 'Dinner'];
    let hasMeals = false;

    mealTypes.forEach(mealType => {
      const mealItems = todayMeals[mealType] || [];
      if (mealItems.length > 0) {
        hasMeals = true;
        summary += `For ${mealType.toLowerCase()}, `;
        mealItems.forEach((item, index) => {
          if (index > 0) summary += ', ';
          summary += getRecipeName(item);
        });
        summary += '. ';
      }
    });

    if (!hasMeals) {
      summary += "No meals planned for today. ";
    }

    summary += "That's everything for today.";
    return summary;
  };

  const generateWeekSummary = (): string => {
    let summary = "Here's your summary for this week. ";

    const eventsByDay: { [key: string]: Event[] } = {};
    events.forEach(event => {
      const dayName = formatDate(event.starts_at);
      if (!eventsByDay[dayName]) {
        eventsByDay[dayName] = [];
      }
      eventsByDay[dayName].push(event);
    });

    if (events.length === 0) {
      summary += "You have no events this week. ";
    } else {
      summary += `You have ${events.length} event${events.length > 1 ? 's' : ''} this week. `;
      Object.keys(eventsByDay).sort().forEach(day => {
        eventsByDay[day].forEach(event => {
          const time = event.is_all_day ? 'all day' : formatTime(event.starts_at);
          summary += `On ${day}, at ${time}, you have ${event.title}. `;
        });
      });
    }

    const todosByDay: { [key: string]: TodoItem[] } = {};
    todos.forEach(todo => {
      const dayName = formatDate(todo.due_date || '');
      if (!todosByDay[dayName]) {
        todosByDay[dayName] = [];
      }
      todosByDay[dayName].push(todo);
    });

    if (todos.length === 0) {
      summary += "You have no to do's this week. ";
    } else {
      summary += `You have ${todos.length} to do${todos.length > 1 ? "'s" : ''} this week. `;
      Object.keys(todosByDay).sort().forEach(day => {
        summary += `On ${day}, you have ${todosByDay[day].length} to do${todosByDay[day].length > 1 ? "'s" : ''}: `;
        todosByDay[day].forEach((todo, index) => {
          if (index > 0) summary += ', ';
          summary += todo.name;
        });
        summary += '. ';
      });
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mealTypes = ['Breakfast', 'Lunch', 'Dinner'];
    let hasMeals = false;

    days.forEach(day => {
      const dayMeals = meals[day];
      if (dayMeals) {
        mealTypes.forEach(mealType => {
          const mealItems = dayMeals[mealType] || [];
          if (mealItems.length > 0) {
            hasMeals = true;
            summary += `On ${day}, for ${mealType.toLowerCase()}: `;
            mealItems.forEach((item, index) => {
              if (index > 0) summary += ', ';
              summary += getRecipeName(item);
            });
            summary += '. ';
          }
        });
      }
    });

    if (!hasMeals) {
      summary += "No meals planned for this week. ";
    }

    summary += "That's everything for this week.";
    return summary;
  };

  const handleVoiceClick = () => {
    const summary = activeTab === 'today' ? generateTodaySummary() : generateWeekSummary();
    speak(summary);
  };

  // Navigation handlers
  const handleEventPress = (event: Event) => {
    // Navigate to calendar screen - user can find the event there
    router.push('/(tabs)/calendar' as any);
  };

  const handleTodoPress = (todo: TodoItem) => {
    if (todo.list_id) {
      router.push(`/(tabs)/lists/${todo.list_id}` as any);
    }
  };

  const handleMealPress = () => {
    router.push('/(tabs)/meals' as any);
  };

  if (!selectedFamily) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Please select a family to view today's activities.
          </Text>
        </View>
      </View>
    );
  }

  const todayDayName = getTodayDayName();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const mealTypes = ['Breakfast', 'Lunch', 'Dinner'];
  const overdueTodos = todos.filter(todo => isOverdue(todo.due_date));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: colors.text }]}>
            {activeTab === 'today' ? "Today's Summary" : "This Week's Summary"}
          </Text>
          <TouchableOpacity
            onPress={handleVoiceClick}
            style={[styles.voiceButton, { backgroundColor: colors.primary }]}
            accessibilityLabel="Listen to summary"
          >
            <FontAwesome name="volume-up" size={18} color="#fff" />
            <Text style={styles.voiceButtonText}>Listen</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'today' && { borderBottomColor: colors.primary },
            activeTab === 'today' && styles.tabActive,
          ]}
          onPress={() => setActiveTab('today')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'today' ? colors.primary : colors.textSecondary },
            ]}
          >
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'week' && { borderBottomColor: colors.primary },
            activeTab === 'week' && styles.tabActive,
          ]}
          onPress={() => setActiveTab('week')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'week' ? colors.primary : colors.textSecondary },
            ]}
          >
            Week
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {error && (
        <View style={[styles.errorContainer, { backgroundColor: colors.surface }]}>
          <Text style={[styles.errorText, { color: colors.error || '#ef4444' }]}>{error}</Text>
        </View>
      )}

      {!loading && !error && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {/* Events Section */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>📅</Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Events {activeTab === 'today' ? 'Today' : 'This Week'}
              </Text>
            </View>
            {events.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>
                  No events {activeTab === 'today' ? 'today' : 'this week'}.
                </Text>
              </View>
            ) : (
              <View style={styles.eventsList}>
                {events.map(event => (
                  <TouchableOpacity
                    key={event.id}
                    style={[
                      styles.eventItem,
                      { backgroundColor: colors.background, borderLeftColor: event.color || '#3b82f6' },
                    ]}
                    onPress={() => handleEventPress(event)}
                  >
                    <View style={styles.eventTimeContainer}>
                      {activeTab === 'week' && (
                        <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
                          {formatDate(event.starts_at)}
                        </Text>
                      )}
                      <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                        {event.is_all_day ? 'All Day' : formatTime(event.starts_at)}
                      </Text>
                    </View>
                    <View style={styles.eventDetails}>
                      <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                      {event.location && (
                        <Text style={[styles.eventLocation, { color: colors.textSecondary }]}>
                          📍 {event.location}
                        </Text>
                      )}
                      {event.notes && (
                        <Text style={[styles.eventNotes, { color: colors.textSecondary }]} numberOfLines={2}>
                          {event.notes}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* To Do's Section */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>✓</Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                To Do's {activeTab === 'today' ? 'Today' : 'This Week'}
              </Text>
              {activeTab === 'today' && overdueTodos.length > 0 && (
                <View style={[styles.overdueBadge, { backgroundColor: colors.error || '#ef4444' }]}>
                  <Text style={styles.overdueBadgeText}>{overdueTodos.length} overdue</Text>
                </View>
              )}
            </View>
            {todos.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>
                  No to do's {activeTab === 'today' ? 'today' : 'this week'}.
                </Text>
              </View>
            ) : (
              <View style={styles.todosList}>
                {todos.map(todo => {
                  const isOverdueItem = isOverdue(todo.due_date);
                  return (
                    <TouchableOpacity
                      key={todo.id}
                      style={[
                        styles.todoItem,
                        {
                          backgroundColor: colors.background,
                          borderLeftColor: isOverdueItem ? (colors.error || '#ef4444') : colors.border,
                        },
                        isOverdueItem && styles.todoItemOverdue,
                      ]}
                      onPress={() => handleTodoPress(todo)}
                    >
                      <View style={styles.todoContent}>
                        <Text style={[styles.todoName, { color: colors.text }]}>{todo.name}</Text>
                        {todo.list_name && (
                          <Text style={[styles.todoList, { color: colors.textSecondary }]}>
                            From: {todo.list_name}
                          </Text>
                        )}
                        {activeTab === 'week' && todo.due_date && (
                          <Text style={[styles.todoDate, { color: colors.textSecondary }]}>
                            Due: {formatDate(todo.due_date)}
                          </Text>
                        )}
                        {isOverdueItem && (
                          <Text style={[styles.todoOverdueLabel, { color: colors.error || '#ef4444' }]}>
                            Overdue
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Meals Section */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>🍽️</Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Meals {activeTab === 'today' ? 'Today' : 'This Week'}
              </Text>
            </View>
            {activeTab === 'today' ? (
              (() => {
                const todayMeals = meals[todayDayName] || {};
                const hasAnyMeals = mealTypes.some(type => {
                  const items = todayMeals[type] ||
                               todayMeals[type.toLowerCase()] ||
                               todayMeals[type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()] ||
                               [];
                  return items.length > 0;
                });

                if (!hasAnyMeals) {
                  return (
                    <View style={styles.emptySection}>
                      <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>
                        No meals planned for today.
                      </Text>
                    </View>
                  );
                }

                return (
                  <TouchableOpacity
                    style={styles.mealsContainer}
                    onPress={handleMealPress}
                    activeOpacity={0.7}
                  >
                    {mealTypes.map(mealType => {
                      // Try both exact match and case-insensitive match
                      const mealItems = todayMeals[mealType] ||
                                       todayMeals[mealType.toLowerCase()] ||
                                       todayMeals[mealType.charAt(0).toUpperCase() + mealType.slice(1).toLowerCase()] ||
                                       [];
                      if (mealItems.length === 0) return null;

                      return (
                        <View key={mealType} style={styles.mealType}>
                          <Text style={[styles.mealTypeTitle, { color: colors.text }]}>{mealType}</Text>
                          <View style={styles.mealItems}>
                            {mealItems.map((item, index) => (
                              <View key={index} style={[styles.mealItem, { backgroundColor: colors.background }]}>
                                <Text style={[styles.mealItemText, { color: colors.text }]}>
                                  {getRecipeName(item)}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </TouchableOpacity>
                );
              })()
            ) : (
              (() => {
                const hasAnyMeals = Object.keys(meals).length > 0;

                if (!hasAnyMeals) {
                  return (
                    <View style={styles.emptySection}>
                      <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>
                        No meals planned for this week.
                      </Text>
                    </View>
                  );
                }

                return (
                  <TouchableOpacity
                    style={styles.mealsWeekContainer}
                    onPress={handleMealPress}
                    activeOpacity={0.7}
                  >
                    {days.map(day => {
                      const dayMeals = meals[day];
                      if (!dayMeals) return null;

                      return (
                        <View key={day} style={styles.mealDay}>
                          <Text style={[styles.mealDayTitle, { color: colors.text }]}>{day}</Text>
                          <View style={styles.mealDayContent}>
                            {mealTypes.map(mealType => {
                              // Try both exact match and case-insensitive match
                              const mealItems = dayMeals[mealType] ||
                                               dayMeals[mealType.toLowerCase()] ||
                                               dayMeals[mealType.charAt(0).toUpperCase() + mealType.slice(1).toLowerCase()] ||
                                               [];
                              if (mealItems.length === 0) return null;

                              return (
                                <View key={mealType} style={styles.mealType}>
                                  <Text style={[styles.mealTypeTitle, { color: colors.text }]}>{mealType}</Text>
                                  <View style={styles.mealItems}>
                                    {mealItems.map((item, index) => (
                                      <View
                                        key={index}
                                        style={[styles.mealItem, { backgroundColor: colors.background }]}
                                      >
                                        <Text style={[styles.mealItemText, { color: colors.text }]}>
                                          {getRecipeName(item)}
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </TouchableOpacity>
                );
              })()
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  voiceButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorContainer: {
    padding: 16,
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionIcon: {
    fontSize: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  overdueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  overdueBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  emptySection: {
    padding: 16,
    alignItems: 'center',
  },
  emptySectionText: {
    fontSize: 14,
    textAlign: 'center',
  },
  eventsList: {
    gap: 12,
  },
  eventItem: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    gap: 12,
  },
  eventTimeContainer: {
    minWidth: 80,
  },
  eventDate: {
    fontSize: 11,
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 13,
    fontWeight: '600',
  },
  eventDetails: {
    flex: 1,
    gap: 4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  eventLocation: {
    fontSize: 13,
  },
  eventNotes: {
    fontSize: 13,
  },
  todosList: {
    gap: 12,
  },
  todoItem: {
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  todoItemOverdue: {
    borderLeftWidth: 4,
  },
  todoContent: {
    gap: 4,
  },
  todoName: {
    fontSize: 16,
    fontWeight: '500',
  },
  todoList: {
    fontSize: 13,
  },
  todoDate: {
    fontSize: 13,
  },
  todoOverdueLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  mealsContainer: {
    gap: 16,
  },
  mealsWeekContainer: {
    gap: 20,
  },
  mealDay: {
    gap: 8,
  },
  mealDayTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  mealDayContent: {
    gap: 12,
  },
  mealType: {
    gap: 8,
  },
  mealTypeTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  mealItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mealItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  mealItemText: {
    fontSize: 13,
  },
});
