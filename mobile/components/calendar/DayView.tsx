import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Event } from '../../services/calendarService';

interface DayViewProps {
  currentDate: Date;
  events: Event[];
  onSlotPress: (date: Date) => void;
  onEventPress: (event: Event) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOT_HEIGHT = 60;

export default function DayView({ currentDate, events, onSlotPress, onEventPress }: DayViewProps) {
  const { colors } = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const dayWidth = screenWidth - 60; // 60px for time gutter

  // Helper to get date string in local timezone (YYYY-MM-DD)
  const getLocalDateString = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    // Use local timezone methods to avoid timezone conversion issues
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get events for the current day
  const getDayEvents = () => {
    const currentDateStr = getLocalDateString(currentDate);

    return events.filter((event) => {
      const eventDateStr = getLocalDateString(event.starts_at);
      return eventDateStr === currentDateStr;
    });
  };

  const dayEvents = getDayEvents();

  // Calculate event position and height
  const getEventStyle = (event: Event) => {
    const start = new Date(event.starts_at);
    const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);

    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const duration = endHour - startHour;

    const top = startHour * SLOT_HEIGHT;
    const height = Math.max(duration * SLOT_HEIGHT, 40); // Minimum height of 40px to fit title

    // Ensure we have a visible color - use a bright, visible color
    const eventColor = event.color || '#3b82f6';
    // Make sure color is valid hex, default to bright blue if invalid
    const validColor = eventColor.startsWith('#') && eventColor.length === 7 ? eventColor : '#3b82f6';

    // Ensure the color is bright enough to be visible in dark mode
    // If the color is too dark, lighten it
    const rgb = hexToRgb(validColor);
    const brightness = rgb ? (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 : 128;
    const finalColor = brightness < 100 ? lightenColor(validColor, 0.3) : validColor;

    return {
      position: 'absolute' as const,
      top: Math.max(0, top), // Ensure top is not negative
      left: 2,
      width: Math.max(50, dayWidth - 4), // Ensure minimum width
      height: Math.max(40, height), // Ensure minimum height of 40px
      backgroundColor: finalColor,
      borderRadius: 4,
      padding: 4,
      justifyContent: 'center',
      zIndex: 10,
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.5,
      shadowRadius: 4,
      borderWidth: 2,
      borderColor: '#ffffff',
      opacity: 1, // Ensure fully opaque
      overflow: 'visible',
    };
  };

  // Helper to convert hex to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  // Helper to lighten a color
  const lightenColor = (hex: string, percent: number) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * percent));
    const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * percent));
    const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * percent));
    return `#${[r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;
  };

  const formatTime = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      {/* Day header */}
      <View style={[styles.dayHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.dayTitle, { color: colors.text }]}>{formatDate(currentDate)}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
      >
        <View style={styles.content}>
          {/* Time gutter */}
          <View style={[styles.timeGutter, { borderRightColor: colors.border, backgroundColor: colors.surface }]}>
            {HOURS.map((hour) => (
              <View key={hour} style={[styles.hourSlot, { borderTopColor: colors.border }]}>
                <Text style={[styles.hourLabel, { color: colors.textSecondary }]}>{formatTime(hour)}</Text>
              </View>
            ))}
          </View>

          {/* Day column */}
          <View style={styles.dayColumn}>
            {HOURS.map((hour) => {
              const slotDate = new Date(currentDate);
              slotDate.setHours(hour, 0, 0, 0);

              return (
                <TouchableOpacity
                  key={hour}
                  style={[styles.timeSlot, { borderTopColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => onSlotPress(slotDate)}
                  onLongPress={() => onSlotPress(slotDate)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 15, bottom: 15, left: 5, right: 5 }}
                  delayPressIn={0}
                />
              );
            })}

            {/* Events overlay - positioned absolutely but only captures events, not empty slots */}
            {dayEvents.length > 0 && (
              <View style={styles.eventsOverlay} pointerEvents="box-none">
                {dayEvents.map((event) => {
                  const eventStyle = getEventStyle(event);
                  return (
                    <TouchableOpacity
                      key={event.id}
                      style={eventStyle}
                      onPress={() => onEventPress(event)}
                      activeOpacity={0.8}
                      hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                    >
                      <Text style={styles.eventTitle} numberOfLines={2} ellipsizeMode="tail">
                        {event.title || 'Untitled Event'}
                      </Text>
                      {event.location ? (
                        <Text style={styles.eventLocation} numberOfLines={1} ellipsizeMode="tail">
                          📍 {event.location}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dayHeader: {
    padding: 16,
    borderBottomWidth: 1,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    minHeight: 24 * SLOT_HEIGHT, // Ensure content is tall enough for all hours
  },
  content: {
    flexDirection: 'row',
    minHeight: 24 * SLOT_HEIGHT, // Ensure content is tall enough for all hours
  },
  timeGutter: {
    width: 60,
    borderRightWidth: 1,
  },
  hourSlot: {
    height: SLOT_HEIGHT,
    borderTopWidth: 1,
    paddingRight: 4,
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  hourLabel: {
    fontSize: 11,
    textAlign: 'right',
  },
  dayColumn: {
    flex: 1,
    position: 'relative',
    minHeight: 24 * SLOT_HEIGHT, // Ensure column is tall enough
    overflow: 'visible',
  },
  timeSlot: {
    height: SLOT_HEIGHT,
    borderTopWidth: 1,
    zIndex: 1,
    elevation: 1,
  },
  eventsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
    zIndex: 5,
    elevation: 5,
    overflow: 'visible',
  },
  eventTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '400',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 15,
  },
  eventTime: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  eventLocation: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});


