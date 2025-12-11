import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from '../utils/storage';

const THEME_STORAGE_KEY = 'app_theme';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: 'light' | 'dark';
  themePreference: Theme;
  setThemePreference: (preference: Theme) => void;
  toggleTheme: () => void;
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
    error: string;
    success: string;
    warning: string;
  };
}

const lightColors = {
  background: '#f5f5f5',
  surface: '#ffffff',
  text: '#333333',
  textSecondary: '#666666',
  border: '#e0e0e0',
  primary: '#007AFF',
  error: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
};

const darkColors = {
  background: '#000000',
  surface: '#1c1c1e',
  text: '#ffffff',
  textSecondary: '#98989d',
  border: '#38383a',
  primary: '#0a84ff',
  error: '#ff453a',
  success: '#30d158',
  warning: '#ff9f0a',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<Theme>('system');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Load theme preference from storage
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const saved = await storage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setThemePreferenceState(saved as Theme);
        }
      } catch (error) {
        console.error('Error loading theme preference:', error);
      }
    };
    loadThemePreference();
  }, []);

  // Update theme based on preference
  useEffect(() => {
    if (themePreference === 'system') {
      setTheme(systemColorScheme === 'dark' ? 'dark' : 'light');
    } else {
      setTheme(themePreference);
    }
  }, [themePreference, systemColorScheme]);

  const setThemePreference = async (preference: Theme) => {
    setThemePreferenceState(preference);
    try {
      await storage.setItem(THEME_STORAGE_KEY, preference);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setThemePreference(newTheme);
  };

  const colors = theme === 'dark' ? darkColors : lightColors;

  const value: ThemeContextType = {
    theme,
    themePreference,
    setThemePreference,
    toggleTheme,
    colors,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};


