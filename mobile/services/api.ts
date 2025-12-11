import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenStorage, STORAGE_KEYS } from '../utils/storage';

/**
 * API Configuration
 * On web, use localhost. On native (phone), use the computer's local IP address.
 * Update EXPO_PUBLIC_API_URL in .env file or set it to your computer's IP (e.g., http://10.0.0.25:8900/api)
 */
import { Platform } from 'react-native';

const getApiBaseUrl = (): string => {
  // Check if explicitly set in environment
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // On web, use localhost
  if (Platform.OS === 'web') {
    return 'http://localhost:8900/api';
  }
  
  // On native (phone), use the computer's local IP address
  // Update this IP address to match your computer's local network IP
  // You can find it by running: ipconfig (Windows) or ifconfig (Mac/Linux)
  return 'http://10.0.0.25:8900/api';
};

const API_BASE_URL = getApiBaseUrl();

/**
 * Create axios instance
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
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

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
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
        const refreshToken = await tokenStorage.getRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

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
        
        // You can add navigation logic here if needed
        // For now, we'll just reject the error
        return Promise.reject(refreshError);
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

  if (error.response) {
    // Server responded with error
    const status = error.response.status;
    const data = error.response.data;
    const message = (data as any)?.detail || (data as any)?.message || error.message;
    return new APIError(message, status, data);
  } else if (error.request) {
    // Request made but no response
    console.error('Network error - request made but no response. Check:', {
      baseURL: API_BASE_URL,
      url: error.config?.url,
      fullUrl: `${API_BASE_URL}${error.config?.url || ''}`,
    });
    return new APIError(`Network error - no response from server. URL: ${API_BASE_URL}${error.config?.url || ''}`, 0);
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

