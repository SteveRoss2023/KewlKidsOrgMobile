import React, { useState, useRef, useEffect, createElement } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ListSection } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';
import { useIsMobileLayout } from '../../hooks/useIsMobileLayout';
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

function isLightColor(hex: string): boolean {
  const color = hex.replace('#', '');
  const rgb = color.length === 8 ? color.slice(0, 6) : color;
  const r = parseInt(rgb.substring(0, 2), 16);
  const g = parseInt(rgb.substring(2, 4), 16);
  const b = parseInt(rgb.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

interface SectionRowProps {
  section: ListSection;
  allCompleted: boolean;
  onToggleComplete: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  itemCount?: number;
  onIndentAll?: () => void;
  onOutdentAll?: () => void;
  onRenameSection?: (newTitle: string) => void;
  onDeleteSection?: () => void;
  listColor?: string;
  onSectionDrag?: () => void;
  /** Show the drag handle icon (e.g. on web where the whole row is draggable). When onSectionDrag is also set, the icon is pressable. */
  showSectionDragHandle?: boolean;
  /** ISO YYYY-MM-DD; compact display + edit beside title */
  onChangeSectionDate?: (iso: string) => void;
}

export default function SectionRow({
  section,
  allCompleted,
  onToggleComplete,
  collapsed = false,
  onToggleCollapse,
  onIndentAll,
  onOutdentAll,
  onRenameSection,
  onDeleteSection,
  listColor,
  onSectionDrag,
  showSectionDragHandle = false,
  onChangeSectionDate,
}: SectionRowProps) {
  const { colors, theme } = useTheme();

  // Match grocery: list color as header fill when set; otherwise surface
  const headerBg = listColor || colors.surface;
  const useLight = listColor ? isLightColor(listColor) : false;
  const headerTextColor = listColor ? (useLight ? '#000000' : '#FFFFFF') : colors.text;
  const headerIconColor = listColor ? (useLight ? '#00000080' : '#FFFFFF80') : colors.textSecondary;
  const checkboxBorderColor = listColor ? (useLight ? '#333' : '#ddd') : colors.border;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(section.title);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (editing) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(section.title);
  }, [section.title]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== section.title && onRenameSection) {
      onRenameSection(trimmed);
    } else {
      setEditValue(section.title);
    }
  };

  const isMobileLayout = useIsMobileLayout();
  const showSectionOverflowMenu = isMobileLayout;
  const hasAnySectionAction = !!(
    onRenameSection ||
    onDeleteSection ||
    onOutdentAll ||
    onIndentAll ||
    onChangeSectionDate
  );

  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [iosDraftDate, setIosDraftDate] = useState(() => dateFromIso(section.section_date));

  useEffect(() => {
    setIosDraftDate(dateFromIso(section.section_date));
  }, [section.section_date]);

  const openSectionMenu = () => {
    const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }> = [];
    if (onRenameSection) {
      buttons.push({ text: 'Rename section', onPress: () => setEditing(true) });
    }
    if (onDeleteSection) {
      buttons.push({ text: 'Delete section', onPress: onDeleteSection, style: 'destructive' });
    }
    if (onOutdentAll) {
      buttons.push({ text: 'Outdent all', onPress: onOutdentAll });
    }
    if (onIndentAll) {
      buttons.push({ text: 'Indent all', onPress: onIndentAll });
    }
    if (onChangeSectionDate) {
      buttons.push({ text: 'Change section date', onPress: () => setShowDateModal(true) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Section', undefined, buttons);
  };

  const indentRef = useRef<any>(null);
  const outdentRef = useRef<any>(null);
  const editBtnRef = useRef<any>(null);
  const deleteBtnRef = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const setTitle = (ref: any, title: string) => {
        if (!ref?.current) return;
        const node = ref.current;
        const dom = node?.nodeType === 1 ? node : node?._nativeNode;
        if (dom) dom.setAttribute('title', title);
      };
      if (onIndentAll) setTitle(indentRef, 'Indent all items +1');
      if (onOutdentAll) setTitle(outdentRef, 'Outdent all items -1');
      if (onRenameSection) setTitle(editBtnRef, 'Edit section name');
      if (onDeleteSection) setTitle(deleteBtnRef, 'Delete section and all its items');
    }
  }, [onIndentAll, onOutdentAll, onRenameSection, onDeleteSection, isMobileLayout, sectionMenuOpen]);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: headerBg, borderBottomColor: colors.border },
      ]}
    >
      <TouchableOpacity
        onPress={onToggleComplete}
        style={[
          styles.checkbox,
          { borderColor: checkboxBorderColor },
          allCompleted && { backgroundColor: listColor || colors.primary },
        ]}
        accessibilityLabel={allCompleted ? 'Uncheck section' : 'Check section'}
        accessibilityHint="Toggles all items in this section"
      >
        {allCompleted ? (
          <FontAwesome name="check" size={14} color="#fff" />
        ) : null}
      </TouchableOpacity>
      {(onSectionDrag || showSectionDragHandle) && (
        onSectionDrag ? (
          <TouchableOpacity
            onLongPress={onSectionDrag}
            style={styles.sectionActionButton}
            accessibilityLabel="Drag to reorder section"
            {...(Platform.OS === 'web' ? { onMouseDown: (e: any) => e.stopPropagation() } : {})}
          >
            <FontAwesome name="bars" size={14} color={headerIconColor} />
          </TouchableOpacity>
        ) : (
          <View style={styles.sectionActionButton}>
            <FontAwesome name="bars" size={14} color={headerIconColor} />
          </View>
        )
      )}
      {editing ? (
        <TextInput
          ref={inputRef}
          style={[styles.titleInput, { color: headerTextColor, borderColor: headerIconColor }]}
          value={editValue}
          onChangeText={setEditValue}
          onBlur={handleSave}
          onSubmitEditing={handleSave}
          returnKeyType="done"
          selectTextOnFocus
        />
      ) : (
        <TouchableOpacity
          style={styles.titleContainer}
          onPress={onToggleCollapse}
          activeOpacity={onToggleCollapse ? 0.6 : 1}
          accessibilityLabel={collapsed ? 'Expand section' : 'Collapse section'}
        >
          <Text
            style={[
              styles.title,
              { color: headerTextColor },
              allCompleted && styles.titleCompleted,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {section.title}
          </Text>
        </TouchableOpacity>
      )}
      {onChangeSectionDate && !editing && (
        <>
          {Platform.OS === 'web' ? (
            <View style={styles.dateWebWrap} pointerEvents="box-none">
              {createElement('input', {
                type: 'date',
                value: section.section_date || '',
                onChange: (e: { target: { value: string } }) => onChangeSectionDate(e.target.value),
                'aria-label': 'Section date',
                style: {
                  width: 118,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: listColor
                    ? useLight
                      ? 'rgba(255,255,255,0.9)'
                      : 'rgba(0,0,0,0.25)'
                    : colors.background,
                  color: headerTextColor,
                  fontSize: 12,
                  flexShrink: 0,
                  cursor: 'pointer',
                },
              })}
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowDateModal(true)}
              style={styles.dateNativeTouch}
              accessibilityLabel="Section date"
              accessibilityHint="Opens date picker"
            >
              <Text style={[styles.dateNativeText, { color: headerIconColor }]} numberOfLines={1}>
                {formatSectionDateLabel(section.section_date)}
              </Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'android' && showDateModal && (
            <DateTimePicker
              value={iosDraftDate}
              mode="date"
              display="default"
              textColor={colors.text}
              accentColor={colors.primary}
              themeVariant={theme === 'dark' ? 'dark' : 'light'}
              onChange={(event, selectedDate) => {
                setShowDateModal(false);
                if (event.type === 'set' && selectedDate) {
                  onChangeSectionDate(formatLocalISODate(selectedDate));
                }
              }}
            />
          )}
          {Platform.OS === 'ios' && (
            <Modal visible={showDateModal} transparent animationType="fade">
              <View style={styles.dateModalBackdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDateModal(false)} />
                <View style={[styles.dateModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
                    style={[styles.dateModalDone, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      onChangeSectionDate(formatLocalISODate(iosDraftDate));
                      setShowDateModal(false);
                    }}
                  >
                    <Text style={styles.dateModalDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
        </>
      )}
      {!editing && showSectionOverflowMenu && hasAnySectionAction ? (
        Platform.OS === 'web' && sectionMenuOpen ? (
          <View style={styles.sectionMenuIconsRow}>
            {onRenameSection && (
              <TouchableOpacity
                ref={editBtnRef}
                style={styles.sectionActionButton}
                onPress={() => { setSectionMenuOpen(false); setEditing(true); }}
                accessibilityLabel="Rename section"
              >
                <FontAwesome name="pencil" size={14} color={headerIconColor} />
              </TouchableOpacity>
            )}
            {onDeleteSection && (
              <TouchableOpacity
                ref={deleteBtnRef}
                style={styles.sectionActionButton}
                onPress={() => { setSectionMenuOpen(false); onDeleteSection(); }}
                accessibilityLabel="Delete section"
              >
                <FontAwesome name="trash" size={14} color="#FF3B30" />
              </TouchableOpacity>
            )}
            {onOutdentAll && (
              <TouchableOpacity
                ref={outdentRef}
                style={styles.sectionActionButton}
                onPress={() => { setSectionMenuOpen(false); onOutdentAll(); }}
                accessibilityLabel="Outdent all"
              >
                <FontAwesome name="outdent" size={14} color={headerIconColor} />
              </TouchableOpacity>
            )}
            {onIndentAll && (
              <TouchableOpacity
                ref={indentRef}
                style={styles.sectionActionButton}
                onPress={() => { setSectionMenuOpen(false); onIndentAll(); }}
                accessibilityLabel="Indent all"
              >
                <FontAwesome name="indent" size={14} color={headerIconColor} />
              </TouchableOpacity>
            )}
            {onChangeSectionDate && Platform.OS !== 'web' && (
              <TouchableOpacity
                style={styles.sectionActionButton}
                onPress={() => { setSectionMenuOpen(false); setShowDateModal(true); }}
                accessibilityLabel="Change section date"
              >
                <FontAwesome name="calendar" size={14} color={headerIconColor} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.sectionActionButton}
              onPress={() => setSectionMenuOpen(false)}
              accessibilityLabel="Close menu"
              accessibilityHint="Closes the section actions menu"
            >
              <FontAwesome name="ellipsis-v" size={14} color={headerIconColor} />
            </TouchableOpacity>
          </View>
        ) : (
        <TouchableOpacity
          onPress={Platform.OS === 'web' ? () => setSectionMenuOpen((open) => !open) : openSectionMenu}
          style={styles.sectionActionButton}
          accessibilityLabel="Section actions"
          accessibilityHint="Opens menu with rename, delete, and indent options"
        >
          <FontAwesome name="ellipsis-v" size={14} color={headerIconColor} />
        </TouchableOpacity>
        )
      ) : !editing && !showSectionOverflowMenu && onRenameSection && (
        <TouchableOpacity
          ref={editBtnRef}
          onPress={() => setEditing(true)}
          style={styles.sectionActionButton}
          accessibilityLabel="Edit section name"
        >
          <FontAwesome name="pencil" size={14} color={headerIconColor} />
        </TouchableOpacity>
      )}
      {!editing && !showSectionOverflowMenu && onDeleteSection && (
        <TouchableOpacity
          ref={deleteBtnRef}
          onPress={onDeleteSection}
          style={styles.sectionActionButton}
          accessibilityLabel="Delete section"
        >
          <FontAwesome name="trash" size={14} color="#FF3B30" />
        </TouchableOpacity>
      )}
      {!showSectionOverflowMenu && onOutdentAll && (
        <TouchableOpacity
          ref={outdentRef}
          onPress={onOutdentAll}
          style={styles.sectionActionButton}
          accessibilityLabel="Outdent all items in this section"
        >
          <FontAwesome name="outdent" size={14} color={headerIconColor} />
        </TouchableOpacity>
      )}
      {!showSectionOverflowMenu && onIndentAll && (
        <TouchableOpacity
          ref={indentRef}
          onPress={onIndentAll}
          style={styles.sectionActionButton}
          accessibilityLabel="Indent all items in this section"
        >
          <FontAwesome name="indent" size={14} color={headerIconColor} />
        </TouchableOpacity>
      )}
      {onToggleCollapse && (
        <TouchableOpacity
          onPress={onToggleCollapse}
          style={styles.chevronButton}
          accessibilityLabel={collapsed ? 'Expand section' : 'Collapse section'}
        >
          <FontAwesome
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={16}
            color={headerIconColor}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  dateWebWrap: {
    flexShrink: 0,
    maxWidth: 120,
  },
  dateNativeTouch: {
    flexShrink: 0,
    paddingVertical: 4,
    paddingHorizontal: 4,
    maxWidth: 100,
  },
  dateNativeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dateModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dateModalCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 24,
    maxWidth: 360,
  },
  dateModalDone: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  dateModalDoneText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  titleInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'web' ? 4 : 6,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  sectionActionButton: {
    padding: 6,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  sectionMenuIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  chevronButton: {
    padding: 8,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
});
