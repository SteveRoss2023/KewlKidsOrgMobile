import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Family } from '../../services/familyService';
import FamilyService from '../../services/familyService';
import { APIError } from '../../services/api';
import ColorPicker from '../ColorPicker';
import { useTheme } from '../../contexts/ThemeContext';

interface FamilyProfileTabProps {
  family: Family;
  currentUserRole: 'owner' | 'admin' | 'member' | 'child' | null;
  onFamilyUpdate: (family: Family) => void;
  onDeleteFamily?: () => void;
  deleting?: boolean;
}

const COLORS = [
  '#10b981', // Emerald Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#84cc16', // Lime Green
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#a855f7', // Violet
];

export default function FamilyProfileTab({
  family,
  currentUserRole,
  onFamilyUpdate,
  onDeleteFamily,
  deleting = false,
}: FamilyProfileTabProps) {
  const { colors } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editFamilyName, setEditFamilyName] = useState(family.name);
  const [editFamilyColor, setEditFamilyColor] = useState(family.color);
  const [updating, setUpdating] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  useEffect(() => {
    setEditFamilyName(family.name);
    setEditFamilyColor(family.color);
  }, [family]);

  const canEdit = currentUserRole === 'owner' || currentUserRole === 'admin';
  const isOwner = currentUserRole === 'owner';

  const handleEdit = () => {
    setIsEditing(true);
    setEditFamilyName(family.name);
    setEditFamilyColor(family.color);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditFamilyName(family.name);
    setEditFamilyColor(family.color);
    setColorPickerOpen(false);
  };

  const handleUpdate = async () => {
    if (!editFamilyName.trim()) return;

    setUpdating(true);
    try {
      const updatedFamily = await FamilyService.updateFamily(family.id, {
        name: editFamilyName.trim(),
        color: editFamilyColor,
      });
      onFamilyUpdate(updatedFamily);
      setIsEditing(false);
      setColorPickerOpen(false);
    } catch (error) {
      const apiError = error as APIError;
      console.error('Error updating family:', apiError);
      // TODO: Show error alert
    } finally {
      setUpdating(false);
    }
  };

  if (isEditing) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.form, { backgroundColor: colors.surface }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Edit Family</Text>
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.cancelButton}
              disabled={updating}
            >
              <FontAwesome name="times" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Family Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            value={editFamilyName}
            onChangeText={setEditFamilyName}
            placeholder="Family name"
            placeholderTextColor={colors.textSecondary}
            editable={!updating}
          />

          <Text style={[styles.label, { color: colors.text }]}>Color</Text>
          <TouchableOpacity
            style={[styles.colorPickerButton, { borderColor: colors.border }]}
            onPress={() => setColorPickerOpen(!colorPickerOpen)}
            disabled={updating}
          >
            <View style={styles.colorPickerHeader}>
              <View style={[styles.colorSwatch, { backgroundColor: editFamilyColor, borderColor: colors.border }]} />
              <Text style={[styles.colorPickerText, { color: colors.text }]}>Select Color</Text>
              <FontAwesome
                name={colorPickerOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.textSecondary}
              />
            </View>
          </TouchableOpacity>

          {colorPickerOpen && (
            <View style={styles.colorPickerContainer}>
              <ColorPicker
                value={editFamilyColor}
                onChange={setEditFamilyColor}
                colors={COLORS}
              />
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.cancelButtonFull, { backgroundColor: colors.border }]}
              onPress={handleCancel}
              disabled={updating}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }, updating && styles.saveButtonDisabled]}
              onPress={handleUpdate}
              disabled={updating || !editFamilyName.trim()}
            >
              {updating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.viewOnly, { backgroundColor: colors.surface }]}>
        <View style={styles.editHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Family Information</Text>
          <View style={styles.headerButtons}>
            {canEdit && (
              <TouchableOpacity
                onPress={handleEdit}
                style={styles.editButton}
              >
                <FontAwesome name="pencil" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            {isOwner && onDeleteFamily && (
              <TouchableOpacity
                onPress={onDeleteFamily}
                style={styles.deleteButton}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <FontAwesome name="trash" size={18} color={colors.error} />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Name:</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{family.name}</Text>
        </View>
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Color:</Text>
          <View style={styles.colorInfo}>
            <View style={[styles.colorSwatch, { backgroundColor: family.color, borderColor: colors.border }]} />
            <Text style={[styles.infoValue, { color: colors.text }]}>{family.color}</Text>
          </View>
        </View>
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Created:</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {new Date(family.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Updated:</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {new Date(family.updated_at).toLocaleDateString()}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    padding: 20,
    margin: 16,
    borderRadius: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  colorPickerButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  colorPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  colorPickerText: {
    flex: 1,
    fontSize: 16,
  },
  colorPickerContainer: {
    marginTop: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButtonFull: {
    flex: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  viewOnly: {
    padding: 20,
    margin: 16,
    borderRadius: 12,
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    width: 100,
  },
  infoValue: {
    fontSize: 16,
    flex: 1,
  },
  colorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
});

