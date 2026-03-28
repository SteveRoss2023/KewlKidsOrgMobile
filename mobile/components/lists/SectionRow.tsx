import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ListSection } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';
import { useIsMobileLayout } from '../../hooks/useIsMobileLayout';

function formatSectionDateLabel(iso: string | undefined, opts?: { compactYear?: boolean }): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (opts?.compactYear) {
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
  }
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
  /** Opens add/edit form (name + date) from the parent screen */
  onEditSection?: () => void;
  onDeleteSection?: () => void;
  listColor?: string;
  onSectionDrag?: () => void;
  /** Show the drag handle icon (e.g. on web where the whole row is draggable). When onSectionDrag is also set, the icon is pressable. */
  showSectionDragHandle?: boolean;
}

export default function SectionRow({
  section,
  allCompleted,
  onToggleComplete,
  collapsed = false,
  onToggleCollapse,
  onIndentAll,
  onOutdentAll,
  onEditSection,
  onDeleteSection,
  listColor,
  onSectionDrag,
  showSectionDragHandle = false,
}: SectionRowProps) {
  const { colors } = useTheme();

  // Match grocery: list color as header fill when set; otherwise surface
  const headerBg = listColor || colors.surface;
  const useLight = listColor ? isLightColor(listColor) : false;
  const headerTextColor = listColor ? (useLight ? '#000000' : '#FFFFFF') : colors.text;
  const headerIconColor = listColor ? (useLight ? '#00000080' : '#FFFFFF80') : colors.textSecondary;
  /** Calendar affordance: primary on default header (light/dark via theme); on tinted header match other row icons */
  const calendarIconColor = listColor ? headerIconColor : colors.primary;
  const checkboxBorderColor = listColor ? (useLight ? '#333' : '#ddd') : colors.border;

  const isMobileLayout = useIsMobileLayout();
  const showSectionOverflowMenu = isMobileLayout;
  const hasAnySectionAction = !!(
    onEditSection ||
    onDeleteSection ||
    onOutdentAll ||
    onIndentAll
  );

  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);

  const openSectionMenu = () => {
    const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }> = [];
    if (onEditSection) {
      buttons.push({ text: 'Edit section', onPress: onEditSection });
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
      if (onEditSection) setTitle(editBtnRef, 'Edit section');
      if (onDeleteSection) setTitle(deleteBtnRef, 'Delete section and all its items');
    }
  }, [onIndentAll, onOutdentAll, onEditSection, onDeleteSection, isMobileLayout, sectionMenuOpen]);

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
      <View style={styles.dateChipTouch} accessibilityLabel="Section date">
        <FontAwesome name="calendar" size={11} color={calendarIconColor} style={styles.dateChipCalendarIcon} />
        <Text style={[styles.dateChipText, { color: headerIconColor }]} numberOfLines={1}>
          {formatSectionDateLabel(section.section_date, { compactYear: true })}
        </Text>
      </View>
      {showSectionOverflowMenu && hasAnySectionAction ? (
        Platform.OS === 'web' && sectionMenuOpen ? (
          <View style={styles.sectionMenuIconsRow}>
            {onEditSection && (
              <TouchableOpacity
                ref={editBtnRef}
                style={styles.sectionActionButton}
                onPress={() => { setSectionMenuOpen(false); onEditSection(); }}
                accessibilityLabel="Edit section"
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
          accessibilityHint="Opens menu with edit, delete, and indent options"
        >
          <FontAwesome name="ellipsis-v" size={14} color={headerIconColor} />
        </TouchableOpacity>
        )
      ) : !showSectionOverflowMenu && onEditSection && (
        <TouchableOpacity
          ref={editBtnRef}
          onPress={onEditSection}
          style={styles.sectionActionButton}
          accessibilityLabel="Edit section"
        >
          <FontAwesome name="pencil" size={14} color={headerIconColor} />
        </TouchableOpacity>
      )}
      {!showSectionOverflowMenu && onDeleteSection && (
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
  dateChipTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingVertical: 4,
    paddingHorizontal: 4,
    maxWidth: 128,
    gap: 4,
  },
  dateChipCalendarIcon: {
    flexShrink: 0,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
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
