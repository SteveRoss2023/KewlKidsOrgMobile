import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Family } from '../services/familyService';
import FamilyService from '../services/familyService';
import { storage, STORAGE_KEYS } from '../utils/storage';

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
  const loadFamilies = async () => {
    try {
      setLoading(true);
      const familiesData = await FamilyService.getFamilies();
      const familiesList = Array.isArray(familiesData) ? familiesData : [];
      setFamilies(familiesList);

      // Restore selected family from storage if available
      const savedFamilyId = await storage.getItem(STORAGE_KEYS.FAMILY_ID);
      if (savedFamilyId && familiesList.length > 0) {
        const savedFamily = familiesList.find(f => f.id === parseInt(savedFamilyId));
        if (savedFamily) {
          setSelectedFamilyState(savedFamily);
          return;
        }
      }

      // Auto-select first family if none selected
      if (!selectedFamily && familiesList.length > 0) {
        setSelectedFamilyState(familiesList[0]);
        await storage.setItem(STORAGE_KEYS.FAMILY_ID, familiesList[0].id.toString());
      }
    } catch (error) {
      console.error('Error loading families:', error);
      setFamilies([]);
    } finally {
      setLoading(false);
    }
  };

  // Set selected family and persist to storage
  const setSelectedFamily = async (family: Family | null) => {
    setSelectedFamilyState(family);
    if (family) {
      await storage.setItem(STORAGE_KEYS.FAMILY_ID, family.id.toString());
    } else {
      await storage.removeItem(STORAGE_KEYS.FAMILY_ID);
    }
  };

  // Refresh families list
  const refreshFamilies = async () => {
    await loadFamilies();
  };

  // Load families on mount
  useEffect(() => {
    loadFamilies();
  }, []);

  // Update selected family if it's no longer in the list
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
        // Update selected family with latest data
        setSelectedFamilyState(familyStillExists);
      }
    } else if (!selectedFamily && families.length > 0) {
      // No family selected but families available, select first
      setSelectedFamilyState(families[0]);
      storage.setItem(STORAGE_KEYS.FAMILY_ID, families[0].id.toString());
    }
  }, [families]);

  const value: FamilyContextType = {
    selectedFamily,
    setSelectedFamily,
    families,
    refreshFamilies,
    loading,
  };

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
};

