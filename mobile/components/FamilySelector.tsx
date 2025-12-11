import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useFamily } from '../contexts/FamilyContext';
import { useTheme } from '../contexts/ThemeContext';

export default function FamilySelector() {
  const { selectedFamily, setSelectedFamily, families, loading } = useFamily();
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const handleSelectFamily = (family: typeof families[0]) => {
    setSelectedFamily(family);
    setModalVisible(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (families.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noFamiliesText, { color: colors.textSecondary }]}>No families</Text>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.selector, { backgroundColor: colors.background, borderColor: colors.border }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <View style={[styles.colorIndicator, { backgroundColor: selectedFamily?.color || colors.primary }]} />
        <Text 
          style={[styles.familyName, { color: colors.text }]} 
          numberOfLines={Platform.OS === 'web' ? 1 : undefined}
        >
          {selectedFamily?.name || 'Select Family'}
        </Text>
        <FontAwesome name="chevron-down" size={14} color={colors.textSecondary} style={styles.chevron} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Family</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <FontAwesome name="times" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.familiesList}>
              {families.map((family) => (
                <TouchableOpacity
                  key={family.id}
                  style={[
                    styles.familyOption,
                    { borderBottomColor: colors.border },
                    selectedFamily?.id === family.id && { backgroundColor: colors.primary + '20' },
                  ]}
                  onPress={() => handleSelectFamily(family)}
                >
                  <View style={[styles.colorIndicator, { backgroundColor: family.color }]} />
                  <View style={styles.familyOptionContent}>
                    <Text style={[styles.familyOptionName, { color: colors.text }]}>{family.name}</Text>
                    <Text style={[styles.familyOptionMembers, { color: colors.textSecondary }]}>
                      {family.member_count || 0} {family.member_count === 1 ? 'member' : 'members'}
                    </Text>
                  </View>
                  {selectedFamily?.id === family.id && (
                    <FontAwesome name="check" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    ...Platform.select({
      web: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        minWidth: 120,
        maxWidth: 200,
      },
      default: {
        paddingHorizontal: 8,
        paddingVertical: 6,
        flex: 1,
        minWidth: 0,
      },
    }),
    borderWidth: 1,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  familyName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  chevron: {
    marginLeft: 6,
  },
  noFamiliesText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  familiesList: {
    maxHeight: 400,
  },
  familyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  familyOptionSelected: {
    // Applied inline with backgroundColor
  },
  familyOptionContent: {
    flex: 1,
    marginLeft: 12,
  },
  familyOptionName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  familyOptionMembers: {
    fontSize: 12,
  },
});

