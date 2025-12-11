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
}

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export default function FamilyProfileTab({
  family,
  currentUserRole,
  onFamilyUpdate,
}: FamilyProfileTabProps) {
  const { colors } = useTheme();
  const [editFamilyName, setEditFamilyName] = useState(family.name);
  const [editFamilyColor, setEditFamilyColor] = useState(family.color);
  const [updating, setUpdating] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  useEffect(() => {
    setEditFamilyName(family.name);
    setEditFamilyColor(family.color);
  }, [family]);

  const canEdit = currentUserRole === 'owner' || currentUserRole === 'admin';

  const handleUpdate = async () => {
    if (!editFamilyName.trim()) return;

    setUpdating(true);
    try {
      const updatedFamily = await FamilyService.updateFamily(family.id, {
        name: editFamilyName.trim(),
        color: editFamilyColor,
      });
      onFamilyUpdate(updatedFamily);
    } catch (error) {
      const apiError = error as APIError;
      console.error('Error updating family:', apiError);
      // TODO: Show error alert
    } finally {
      setUpdating(false);
    }
  };

  if (canEdit) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.form, { backgroundColor: colors.surface }]}>
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

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }, updating && styles.saveButtonDisabled]}
            onPress={handleUpdate}
            disabled={updating || !editFamilyName.trim()}
          >
            {updating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.viewOnly, { backgroundColor: colors.surface }]}>
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
  saveButton: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
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

