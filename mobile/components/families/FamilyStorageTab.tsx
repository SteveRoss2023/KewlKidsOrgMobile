import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Family } from '../../services/familyService';

interface FamilyStorageTabProps {
  family: Family;
}

export default function FamilyStorageTab({ family }: FamilyStorageTabProps) {
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
    <ScrollView style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Storage Summary</Text>
        <Text style={styles.summaryTotal}>{totalSize}</Text>
        <Text style={styles.summaryCount}>{totalCount} files</Text>
      </View>

      <View style={styles.breakdownSection}>
        <Text style={styles.sectionTitle}>Storage Breakdown</Text>
        {storageData.map((item, index) => (
          <View key={index} style={styles.storageItem}>
            <View style={styles.storageItemInfo}>
              <Text style={styles.storageItemType}>{item.type}</Text>
              <Text style={styles.storageItemCount}>{item.count} files</Text>
            </View>
            <Text style={styles.storageItemSize}>{item.size}</Text>
          </View>
        ))}
      </View>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Storage tracking will be available once document management is implemented.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    margin: 16,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  summaryTotal: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  summaryCount: {
    fontSize: 14,
    color: '#999',
  },
  breakdownSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  storageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  storageItemInfo: {
    flex: 1,
  },
  storageItemType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  storageItemCount: {
    fontSize: 14,
    color: '#666',
  },
  storageItemSize: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  placeholder: {
    padding: 40,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});

