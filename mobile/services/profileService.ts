import apiClient, { APIError, handleAPIError } from './api';
import { Platform } from 'react-native';
import { tokenStorage } from '../utils/storage';

/**
 * User Profile data interface
 */
export interface UserProfile {
  id: number;
  email: string;
  display_name?: string;
  photo?: string;
  photo_url?: string;
  email_verified: boolean;
  date_joined: string;
  created_at: string;
  updated_at: string;
}

/**
 * Update profile data
 */
export interface UpdateProfileData {
  display_name?: string;
  photo?: any; // File or FormData
}

/**
 * Profile Service
 */
class ProfileService {
  /**
   * Get current user's profile
   */
  async getProfile(): Promise<UserProfile> {
    try {
      const response = await apiClient.get<UserProfile>('/users/me/profile/');
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update user's profile
   */
  async updateProfile(data: UpdateProfileData): Promise<UserProfile> {
    try {
      // If only updating display_name (no photo), use JSON for better compatibility
      if (!data.photo && data.display_name !== undefined) {
        if (__DEV__) {
          console.log('Updating profile with display_name only (using JSON):', {
            display_name: data.display_name,
            apiUrl: (apiClient.defaults.baseURL || '') + '/users/me/profile/',
          });
        }
        try {
          const response = await apiClient.patch<UserProfile>('/users/me/profile/', {
            display_name: data.display_name,
          }, {
            timeout: 30000, // 30 seconds for text updates
          });
          return response.data;
        } catch (error) {
          if (__DEV__) {
            console.error('Profile update error details:', {
              error,
              baseURL: apiClient.defaults.baseURL,
              url: '/users/me/profile/',
              method: 'PATCH',
            });
          }
          throw error;
        }
      }

      // If updating photo, use FormData
      const formData = new FormData();
      
      if (data.display_name !== undefined) {
        formData.append('display_name', data.display_name);
      }
      
      if (data.photo) {
        const { Platform } = require('react-native');
        let photoUri = data.photo.uri || data.photo;
        const photoType = data.photo.type || 'image/jpeg';
        const photoName = data.photo.fileName || 'photo.jpg';
        
        if (__DEV__) {
          console.log('Photo upload details:', {
            platform: Platform.OS,
            photoUri: photoUri.substring(0, 100) + (photoUri.length > 100 ? '...' : ''),
            photoType,
            photoName,
            apiUrl: (apiClient.defaults.baseURL || '') + '/users/me/profile/',
          });
        }
        
        if (Platform.OS === 'web') {
          // On web, we need to convert the URI to a File object
          try {
            // Fetch the image as a blob
            const response = await fetch(photoUri);
            const blob = await response.blob();
            const file = new File([blob], photoName, { type: photoType });
            formData.append('photo', file);
          } catch (fetchError) {
            // If fetch fails (e.g., data URI), try to create from base64
            if (photoUri.startsWith('data:')) {
              const base64Data = photoUri.split(',')[1];
              const byteCharacters = atob(base64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: photoType });
              const file = new File([blob], photoName, { type: photoType });
              formData.append('photo', file);
            } else {
              throw fetchError;
            }
          }
        } else {
          // On native (iOS/Android), use the React Native FormData format
          // Ensure URI is properly formatted - React Native expects file:// or content:// URIs
          // Normalize the URI to ensure it's accessible
          if (photoUri.startsWith('file://') || photoUri.startsWith('content://') || photoUri.startsWith('ph://')) {
            // URI is already in correct format
          } else if (photoUri.startsWith('/')) {
            // If it's a relative path, convert to file:// URI
            photoUri = `file://${photoUri}`;
          } else if (!photoUri.includes('://')) {
            // If no protocol, assume it's a file path
            photoUri = `file://${photoUri}`;
          }
          
          if (__DEV__) {
            console.log('Normalized photo URI:', photoUri.substring(0, 100) + (photoUri.length > 100 ? '...' : ''));
          }
          
          // React Native FormData format for file uploads
          formData.append('photo', {
            uri: photoUri,
            type: photoType,
            name: photoName,
          } as any);
        }
      }

      if (__DEV__) {
        console.log('Sending FormData request:', {
          hasPhoto: !!data.photo,
          hasDisplayName: data.display_name !== undefined,
          timeout: 120000,
          platform: Platform.OS,
        });
      }

      // On native platforms, use XMLHttpRequest for better FormData support with ngrok
      // Axios has known issues with React Native FormData and ngrok
      if (Platform.OS !== 'web') {
        return new Promise<UserProfile>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const url = `${apiClient.defaults.baseURL}/users/me/profile/`;
          
          xhr.open('PATCH', url, true);
          xhr.timeout = 120000; // 2 minutes
          
          // Get token and set headers
          tokenStorage.getAccessToken().then((token) => {
            if (token) {
              xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
            
            // Don't set Content-Type - let the browser set it with boundary for FormData
            // React Native FormData requires the browser to automatically set Content-Type
            
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const responseData = JSON.parse(xhr.responseText);
                  if (__DEV__) {
                    console.log('Photo upload successful:', {
                      status: xhr.status,
                      hasPhotoUrl: !!responseData.photo_url,
                      photoUrl: responseData.photo_url,
                      profileId: responseData.id,
                    });
                  }
                  resolve(responseData);
                } catch (parseError) {
                  if (__DEV__) {
                    console.error('Failed to parse response:', {
                      status: xhr.status,
                      responseText: xhr.responseText.substring(0, 200),
                      error: parseError,
                    });
                  }
                  reject(new APIError('Failed to parse response', xhr.status));
                }
              } else {
                try {
                  const errorData = JSON.parse(xhr.responseText);
                  reject(new APIError(errorData.detail || errorData.message || `Request failed with status ${xhr.status}`, xhr.status));
                } catch (parseError) {
                  reject(new APIError(`Request failed with status ${xhr.status}`, xhr.status));
                }
              }
            };
            
            xhr.onerror = () => {
              reject(new APIError('Network error - unable to reach server. Please check your internet connection and ensure the server is running.', 0));
            };
            
            xhr.ontimeout = () => {
              reject(new APIError('Request timeout - the server took too long to respond. This may happen with large file uploads.', 0));
            };
            
            if (__DEV__) {
              console.log('Sending XMLHttpRequest:', {
                method: 'PATCH',
                url,
                hasFormData: true,
              });
            }
            
            // Send the FormData
            xhr.send(formData as any);
          }).catch((tokenError) => {
            reject(new APIError('Failed to get authentication token', 0));
          });
        });
      }

      // On web, use axios (works fine with FormData)
      // Don't set Content-Type header - let axios set it automatically with boundary
      // React Native FormData requires axios to set the Content-Type header automatically
      // Use a longer timeout for file uploads
      const response = await apiClient.patch<UserProfile>('/users/me/profile/', formData, {
        timeout: 120000, // 2 minutes for photo uploads
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      return response.data;
    } catch (error) {
      // Provide more context for photo upload errors
      const apiError = handleAPIError(error as any);
      
      if (__DEV__) {
        console.error('Photo upload error details:', {
          error: apiError.message,
          status: apiError.status,
          hasPhoto: !!data.photo,
          photoUri: data.photo ? (data.photo.uri || data.photo).substring(0, 100) : 'none',
          baseURL: apiClient.defaults.baseURL,
          url: '/users/me/profile/',
          method: 'PATCH',
          originalError: error,
        });
      }
      
      throw apiError;
    }
  }

  /**
   * Resend email verification email
   */
  async resendVerificationEmail(): Promise<void> {
    try {
      const response = await apiClient.post('/auth/resend-verification/');
      // No data returned, just success
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete user's profile photo
   */
  async deletePhoto(): Promise<void> {
    try {
      await apiClient.delete('/users/me/profile/photo/');
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }
}

export default new ProfileService();

