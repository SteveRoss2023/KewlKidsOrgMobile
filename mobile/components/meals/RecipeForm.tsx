import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../contexts/ThemeContext';
import MealsService, {
  CreateRecipeData,
  UpdateRecipeData,
  Recipe,
  RecipeImageAsset,
} from '../../services/mealsService';
import { resolveRecipeImageUrl } from '../../utils/recipeImageUrl';

/** RN Web: Alert.alert is often hidden behind a full-screen Modal — use a blocking browser dialog. */
function notifyAlert(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  if (message !== undefined) {
    Alert.alert(title, message);
  } else {
    Alert.alert(title);
  }
}

let ImagePicker: any = null;
if (Platform.OS !== 'web') {
  try {
    ImagePicker = require('expo-image-picker');
  } catch {
    // expo-image-picker not available on this platform
  }
}


interface RecipeFormProps {
  selectedFamily: { id: number; name: string };
  onClose: () => void;
  /** Called with the saved recipe so the parent can update the list (esp. when refetch is slow or fails). */
  onSuccess: (savedRecipe?: Recipe) => void | Promise<void>;
  recipe?: Recipe | null;
}

export default function RecipeForm({ selectedFamily, onClose, onSuccess, recipe }: RecipeFormProps) {
  const { colors } = useTheme();
  const isEdit = !!recipe;
  const [title, setTitle] = useState(recipe?.title || '');
  const [servings, setServings] = useState(recipe?.servings?.toString() || '');
  const [prepTime, setPrepTime] = useState(recipe?.prep_time_minutes?.toString() || '');
  const [cookTime, setCookTime] = useState(recipe?.cook_time_minutes?.toString() || '');
  const [imageUrl, setImageUrl] = useState(recipe?.image_url || '');
  const [sourceUrl, setSourceUrl] = useState(recipe?.source_url || '');
  const [notes, setNotes] = useState(recipe?.notes || '');
  const [ingredients, setIngredients] = useState<string[]>(recipe?.ingredients?.length ? [...recipe.ingredients] : ['']);
  const [instructions, setInstructions] = useState<string[]>(recipe?.instructions?.length ? [...recipe.instructions] : ['']);
  const [creating, setCreating] = useState(false);
  const [pickedImage, setPickedImage] = useState<RecipeImageAsset | null>(null);
  const [clearImageRequested, setClearImageRequested] = useState(false);

  const addIngredient = () => {
    setIngredients([...ingredients, '']);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = value;
    setIngredients(newIngredients);
  };

  const addInstruction = () => {
    setInstructions([...instructions, '']);
  };

  const removeInstruction = (index: number) => {
    setInstructions(instructions.filter((_, i) => i !== index));
  };

  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...instructions];
    newInstructions[index] = value;
    setInstructions(newInstructions);
  };

  const handleChooseFromLibrary = async () => {
    if (!ImagePicker) {
      notifyAlert('Not available', 'Image picker is not available on this platform.');
      return;
    }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        notifyAlert('Permission needed', 'Permission to access photos is required to add a recipe image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setPickedImage({
          uri: asset.uri,
          type: asset.mimeType || 'image/jpeg',
          fileName: asset.fileName || 'recipe.jpg',
        });
        setClearImageRequested(false);
      }
    } catch (err: any) {
      console.error('Error picking image:', err);
      notifyAlert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
    if (!ImagePicker) {
      notifyAlert('Not available', 'Camera is not available on this platform.');
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        notifyAlert('Permission needed', 'Permission to access camera is required to take a photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setPickedImage({
          uri: asset.uri,
          type: asset.mimeType || 'image/jpeg',
          fileName: asset.fileName || 'recipe.jpg',
        });
        setClearImageRequested(false);
      }
    } catch (err: any) {
      console.error('Error taking photo:', err);
      notifyAlert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleRemovePhoto = () => {
    setPickedImage(null);
    if (isEdit) setClearImageRequested(true);
  };

  const handleSelectImageFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setPickedImage({
          uri: asset.uri,
          type: asset.mimeType || 'image/jpeg',
          fileName: asset.name || 'recipe.jpg',
        });
        setClearImageRequested(false);
      }
    } catch (err: any) {
      console.error('Error picking image:', err);
      notifyAlert('Error', 'Failed to select image. Please try again.');
    }
  };

  const displayImageUri =
    pickedImage?.uri ?? (clearImageRequested ? null : resolveRecipeImageUrl(recipe?.image_url));
  const showFilePickerFallback = !ImagePicker;

  const handleSubmit = async () => {
    if (!title.trim()) {
      notifyAlert('Missing title', 'Please enter a recipe name.');
      return;
    }

    const filteredIngredients = ingredients.filter(i => i.trim());
    const filteredInstructions = instructions.filter(i => i.trim());

    if (filteredIngredients.length === 0) {
      notifyAlert('Missing ingredients', 'Add at least one ingredient.');
      return;
    }

    setCreating(true);
    try {
      let saved: Recipe;
      if (isEdit && recipe) {
        const data: UpdateRecipeData = {
          title: title.trim(),
          ingredients: filteredIngredients,
          instructions: filteredInstructions,
          servings: servings ? parseInt(servings, 10) : undefined,
          prep_time_minutes: prepTime ? parseInt(prepTime, 10) : undefined,
          cook_time_minutes: cookTime ? parseInt(cookTime, 10) : undefined,
          image_url: imageUrl.trim() || undefined,
          source_url: sourceUrl.trim() || undefined,
          notes: notes.trim() || undefined,
        };
        if (clearImageRequested) {
          data.clear_image = true;
        } else if (pickedImage) {
          data.image = pickedImage;
        } else if (imageUrl.trim()) {
          // User set an image URL; clear stored file so this URL is used as the recipe image
          data.clear_image = true;
        }
        saved = await MealsService.updateRecipe(recipe.id, data);
      } else {
        const data: CreateRecipeData = {
          family: selectedFamily.id,
          title: title.trim(),
          ingredients: filteredIngredients,
          instructions: filteredInstructions,
          servings: servings ? parseInt(servings, 10) : undefined,
          prep_time_minutes: prepTime ? parseInt(prepTime, 10) : undefined,
          cook_time_minutes: cookTime ? parseInt(cookTime, 10) : undefined,
          image_url: !pickedImage && imageUrl.trim() ? imageUrl.trim() : undefined,
          source_url: sourceUrl.trim() || undefined,
          notes: notes.trim() || undefined,
          image: pickedImage || undefined,
        };
        saved = await MealsService.createRecipe(data);
      }
      await onSuccess(saved);
      onClose();
    } catch (err: any) {
      console.error('Error saving recipe:', err);
      notifyAlert('Error', err?.message || 'Failed to save recipe. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <FontAwesome name="times" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{isEdit ? 'Edit Recipe' : 'Create Recipe'}</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={creating || !title.trim()}
            style={[styles.saveButton, { opacity: creating || !title.trim() ? 0.5 : 1 }]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.saveButtonText, { color: colors.primary }]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Recipe title"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, styles.halfField]}>
              <Text style={[styles.label, { color: colors.text }]}>Servings</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                value={servings}
                onChangeText={setServings}
                placeholder="4"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.field, styles.halfField]}>
              <Text style={[styles.label, { color: colors.text }]}>Prep Time (min)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                value={prepTime}
                onChangeText={setPrepTime}
                placeholder="15"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Cook Time (min)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={cookTime}
              onChangeText={setCookTime}
              placeholder="30"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Recipe photo</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Choose from library, take a photo, or paste an Image URL below.
            </Text>
            {displayImageUri ? (
              <View style={styles.imageSection}>
                <View style={[styles.thumbnailFrame, { backgroundColor: colors.border }]}>
                  <Image source={{ uri: displayImageUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                </View>
                <View style={styles.imageActions}>
                  {ImagePicker ? (
                    <>
                      <TouchableOpacity
                        style={[styles.imageButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={handleChooseFromLibrary}
                      >
                        <FontAwesome name="photo" size={16} color={colors.primary} />
                        <Text style={[styles.imageButtonText, { color: colors.primary }]}>Library</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.imageButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={handleTakePhoto}
                      >
                        <FontAwesome name="camera" size={16} color={colors.primary} />
                        <Text style={[styles.imageButtonText, { color: colors.primary }]}>Camera</Text>
                      </TouchableOpacity>
                    </>
                  ) : showFilePickerFallback ? (
                    <TouchableOpacity
                      style={[styles.imageButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={handleSelectImageFile}
                    >
                      <FontAwesome name="photo" size={16} color={colors.primary} />
                      <Text style={[styles.imageButtonText, { color: colors.primary }]}>Change image</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.imageButton, { backgroundColor: colors.surface, borderColor: colors.error }]}
                    onPress={handleRemovePhoto}
                  >
                    <FontAwesome name="trash" size={16} color={colors.error} />
                    <Text style={[styles.imageButtonText, { color: colors.error }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.imageActions}>
                {ImagePicker ? (
                  <>
                    <TouchableOpacity
                      style={[styles.imageButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={handleChooseFromLibrary}
                    >
                      <FontAwesome name="photo" size={16} color={colors.primary} />
                      <Text style={[styles.imageButtonText, { color: colors.primary }]}>Choose from library</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.imageButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={handleTakePhoto}
                    >
                      <FontAwesome name="camera" size={16} color={colors.primary} />
                      <Text style={[styles.imageButtonText, { color: colors.primary }]}>Take photo</Text>
                    </TouchableOpacity>
                  </>
                ) : showFilePickerFallback ? (
                  <TouchableOpacity
                    style={[styles.imageButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={handleSelectImageFile}
                  >
                    <FontAwesome name="photo" size={16} color={colors.primary} />
                    <Text style={[styles.imageButtonText, { color: colors.primary }]}>Select image</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Image URL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Source URL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, { color: colors.text }]}>Ingredients *</Text>
              <TouchableOpacity onPress={addIngredient} style={styles.addButton}>
                <FontAwesome name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addButtonText, { color: colors.primary }]}>Add</Text>
              </TouchableOpacity>
            </View>
            {ingredients.map((ingredient, index) => (
              <View key={index} style={styles.listItem}>
                <TextInput
                  style={[styles.input, styles.listInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={ingredient}
                  onChangeText={(value) => updateIngredient(index, value)}
                  placeholder={`Ingredient ${index + 1}`}
                  placeholderTextColor={colors.textSecondary}
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity onPress={() => removeIngredient(index)} style={styles.removeButton}>
                    <FontAwesome name="trash" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View style={styles.field}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, { color: colors.text }]}>Instructions (optional)</Text>
              <TouchableOpacity onPress={addInstruction} style={styles.addButton}>
                <FontAwesome name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addButtonText, { color: colors.primary }]}>Add</Text>
              </TouchableOpacity>
            </View>
            {instructions.map((instruction, index) => (
              <View key={index} style={styles.listItem}>
                <TextInput
                  style={[styles.input, styles.listInput, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={instruction}
                  onChangeText={(value) => updateInstruction(index, value)}
                  placeholder={`Step ${index + 1}`}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
                {instructions.length > 1 && (
                  <TouchableOpacity onPress={() => removeInstruction(index)} style={styles.removeButton}>
                    <FontAwesome name="trash" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>
        </ScrollView>
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
  saveButton: {
    padding: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  field: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  listInput: {
    flex: 1,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  removeButton: {
    padding: 8,
    marginTop: 2,
  },
  imageSection: {
    marginTop: 4,
  },
  thumbnailFrame: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  imageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  imageButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

