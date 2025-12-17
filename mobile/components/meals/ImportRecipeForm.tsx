import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface ImportRecipeFormProps {
  onImport: (url: string) => Promise<void>;
  onClose: () => void;
}

export default function ImportRecipeForm({ onImport, onClose }: ImportRecipeFormProps) {
  const { colors } = useTheme();
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setError('URL must start with http:// or https://');
      return;
    }

    setError('');
    setImporting(true);
    try {
      await onImport(url.trim());
      setUrl('');
    } catch (err: any) {
      setError(err.message || 'Failed to import recipe');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <FontAwesome name="times" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Import Recipe</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          <Text style={[styles.label, { color: colors.text }]}>Recipe URL</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              setError('');
            }}
            placeholder="https://example.com/recipe"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!importing}
          />
          {error ? (
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          ) : (
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              Enter a URL from a recipe website (e.g., AllRecipes, Food Network, BBC Good Food)
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.importButton,
              { backgroundColor: colors.primary },
              (!url.trim() || importing) && styles.importButtonDisabled,
            ]}
            onPress={handleImport}
            disabled={!url.trim() || importing}
          >
            {importing ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.importButtonText}>Importing...</Text>
              </>
            ) : (
              <>
                <FontAwesome name="download" size={16} color="#fff" />
                <Text style={styles.importButtonText}>Import Recipe</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 8,
  },
  hintText: {
    fontSize: 13,
    marginBottom: 24,
    lineHeight: 18,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
