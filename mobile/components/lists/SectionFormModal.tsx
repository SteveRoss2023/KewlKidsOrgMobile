import React, { useState, useEffect, useRef, createElement } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../contexts/ThemeContext';
import { ListSection } from '../../types/lists';
import { formatLocalISODate } from '../../utils/sectionSort';

function formatSectionDateLabel(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateFromIso(iso: string | undefined): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

export interface SectionFormModalProps {
  visible: boolean;
  section: ListSection | null;
  saving?: boolean;
  onDismiss: () => void;
  onSave: (payload: { title: string; section_date: string }) => void | Promise<void>;
}

export default function SectionFormModal({
  visible,
  section,
  saving = false,
  onDismiss,
  onSave,
}: SectionFormModalProps) {
  const { colors, theme } = useTheme();
  const [title, setTitle] = useState('');
  const [dateIso, setDateIso] = useState(formatLocalISODate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [iosDraftDate, setIosDraftDate] = useState(() => new Date());
  const webDateInputRef = useRef<HTMLInputElement | null>(null);
  const webDateBlurCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && section) {
      setTitle(section.title);
      const d = section.section_date || formatLocalISODate();
      setDateIso(d);
      setIosDraftDate(dateFromIso(d));
      setShowDatePicker(false);
      setTimeout(() => titleInputRef.current?.focus(), 80);
    }
  }, [visible, section?.id, section?.title, section?.section_date]);

  useEffect(() => {
    if (!showDatePicker && webDateBlurCloseRef.current) {
      clearTimeout(webDateBlurCloseRef.current);
      webDateBlurCloseRef.current = null;
    }
  }, [showDatePicker]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showDatePicker) return;
    const id = requestAnimationFrame(() => {
      const el = webDateInputRef.current;
      if (!el) return;
      try {
        if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
          (el as HTMLInputElement & { showPicker: () => void }).showPicker();
        } else {
          el.focus();
        }
      } catch {
        el.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [showDatePicker]);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Section name', 'Enter a section name.');
      return;
    }
    void onSave({ title: trimmed, section_date: dateIso });
  };

  return (
    <Modal
      visible={visible && !!section}
      transparent
      animationType="fade"
      onRequestClose={saving ? undefined : onDismiss}
    >
      <>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onDismiss} />
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                onPress={saving ? undefined : onDismiss}
                style={styles.headerIconBtn}
                accessibilityLabel="Cancel"
                disabled={saving}
              >
                <FontAwesome name="times" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                Edit section
              </Text>
              <TouchableOpacity
                onPress={saving ? undefined : submit}
                style={styles.headerIconBtn}
                accessibilityLabel="Save section"
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <FontAwesome name="check" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                ref={titleInputRef}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="Section name"
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
                onSubmitEditing={submit}
                returnKeyType="done"
                editable={!saving}
                selectTextOnFocus
              />
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced, { color: colors.textSecondary }]}>
                Section date
              </Text>
              <TouchableOpacity
                style={[
                  styles.dateRow,
                  { borderColor: colors.border, backgroundColor: colors.background },
                ]}
                onPress={
                  saving
                    ? undefined
                    : () => {
                        setIosDraftDate(dateFromIso(dateIso));
                        setShowDatePicker(true);
                      }
                }
                disabled={saving}
                accessibilityLabel="Change section date"
              >
                <FontAwesome name="calendar" size={16} color={colors.primary} />
                <Text style={[styles.dateRowText, { color: colors.text }]}>
                  {formatSectionDateLabel(dateIso)}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      {Platform.OS === 'web' && (
        <Modal visible={showDatePicker} transparent animationType="fade">
          <View style={styles.innerBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                if (webDateBlurCloseRef.current) {
                  clearTimeout(webDateBlurCloseRef.current);
                  webDateBlurCloseRef.current = null;
                }
                setShowDatePicker(false);
              }}
            />
            <View style={[styles.innerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.innerLabel, { color: colors.text }]}>Section date</Text>
              {createElement('input', {
                ref: webDateInputRef,
                type: 'date',
                value: dateIso || '',
                onChange: (e: { target: { value: string } }) => {
                  if (webDateBlurCloseRef.current) {
                    clearTimeout(webDateBlurCloseRef.current);
                    webDateBlurCloseRef.current = null;
                  }
                  const v = e.target.value;
                  if (v) setDateIso(v);
                  setShowDatePicker(false);
                },
                onBlur: () => {
                  if (webDateBlurCloseRef.current) {
                    clearTimeout(webDateBlurCloseRef.current);
                  }
                  webDateBlurCloseRef.current = setTimeout(() => {
                    webDateBlurCloseRef.current = null;
                    setShowDatePicker(false);
                  }, 200);
                },
                'aria-label': 'Section date',
                style: {
                  width: '100%',
                  maxWidth: 280,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.background,
                  color: colors.text,
                  fontSize: 16,
                  boxSizing: 'border-box' as const,
                },
              })}
              <TouchableOpacity
                style={[styles.innerCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={iosDraftDate}
          mode="date"
          display="default"
          textColor={colors.text}
          accentColor={colors.primary}
          themeVariant={theme === 'dark' ? 'dark' : 'light'}
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (event.type === 'set' && selectedDate) {
              const iso = formatLocalISODate(selectedDate);
              setDateIso(iso);
              setIosDraftDate(selectedDate);
            }
          }}
        />
      )}
      {Platform.OS === 'ios' && (
        <Modal visible={showDatePicker} transparent animationType="fade">
          <View style={styles.innerBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDatePicker(false)} />
            <View style={[styles.innerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <DateTimePicker
                value={iosDraftDate}
                mode="date"
                display="spinner"
                textColor={colors.text}
                accentColor={colors.primary}
                themeVariant={theme === 'dark' ? 'dark' : 'light'}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setIosDraftDate(selectedDate);
                }}
              />
              <TouchableOpacity
                style={[styles.innerDoneBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const iso = formatLocalISODate(iosDraftDate);
                  setDateIso(iso);
                  setShowDatePicker(false);
                }}
              >
                <Text style={styles.innerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      </>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  fieldLabelSpaced: {
    marginTop: 16,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 16,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  dateRowText: {
    fontSize: 16,
    fontWeight: '500',
  },
  innerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  innerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 24,
    maxWidth: 360,
  },
  innerLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  innerCancelBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  innerDoneBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  innerDoneText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
