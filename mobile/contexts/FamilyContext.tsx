import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Family } from '../services/familyService';
import FamilyService from '../services/familyService';
import { storage, STORAGE_KEYS } from '../utils/storage';
import AuthService from '../services/authService';

interface FamilyContextType {
  selectedFamily: Family | null;
  setSelectedFamily: (family: Family | null) => void;
  families: Family[];
  refreshFamilies: () => Promise<void>;
  loading: boolean;
}

const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export const useFamily = () => {
  const context = useContext(FamilyContext);
  if (!context) {
    throw new Error('useFamily must be used within FamilyProvider');
  }
  return context;
};

interface FamilyProviderProps {
  children: ReactNode;
}

export const FamilyProvider: React.FC<FamilyProviderProps> = ({ children }) => {
  const [selectedFamily, setSelectedFamilyState] = useState<Family | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);

  // Load families and restore selected family from storage
  const loadFamilies = React.useCallback(async () => {
    try {
      setLoading(true);
      console.log('[FamilyContext] Loading families...');
      const familiesData = await FamilyService.getFamilies();
      const familiesList = Array.isArray(familiesData) ? familiesData : [];
      console.log('[FamilyContext] Loaded', familiesList.length, 'families');
      setFamilies(familiesList);

      // Restore selected family from storage if available
      const savedFamilyId = await storage.getItem(STORAGE_KEYS.FAMILY_ID);
      console.log('[FamilyContext] Saved family ID from storage:', savedFamilyId);
      if (savedFamilyId && familiesList.length > 0) {
        const savedFamily = familiesList.find(f => f.id === parseInt(savedFamilyId));
        if (savedFamily) {
          console.log('[FamilyContext] Restoring saved family:', savedFamily.name);
          setSelectedFamilyState(savedFamily);
          setLoading(false);
          return;
        }
      }

      // Auto-select first family if none selected (check current state, not parameter)
      setSelectedFamilyState((currentSelected) => {
        if (!currentSelected && familiesList.length > 0) {
          console.log('[FamilyContext] Auto-selecting first family:', familiesList[0].name);
          storage.setItem(STORAGE_KEYS.FAMILY_ID, familiesList[0].id.toString());
          return familiesList[0];
        }
        return currentSelected;
      });
    } catch (error) {
      console.error('[FamilyContext] Error loading families:', error);
      const errorDetails = error instanceof Error ? error.message : String(error);
      console.error('[FamilyContext] Error details:', errorDetails);
      setFamilies([]);
      setSelectedFamilyState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set selected family and persist to storage
  const setSelectedFamily = async (family: Family | null) => {
    setSelectedFamilyState(family);
    if (family) {
      await storage.setItem(STORAGE_KEYS.FAMILY_ID, family.id.toString());
    } else {
      await storage.removeItem(STORAGE_KEYS.FAMILY_ID);
    }
  };

  // Refresh families list - memoized to prevent infinite loops
  const refreshFamilies = React.useCallback(async () => {
    await loadFamilies();
  }, [loadFamilies]);

  // Load families on mount
  useEffect(() => {
    let isMounted = true;
    
    const checkAuthAndLoad = async () => {
      try {
        console.log('[FamilyContext] Checking authentication...');
        // Check if authenticated
        const isAuthenticated = await AuthService.isAuthenticated();
        console.log('[FamilyContext] Authentication status:', isAuthenticated);
        if (!isMounted) return;
        
        if (isAuthenticated) {
          // Load families - the API will handle authentication
          await loadFamilies();
        } else {
          console.log('[FamilyContext] Not authenticated, clearing families');
          // Not authenticated, clear families
          if (isMounted) {
            setFamilies([]);
            setSelectedFamilyState(null);
            setLoading(false);
          }
        }
      } catch (error: any) {
        console.error('[FamilyContext] Error in checkAuthAndLoad:', error);
        const errorDetails = error instanceof Error ? error.message : String(error);
        console.error('[FamilyContext] Error details:', errorDetails);
        // On error, still set loading to false so UI doesn't spin forever
        if (isMounted) {
          setLoading(false);
          setFamilies([]);
          setSelectedFamilyState(null);
        }
      }
    };
    
    checkAuthAndLoad();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // Update selected family if it's no longer in the list or if it has been updated
  useEffect(() => {
    if (selectedFamily && families.length > 0) {
      const familyStillExists = families.find(f => f.id === selectedFamily.id);
      if (!familyStillExists) {
        // Selected family was deleted, select first available
        if (families.length > 0) {
          setSelectedFamilyState(families[0]);
          storage.setItem(STORAGE_KEYS.FAMILY_ID, families[0].id.toString());
        } else {
          setSelectedFamilyState(null);
          storage.removeItem(STORAGE_KEYS.FAMILY_ID);
        }
      } else {
        // Update selected family with latest data (including color, name, etc.)
        // Only update if the data has actually changed to avoid unnecessary re-renders
        if (familyStillExists.name !== selectedFamily.name || 
            familyStillExists.color !== selectedFamily.color ||
            familyStillExists.updated_at !== selectedFamily.updated_at) {
          setSelectedFamilyState(familyStillExists);
        }
      }
    } else if (!selectedFamily && families.length > 0) {
      // No family selected but families available, select first
      setSelectedFamilyState(families[0]);
      storage.setItem(STORAGE_KEYS.FAMILY_ID, families[0].id.toString());
    }
  }, [families, selectedFamily]);

  const value: FamilyContextType = {
    selectedFamily,
    setSelectedFamily,
    families,
    refreshFamilies,
    loading,
  };

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
};
