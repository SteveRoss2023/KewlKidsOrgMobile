import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { useFamily } from '../contexts/FamilyContext';
import { useTheme } from '../contexts/ThemeContext';

export default function FamilySelector() {
  const { selectedFamily, setSelectedFamily, families, loading } = useFamily();
  const { colors } = useTheme();
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const selectorRef = useRef<View>(null);

  const handleSelectFamily = (family: typeof families[0]) => {
    setSelectedFamily(family);
    setDropdownVisible(false);
  };

  const handleToggleDropdown = () => {
    setDropdownVisible(!dropdownVisible);
  };

  const handleCloseDropdown = () => {
    setDropdownVisible(false);
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
    <View style={styles.container} ref={selectorRef}>
      <TouchableOpacity
        style={[styles.selector, { backgroundColor: colors.background, borderColor: colors.border }]}
        onPress={handleToggleDropdown}
        activeOpacity={0.7}
      >
        <View style={[styles.colorIndicator, { backgroundColor: selectedFamily?.color || colors.primary }]} />
        <Text 
          style={[styles.familyName, { color: colors.text }]} 
          numberOfLines={Platform.OS === 'web' ? 1 : undefined}
        >
          {selectedFamily?.name || 'Select Family'}
        </Text>
        <Ionicons 
          name={dropdownVisible ? "chevron-up" : "chevron-down"} 
          size={16} 
          color={colors.textSecondary} 
          style={styles.chevron} 
        />
      </TouchableOpacity>

      {dropdownVisible && (
        <>
          <TouchableOpacity
            style={styles.dropdownOverlay}
            activeOpacity={1}
            onPress={handleCloseDropdown}
          />
          <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ScrollView 
              style={styles.dropdownList}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
            >
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
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    zIndex: 1000,
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
  dropdownOverlay: {
    position: 'absolute',
    top: -10000,
    left: -10000,
    right: -10000,
    bottom: -10000,
    zIndex: 998,
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
    }),
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 300,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        minWidth: 200,
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
    zIndex: 1001,
  },
  dropdownList: {
    maxHeight: 300,
  },
  familyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  familyOptionContent: {
    flex: 1,
    marginLeft: 12,
  },
  familyOptionName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  familyOptionMembers: {
    fontSize: 12,
  },
});

