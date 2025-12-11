import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import FamilyService, { Family } from '../../services/familyService';
import { APIError } from '../../services/api';
import { FontAwesome } from '@expo/vector-icons';
import GlobalNavBar from '../../components/GlobalNavBar';
import { useTheme } from '../../contexts/ThemeContext';

export default function FamiliesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load families on mount
  useEffect(() => {
    loadFamilies();
  }, []);

  // Refresh families when screen comes into focus (e.g., after deleting a family)
  useFocusEffect(
    useCallback(() => {
      loadFamilies();
    }, [])
  );

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
    router.push(`/(tabs)/families/${familyId}`);
  };

  const handleCreateFamily = () => {
    router.push('/(tabs)/families/create');
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <ScrollView style={styles.scrollView}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>My Families</Text>
        <TouchableOpacity onPress={handleCreateFamily} style={[styles.createButton, { backgroundColor: colors.primary }]}>
          <FontAwesome name="plus" size={16} color="#fff" />
          <Text style={styles.createButtonText}>Create Family</Text>
        </TouchableOpacity>
      </View>

      {families.length === 0 ? (
        <View style={styles.emptyState}>
          <FontAwesome name="users" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No families yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Create your first family to get started</Text>
          <TouchableOpacity style={[styles.emptyCreateButton, { backgroundColor: colors.primary }]} onPress={handleCreateFamily}>
            <Text style={styles.emptyCreateButtonText}>Create Family</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.familiesList}>
          {families.map((family) => (
            <TouchableOpacity
              key={family.id}
              style={[styles.familyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleFamilyPress(family.id)}
            >
              <View style={[styles.familyColor, { backgroundColor: family.color }]} />
              <View style={styles.familyContent}>
                <Text style={[styles.familyName, { color: colors.text }]}>{family.name}</Text>
                <Text style={[styles.familyInfo, { color: colors.textSecondary }]}>
                  {family.member_count || 0} {family.member_count === 1 ? 'member' : 'members'}
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyCreateButton: {
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
    marginBottom: 4,
  },
  familyInfo: {
    fontSize: 14,
  },
});

