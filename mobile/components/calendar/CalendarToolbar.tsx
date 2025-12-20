import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Modal, FlatList, Pressable } from 'react-native';
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
  onCreateEvent?: () => void;
  showEventForm?: boolean;
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
  onCreateEvent,
  showEventForm = false,
}: CalendarToolbarProps) {
  const { colors } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleViewSelect = (selectedView: string) => {
    onView(selectedView);
    setDropdownOpen(false);
  };

  // Use native select on web
  if (Platform.OS === 'web') {
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

        {/* Hide label on week and month view for web mobile to save space */}
        {view !== 'week' && view !== 'month' && (
          <Text style={[styles.label, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {label}
          </Text>
        )}

        <View style={[styles.toolbarGroup, styles.centerGroup]}>
          <select
            value={view}
            onChange={(e) => onView(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.background,
              color: colors.text,
              fontSize: '14px',
              fontWeight: '500',
              minHeight: '36px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {views.map((name) => (
              <option key={name} value={name}>
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </option>
            ))}
          </select>
        </View>

        <View style={[styles.toolbarGroup, styles.rightGroup]}>
          {!showEventForm && onCreateEvent && (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={onCreateEvent}
              activeOpacity={0.8}
            >
              <FontAwesome name="plus" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          <VoiceButton
            onPress={onVoicePress}
            isListening={isListening}
            disabled={voiceDisabled}
            size={18}
          />
        </View>
      </View>
    );
  }

  // Mobile: Hide the label and navigation arrows (use swipe gestures instead)
  return (
    <View style={[styles.toolbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.toolbarGroup}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => onNavigate('TODAY')}
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>Today</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.toolbarGroup, styles.centerGroup]}>
        <View style={styles.viewPickerContainer}>
          <TouchableOpacity
            style={[styles.viewPickerButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => setDropdownOpen(true)}
          >
            <Text style={[styles.viewPickerText, { color: colors.text }]}>
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </Text>
            <FontAwesome name="chevron-down" size={12} color={colors.text} style={styles.chevronIcon} />
          </TouchableOpacity>

          <Modal
            visible={dropdownOpen}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setDropdownOpen(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setDropdownOpen(false)}
            >
              <View
                style={[styles.dropdownContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onStartShouldSetResponder={() => true}
              >
                {views.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.dropdownItem,
                      view === item && { backgroundColor: colors.primary + '20' },
                      { borderBottomColor: colors.border },
                    ]}
                    onPress={() => handleViewSelect(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        { color: view === item ? colors.primary : colors.text },
                      ]}
                    >
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </Text>
                    {view === item && (
                      <FontAwesome name="check" size={14} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>
        </View>
      </View>

      <View style={[styles.toolbarGroup, styles.rightGroup]}>
        {!showEventForm && onCreateEvent && (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={onCreateEvent}
            activeOpacity={0.8}
          >
            <FontAwesome name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
        <VoiceButton
          onPress={onVoicePress}
          isListening={isListening}
          disabled={voiceDisabled}
          size={18}
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
    gap: 8,
  },
  toolbarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  centerGroup: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightGroup: {
    gap: 8,
    flexShrink: 0,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
    minWidth: 150,
    paddingHorizontal: 12,
  },
  viewPickerContainer: {
    position: 'relative',
    flexShrink: 0,
  },
  viewPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  viewPickerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chevronIcon: {
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownContainer: {
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 150,
    maxHeight: 200,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});


