import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Alert,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter, useFocusEffect } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import CalendarService, { Event, CreateEventData } from '../../services/calendarService';
import ProfileService from '../../services/profileService';
import AlertModal from '../../components/AlertModal';
import WeekView from '../../components/calendar/WeekView';
import DayView from '../../components/calendar/DayView';
import CalendarToolbar from '../../components/calendar/CalendarToolbar';
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';
import { useCalendarVoiceCommands } from '../../hooks/useCalendarVoiceCommands';
import VoiceButton from '../../components/VoiceButton';
import { speak } from '../../utils/voiceFeedback';

type ViewType = 'month' | 'week' | 'day' | 'agenda';

const COLOR_PRESETS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' },
];

export default function CalendarScreen() {
  const router = useRouter();
  const { colors, theme } = useTheme();
  const { selectedFamily } = useFamily();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>('');
  // Initialize currentDate to today in local timezone
  const getTodayLocal = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };
  const [currentDate, setCurrentDate] = useState<Date>(getTodayLocal());
  const [view, setView] = useState<ViewType>('month');
  const currentDateRef = useRef(currentDate);
  const viewRef = useRef<ViewType>(view);

  // Keep refs in sync with state
  useEffect(() => {
    currentDateRef.current = currentDate;
  }, [currentDate]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);
  const [formData, setFormData] = useState<CreateEventData>({
    family: selectedFamily?.id || 0,
    title: '',
    notes: '',
    location: '',
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    is_all_day: false,
    color: '#3b82f6',
  });
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const titleInputRef = useRef<TextInput>(null);
  const modalRef = useRef<ScrollView>(null);

  // Voice recognition
  const { isListening, transcript, start, stop, reset, isSupported } = useVoiceRecognition();

  // Load calendar view preference
  useEffect(() => {
    const loadViewPreference = async () => {
      try {
        const profile = await ProfileService.getProfile();
        if (profile.calendar_view_preference) {
          const savedView = profile.calendar_view_preference;
          const viewMap: Record<string, ViewType> = {
            'month': 'month',
            'week': 'week',
            '3day': 'week',
            'day': 'day',
            'agenda': 'agenda',
          };
          const mappedView = viewMap[savedView] || 'month';
          setView(mappedView);
        }
      } catch (error) {
        console.error('Failed to load calendar view preference:', error);
      }
    };
    loadViewPreference();
  }, []);

  // Save view preference
  const saveViewPreference = async (newView: ViewType) => {
    try {
      const viewMap: Record<string, string> = {
        'month': 'month',
        'week': 'week',
        'day': 'day',
        'agenda': 'agenda',
      };
      const savedView = viewMap[newView] || 'month';
      await ProfileService.updateCalendarViewPreference(savedView);
    } catch (error) {
      console.error('Failed to save calendar view preference:', error);
    }
  };

  // Convert datetime-local to ISO
  const convertLocalDateTimeToISO = (localDateTimeStr: string): string | null => {
    if (!localDateTimeStr) return null;
    const [datePart, timePart] = localDateTimeStr.split('T');
    if (!datePart || !timePart) return localDateTimeStr;
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return localDate.toISOString();
  };

  // Load events when family changes or screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (selectedFamily) {
        fetchEvents();
      } else {
        setEvents([]);
      }
    }, [selectedFamily])
  );

  const fetchEvents = async () => {
    if (!selectedFamily) {
      setEvents([]);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const fetchedEvents = await CalendarService.getEvents(selectedFamily.id);
      setEvents(fetchedEvents);
    } catch (err: any) {
      console.error('Error fetching events:', err);
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  };

  // Handle navigation (Today, Prev, Next)
  const handleNavigate = (action: 'TODAY' | 'PREV' | 'NEXT') => {
    const newDate = new Date(currentDate);
    if (action === 'TODAY') {
      setCurrentDate(new Date());
    } else if (action === 'PREV') {
      if (view === 'month') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else if (view === 'week') {
        newDate.setDate(newDate.getDate() - 7);
      } else if (view === 'day') {
        newDate.setDate(newDate.getDate() - 1);
      }
      setCurrentDate(newDate);
    } else if (action === 'NEXT') {
      if (view === 'month') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else if (view === 'week') {
        newDate.setDate(newDate.getDate() + 7);
      } else if (view === 'day') {
        newDate.setDate(newDate.getDate() + 1);
      }
      setCurrentDate(newDate);
    }
  };

  // Swipe gesture handler for mobile navigation
  const swipeGesture = useMemo(() => {
    if (Platform.OS === 'web') return null;

    return Gesture.Pan()
      .minDistance(30) // Require more distance before activating
      .activeOffsetX([-30, 30]) // Only activate on clear horizontal movement
      .failOffsetY([-5, 5]) // Fail immediately on any vertical movement
      .maxPointers(1) // Only allow single finger
      .runOnJS(true)
      .onEnd((event) => {
        const swipeThreshold = 100; // Higher threshold for more intentional swipes
        const horizontalMovement = Math.abs(event.translationX);
        const verticalMovement = Math.abs(event.translationY);

        // Only trigger if horizontal movement is very significant and much greater than vertical
        if (horizontalMovement > swipeThreshold && horizontalMovement > verticalMovement * 3) {
          const currentView = viewRef.current;
          const currentDateValue = currentDateRef.current;
          const newDate = new Date(currentDateValue);

          if (event.translationX > 0) {
            // Swipe right = previous
            if (currentView === 'month') {
              newDate.setMonth(newDate.getMonth() - 1);
            } else if (currentView === 'week') {
              newDate.setDate(newDate.getDate() - 7);
            } else if (currentView === 'day') {
              newDate.setDate(newDate.getDate() - 1);
            }
            setCurrentDate(newDate);
          } else {
            // Swipe left = next
            if (currentView === 'month') {
              newDate.setMonth(newDate.getMonth() + 1);
            } else if (currentView === 'week') {
              newDate.setDate(newDate.getDate() + 7);
            } else if (currentView === 'day') {
              newDate.setDate(newDate.getDate() + 1);
            }
            setCurrentDate(newDate);
          }
        }
      });
  }, [view]);

  // Handle view change
  const handleViewChange = (newView: string) => {
    setView(newView as ViewType);
    saveViewPreference(newView as ViewType);
  };

  // Format date to local datetime string (YYYY-MM-DDTHH:mm)
  const formatLocalDateTime = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Extract date part (YYYY-MM-DD) from datetime string
  const getDatePart = (datetime: string) => {
    if (!datetime) return '';
    const date = new Date(datetime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Extract time part (HH:mm) from datetime string
  const getTimePart = (datetime: string) => {
    if (!datetime) return '';
    const date = new Date(datetime);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Combine date and time into datetime string
  const combineDateTime = (dateStr: string, timeStr: string) => {
    if (!dateStr || !timeStr) return '';
    return `${dateStr}T${timeStr}`;
  };

  // Handle slot selection (click on time slot to create event)
  const handleSelectSlot = (date: Date) => {
    if (!selectedFamily) {
      Alert.alert('Error', 'Please select a family first');
      return;
    }

    const endDate = new Date(date.getTime() + 30 * 60 * 1000); // 30 minutes later

    setFormData({
      family: selectedFamily.id,
      title: '',
      notes: '',
      location: '',
      starts_at: formatLocalDateTime(date),
      ends_at: formatLocalDateTime(endDate),
      is_all_day: false,
      color: '#3b82f6',
    });
    setSelectedEvent(null);
    setIsEditing(false);
    setShowEventForm(true);
  };

  // Handle day cell click in month view to create event
  const handleMonthDayPress = (day: any) => {
    // Create date in local timezone (not UTC)
    const date = new Date(day.year, day.month - 1, day.day, 12, 0, 0, 0);
    handleSelectSlot(date);
  };

  // Handle event click - open form in edit mode
  const handleSelectEvent = (event: Event) => {
    const eventColor = event.color || '#3b82f6';

    setFormData({
      family: event.family,
      title: event.title,
      notes: event.notes || '',
      location: event.location || '',
      starts_at: formatLocalDateTime(new Date(event.starts_at)),
      ends_at: event.ends_at ? formatLocalDateTime(new Date(event.ends_at)) : formatLocalDateTime(new Date(event.starts_at)),
      is_all_day: event.is_all_day,
      color: eventColor,
    });
    setSelectedEvent(event);
    setIsEditing(true);
    setShowEventForm(true);
  };

  // Handle day press in month view
  const handleDayPress = (day: any) => {
    // Parse date string (YYYY-MM-DD) in local timezone
    const [year, month, dayNum] = day.dateString.split('-').map(Number);
    const date = new Date(year, month - 1, dayNum);
    setCurrentDate(date);
    // Optionally switch to day view
    // setView('day');
  };

  // Handle event creation/update from form
  const handleCreateEvent = async () => {
    if (!selectedFamily || !formData.title.trim()) {
      Alert.alert('Error', 'Please enter an event title');
      return;
    }

    setCreating(true);
    setError('');
    stop();
    reset();

    try {
      // Convert datetime-local format to ISO
      let startsAtISO = formData.starts_at;
      let endsAtISO = formData.ends_at || startsAtISO;

      // If it's in datetime-local format (YYYY-MM-DDTHH:mm), convert it
      if (formData.starts_at && formData.starts_at.includes('T') && !formData.starts_at.includes('Z') && !formData.starts_at.includes('+')) {
        startsAtISO = convertLocalDateTimeToISO(formData.starts_at) || formData.starts_at;
      } else if (!formData.starts_at) {
        startsAtISO = new Date().toISOString();
      }

      if (formData.ends_at && formData.ends_at.includes('T') && !formData.ends_at.includes('Z') && !formData.ends_at.includes('+')) {
        endsAtISO = convertLocalDateTimeToISO(formData.ends_at) || formData.ends_at;
      } else if (!formData.ends_at) {
        endsAtISO = startsAtISO;
      }

      let response;
      if (isEditing && selectedEvent) {
        response = await CalendarService.updateEvent(selectedEvent.id, {
          ...formData,
          starts_at: startsAtISO || formData.starts_at,
          ends_at: endsAtISO || formData.ends_at,
        });
        speak(`Event "${response.title}" updated successfully!`);
      } else {
        response = await CalendarService.createEvent({
          ...formData,
          family: selectedFamily.id,
          starts_at: startsAtISO || formData.starts_at,
          ends_at: endsAtISO || formData.ends_at,
        });
        speak(`Event "${response.title}" added to calendar successfully!`);
      }

      // Refresh from server
      setTimeout(async () => {
        await fetchEvents();
      }, 1000);

      // Reset form
      resetForm();
      setShowEventForm(false);
      setCalendarKey(prev => prev + 1);
    } catch (err: any) {
      console.error('Error saving event:', err);
      setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} event`);
      speak(`Failed to ${isEditing ? 'update' : 'create'} event. Please try again.`);
    } finally {
      setCreating(false);
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!selectedEvent) return;

    setDeleting(true);
    try {
      await CalendarService.deleteEvent(selectedEvent.id);
      await fetchEvents();
      setShowDeleteModal(false);
      setSelectedEvent(null);
      stop();
      reset();
      speak('Event deleted successfully.');
    } catch (err: any) {
      console.error('Error deleting event:', err);
      setError(err.message || 'Failed to delete event');
      stop();
      reset();
      speak('Failed to delete event. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      family: selectedFamily?.id || 0,
      title: '',
      notes: '',
      location: '',
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      is_all_day: false,
      color: '#3b82f6',
    });
    setSelectedEvent(null);
    setIsEditing(false);
  };

  // Helper function to get date string in local timezone (YYYY-MM-DD)
  const getLocalDateString = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to compare dates (ignoring time)
  const isSameDate = (date1: Date | string, date2: Date | string) => {
    return getLocalDateString(date1) === getLocalDateString(date2);
  };

  // Format date for toolbar label
  const getToolbarLabel = () => {
    if (view === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (view === 'week') {
      const weekStart = new Date(currentDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else if (view === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    return 'Agenda';
  };

  // Convert events to marked dates format for calendar
  const getMarkedDates = () => {
    const marked: any = {};
    events.forEach((event) => {
      const date = getLocalDateString(event.starts_at);
      if (!marked[date]) {
        marked[date] = {
          marked: true,
          dots: [],
        };
      }
      marked[date].dots.push({
        color: event.color || '#3b82f6',
      });
    });
    return marked;
  };

  // Get events for selected date
  const getEventsForDate = (date: Date) => {
    const dateStr = getLocalDateString(date);
    return events.filter((event) => {
      const eventDateStr = getLocalDateString(event.starts_at);
      return eventDateStr === dateStr;
    });
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toISOString().split('T')[0],
      time: date.toTimeString().slice(0, 5),
    };
  };

  // Handle form changes
  const handleChange = (name: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Scroll modal to top and focus title input when form opens
  useEffect(() => {
    if (showEventForm) {
      if (modalRef.current) {
        modalRef.current.scrollTo({ y: 0, animated: false });
      }
      setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
        }
      }, 150);
    }
  }, [showEventForm]);

  // Custom event style getter for month view
  const eventStyleGetter = useCallback((event: Event) => {
    const foundEvent = events.find(e => e.id === event.id);
    const color = foundEvent?.color || event.color || '#3b82f6';
    return {
      style: {
        backgroundColor: color,
        borderRadius: 4,
        opacity: 0.8,
        borderWidth: 0,
      },
    };
  }, [events]);

  // Memoize agenda items to prevent infinite re-renders
  const agendaItems = useMemo(() => {
    const items: { [key: string]: Event[] } = {};
    events.forEach((event) => {
      const date = getLocalDateString(event.starts_at);
      if (!items[date]) {
        items[date] = [];
      }
      items[date].push(event);
    });
    return items;
  }, [events]);

  // Memoize sorted dates for agenda view
  const sortedDates = useMemo(() => {
    const dates = Object.keys(agendaItems).sort();
    return dates;
  }, [agendaItems]);

  // Create event directly (from voice)
  const handleCreateEventDirectly = async (eventData: any) => {
    if (!selectedFamily) return;

    setCreating(true);
    try {
      const startsAtISO = convertLocalDateTimeToISO(eventData.starts_at);
      const endsAtISO = convertLocalDateTimeToISO(eventData.ends_at);

      const response = await CalendarService.createEvent({
        ...eventData,
        family: selectedFamily.id,
        starts_at: startsAtISO || eventData.starts_at,
        ends_at: endsAtISO || eventData.ends_at,
      });

      // Refresh from server
      setTimeout(async () => {
        await fetchEvents();
      }, 1000);

      speak(`Event "${eventData.title}" added to calendar successfully!`);
      stop();
      reset();
    } catch (err: any) {
      console.error('Error creating event:', err);
      speak('Failed to create event. Please try again.');
      stop();
      reset();
      throw err;
    } finally {
      setCreating(false);
    }
  };

  // Voice commands using shared hook
  const { handleVoiceClick } = useCalendarVoiceCommands({
    transcript,
    isSupported,
    selectedFamily,
    events,
    isListening,
    start,
    stop,
    reset,
    showDeleteModal,
    showCreateForm: showEventForm,
    selectedEvent,
    onOpenCreateForm: (open: boolean) => setShowEventForm(open),
    onSetFormData: setFormData,
    onSetSelectedEvent: setSelectedEvent,
    onShowDeleteModal: (show: boolean) => {
      setShowDeleteModal(show);
      if (!show) {
        setSelectedEvent(null);
      }
    },
    onDeleteConfirm: handleDeleteConfirm,
    onCreateEventDirectly: handleCreateEventDirectly,
    convertLocalDateTimeToISO,
    onSubmitForm: () => {
      // Trigger form submission
      handleCreateEvent();
    },
  });

  // Handle create new event button
  const handleCreateNewEvent = () => {
    const now = new Date();
    const endTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour later

    setFormData({
      family: selectedFamily?.id || 0,
      title: '',
      notes: '',
      location: '',
      starts_at: formatLocalDateTime(now),
      ends_at: formatLocalDateTime(endTime),
      is_all_day: false,
      color: '#3b82f6',
    });
    setSelectedEvent(null);
    setIsEditing(false);
    setShowEventForm(true);
  };

  if (!selectedFamily) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.placeholderContainer}>
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Please select a family to view events
          </Text>
        </View>
      </View>
    );
  }

  const markedDates = getMarkedDates();
  const selectedDateStr = getLocalDateString(currentDate);

  const content = (
    <>
      <GlobalNavBar />
      {error ? (
        <View style={[styles.errorContainer, { backgroundColor: '#FF3B3020' }]}>
          <Text style={[styles.errorText, { color: '#FF3B30' }]}>{error}</Text>
        </View>
      ) : null}
      {loading && events.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <CalendarToolbar
            label={getToolbarLabel()}
            onNavigate={handleNavigate}
            onView={handleViewChange}
            view={view}
            views={['month', 'week', 'day', 'agenda']}
            isListening={isListening}
            onVoicePress={handleVoiceClick}
            voiceDisabled={!selectedFamily || creating || deleting}
            onCreateEvent={handleCreateNewEvent}
            showEventForm={showEventForm}
          />

          {view === 'agenda' ? (
            <View style={styles.agendaContainer}>
                <Calendar
                  current={selectedDateStr}
                  onDayPress={(day) => {
                    const [year, month, dayNum] = day.dateString.split('-').map(Number);
                    const date = new Date(year, month - 1, dayNum);
                    setCurrentDate(date);
                  }}
                markedDates={{
                  ...markedDates,
                  [selectedDateStr]: {
                    ...markedDates[selectedDateStr],
                    selected: true,
                    selectedColor: colors.primary,
                  },
                }}
                theme={{
                  backgroundColor: colors.surface,
                  calendarBackground: colors.surface,
                  textSectionTitleColor: colors.text,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: '#fff',
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.textSecondary,
                  dotColor: colors.primary,
                  selectedDotColor: '#fff',
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                  textDayFontWeight: '500',
                  textMonthFontWeight: 'bold',
                  textDayHeaderFontWeight: '600',
                  textDayFontSize: 16,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 13,
                }}
                markingType="multi-dot"
              />
              <ScrollView
                style={styles.agendaList}
                contentContainerStyle={styles.agendaListContent}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
                }
              >
                {sortedDates.length === 0 ? (
                  <View style={styles.agendaEmptyContainer}>
                    <Text style={[styles.agendaEmptyText, { color: colors.textSecondary }]}>
                      No events scheduled
                    </Text>
                  </View>
                ) : (
                  sortedDates.map((date) => {
                    const dayEvents = agendaItems[date] || [];
                    return (
                      <View key={date} style={styles.agendaDateSection}>
                        <Text style={[styles.agendaDateHeader, { color: colors.text }]}>
                          {(() => {
                            // Parse date string (YYYY-MM-DD) in local timezone
                            const [year, month, day] = date.split('-').map(Number);
                            const localDate = new Date(year, month - 1, day);
                            return localDate.toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            });
                          })()}
                        </Text>
                        {dayEvents.length === 0 ? (
                          <Text style={[styles.agendaEmptyText, { color: colors.textSecondary }]}>
                            No events
                          </Text>
                        ) : (
                          dayEvents.map((event) => (
                            <TouchableOpacity
                              key={event.id}
                              style={[styles.eventItem, { backgroundColor: colors.surface, borderLeftColor: event.color || '#3b82f6' }]}
                              onPress={() => handleSelectEvent(event)}
                            >
                              <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                              {event.location && (
                                <Text style={[styles.eventLocation, { color: colors.textSecondary }]}>
                                  📍 {event.location}
                                </Text>
                              )}
                              <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                                {new Date(event.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                {event.ends_at && ` - ${new Date(event.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : (
          <ScrollView
            style={styles.scrollView}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            }
          >
            {view === 'month' && (
              <Calendar
                key={`calendar-${events.length}-${view}-${calendarKey}`}
                current={selectedDateStr}
                onDayPress={(day) => {
                  // On mobile, just select the day to show events below
                  // Use + button to add events
                  if (Platform.OS === 'web') {
                    handleDayPress(day);
                    handleMonthDayPress(day);
                  } else {
                    handleDayPress(day);
                  }
                }}
                markedDates={{
                  ...markedDates,
                  [selectedDateStr]: {
                    ...markedDates[selectedDateStr],
                    selected: true,
                    selectedColor: colors.primary,
                  },
                }}
                theme={{
                  backgroundColor: colors.surface,
                  calendarBackground: colors.surface,
                  textSectionTitleColor: colors.text,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: '#fff',
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.textSecondary,
                  dotColor: colors.primary,
                  selectedDotColor: '#fff',
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                  textDayFontWeight: '500',
                  textMonthFontWeight: 'bold',
                  textDayHeaderFontWeight: '600',
                  textDayFontSize: 16,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 13,
                }}
                markingType="multi-dot"
                onMonthChange={(month: any) => {
                  const newDate = new Date(month.year, month.month - 1, 1);
                  setCurrentDate(newDate);
                }}
              />
            )}

            {view === 'week' && (
              <WeekView
                currentDate={currentDate}
                events={events}
                onSlotPress={handleSelectSlot}
                onEventPress={handleSelectEvent}
              />
            )}

            {view === 'day' && (
              <DayView
                currentDate={currentDate}
                events={events}
                onSlotPress={handleSelectSlot}
                onEventPress={handleSelectEvent}
              />
            )}


            {view === 'month' && (
              <View style={styles.eventsListContainer}>
                <Text style={[styles.eventsListTitle, { color: colors.text }]}>
                  Events for {currentDate.toLocaleDateString()}
                </Text>
                {getEventsForDate(currentDate).length === 0 ? (
                  <Text style={[styles.agendaEmptyText, { color: colors.textSecondary }]}>
                    No events scheduled for this day
                  </Text>
                ) : (
                  getEventsForDate(currentDate).map((event) => (
                    <TouchableOpacity
                      key={event.id}
                      style={[styles.eventItem, { backgroundColor: colors.surface, borderLeftColor: event.color || '#3b82f6' }]}
                      onPress={() => handleSelectEvent(event)}
                    >
                      <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                      {event.location && (
                        <Text style={[styles.eventLocation, { color: colors.textSecondary }]}>
                          📍 {event.location}
                        </Text>
                      )}
                      <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                        {new Date(event.starts_at).toLocaleString()}
                        {event.ends_at && ` - ${new Date(event.ends_at).toLocaleString()}`}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </ScrollView>
          )}
        </>
      )}

      {/* Floating Action Button removed - + button is now in toolbar for both web and mobile */}

      {/* Event Form Modal */}
      <Modal
        visible={showEventForm}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => {
          setShowEventForm(false);
          setSelectedEvent(null);
          setIsEditing(false);
          setCalendarKey(prev => prev + 1);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setShowEventForm(false);
              setSelectedEvent(null);
              setIsEditing(false);
              setCalendarKey(prev => prev + 1);
            }}
          />
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={styles.modalContent}
            >
              <View style={[styles.modalContentInner, { backgroundColor: colors.surface }]}>
                <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {isEditing ? 'Edit Event' : 'Create Event'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowEventForm(false);
                  setSelectedEvent(null);
                  setIsEditing(false);
                  setCalendarKey(prev => prev + 1);
                }}
                style={styles.closeButton}
              >
                <Text style={[styles.closeButtonText, { color: colors.text }]}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={modalRef}
              style={styles.formScroll}
              contentContainerStyle={styles.formScrollContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
            >
              {!colors || !colors.text || !colors.border ? (
                <ActivityIndicator size="small" color={colors?.primary} style={{ padding: 20 }} />
              ) : (
                <>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
                <TextInput
                  ref={titleInputRef}
                  style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={formData.title}
                  onChangeText={(text) => handleChange('title', text)}
                  placeholder="Event title"
                  placeholderTextColor={colors.textSecondary}
                  editable={!creating}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Start</Text>
                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1, marginRight: 6, marginBottom: 0 }]}>
                    {Platform.OS === 'web' ? (
                      <View style={styles.datetimeInputWrapper}>
                        <TextInput
                          style={[styles.datetimeInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                          value={getDatePart(formData.starts_at)}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.textSecondary}
                          editable={false}
                        />
                        <TouchableOpacity
                          style={styles.datetimeIconButton}
                          onPress={() => {
                            if (Platform.OS === 'web' && typeof document !== 'undefined') {
                              const input = document.createElement('input');
                              input.type = 'date';
                              input.value = getDatePart(formData.starts_at) || new Date().toISOString().slice(0, 10);
                              input.style.position = 'fixed';
                              input.style.top = '50%';
                              input.style.left = '50%';
                              input.style.transform = 'translate(-50%, -50%)';
                              input.style.opacity = '0';
                              input.style.width = '1px';
                              input.style.height = '1px';
                              input.style.pointerEvents = 'none';
                              input.style.zIndex = '99999';
                              document.body.appendChild(input);

                              input.onchange = (e: any) => {
                                if (e.target.value) {
                                  const timePart = getTimePart(formData.starts_at) || '12:00';
                                  handleChange('starts_at', combineDateTime(e.target.value, timePart));
                                }
                                if (document.body.contains(input)) {
                                  document.body.removeChild(input);
                                }
                              };

                              input.onblur = () => {
                                if (document.body.contains(input)) {
                                  document.body.removeChild(input);
                                }
                              };

                              // Use showPicker() if available, otherwise fallback to click
                              if ((input as any).showPicker) {
                                try {
                                  const pickerResult = (input as any).showPicker();
                                  if (pickerResult && typeof pickerResult.catch === 'function') {
                                    pickerResult.catch(() => {
                                      input.click();
                                    });
                                  } else {
                                    input.click();
                                  }
                                } catch (err) {
                                  input.click();
                                }
                              } else {
                                input.focus();
                                input.click();
                              }
                            }
                          }}
                          disabled={creating}
                        >
                          <FontAwesome name="calendar" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.datetimeInputWrapper}>
                        <TextInput
                          style={[styles.datetimeInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                          value={getDatePart(formData.starts_at)}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.textSecondary}
                          editable={false}
                        />
                        <TouchableOpacity
                          style={styles.datetimeIconButton}
                          onPress={() => setShowStartDatePicker(true)}
                          disabled={creating}
                        >
                          <FontAwesome name="calendar" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <View style={[styles.formGroup, { flex: 1, marginLeft: 6, marginBottom: 0 }]}>
                    {Platform.OS === 'web' ? (
                      <View style={styles.datetimeInputWrapper}>
                        <TextInput
                          style={[styles.datetimeInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                          value={getTimePart(formData.starts_at)}
                          placeholder="HH:mm"
                          placeholderTextColor={colors.textSecondary}
                          editable={false}
                        />
                        <TouchableOpacity
                          style={styles.datetimeIconButton}
                          onPress={() => {
                            if (Platform.OS === 'web' && typeof document !== 'undefined') {
                              const input = document.createElement('input');
                              input.type = 'time';
                              input.value = getTimePart(formData.starts_at) || '12:00';
                              input.style.position = 'fixed';
                              input.style.top = '50%';
                              input.style.left = '50%';
                              input.style.transform = 'translate(-50%, -50%)';
                              input.style.opacity = '0';
                              input.style.width = '1px';
                              input.style.height = '1px';
                              input.style.pointerEvents = 'none';
                              input.style.zIndex = '99999';
                              document.body.appendChild(input);

                              input.onchange = (e: any) => {
                                if (e.target.value) {
                                  const datePart = getDatePart(formData.starts_at) || new Date().toISOString().slice(0, 10);
                                  handleChange('starts_at', combineDateTime(datePart, e.target.value));
                                }
                                if (document.body.contains(input)) {
                                  document.body.removeChild(input);
                                }
                              };

                              input.onblur = () => {
                                if (document.body.contains(input)) {
                                  document.body.removeChild(input);
                                }
                              };

                              // Use showPicker() if available, otherwise fallback to click
                              if ((input as any).showPicker) {
                                try {
                                  const pickerResult = (input as any).showPicker();
                                  if (pickerResult && typeof pickerResult.catch === 'function') {
                                    pickerResult.catch(() => {
                                      input.click();
                                    });
                                  } else {
                                    input.click();
                                  }
                                } catch (err) {
                                  input.click();
                                }
                              } else {
                                input.focus();
                                input.click();
                              }
                            }
                          }}
                          disabled={creating}
                        >
                          <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.datetimeInputWrapper}>
                        <TextInput
                          style={[styles.datetimeInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                          value={getTimePart(formData.starts_at)}
                          placeholder="HH:mm"
                          placeholderTextColor={colors.textSecondary}
                          editable={false}
                        />
                        <TouchableOpacity
                          style={styles.datetimeIconButton}
                          onPress={() => setShowStartTimePicker(true)}
                          disabled={creating}
                        >
                          <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>End</Text>
                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1, marginRight: 6, marginBottom: 0 }]}>
                    <View style={styles.datetimeInputWrapper}>
                      <TextInput
                        style={[styles.datetimeInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        value={formData.ends_at ? getDatePart(formData.ends_at) : ''}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.textSecondary}
                        editable={false}
                      />
                      <TouchableOpacity
                        style={styles.datetimeIconButton}
                        onPress={() => {
                          if (Platform.OS === 'web') {
                            // Use native browser date picker for web
                            const input = document.createElement('input');
                            input.type = 'date';
                            input.value = formData.ends_at ? getDatePart(formData.ends_at) : new Date().toISOString().slice(0, 10);
                            input.style.position = 'fixed';
                            input.style.top = '50%';
                            input.style.left = '50%';
                            input.style.transform = 'translate(-50%, -50%)';
                            input.style.opacity = '0';
                            input.style.width = '1px';
                            input.style.height = '1px';
                            input.style.pointerEvents = 'none';
                            input.style.zIndex = '99999';
                            document.body.appendChild(input);

                            input.onchange = (e: any) => {
                              if (e.target.value) {
                                const timePart = formData.ends_at ? getTimePart(formData.ends_at) : '13:00';
                                handleChange('ends_at', combineDateTime(e.target.value, timePart));
                              }
                              document.body.removeChild(input);
                            };

                            input.onblur = () => {
                              if (document.body.contains(input)) {
                                document.body.removeChild(input);
                              }
                            };

                            // Use showPicker() if available, otherwise fallback to click
                            if ((input as any).showPicker) {
                              try {
                                const pickerResult = (input as any).showPicker();
                                if (pickerResult && typeof pickerResult.catch === 'function') {
                                  pickerResult.catch(() => {
                                    input.click();
                                  });
                                } else {
                                  input.click();
                                }
                              } catch (err) {
                                input.click();
                              }
                            } else {
                              input.focus();
                              input.click();
                            }
                          } else {
                            setShowEndDatePicker(true);
                          }
                        }}
                        disabled={creating}
                      >
                        <FontAwesome name="calendar" size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={[styles.formGroup, { flex: 1, marginLeft: 6, marginBottom: 0 }]}>
                    <View style={styles.datetimeInputWrapper}>
                      <TextInput
                        style={[styles.datetimeInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        value={formData.ends_at ? getTimePart(formData.ends_at) : ''}
                        placeholder="HH:mm"
                        placeholderTextColor={colors.textSecondary}
                        editable={false}
                      />
                      <TouchableOpacity
                        style={styles.datetimeIconButton}
                        onPress={() => {
                          if (Platform.OS === 'web' && typeof document !== 'undefined') {
                            const input = document.createElement('input');
                            input.type = 'time';
                            input.value = formData.ends_at ? getTimePart(formData.ends_at) : '13:00';
                            input.style.position = 'fixed';
                            input.style.top = '50%';
                            input.style.left = '50%';
                            input.style.transform = 'translate(-50%, -50%)';
                            input.style.opacity = '0';
                            input.style.width = '1px';
                            input.style.height = '1px';
                            input.style.pointerEvents = 'none';
                            input.style.zIndex = '99999';
                            document.body.appendChild(input);

                            input.onchange = (e: any) => {
                              if (e.target.value) {
                                const datePart = formData.ends_at ? getDatePart(formData.ends_at) : new Date().toISOString().slice(0, 10);
                                handleChange('ends_at', combineDateTime(datePart, e.target.value));
                              }
                              if (document.body.contains(input)) {
                                document.body.removeChild(input);
                              }
                            };

                            input.onblur = () => {
                              if (document.body.contains(input)) {
                                document.body.removeChild(input);
                              }
                            };

                            // Use showPicker() if available, otherwise fallback to click
                            if ((input as any).showPicker) {
                              try {
                                const pickerResult = (input as any).showPicker();
                                if (pickerResult && typeof pickerResult.catch === 'function') {
                                  pickerResult.catch(() => {
                                    input.click();
                                  });
                                } else {
                                  input.click();
                                }
                              } catch (err) {
                                input.click();
                              }
                            } else {
                              input.focus();
                              input.click();
                            }
                          } else {
                            setShowEndTimePicker(true);
                          }
                        }}
                        disabled={creating}
                      >
                        <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => handleChange('is_all_day', !formData.is_all_day)}
                  disabled={creating}
                >
                  <FontAwesome
                    name={formData.is_all_day ? 'check-square' : 'square-o'}
                    size={20}
                    color={formData.is_all_day ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.checkboxLabel, { color: colors.text }]}>All Day</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Location</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={formData.location}
                  onChangeText={(text) => handleChange('location', text)}
                  placeholder="Event location"
                  placeholderTextColor={colors.textSecondary}
                  editable={!creating}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={formData.notes}
                  onChangeText={(text) => handleChange('notes', text)}
                  placeholder="Event notes or description"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                  editable={!creating}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Color</Text>
                <View style={styles.colorPicker}>
                  {COLOR_PRESETS.map((color, index) => {
                    const isSelected = formData.color === color.value;
                    const textColor = colors.text;
                    const borderColorValue = colors.border;
                    const selectedBorderColor = isSelected ? textColor : borderColorValue;
                    const borderWidthValue = isSelected ? 3 : 1;
                    const marginRightValue = index % 6 !== 5 ? 12 : 0;
                    const marginBottomValue = 12;

                    // Create style object with all values defined
                    const dynamicStyle = {
                      backgroundColor: color.value,
                      borderColor: selectedBorderColor,
                      borderWidth: borderWidthValue,
                      marginRight: marginRightValue,
                      marginBottom: marginBottomValue,
                    };

                    return (
                      <TouchableOpacity
                        key={color.value}
                        style={[styles.colorButton, dynamicStyle]}
                        onPress={() => handleChange('color', color.value)}
                        disabled={creating}
                      >
                        {isSelected && (
                          <Text style={styles.colorCheckmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.customColorRow}>
                  <Text style={[styles.customColorLabel, { color: colors.text, marginRight: 12 }]}>Custom:</Text>
                  <View style={styles.customColorInputs}>
                    <View style={[styles.colorInputWrapper, { borderColor: colors.border }]}>
                      <TextInput
                        style={[styles.colorInput, { color: colors.text }]}
                        value={formData.color}
                        onChangeText={(text) => handleChange('color', text)}
                        placeholder="#3b82f6"
                        placeholderTextColor={colors.textSecondary}
                        editable={!creating}
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.formActions}>
                {isEditing && selectedEvent && (
                  <TouchableOpacity
                    style={[styles.deleteButton, { backgroundColor: '#ef4444' }]}
                    onPress={() => {
                      setShowEventForm(false);
                      setShowDeleteModal(true);
                    }}
                    disabled={creating || deleting}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.background, borderColor: colors.border, marginRight: 6 }]}
                  onPress={() => {
                    setShowEventForm(false);
                    setSelectedEvent(null);
                    setIsEditing(false);
                    setCalendarKey(prev => prev + 1);
                  }}
                >
                  <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary, marginLeft: 6 }]}
                  onPress={handleCreateEvent}
                  disabled={creating || !formData.title.trim()}
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{isEditing ? 'Update' : 'Create'}</Text>
                  )}
                </TouchableOpacity>
              </View>
                </>
              )}
                </ScrollView>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Date/Time Pickers - Only for mobile (web uses native browser pickers) */}
      {showStartDatePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={new Date(formData.starts_at)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          textColor={colors?.text}
          accentColor={colors?.primary}
          themeVariant={theme === 'dark' ? 'dark' : 'light'}
          onChange={(event, date) => {
            setShowStartDatePicker(false);
            if (date && (Platform.OS === 'ios' ? event.type !== 'dismissed' : event.type === 'set')) {
              const timePart = getTimePart(formData.starts_at) || '12:00';
              const dateStr = formatLocalDateTime(date).split('T')[0];
              handleChange('starts_at', combineDateTime(dateStr, timePart));
            }
          }}
        />
      )}

      {showEndDatePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={formData.ends_at ? new Date(formData.ends_at) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          textColor={colors?.text}
          accentColor={colors?.primary}
          themeVariant={theme === 'dark' ? 'dark' : 'light'}
          onChange={(event, date) => {
            setShowEndDatePicker(false);
            if (date && (Platform.OS === 'ios' ? event.type !== 'dismissed' : event.type === 'set')) {
              const timePart = formData.ends_at ? getTimePart(formData.ends_at) : '13:00';
              const dateStr = formatLocalDateTime(date).split('T')[0];
              handleChange('ends_at', combineDateTime(dateStr, timePart));
            }
          }}
        />
      )}

      {showStartTimePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={new Date(formData.starts_at)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          textColor={colors?.text}
          accentColor={colors?.primary}
          themeVariant={theme === 'dark' ? 'dark' : 'light'}
          onChange={(event, date) => {
            setShowStartTimePicker(false);
            if (date && (Platform.OS === 'ios' ? event.type !== 'dismissed' : event.type === 'set')) {
              const datePart = getDatePart(formData.starts_at) || new Date().toISOString().slice(0, 10);
              const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
              handleChange('starts_at', combineDateTime(datePart, timeStr));
            }
          }}
        />
      )}

      {showEndTimePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={formData.ends_at ? new Date(formData.ends_at) : new Date()}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          textColor={colors?.text}
          accentColor={colors?.primary}
          themeVariant={theme === 'dark' ? 'dark' : 'light'}
          onChange={(event, date) => {
            setShowEndTimePicker(false);
            if (date && (Platform.OS === 'ios' ? event.type !== 'dismissed' : event.type === 'set')) {
              const datePart = formData.ends_at ? getDatePart(formData.ends_at) : new Date().toISOString().slice(0, 10);
              const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
              handleChange('ends_at', combineDateTime(datePart, timeStr));
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <AlertModal
        visible={showDeleteModal}
        title="Delete Event"
        message={`Are you sure you want to delete "${selectedEvent?.title}"?`}
        type="warning"
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        confirmText={deleting ? 'Deleting...' : 'Delete Event'}
        cancelText="Cancel"
        showCancel={true}
      />
    </>
  );

  // Wrap with gesture handler on mobile for swipe navigation
  if (Platform.OS === 'web' || !swipeGesture) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {content}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={swipeGesture}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {content}
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  scrollView: {
    flex: 1,
  },
  eventsListContainer: {
    padding: 16,
  },
  eventsListTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  eventItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 14,
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 12,
  },
  emptyDate: {
    height: 15,
    paddingTop: 30,
  },
  agendaContainer: {
    flex: 1,
  },
  agendaList: {
    flex: 1,
  },
  agendaListContent: {
    padding: 16,
    paddingBottom: 100,
  },
  agendaDateSection: {
    marginBottom: 24,
  },
  agendaDateHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  agendaEmptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  agendaEmptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  modalContentInner: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: Dimensions.get('window').height * 0.85,
    maxHeight: Dimensions.get('window').height * 0.9,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 32,
    lineHeight: 32,
  },
  formScroll: {
    flex: 1,
  },
  formScrollContent: {
    padding: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 48,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 48,
  },
  dateText: {
    fontSize: 16,
  },
  datetimeInputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  datetimeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    paddingRight: 48,
    fontSize: 16,
    minHeight: 48,
  },
  datetimeButtons: {
    flexDirection: 'row',
    position: 'absolute',
    right: 8,
  },
  datetimeIconButton: {
    padding: 8,
    zIndex: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxLabel: {
    fontSize: 16,
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  colorCheckmark: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  customColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
  },
  customColorLabel: {
    fontSize: 14,
    minWidth: 60,
  },
  customColorInputs: {
    flex: 1,
    flexDirection: 'row',
  },
  colorInputWrapper: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  colorInput: {
    fontSize: 14,
  },
  formActions: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  deleteButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 'auto',
    minWidth: 80,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 16,
    top: Platform.OS === 'web' ? 80 : 70,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 1000,
  },
  webPickerContainer: {
    ...Platform.select({
      web: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10000,
        backgroundColor: 'transparent',
      },
    }),
  },
});
