import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenStorage, STORAGE_KEYS } from '../utils/storage';
import navigationService from './navigationService';

/**
 * API Configuration
 * On web, use localhost. On native (phone), use the computer's local IP address.
 * Update EXPO_PUBLIC_API_URL in .env file or set it to your computer's IP (e.g., http://10.0.0.25:8900/api)
 */
import { Platform } from 'react-native';

const getApiBaseUrl = (): string => {
  // Check if explicitly set in environment
  if (process.env.EXPO_PUBLIC_API_URL) {
    const url = process.env.EXPO_PUBLIC_API_URL.trim();
    // Validate URL format
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.warn(`Invalid API URL format: ${url}. Should start with http:// or https://`);
    }
    return url;
  }

  // On web, detect if we're running on ngrok and use ngrok API URL
  if (Platform.OS === 'web') {
    // Check if we're accessing the app via ngrok
    if (typeof window !== 'undefined' && window.location.hostname.includes('ngrok')) {
      // If on ngrok web app, use ngrok API URL (same domain, different path)
      // Replace web app ngrok domain with API ngrok domain
      const hostname = window.location.hostname;
      // Assuming API is on kewlkidsorganizermobile.ngrok.app and web is on kewlkidsorganizermobile-web.ngrok.app
      if (hostname.includes('kewlkidsorganizermobile-web')) {
        return 'https://kewlkidsorganizermobile.ngrok.app/api';
      }
      // Fallback: use same domain for API
      return `https://${hostname.replace('-web', '')}/api`;
    }
    // Not on ngrok, use localhost
    return 'http://localhost:8900/api';
  }

  // On native (phone), use the computer's local IP address
  // Update this IP address to match your computer's local network IP
  // You can find it by running: ipconfig (Windows) or ifconfig (Mac/Linux)
  return 'http://10.0.0.25:8900/api';
};

const API_BASE_URL = getApiBaseUrl();

// Log API URL for debugging (only in development)
if (__DEV__) {
  console.log('API Base URL:', API_BASE_URL);
}

/**
 * Create axios instance
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased to 60 seconds for file uploads
  headers: {
    'Content-Type': 'application/json',
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

/**
 * Request interceptor - Add access token to requests
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await tokenStorage.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // For FormData (file uploads), don't set Content-Type - let axios set it with boundary
    // React Native FormData requires axios to automatically set Content-Type
    if (config.data instanceof FormData) {
      if (config.headers) {
        delete config.headers['Content-Type'];
      }
    } else if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
      // For JSON requests, ensure Content-Type is set
      if (config.headers) {
        config.headers['Content-Type'] = 'application/json';
      }
    }

    // Log request details in development
    if (__DEV__) {
      console.log('API Request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        fullUrl: `${config.baseURL}${config.url}`,
        hasData: !!config.data,
        dataType: config.data instanceof FormData ? 'FormData' : typeof config.data,
      });
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - Handle token refresh on 401
 */
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Check if this is an OAuth-related endpoint - don't redirect for these
    const isOAuthEndpoint = originalRequest.url?.includes('/oauth/') ||
                            originalRequest.url?.includes('/connection/') ||
                            originalRequest.url?.includes('/disconnect/') ||
                            originalRequest.url?.includes('/onedrive/') ||
                            originalRequest.url?.includes('/googledrive/') ||
                            originalRequest.url?.includes('/googlephotos/') ||
                            originalRequest.url?.includes('/calendar/outlook/') ||
                            originalRequest.url?.includes('/media-items/');

    // Check if error response indicates OAuth issue (not session issue)
    const errorData = error.response?.data as any;
    const isOAuthError = errorData?.requires_reconnect ||
                        errorData?.requires_refresh ||
                        errorData?.error?.toLowerCase().includes('oauth') ||
                        errorData?.error?.toLowerCase().includes('token') ||
                        errorData?.error?.toLowerCase().includes('session expired') ||
                        errorData?.error?.toLowerCase().includes('decrypt');

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // For OAuth endpoints with OAuth-specific errors, don't redirect - let the screen handle it
      if (isOAuthEndpoint && isOAuthError) {
        return Promise.reject(error);
      }

      // Check if we have a refresh token first
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) {
        // No refresh token available, clear tokens and redirect to login
        // But not for OAuth endpoints - let them handle the error
        if (!isOAuthEndpoint) {
          await tokenStorage.clearTokens();
          navigationService.navigateToLogin();
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers && token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {

        // Attempt to refresh the token
        const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
          refresh: refreshToken,
        });

        const { access } = response.data;
        await tokenStorage.saveTokens(access, refreshToken);

        // Update the original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access}`;
        }

        processQueue(null, access);
        isRefreshing = false;

        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        isRefreshing = false;

        // Clear tokens and redirect to login
        await tokenStorage.clearTokens();

        // Redirect to login page when authentication fails
        navigationService.navigateToLogin();

        return Promise.reject(refreshError);
      }
    }

    // If we get a 401 after already trying to refresh, redirect to login
    // But not for OAuth endpoints - let them handle the error
    if (error.response?.status === 401 && originalRequest._retry) {
      const isOAuthEndpoint = originalRequest.url?.includes('/oauth/') ||
                              originalRequest.url?.includes('/connection/') ||
                              originalRequest.url?.includes('/disconnect/') ||
                              originalRequest.url?.includes('/onedrive/') ||
                              originalRequest.url?.includes('/googledrive/') ||
                              originalRequest.url?.includes('/googlephotos/') ||
                              originalRequest.url?.includes('/calendar/outlook/') ||
                              originalRequest.url?.includes('/media-items/');

      if (!isOAuthEndpoint) {
        await tokenStorage.clearTokens();
        navigationService.navigateToLogin();
      }
    }

    return Promise.reject(error);
  }
);

