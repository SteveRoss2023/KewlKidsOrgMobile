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
      <ScrollView style={styles.container}>
        <View style={styles.form}>
          <Text style={styles.label}>Family Name</Text>
          <TextInput
            style={styles.input}
            value={editFamilyName}
            onChangeText={setEditFamilyName}
            placeholder="Family name"
            editable={!updating}
          />

          <Text style={styles.label}>Color</Text>
          <TouchableOpacity
            style={styles.colorPickerButton}
            onPress={() => setColorPickerOpen(!colorPickerOpen)}
            disabled={updating}
          >
            <View style={styles.colorPickerHeader}>
              <View style={[styles.colorSwatch, { backgroundColor: editFamilyColor }]} />
              <Text style={styles.colorPickerText}>Select Color</Text>
              <FontAwesome
                name={colorPickerOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#666"
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
            style={[styles.saveButton, updating && styles.saveButtonDisabled]}
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
    <ScrollView style={styles.container}>
      <View style={styles.viewOnly}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{family.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Color:</Text>
          <View style={styles.colorInfo}>
            <View style={[styles.colorSwatch, { backgroundColor: family.color }]} />
            <Text style={styles.infoValue}>{family.color}</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Created:</Text>
          <Text style={styles.infoValue}>
            {new Date(family.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Updated:</Text>
          <Text style={styles.infoValue}>
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
    backgroundColor: '#f5f5f5',
  },
  form: {
    backgroundColor: '#fff',
    padding: 20,
    margin: 16,
    borderRadius: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  colorPickerButton: {
    borderWidth: 1,
    borderColor: '#ddd',
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
    borderColor: '#ddd',
  },
  colorPickerText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  colorPickerContainer: {
    marginTop: 12,
  },
  saveButton: {
    backgroundColor: '#007AFF',
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
    backgroundColor: '#fff',
    padding: 20,
    margin: 16,
    borderRadius: 12,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    width: 100,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  colorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
});

