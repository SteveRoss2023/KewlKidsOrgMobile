import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Family } from '../../services/familyService';
import { useTheme } from '../../contexts/ThemeContext';

interface FamilyStorageTabProps {
  family: Family;
}

export default function FamilyStorageTab({ family }: FamilyStorageTabProps) {
  const { colors } = useTheme();
  // TODO: Implement storage usage tracking when backend endpoints are available
  // For now, show placeholder

  const storageData = [
    { type: 'Documents', size: '0 MB', count: 0 },
    { type: 'Photos', size: '0 MB', count: 0 },
    { type: 'Videos', size: '0 MB', count: 0 },
    { type: 'Other', size: '0 MB', count: 0 },
  ];

  const totalSize = '0 MB';
  const totalCount = 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.summaryTitle, { color: colors.textSecondary }]}>Storage Summary</Text>
        <Text style={[styles.summaryTotal, { color: colors.text }]}>{totalSize}</Text>
        <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>{totalCount} files</Text>
      </View>

      <View style={[styles.breakdownSection, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Storage Breakdown</Text>
        {storageData.map((item, index) => (
          <View key={index} style={[styles.storageItem, { borderBottomColor: colors.border }]}>
            <View style={styles.storageItemInfo}>
              <Text style={[styles.storageItemType, { color: colors.text }]}>{item.type}</Text>
              <Text style={[styles.storageItemCount, { color: colors.textSecondary }]}>{item.count} files</Text>
            </View>
            <Text style={[styles.storageItemSize, { color: colors.primary }]}>{item.size}</Text>
          </View>
        ))}
      </View>

      <View style={styles.placeholder}>
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
          Storage tracking will be available once document management is implemented.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    borderRadius: 12,
    padding: 24,
    margin: 16,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    marginBottom: 8,
  },
  summaryTotal: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  summaryCount: {
    fontSize: 14,
  },
  breakdownSection: {
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  storageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  storageItemInfo: {
    flex: 1,
  },
  storageItemType: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  storageItemCount: {
    fontSize: 14,
  },
  storageItemSize: {
    fontSize: 16,
    fontWeight: '600',
  },
  placeholder: {
    padding: 40,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

