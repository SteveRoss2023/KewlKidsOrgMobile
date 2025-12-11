import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import GlobalNavBar from '../../components/GlobalNavBar';

export default function TodayScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Activity</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            View today's activities and events
          </Text>
        </View>

        <View style={styles.placeholder}>
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Activity view will be available soon.
          </Text>
        </View>
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
  contentContainer: {
    padding: 16,
  },
  header: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
  },
  placeholder: {
    padding: 40,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
  },
});


