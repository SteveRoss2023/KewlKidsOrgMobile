import apiClient, { handleAPIError, APIError } from './api';
import { tokenStorage, storage, STORAGE_KEYS } from '../utils/storage';

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Registration data
 */
export interface RegisterData {
  email: string;
  password: string;
  password2: string;
  display_name?: string;
}

/**
 * Auth response
 */
export interface AuthResponse {
  access: string;
  refresh: string;
  user?: UserData;
}

/**
 * User data
 */
export interface UserData {
  id: number;
  email: string;
  display_name?: string;
  email_verified?: boolean;
}

/**
 * Authentication Service
 */
class AuthService {
  /**
   * Login user
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/login/', credentials);
      const { access, refresh, user } = response.data;

      // Store tokens
      await tokenStorage.saveTokens(access, refresh);
      
      // Store user data if available
      if (user) {
        await storage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
      }

      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/register/', data);
      const { access, refresh, user } = response.data;

      // Store tokens
      await tokenStorage.saveTokens(access, refresh);
      
      // Store user data if available
      if (user) {
        await storage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
      }

      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      // Clear tokens and user data
      await tokenStorage.clearTokens();
      await storage.removeItem(STORAGE_KEYS.USER_DATA);
    } catch (error) {
      console.error('Error during logout:', error);
      // Clear tokens anyway even if there's an error
      await tokenStorage.clearTokens();
      await storage.removeItem(STORAGE_KEYS.USER_DATA);
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await tokenStorage.getAccessToken();
    return !!token;
  }

  /**
   * Get current access token
   */
  async getAccessToken(): Promise<string | null> {
    return await tokenStorage.getAccessToken();
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<string> {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) {
        throw new APIError('No refresh token available', 401);
      }

      const response = await apiClient.post<{ access: string }>('/auth/refresh/', {
        refresh: refreshToken,
      });

      const { access } = response.data;
      await tokenStorage.saveTokens(access, refreshToken);

      return access;
    } catch (error) {
      await tokenStorage.clearTokens();
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get current user data (if available in token or from API)
   */
  async getCurrentUser(): Promise<UserData | null> {
    try {
      // If your backend has a /auth/me/ endpoint, use it here
      // const response = await apiClient.get<UserData>('/auth/me/');
      // return response.data;
      
      // For now, return null - you can decode JWT token if needed
      return null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Get user data from storage
   */
  async getUserData(): Promise<UserData | null> {
    try {
      const userDataString = await storage.getItem(STORAGE_KEYS.USER_DATA);
      if (userDataString) {
        return JSON.parse(userDataString);
      }
      return null;
    } catch (error) {
      console.error('Error getting user data:', error);
      return null;
    }
  }
}

export default new AuthService();

