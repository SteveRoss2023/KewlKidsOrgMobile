import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import VoiceButton from '../VoiceButton';

interface CalendarToolbarProps {
  label: string;
  onNavigate: (action: 'TODAY' | 'PREV' | 'NEXT') => void;
  onView: (view: string) => void;
  view: string;
  views: string[];
  isListening?: boolean;
  onVoicePress: () => void;
  voiceDisabled?: boolean;
}

export default function CalendarToolbar({
  label,
  onNavigate,
  onView,
  view,
  views,
  isListening = false,
  onVoicePress,
  voiceDisabled = false,
}: CalendarToolbarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.toolbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.toolbarGroup}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => onNavigate('TODAY')}
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => onNavigate('PREV')}
        >
          <FontAwesome name="chevron-left" size={16} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => onNavigate('NEXT')}
        >
          <FontAwesome name="chevron-right" size={16} color={colors.text} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>

      <View style={styles.toolbarGroup}>
        <View style={styles.viewButtons}>
          {views.map((name) => (
            <TouchableOpacity
              key={name}
              style={[
                styles.viewButton,
                view === name && { backgroundColor: colors.primary },
                { borderColor: colors.border },
              ]}
              onPress={() => onView(name)}
            >
              <Text
                style={[
                  styles.viewButtonText,
                  { color: view === name ? '#fff' : colors.text },
                ]}
              >
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <VoiceButton
          onPress={onVoicePress}
          isListening={isListening}
          disabled={voiceDisabled}
          size={20}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  toolbarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  viewButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  viewButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});


