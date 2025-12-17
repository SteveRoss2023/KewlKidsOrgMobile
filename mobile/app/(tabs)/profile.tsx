import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ProfileService, { UserProfile } from '../../services/profileService';
import { APIError } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';
import GlobalNavBar from '../../components/GlobalNavBar';
import AuthenticatedImage from '../../components/AuthenticatedImage';
import { useRouter } from 'expo-router';
import AuthService from '../../services/authService';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [formData, setFormData] = useState({
    display_name: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [photoCacheBuster, setPhotoCacheBuster] = useState<number>(Date.now());

  useEffect(() => {
    fetchProfile();
    requestImagePickerPermission();
  }, []);

  const requestImagePickerPermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Permission to access camera roll is required!');
      }
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const profileData = await ProfileService.getProfile();
      setProfile(profileData);
      setFormData({
        display_name: profileData.display_name || '',
      });
      setError(null);
    } catch (err) {
      const apiError = err as APIError;
      
      // If unauthorized (401), user needs to log in again
      if (apiError.status === 401) {
        console.error('Authentication failed. Redirecting to login.');
        // Clear any stored tokens
        await AuthService.logout();
        // Redirect to login
        router.replace('/(auth)/login');
        return;
      }
      
      // If endpoint doesn't exist (404), use fallback data from AuthService
      if (apiError.status === 404) {
        // Don't log 404 errors - endpoint may not be implemented yet
        try {
          const userData = await AuthService.getUserData();
          if (userData) {
            // Create a basic profile from user data
            const fallbackProfile: UserProfile = {
              id: userData.id,
              email: userData.email,
              display_name: userData.display_name || '',
              email_verified: false, // We don't know this from userData
              date_joined: new Date().toISOString(), // We don't have this
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            setProfile(fallbackProfile);
            setFormData({
              display_name: fallbackProfile.display_name || '',
            });
            setError('Profile endpoint not available. Showing basic account information. This feature may not be implemented on the backend yet.');
          } else {
            setError('Profile endpoint not available. This feature may not be implemented on the backend yet.');
          }
        } catch (fallbackError) {
          setError('Profile endpoint not available. This feature may not be implemented on the backend yet.');
        }
      } else {
        // Only log non-404 errors
        console.error('Error fetching profile:', apiError);
        setError('Failed to load profile. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setEditing(true);
    setError(null);
    setSuccess(null);
  };

  const handleCancel = () => {
    setEditing(false);
    setFormData({
      display_name: profile?.display_name || '',
    });
    setError(null);
    setSuccess(null);
  };

  const handleChoosePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadPhoto(result.assets[0]);
      }
    } catch (err) {
      console.error('Error picking image:', err);
      setError('Failed to pick image. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Permission to access camera is required!');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadPhoto(result.assets[0]);
      }
    } catch (err) {
      console.error('Error taking photo:', err);
      setError('Failed to take photo. Please try again.');
    }
  };

  const uploadPhoto = async (image: ImagePicker.ImagePickerAsset) => {
    setUploadingPhoto(true);
    setError(null);

    try {
      // Determine the MIME type from the URI or use default
      let mimeType = 'image/jpeg';
      if (image.uri) {
        if (image.uri.startsWith('data:')) {
          // Extract MIME type from data URI
          const mimeMatch = image.uri.match(/data:([^;]+)/);
          if (mimeMatch) {
            mimeType = mimeMatch[1];
          }
        } else if (image.uri.includes('.png')) {
          mimeType = 'image/png';
        } else if (image.uri.includes('.gif')) {
          mimeType = 'image/gif';
        }
      }

      // Get filename from URI or use default
      let fileName = 'photo.jpg';
      if (image.fileName) {
        fileName = image.fileName;
      } else if (image.uri && !image.uri.startsWith('data:') && !image.uri.startsWith('blob:')) {
        // Try to extract filename from URI
        const uriParts = image.uri.split('/');
        const lastPart = uriParts[uriParts.length - 1];
        if (lastPart.includes('.')) {
          fileName = lastPart;
        }
      }

      const updatedProfile = await ProfileService.updateProfile({
        photo: {
          uri: image.uri,
          type: mimeType,
          fileName: fileName,
        },
      });
      
      if (__DEV__) {
        console.log('Profile updated after photo upload:', {
          hasPhotoUrl: !!updatedProfile.photo_url,
          photoUrl: updatedProfile.photo_url,
        });
      }
      
      setProfile(updatedProfile);
      // Force image reload by updating cache buster
      setPhotoCacheBuster(Date.now());
      setSuccess('Photo uploaded successfully!');
      setTimeout(() => setSuccess(null), 3000);
      
      // Reload profile to get the updated photo_url (in case it wasn't in the response)
      await fetchProfile();
      // Update cache buster again after fetch to ensure fresh image
      setPhotoCacheBuster(Date.now());
    } catch (err) {
      const apiError = err as APIError;
      console.error('Error uploading photo:', apiError);
      setError(apiError.message || 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = () => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete your profile photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ProfileService.deletePhoto();
              setProfile({ ...profile!, photo: null, photo_url: null });
              setSuccess('Photo deleted successfully!');
              setTimeout(() => setSuccess(null), 3000);
            } catch (err) {
              const apiError = err as APIError;
              console.error('Error deleting photo:', apiError);
              setError('Failed to delete photo. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedProfile = await ProfileService.updateProfile({
        display_name: formData.display_name.trim(),
      });
      setProfile(updatedProfile);
      setEditing(false);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const apiError = err as APIError;
      console.error('Error updating profile:', apiError);
      setError(apiError.message || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPhotoUrl = (): string | null => {
    if (!profile?.photo_url) return null;
    // If it's a full URL, return it with cache-busting parameter; otherwise construct it
    if (profile.photo_url.startsWith('http://') || profile.photo_url.startsWith('https://')) {
      // Add cache-busting parameter to force image reload after upload
      const separator = profile.photo_url.includes('?') ? '&' : '?';
      return `${profile.photo_url}${separator}_t=${photoCacheBuster}`;
    }
    // For relative URLs, we'd need the API base URL - for now just return as is
    return profile.photo_url;
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  if (!profile && !loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GlobalNavBar />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>Failed to load profile</Text>
          <Text style={[styles.errorText, { color: colors.textSecondary, marginTop: 8, fontSize: 14 }]}>
            The profile endpoint may not be available yet.
          </Text>
        </View>
      </View>
    );
  }

  if (!profile) {
    return null; // Still loading
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>User Profile</Text>
          </View>
          {!editing && (
            <TouchableOpacity
              onPress={handleEdit}
              style={[styles.editButton, { backgroundColor: colors.primary }]}
            >
              <FontAwesome name="pencil" size={14} color="#fff" />
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Photo Section */}
        <View style={[styles.photoSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {getPhotoUrl() && (
            <TouchableOpacity
              onPress={handleDeletePhoto}
              style={[styles.photoDeleteButtonTopRight, { backgroundColor: colors.error }]}
              disabled={uploadingPhoto}
            >
              <FontAwesome name="trash" size={Platform.OS === 'web' ? 14 : 16} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => getPhotoUrl() && setShowPhotoViewer(true)}
            style={styles.photoContainer}
          >
            {getPhotoUrl() ? (
              <AuthenticatedImage 
                source={{ uri: getPhotoUrl()! }} 
                style={styles.photo}
                placeholder={
                  <View style={[styles.photoPlaceholder, { backgroundColor: colors.border }]}>
                    <FontAwesome name="user" size={64} color={colors.textSecondary} />
                  </View>
                }
              />
            ) : (
              <View style={[styles.photoPlaceholder, { backgroundColor: colors.border }]}>
                <FontAwesome name="user" size={64} color={colors.textSecondary} />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.photoActions}>
            <TouchableOpacity
              onPress={handleTakePhoto}
              style={[styles.photoButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              disabled={uploadingPhoto}
            >
              <Ionicons name="camera" size={Platform.OS === 'web' ? 16 : 18} color={colors.text} />
              {Platform.OS === 'web' ? (
                <Text style={[styles.photoButtonText, { color: colors.text }]}>Take Photo</Text>
              ) : (
                <Text style={[styles.photoButtonLabel, { color: colors.textSecondary }]}>Take</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleChoosePhoto}
              style={[styles.photoButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              disabled={uploadingPhoto}
            >
              <Ionicons name="image" size={Platform.OS === 'web' ? 16 : 18} color={colors.text} />
              {Platform.OS === 'web' ? (
                <Text style={[styles.photoButtonText, { color: colors.text }]}>Choose Photo</Text>
              ) : (
                <Text style={[styles.photoButtonLabel, { color: colors.textSecondary }]}>Select</Text>
              )}
            </TouchableOpacity>
            {getPhotoUrl() && (
              <TouchableOpacity
                onPress={() => setShowPhotoViewer(true)}
                style={[styles.photoButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Ionicons name="eye" size={Platform.OS === 'web' ? 16 : 18} color={colors.text} />
                {Platform.OS === 'web' ? (
                  <Text style={[styles.photoButtonText, { color: colors.text }]}>View</Text>
                ) : (
                  <Text style={[styles.photoButtonLabel, { color: colors.textSecondary }]}>View</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          {uploadingPhoto && (
            <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>Uploading photo...</Text>
          )}
        </View>

        {/* Messages */}
        {error && (
          <View style={[styles.message, styles.errorMessage, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
            <Text style={[styles.messageText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {success && (
          <View style={[styles.message, styles.successMessage, { backgroundColor: '#22c55e20', borderColor: '#22c55e' }]}>
            <Text style={[styles.messageText, { color: '#22c55e' }]}>{success}</Text>
          </View>
        )}

        {/* Form or Info */}
        {editing ? (
          <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Display Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={formData.display_name}
                onChangeText={(text) => setFormData({ ...formData, display_name: text })}
                placeholder="Enter your display name"
                placeholderTextColor={colors.textSecondary}
                maxLength={150}
              />
              <Text style={[styles.fieldHelp, { color: colors.textSecondary }]}>
                This name will be shown to other family members
              </Text>
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity
                onPress={handleCancel}
                style={[styles.cancelButton, { backgroundColor: colors.border }]}
                disabled={saving}
              >
                  <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSubmit}
                  style={[styles.saveButton, { backgroundColor: colors.primary }]}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.info}>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>Account Information</Text>
              <View style={[styles.detail, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Email:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{profile.email}</Text>
              </View>
              <View style={[styles.detail, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Display Name:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{profile.display_name || 'Not set'}</Text>
              </View>
              <View style={styles.detail}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Email Verified:</Text>
                <View style={styles.verifiedContainer}>
                  {profile.email_verified ? (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                      <Text style={[styles.verifiedText, { color: '#22c55e' }]}>Verified</Text>
                    </View>
                  ) : (
                    <View style={styles.unverifiedBadge}>
                      <Ionicons name="alert-circle" size={16} color={colors.error} />
                      <Text style={[styles.unverifiedText, { color: colors.error }]}>Not Verified</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.border }]}>Account Details</Text>
              <View style={[styles.detail, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Member Since:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{formatDate(profile.date_joined)}</Text>
              </View>
              <View style={[styles.detail, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Profile Created:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{formatDate(profile.created_at)}</Text>
              </View>
              <View style={styles.detail}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Last Updated:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{formatDate(profile.updated_at)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Photo Viewer Modal */}
        {showPhotoViewer && getPhotoUrl() && (
          <Modal
            visible={showPhotoViewer}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowPhotoViewer(false)}
          >
            <TouchableOpacity
              style={styles.photoViewerOverlay}
              activeOpacity={1}
              onPress={() => setShowPhotoViewer(false)}
            >
              <View 
                style={styles.photoViewerContent}
                onStartShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
              >
                <View 
                  style={styles.photoViewerImageContainer}
                  onStartShouldSetResponder={() => true}
                  onResponderTerminationRequest={() => false}
                >
                  <AuthenticatedImage 
                    source={{ uri: getPhotoUrl()! }} 
                    style={styles.photoViewerImage} 
                    resizeMode="contain"
                    placeholder={
                      <View style={styles.photoViewerPlaceholder}>
                        <ActivityIndicator size="large" color="#fff" />
                      </View>
                    }
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setShowPhotoViewer(false)}
                  style={styles.photoViewerClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.photoViewerCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  photoSection: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
    alignItems: 'center',
    gap: 20,
    position: 'relative',
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
  },
  photoPlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Platform.OS === 'web' ? 12 : 8,
    justifyContent: 'center',
  },
  photoButton: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Platform.OS === 'web' ? 6 : 4,
    paddingHorizontal: Platform.OS === 'web' ? 12 : 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 10,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: Platform.OS === 'web' ? 'auto' : 70,
  },
  photoDeleteButton: {
    backgroundColor: 'transparent',
  },
  photoDeleteButtonTopRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  photoButtonLabel: {
    fontSize: 10,
    fontWeight: '400',
    marginTop: 2,
  },
  uploadingText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  message: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
  },
  errorMessage: {
    // Styles applied inline
  },
  successMessage: {
    // Styles applied inline
  },
  messageText: {
    fontSize: 14,
  },
  form: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  fieldHelp: {
    fontSize: 12,
    marginTop: 6,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  info: {
    gap: 16,
  },
  section: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent', // Will be set inline
  },
  detail: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    justifyContent: Platform.OS === 'web' ? 'space-between' : 'flex-start',
    alignItems: Platform.OS === 'web' ? 'center' : 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: Platform.OS === 'web' ? 0 : 4,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: Platform.OS === 'web' ? 1 : 0,
  },
  detailValue: {
    fontSize: 14,
    flex: Platform.OS === 'web' ? 1 : 0,
    textAlign: Platform.OS === 'web' ? 'right' : 'left',
    flexWrap: 'wrap',
  },
  verifiedContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    fontSize: 14,
  },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unverifiedText: {
    fontSize: 14,
  },
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    position: 'relative',
  },
  photoViewerContent: {
    position: 'relative',
    width: '100%',
    maxWidth: '95%',
    maxHeight: '95%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerClose: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  photoViewerCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  photoViewerImageContainer: {
    width: '100%',
    height: '100%',
    maxWidth: Platform.OS === 'web' ? '95vw' : '95%',
    maxHeight: Platform.OS === 'web' ? '95vh' : '95%',
    minWidth: 300,
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerImage: {
    width: '100%',
    height: '100%',
    maxWidth: Platform.OS === 'web' ? '95vw' : '95%',
    maxHeight: Platform.OS === 'web' ? '95vh' : '95%',
    borderRadius: 8,
  },
  photoViewerPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
  },
});
