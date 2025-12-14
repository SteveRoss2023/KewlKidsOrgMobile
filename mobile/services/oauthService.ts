/**
 * OAuth Service for sync services (Outlook, OneDrive, Google Drive, Google Photos)
 */
import apiClient from './api';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// Complete OAuth flow in browser
WebBrowser.maybeCompleteAuthSession();

export type OAuthServiceType = 'outlook' | 'onedrive' | 'googledrive' | 'googlephotos';

export interface OAuthConnectionStatus {
  connected: boolean;
  email?: string;
  connected_at?: string;
  calendar_name?: string; // For Outlook
}

export interface OAuthInitiateResponse {
  auth_url: string;
  state: string;
}

export interface OAuthCallbackResponse {
  success: boolean;
  message: string;
  email?: string;
  calendar_name?: string; // For Outlook
}

class OAuthService {
  /**
   * Initiate OAuth flow for Outlook Calendar
   */
  async initiateOutlookOAuth(familyId?: number): Promise<OAuthInitiateResponse> {
    const params: any = { mobile: 'true' };
    if (familyId) {
      params.family_id = familyId;
    }
    const response = await apiClient.get<OAuthInitiateResponse>(
      '/calendar/outlook/oauth/initiate/',
      { params }
    );
    return response.data;
  }

  /**
   * Initiate OAuth flow for OneDrive
   */
  async initiateOneDriveOAuth(): Promise<OAuthInitiateResponse> {
    try {
      const response = await apiClient.get<OAuthInitiateResponse>(
        '/onedrive/oauth/initiate/',
        { params: { mobile: 'true' } }
      );
      return response.data;
    } catch (error: any) {
      // Extract error message from 401 responses
      if (error.response?.status === 401 && error.response?.data) {
        const errorMessage = error.response.data.error || error.response.data.detail || 'Authentication failed. Please log out and log back in.';
        throw new Error(errorMessage);
      }
      throw error;
    }
  }

  /**
   * Initiate OAuth flow for Google Drive
   */
  async initiateGoogleDriveOAuth(): Promise<OAuthInitiateResponse> {
    try {
      const response = await apiClient.get<OAuthInitiateResponse>(
        '/googledrive/oauth/initiate/',
        { params: { mobile: 'true' } }
      );
      return response.data;
    } catch (error: any) {
      // Extract error message from 401 responses
      if (error.response?.status === 401 && error.response?.data) {
        const errorMessage = error.response.data.error || error.response.data.detail || 'Authentication failed. Please log out and log back in.';
        throw new Error(errorMessage);
      }
      throw error;
    }
  }

  /**
   * Initiate OAuth flow for Google Photos
   */
  async initiateGooglePhotosOAuth(): Promise<OAuthInitiateResponse> {
    try {
      const response = await apiClient.get<OAuthInitiateResponse>(
        '/googlephotos/oauth/initiate/',
        { params: { mobile: 'true' } }
      );
      return response.data;
    } catch (error: any) {
      // Extract error message from 401 responses
      if (error.response?.status === 401 && error.response?.data) {
        const errorMessage = error.response.data.error || error.response.data.detail || 'Authentication failed. Please log out and log back in.';
        throw new Error(errorMessage);
      }
      throw error;
    }
  }

  /**
   * Open OAuth URL in browser and wait for callback
   * Note: The backend handles the OAuth callback and token exchange.
   * This method opens the browser and the backend redirects back to the app via deep link.
   */
  async performOAuthFlow(authUrl: string, redirectUri?: string): Promise<OAuthCallbackResponse | null> {
    try {
      // Use the app's deep link scheme for OAuth callback
      const callbackUrl = redirectUri || Linking.createURL('/oauth/callback');

      // Open browser for OAuth with callback URL
      const result = await WebBrowser.openAuthSessionAsync(authUrl, callbackUrl);

      if (result.type === 'success' && result.url) {
        // Parse callback URL from deep link
        const url = new URL(result.url);
        const success = url.searchParams.get('success') === 'true';
        const message = url.searchParams.get('message') || '';
        const error = url.searchParams.get('error');

        if (error || !success) {
          return {
            success: false,
            message: message || error || 'OAuth flow failed',
          };
        }

        return {
          success: true,
          message: message || 'OAuth flow completed successfully',
        };
      }

      if (result.type === 'cancel') {
        return {
          success: false,
          message: 'OAuth flow was cancelled',
        };
      }

      // If browser was dismissed, assume user needs to complete in browser
      // The deep link will be handled by the app's deep link handler
      return {
        success: true,
        message: 'Please complete authorization in browser. You will be redirected back to the app.',
      };
    } catch (error: any) {
      console.error('OAuth flow error:', error);
      return {
        success: false,
        message: error.message || 'Failed to open OAuth URL',
      };
    }
  }

