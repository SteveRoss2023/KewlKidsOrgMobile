import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ListSection } from '../../types/lists';
import { useTheme } from '../../contexts/ThemeContext';

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
}: SectionRowProps) {
  const { colors } = useTheme();
  const bullet =
    section.bullet_style === 'number'
      ? `${section.order + 1}.`
      : '\u2022';

  const headerBg = colors.surface;
  const headerTextColor = colors.text;
  const headerIconColor = colors.textSecondary;
  const checkboxBorderColor = listColor || colors.border;

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
  }, [onIndentAll, onOutdentAll, onRenameSection, onDeleteSection]);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: headerBg, borderColor: colors.borderStrong },
        listColor && { borderWidth: 2, borderColor: listColor },
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
      <View style={styles.bulletContainer}>
        <Text style={[styles.bullet, { color: headerTextColor }]}>{bullet}</Text>
      </View>
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
            style={[styles.title, { color: headerTextColor }]}
            numberOfLines={2}
          >
            {section.title}
          </Text>
        </TouchableOpacity>
      )}
      {!editing && onRenameSection && (
        <TouchableOpacity
          ref={editBtnRef}
          onPress={() => setEditing(true)}
          style={styles.sectionActionButton}
          accessibilityLabel="Edit section name"
        >
          <FontAwesome name="pencil" size={14} color={headerIconColor} />
        </TouchableOpacity>
      )}
      {!editing && onDeleteSection && (
        <TouchableOpacity
          ref={deleteBtnRef}
          onPress={onDeleteSection}
          style={styles.sectionActionButton}
          accessibilityLabel="Delete section"
        >
          <FontAwesome name="trash" size={14} color="#FF3B30" />
        </TouchableOpacity>
      )}
      {onOutdentAll && (
        <TouchableOpacity
          ref={outdentRef}
          onPress={onOutdentAll}
          style={styles.sectionActionButton}
          accessibilityLabel="Outdent all items in this section"
        >
          <FontAwesome name="outdent" size={14} color={headerIconColor} />
        </TouchableOpacity>
      )}
      {onIndentAll && (
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
            name={collapsed ? 'chevron-right' : 'chevron-down'}
            size={14}
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  bulletContainer: {
    minWidth: 24,
    alignItems: 'center',
  },
  bullet: {
    fontSize: 16,
    fontWeight: '600',
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
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
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
  chevronButton: {
    padding: 8,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
});