/**
 * API Error types
 */
export class APIError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Handle API errors
 */
export const handleAPIError = (error: AxiosError): APIError => {
  // Don't log 404 errors - they're expected when endpoints don't exist yet
  const is404 = error.response?.status === 404;

  if (!is404) {
    console.log('API Error Details:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
      } : null,
      request: error.request ? 'Request made but no response' : null,
      config: {
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        method: error.config?.method,
      },
    });
  }

  if (error.response) {
    // Server responded with error
    const status = error.response.status;
    const data = error.response.data;

    // For 400 errors, log more details to help debug
    if (status === 400) {
      console.log('400 Bad Request Details:', JSON.stringify(data, null, 2));
    }

    // Try to extract a meaningful error message
    let message = error.message;
    if (data) {
      if (typeof data === 'string') {
        message = data;
      } else if ((data as any)?.detail) {
        message = (data as any).detail;
      } else if ((data as any)?.message) {
        message = (data as any).message;
      } else if ((data as any)?.photo) {
        // Handle field-specific errors (e.g., photo validation errors)
        const photoError = (data as any).photo;
        if (Array.isArray(photoError)) {
          message = photoError.join(', ');
        } else if (typeof photoError === 'string') {
          message = photoError;
        } else {
          message = JSON.stringify(photoError);
        }
      } else if ((data as any)?.display_name) {
        const displayNameError = (data as any).display_name;
        if (Array.isArray(displayNameError)) {
          message = displayNameError.join(', ');
        } else {
          message = displayNameError;
        }
      } else {
        // Try to stringify the whole error object
        message = JSON.stringify(data);
      }
    }

    return new APIError(message, status, data);
  } else if (error.request) {
    // Request made but no response
    const fullUrl = error.config?.url
      ? `${API_BASE_URL}${error.config.url.startsWith('/') ? '' : '/'}${error.config.url}`
      : API_BASE_URL;

    console.error('Network error - request made but no response. Check:', {
      baseURL: API_BASE_URL,
      url: error.config?.url,
      fullUrl: fullUrl,
      method: error.config?.method,
      timeout: error.code === 'ECONNABORTED' ? 'Request timeout' : 'Connection failed',
    });

    // Provide more helpful error message
    let errorMessage = `Network error - no response from server.`;
    if (error.code === 'ECONNABORTED') {
      errorMessage = `Request timeout - the server took too long to respond. This may happen with large file uploads.`;
    } else if (error.code === 'ERR_NETWORK') {
      errorMessage = `Network error - unable to reach server. Please check your internet connection and ensure the server is running.`;
    }
    errorMessage += ` URL: ${fullUrl}`;

    return new APIError(errorMessage, 0);
  } else {
    // Something else happened
    return new APIError(error.message || 'An unexpected error occurred', 0);
  }
};

/**
 * Health check
 */
export const healthCheck = async (): Promise<{ status: string; message: string }> => {
  try {
    const response = await apiClient.get('/health/');
    return response.data;
  } catch (error) {
    throw handleAPIError(error as AxiosError);
  }
};

export default apiClient;

