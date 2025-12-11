import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import FamilyService, { Family } from '../../services/familyService';
import { APIError } from '../../services/api';
import { FontAwesome } from '@expo/vector-icons';

export default function FamiliesScreen() {
  const router = useRouter();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFamilies();
  }, []);

  const loadFamilies = async () => {
    try {
      setLoading(true);
      const familiesData = await FamilyService.getFamilies();
      setFamilies(Array.isArray(familiesData) ? familiesData : []);
    } catch (error) {
      console.error('Error loading families:', error);
      setFamilies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFamilyPress = (familyId: number) => {
    router.push(`/families/${familyId}`);
  };

  const handleCreateFamily = () => {
    router.push('/families/create');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Families</Text>
        <TouchableOpacity onPress={handleCreateFamily} style={styles.createButton}>
          <FontAwesome name="plus" size={16} color="#fff" />
          <Text style={styles.createButtonText}>Create Family</Text>
        </TouchableOpacity>
      </View>

      {families.length === 0 ? (
        <View style={styles.emptyState}>
          <FontAwesome name="users" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No families yet</Text>
          <Text style={styles.emptySubtext}>Create your first family to get started</Text>
          <TouchableOpacity style={styles.emptyCreateButton} onPress={handleCreateFamily}>
            <Text style={styles.emptyCreateButtonText}>Create Family</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.familiesList}>
          {families.map((family) => (
            <TouchableOpacity
              key={family.id}
              style={styles.familyCard}
              onPress={() => handleFamilyPress(family.id)}
            >
              <View style={[styles.familyColor, { backgroundColor: family.color }]} />
              <View style={styles.familyContent}>
                <Text style={styles.familyName}>{family.name}</Text>
                <Text style={styles.familyInfo}>
                  {family.member_count || 0} {family.member_count === 1 ? 'member' : 'members'}
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={16} color="#999" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  createButtonText: {
    marginLeft: 6,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyCreateButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyCreateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  familiesList: {
    padding: 20,
  },
  familyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  familyColor: {
    width: 4,
    height: 50,
    borderRadius: 2,
    marginRight: 12,
  },
  familyContent: {
    flex: 1,
  },
  familyName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  familyInfo: {
    fontSize: 14,
    color: '#666',
  },
});