  /**
   * Check connection status for a service
   */
  async checkConnection(service: OAuthServiceType): Promise<OAuthConnectionStatus> {
    try {
      let endpoint = '';
      switch (service) {
        case 'outlook':
          endpoint = '/calendar/outlook/connection/';
          break;
        case 'onedrive':
          endpoint = '/onedrive/connection/';
          break;
        case 'googledrive':
          endpoint = '/googledrive/connection/';
          break;
        case 'googlephotos':
          endpoint = '/googlephotos/connection/';
          break;
      }

      const response = await apiClient.get<OAuthConnectionStatus>(endpoint);
      return response.data;
    } catch (error: any) {
      console.error(`Error checking ${service} connection:`, error);
      return { connected: false };
    }
  }

  /**
   * Disconnect a service
   */
  async disconnect(service: OAuthServiceType): Promise<{ success: boolean; message: string }> {
    try {
      let endpoint = '';
      switch (service) {
        case 'outlook':
          // Outlook doesn't have a disconnect endpoint in the current implementation
          // You may need to add one or handle it differently
          throw new Error('Outlook disconnect not implemented');
        case 'onedrive':
          endpoint = '/onedrive/disconnect/';
          break;
        case 'googledrive':
          endpoint = '/googledrive/disconnect/';
          break;
        case 'googlephotos':
          endpoint = '/googlephotos/disconnect/';
          break;
      }

      const response = await apiClient.delete<{ success: boolean; message: string }>(endpoint);
      return response.data;
    } catch (error: any) {
      console.error(`Error disconnecting ${service}:`, error);
      throw error;
    }
  }

  /**
   * Complete OAuth flow for Outlook
   */
  async connectOutlook(familyId?: number): Promise<OAuthCallbackResponse> {
    const { auth_url } = await this.initiateOutlookOAuth(familyId);
    const result = await this.performOAuthFlow(auth_url, Linking.createURL('/oauth/callback?service=outlook'));
    if (!result) {
      return {
        success: false,
        message: 'OAuth flow did not complete',
      };
    }
    return result;
  }

  /**
   * Complete OAuth flow for OneDrive
   */
  async connectOneDrive(): Promise<OAuthCallbackResponse> {
    const { auth_url } = await this.initiateOneDriveOAuth();
    const result = await this.performOAuthFlow(auth_url, Linking.createURL('/oauth/callback?service=onedrive'));
    if (!result) {
      return {
        success: false,
        message: 'OAuth flow did not complete',
      };
    }
    return result;
  }

  /**
   * Complete OAuth flow for Google Drive
   */
  async connectGoogleDrive(): Promise<OAuthCallbackResponse> {
    const { auth_url } = await this.initiateGoogleDriveOAuth();
    const result = await this.performOAuthFlow(auth_url, Linking.createURL('/oauth/callback?service=googledrive'));
    if (!result) {
      return {
        success: false,
        message: 'OAuth flow did not complete',
      };
    }
    return result;
  }

  /**
   * Complete OAuth flow for Google Photos
   */
  async connectGooglePhotos(): Promise<OAuthCallbackResponse> {
    const { auth_url } = await this.initiateGooglePhotosOAuth();
    const result = await this.performOAuthFlow(auth_url, Linking.createURL('/oauth/callback?service=googlephotos'));
    if (!result) {
      return {
        success: false,
        message: 'OAuth flow did not complete',
      };
    }
    return result;
  }
}

export default new OAuthService();
