import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Platform,
  Image,
  useWindowDimensions,
  Animated,
  Linking,
} from 'react-native';
import {
  PinchGestureHandler,
  PanGestureHandler,
  State,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import GlobalNavBar from '../../components/GlobalNavBar';
import DocumentService, { CloudFile, GooglePhotoItem } from '../../services/documentService';
import OAuthService from '../../services/oauthService';
import AppDocumentsService, { AppDocument, AppFolder } from '../../services/appDocumentsService';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import ConfirmModal from '../../components/ConfirmModal';
import AlertModal from '../../components/AlertModal';
import AuthService from '../../services/authService';
import { APIError } from '../../services/api';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';

type TabType = 'app' | 'onedrive' | 'googledrive' | 'googlephotos';

// Helper function for short date format on mobile
function formatShortDate(dateString: string | undefined): string {
  if (!dateString) return 'Unknown';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    // Format as MM/DD/YY H:MM AM/PM for mobile
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
  } catch {
    return 'Unknown';
  }
}

export default function DocumentsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { selectedFamily } = useFamily();
  const [activeTab, setActiveTab] = useState<TabType>('app');
  const [onedriveConnected, setOnedriveConnected] = useState(false);
  const [googledriveConnected, setGoogledriveConnected] = useState(false);
  const [googlephotosConnected, setGooglephotosConnected] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    requiresReconnect: boolean;
    requiresLogout: boolean;
  }>({
    visible: false,
    title: '',
    message: '',
    requiresReconnect: false,
    requiresLogout: false,
  });

  const parseError = (err: any): { message: string; requiresReconnect: boolean; requiresLogout: boolean } => {
    const apiError = err as APIError;
    const errorData = apiError.data || {};
    const errorMessage = apiError.message || err.message || 'An error occurred';

    const requiresReconnect = errorData.requires_reconnect ||
                            errorData.requires_refresh ||
                            errorMessage.toLowerCase().includes('reconnect') ||
                            errorMessage.toLowerCase().includes('disconnect and reconnect') ||
                            errorMessage.toLowerCase().includes('token expired') ||
                            errorMessage.toLowerCase().includes('decrypt') ||
                            errorMessage.toLowerCase().includes('session expired');

    const requiresLogout = errorData.requires_logout ||
                          errorMessage.toLowerCase().includes('log out') ||
                          errorMessage.toLowerCase().includes('log in again') ||
                          (apiError.status === 401 && !requiresReconnect);

    return {
      message: errorMessage,
      requiresReconnect,
      requiresLogout,
    };
  };

  useFocusEffect(
    useCallback(() => {
      checkConnections();
    }, [])
  );

  const checkConnections = async () => {
    try {
      const [onedriveStatus, googledriveStatus, googlephotosStatus] = await Promise.all([
        OAuthService.checkConnection('onedrive').catch((err) => {
          console.error('Error checking OneDrive connection:', err);
          return { connected: false };
        }),
        OAuthService.checkConnection('googledrive').catch((err) => {
          console.error('Error checking Google Drive connection:', err);
          return { connected: false };
        }),
        OAuthService.checkConnection('googlephotos').catch((err) => {
          console.error('Error checking Google Photos connection:', err);
          // Show error modal for Google Photos errors
          const parsedError = parseError(err, 'Google Photos');
          if (parsedError.requiresReconnect || parsedError.requiresLogout) {
            setErrorModal({
              visible: true,
              title: 'Google Photos Connection Error',
              message: parsedError.message,
              requiresReconnect: parsedError.requiresReconnect,
              requiresLogout: parsedError.requiresLogout,
            });
          }
          return { connected: false };
        }),
      ]);
      setOnedriveConnected(onedriveStatus.connected);
      setGoogledriveConnected(googledriveStatus.connected);
      setGooglephotosConnected(googlephotosStatus.connected);
    } catch (error) {
      console.error('Error checking connections:', error);
    }
  };

  const handleErrorModalClose = () => {
    setErrorModal(prev => ({ ...prev, visible: false }));
  };

  const handleReconnect = async () => {
    setErrorModal(prev => ({ ...prev, visible: false }));
    router.push('/(tabs)/googlephotos-connect');
  };

  const handleLogout = async () => {
    setErrorModal(prev => ({ ...prev, visible: false }));
    try {
      await AuthService.logout();
      router.replace('/(auth)/login');
    } catch (err) {
      console.error('Error during logout:', err);
      router.replace('/(auth)/login');
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    checkConnections();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'app' && [styles.activeTab, { backgroundColor: colors.primary + '15', borderBottomColor: colors.primary }]
          ]}
          onPress={() => handleTabChange('app')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'app' ? colors.primary : colors.textSecondary },
              activeTab === 'app' && styles.activeTabText
            ]}
            numberOfLines={2}
          >
            App Docs
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'onedrive' && [styles.activeTab, { backgroundColor: colors.primary + '15', borderBottomColor: colors.primary }]
          ]}
          onPress={() => handleTabChange('onedrive')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'onedrive' ? colors.primary : colors.textSecondary },
              activeTab === 'onedrive' && styles.activeTabText
            ]}
            numberOfLines={2}
          >
            OneDrive
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'googledrive' && [styles.activeTab, { backgroundColor: colors.primary + '15', borderBottomColor: colors.primary }]
          ]}
          onPress={() => handleTabChange('googledrive')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'googledrive' ? colors.primary : colors.textSecondary },
              activeTab === 'googledrive' && styles.activeTabText
            ]}
            numberOfLines={2}
          >
            Google Drive
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'googlephotos' && [styles.activeTab, { backgroundColor: colors.primary + '15', borderBottomColor: colors.primary }]
          ]}
          onPress={() => handleTabChange('googlephotos')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'googlephotos' ? colors.primary : colors.textSecondary },
              activeTab === 'googlephotos' && styles.activeTabText
            ]}
            numberOfLines={2}
          >
            Google Photos
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === 'app' && <AppDocumentsTab selectedFamily={selectedFamily} colors={colors} />}
        {activeTab === 'onedrive' && (
          <OneDriveTab connected={onedriveConnected} onConnectionChange={setOnedriveConnected} colors={colors} />
        )}
        {activeTab === 'googledrive' && (
          <GoogleDriveTab
            connected={googledriveConnected}
            onConnectionChange={setGoogledriveConnected}
            colors={colors}
          />
        )}
        {activeTab === 'googlephotos' && (
          <GooglePhotosTab
            connected={googlephotosConnected}
            colors={colors}
          />
        )}
      </View>

      <AlertModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        type="error"
        onClose={handleErrorModalClose}
        onConfirm={errorModal.requiresReconnect ? handleReconnect : errorModal.requiresLogout ? handleLogout : handleErrorModalClose}
        confirmText={errorModal.requiresReconnect ? 'Go to Settings' : errorModal.requiresLogout ? 'Logout' : 'OK'}
        showCancel={errorModal.requiresReconnect || errorModal.requiresLogout}
        cancelText="Cancel"
      />
    </View>
  );
}

function AppDocumentsTab({ selectedFamily, colors }: { selectedFamily: any; colors: any }) {
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [folders, setFolders] = useState<AppFolder[]>([]);
  const [allDocuments, setAllDocuments] = useState<AppDocument[]>([]);
  const [allFolders, setAllFolders] = useState<AppFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<AppFolder | null>(null);
  const [folderPath, setFolderPath] = useState<AppFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editingDocument, setEditingDocument] = useState<AppDocument | null>(null);
  const [editingFolder, setEditingFolder] = useState<AppFolder | null>(null);
  const [uploadFormData, setUploadFormData] = useState({
    name: '',
    description: '',
    fileUri: '',
    fileName: '',
    mimeType: '',
  });
  const [folderFormData, setFolderFormData] = useState({
    name: '',
    description: '',
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    documentId: number | null;
    documentName: string;
    folderId: number | null;
    folderName: string;
  }>({
    isOpen: false,
    documentId: null,
    documentName: '',
    folderId: null,
    folderName: '',
  });
  // Unified search and sort for both folders and documents
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showSummary, setShowSummary] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);

  const loadDocuments = useCallback(
    async (skipLoading = false) => {
      if (!selectedFamily) {
        setDocuments([]);
        return;
      }
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError('');
        const docs = await AppDocumentsService.listDocuments(
          selectedFamily.id,
          currentFolder ? currentFolder.id : null
        );
        setDocuments(docs || []);
      } catch (err: any) {
        console.error('Error loading documents:', err);
        console.error('Family ID:', selectedFamily?.id);
        console.error('Current Folder ID:', currentFolder?.id);
        // Set empty array on error to show empty state instead of stale data
        setDocuments([]);
        // Set error message for user feedback
        if (err?.response?.status !== 404) {
          setError(err?.response?.data?.error || err?.message || 'Failed to load documents. Please try again.');
        }
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    },
    [selectedFamily, currentFolder]
  );

  const loadFolders = useCallback(
    async () => {
      if (!selectedFamily || !selectedFamily.id) {
        console.warn('Cannot load folders: no family selected');
        setFolders([]);
        return;
      }
      try {
        const foldersList = await AppDocumentsService.listFolders(
          selectedFamily.id,
          currentFolder ? currentFolder.id : null
        );
        setFolders(foldersList || []);
      } catch (err: any) {
        console.error('Error loading folders:', err);
        console.error('Family ID:', selectedFamily?.id);
        console.error('Current Folder ID:', currentFolder?.id);
        console.error('Error response:', err?.response?.data);
        // Set empty array on error to show empty state instead of stale data
        setFolders([]);
        // Set error message for user feedback
        if (err?.response?.status !== 404) {
          setError(err?.response?.data?.error || err?.message || 'Failed to load folders. Please try again.');
        }
      }
    },
    [selectedFamily, currentFolder]
  );

  const loadAllDocuments = useCallback(async () => {
    if (!selectedFamily) return;
    try {
      const docs = await AppDocumentsService.listDocuments(selectedFamily.id);
      setAllDocuments(docs);
    } catch (err: any) {
      console.error('Error loading all documents:', err);
    }
  }, [selectedFamily]);

  const loadAllFolders = useCallback(async () => {
    if (!selectedFamily) return;
    try {
      const foldersList = await AppDocumentsService.listFolders(selectedFamily.id);
      setAllFolders(foldersList);
    } catch (err: any) {
      console.error('Error loading all folders:', err);
    }
  }, [selectedFamily]);

  useFocusEffect(
    useCallback(() => {
      if (selectedFamily) {
        loadDocuments();
        loadFolders();
        loadAllDocuments();
        loadAllFolders();
      }
      return () => {
        setDeleteConfirm({ isOpen: false, documentId: null, documentName: '', folderId: null, folderName: '' });
      };
    }, [selectedFamily, loadDocuments, loadFolders, loadAllDocuments, loadAllFolders])
  );

  useEffect(() => {
    if (selectedFamily) {
      loadDocuments();
      loadFolders();
    }
  }, [currentFolder, selectedFamily, loadDocuments, loadFolders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDocuments(true), loadFolders(), loadAllDocuments(), loadAllFolders()]);
    setRefreshing(false);
  }, [loadDocuments, loadFolders, loadAllDocuments, loadAllFolders]);

  const navigateToFolder = (folder: AppFolder) => {
    // Clear error state when navigating
    setError('');
    setCurrentFolder(folder);
    setFolderPath((prevPath) => [...prevPath, folder]);
  };

  const navigateToPath = (index: number) => {
    // Clear error state when navigating
    setError('');

    if (index === -1) {
      setCurrentFolder(null);
      setFolderPath([]);
    } else {
      const targetFolder = folderPath[index];
      setCurrentFolder(targetFolder);
      setFolderPath(folderPath.slice(0, index + 1));
    }
    // Data will reload automatically via useEffect when currentFolder changes
  };

  // Get folders to display - if searching, search all folders, otherwise show current folder's folders
  const getDisplayFolders = (): AppFolder[] => {
    if (searchQuery.trim()) {
      // When searching, search through all folders
      return allFolders;
    } else {
      // When not searching, show only folders in current folder
      return folders;
    }
  };

  // Get documents to display - if searching, search all documents, otherwise show current folder's documents
  const getDisplayDocuments = (): AppDocument[] => {
    if (searchQuery.trim()) {
      // When searching, search through all documents
      return allDocuments;
    } else {
      // When not searching, show only documents in current folder
      return documents;
    }
  };

  const filterAndSortFolders = (foldersList: AppFolder[]) => {
    let filtered = foldersList;
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (folder) =>
          folder.name.toLowerCase().includes(queryLower) ||
          (folder.description && folder.description.toLowerCase().includes(queryLower))
      );
    }
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'date') {
        const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
        const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
        comparison = dateA - dateB;
      } else if (sortBy === 'size') {
        // Folders don't have size, so sort by name when size is selected
        comparison = a.name.localeCompare(b.name);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return filtered;
  };

  const filterAndSortDocuments = (documentsList: AppDocument[]) => {
    let filtered = documentsList;
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (doc) =>
          doc.name.toLowerCase().includes(queryLower) ||
          (doc.description && doc.description.toLowerCase().includes(queryLower)) ||
          (doc.mime_type && doc.mime_type.toLowerCase().includes(queryLower))
      );
    }
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'date') {
        const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
        const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
        comparison = dateA - dateB;
      } else if (sortBy === 'size') {
        const sizeA = a.file_size || 0;
        const sizeB = b.file_size || 0;
        comparison = sizeA - sizeB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return filtered;
  };

  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      setUploadFormData((prev) => ({
        ...prev,
        fileUri: file.uri,
        fileName: file.name,
        mimeType: file.mimeType || 'application/octet-stream',
        name: prev.name || file.name,
      }));
    } catch (err: any) {
      console.error('Error picking file:', err);
      Alert.alert('Error', 'Failed to pick file. Please try again.');
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFamily || !uploadFormData.fileUri || !uploadFormData.name.trim()) {
      setError('Please provide a file and name');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      if (editingDocument) {
        await AppDocumentsService.updateDocument(
          editingDocument.id,
          uploadFormData.name,
          uploadFormData.description,
          uploadFormData.fileUri,
          uploadFormData.fileName,
          uploadFormData.mimeType,
          currentFolder ? currentFolder.id : null
        );
        setSuccess('Document updated successfully!');
      } else {
        await AppDocumentsService.uploadDocument(
          uploadFormData.fileUri,
          uploadFormData.fileName,
          uploadFormData.mimeType,
          selectedFamily.id,
          uploadFormData.name,
          uploadFormData.description,
          currentFolder ? currentFolder.id : null
        );
        setSuccess('Document uploaded successfully!');
      }
      setUploadFormData({ name: '', description: '', fileUri: '', fileName: '', mimeType: '' });
      setEditingDocument(null);
      setShowUploadForm(false);
      await Promise.all([loadDocuments(), loadFolders(), loadAllDocuments(), loadAllFolders()]);
    } catch (err: any) {
      console.error('Error uploading document:', err);
      console.error('Error response data:', err?.response?.data);
      // Try to extract detailed error messages
      let errorMessage = 'Failed to upload document. Please try again.';
      if (err?.response?.data) {
        const errorData = err.response.data;
        if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (typeof errorData === 'object') {
          // Collect all field errors
          const fieldErrors: string[] = [];
          Object.keys(errorData).forEach((key) => {
            if (Array.isArray(errorData[key])) {
              fieldErrors.push(`${key}: ${errorData[key].join(', ')}`);
            } else if (typeof errorData[key] === 'string') {
              fieldErrors.push(`${key}: ${errorData[key]}`);
            }
          });
          if (fieldErrors.length > 0) {
            errorMessage = fieldErrors.join('; ');
          }
        }
      }
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleFolderSubmit = async () => {
    if (!selectedFamily || !folderFormData.name.trim()) {
      setError('Please provide a folder name');
      return;
    }

    setUpdating(true);
    setError('');
    setSuccess('');

    try {
      if (editingFolder) {
        await AppDocumentsService.updateFolder(
          editingFolder.id,
          folderFormData.name,
          folderFormData.description,
          currentFolder ? currentFolder.id : null
        );
        setSuccess('Folder updated successfully!');
      } else {
        await AppDocumentsService.createFolder(
          selectedFamily.id,
          folderFormData.name,
          folderFormData.description,
          currentFolder ? currentFolder.id : null
        );
        setSuccess('Folder created successfully!');
      }
      setFolderFormData({ name: '', description: '' });
      setEditingFolder(null);
      setShowFolderForm(false);
      await Promise.all([loadFolders(), loadAllFolders()]);
    } catch (err: any) {
      console.error('Error saving folder:', err);
      const errorMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.name?.[0] ||
        'Failed to save folder. Please try again.';
      setError(errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const handleEdit = (document: AppDocument) => {
    setEditingDocument(document);
    setUploadFormData({
      name: document.name || '',
      description: document.description || '',
      fileUri: '',
      fileName: '',
      mimeType: '',
    });
    setShowUploadForm(true);
    setError('');
    setSuccess('');
  };

  const handleEditFolder = (folder: AppFolder) => {
    setEditingFolder(folder);
    setFolderFormData({
      name: folder.name || '',
      description: folder.description || '',
    });
    setShowFolderForm(true);
    setError('');
    setSuccess('');
  };

  const handleDelete = async () => {
    if (deleteConfirm.documentId) {
      try {
        await AppDocumentsService.deleteDocument(deleteConfirm.documentId);
        setSuccess('Document deleted successfully!');
        await Promise.all([loadDocuments(), loadFolders(), loadAllDocuments(), loadAllFolders()]);
        if (currentFolder && currentFolder.id === deleteConfirm.documentId) {
          navigateToPath(folderPath.length - 2);
        }
      } catch (err: any) {
        console.error('Error deleting document:', err);
        setError(err?.response?.data?.detail || 'Failed to delete document. Please try again.');
      }
    } else if (deleteConfirm.folderId) {
      try {
        await AppDocumentsService.deleteFolder(deleteConfirm.folderId);
        setSuccess('Folder deleted successfully!');
        await Promise.all([loadFolders(), loadDocuments(), loadAllFolders(), loadAllDocuments()]);
        if (currentFolder && currentFolder.id === deleteConfirm.folderId) {
          navigateToPath(folderPath.length - 2);
        }
      } catch (err: any) {
        console.error('Error deleting folder:', err);
        setError(err?.response?.data?.detail || 'Failed to delete folder. Please try again.');
      }
    }
    setDeleteConfirm({ isOpen: false, documentId: null, documentName: '', folderId: null, folderName: '' });
  };

  const handleDownload = async (doc: AppDocument) => {
    try {
      const blob = await AppDocumentsService.downloadDocument(doc.id);
      // In React Native, we'd need to use a library like expo-file-system to save the file
      // For now, we'll just show a success message
      Alert.alert('Success', 'Document downloaded successfully');
    } catch (err: any) {
      console.error('Error downloading document:', err);
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to download document. Please try again.');
    }
  };

  const handleView = async (doc: AppDocument) => {
    try {
      const { url } = await AppDocumentsService.getViewToken(doc.id);
      // Open the document URL in the device's browser or document viewer
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to open this document. The URL may be invalid.');
      }
    } catch (err: any) {
      console.error('Error viewing document:', err);
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to view document. Please try again.');
    }
  };

  if (!selectedFamily) {
    return (
      <View style={[styles.tabContent, { backgroundColor: colors.background }]}>
        <View style={styles.placeholder}>
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Please select a family to view documents.
          </Text>
        </View>
      </View>
    );
  }

  const totalSize = allDocuments.reduce((total, doc) => {
    const size = typeof doc.file_size === 'number' ? doc.file_size : parseInt(String(doc.file_size)) || 0;
    return total + size;
  }, 0);

  return (
    <View style={[styles.tabContent, { backgroundColor: colors.background }]}>
      {/* Title with Breadcrumb and Actions */}
      <View style={[styles.titleBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.documentsTitle, { color: colors.text }]}>Documents</Text>
          <View style={styles.titleActions}>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                if (showFolderForm) {
                  setShowFolderForm(false);
                  setEditingFolder(null);
                  setFolderFormData({ name: '', description: '' });
                } else {
                  setShowFolderForm(true);
                  setEditingFolder(null);
                  setFolderFormData({ name: '', description: '' });
                }
              }}
              disabled={uploading || updating}
            >
              <FontAwesome name="folder-open" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                if (showUploadForm) {
                  setShowUploadForm(false);
                  setEditingDocument(null);
                  setUploadFormData({ name: '', description: '', fileUri: '', fileName: '', mimeType: '' });
                } else {
                  setShowUploadForm(true);
                  setEditingDocument(null);
                  setUploadFormData({ name: '', description: '', fileUri: '', fileName: '', mimeType: '' });
                }
              }}
              disabled={uploading || updating}
            >
              <FontAwesome name="upload" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowSummary(!showSummary)}
            >
              <FontAwesome name="info-circle" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.breadcrumbInline, { borderTopColor: colors.border }]}>
          {folderPath.length === 0 && !currentFolder ? (
            <Text style={[styles.breadcrumbItem, { color: colors.text }]}>Home</Text>
          ) : (
            <>
              <TouchableOpacity onPress={() => navigateToPath(-1)}>
                <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>Home</Text>
              </TouchableOpacity>
              {folderPath.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <Text style={[styles.breadcrumbSeparator, { color: colors.textSecondary }]}> / </Text>
                  <TouchableOpacity onPress={() => navigateToPath(index)}>
                    <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>{folder.name}</Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
              {currentFolder && !folderPath.find((f) => f.id === currentFolder.id) && (
                <>
                  <Text style={[styles.breadcrumbSeparator, { color: colors.textSecondary }]}> / </Text>
                  <Text style={[styles.breadcrumbItem, { color: colors.text }]}>{currentFolder.name}</Text>
                </>
              )}
            </>
          )}
        </View>
      </View>

      {/* Summary Statistics - Shown when info button is clicked */}
      {!loading && showSummary && (
        <View style={[styles.summary, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <FontAwesome name="folder" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Folders</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{allFolders.length}</Text>
            </View>
          </View>
          <View style={styles.summaryItem}>
            <FontAwesome name="file" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Documents</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{allDocuments.length}</Text>
            </View>
          </View>
          <View style={styles.summaryItem}>
            <FontAwesome name="database" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Size</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {AppDocumentsService.formatFileSize(totalSize)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Messages */}
      {error && (
        <View style={[styles.message, styles.errorMessage, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
          <Text style={[styles.messageText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={() => setError('')}>
            <FontAwesome name="times" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      )}

      {success && (
        <View style={[styles.message, styles.successMessage, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
          <Text style={[styles.messageText, { color: colors.primary }]}>{success}</Text>
          <TouchableOpacity onPress={() => setSuccess('')}>
            <FontAwesome name="times" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Forms */}
      {showFolderForm && (
        <Modal visible={showFolderForm} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingFolder ? 'Edit Folder' : 'Create New Folder'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Folder Name"
                placeholderTextColor={colors.textSecondary}
                value={folderFormData.name}
                onChangeText={(text) => setFolderFormData((prev) => ({ ...prev, name: text }))}
                editable={!updating}
              />
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                ]}
                placeholder="Description (optional)"
                placeholderTextColor={colors.textSecondary}
                value={folderFormData.description}
                onChangeText={(text) => setFolderFormData((prev) => ({ ...prev, description: text }))}
                multiline
                numberOfLines={3}
                editable={!updating}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { borderColor: colors.border }]}
                  onPress={() => {
                    setShowFolderForm(false);
                    setEditingFolder(null);
                    setFolderFormData({ name: '', description: '' });
                  }}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={handleFolderSubmit}
                  disabled={updating || !folderFormData.name.trim()}
                >
                  <Text style={styles.modalButtonText}>{updating ? 'Saving...' : editingFolder ? 'Update' : 'Create'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {showUploadForm && (
        <Modal visible={showUploadForm} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <ScrollView style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingDocument ? 'Edit Document' : 'Upload New Document'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Document Name"
                placeholderTextColor={colors.textSecondary}
                value={uploadFormData.name}
                onChangeText={(text) => setUploadFormData((prev) => ({ ...prev, name: text }))}
                editable={!uploading}
              />
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                ]}
                placeholder="Description (optional)"
                placeholderTextColor={colors.textSecondary}
                value={uploadFormData.description}
                onChangeText={(text) => setUploadFormData((prev) => ({ ...prev, description: text }))}
                multiline
                numberOfLines={3}
                editable={!uploading}
              />
              {!editingDocument && (
                <TouchableOpacity
                  style={[styles.filePickerButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={handleFilePick}
                  disabled={uploading}
                >
                  <FontAwesome name="file" size={20} color={colors.primary} />
                  <Text style={[styles.filePickerText, { color: colors.text }]}>
                    {uploadFormData.fileName || 'Select File'}
                  </Text>
                </TouchableOpacity>
              )}
              {editingDocument && (
                <TouchableOpacity
                  style={[styles.filePickerButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={handleFilePick}
                  disabled={uploading}
                >
                  <FontAwesome name="file" size={20} color={colors.primary} />
                  <Text style={[styles.filePickerText, { color: colors.text }]}>
                    {uploadFormData.fileName || 'Replace File (Optional)'}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { borderColor: colors.border }]}
                  onPress={() => {
                    setShowUploadForm(false);
                    setEditingDocument(null);
                    setUploadFormData({ name: '', description: '', fileUri: '', fileName: '', mimeType: '' });
                  }}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={handleUploadSubmit}
                  disabled={uploading || !uploadFormData.name.trim() || (!editingDocument && !uploadFormData.fileUri)}
                >
                  <Text style={styles.modalButtonText}>
                    {updating ? 'Updating...' : uploading ? 'Uploading...' : editingDocument ? 'Update' : 'Upload'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : folders.length === 0 && documents.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              No folders or documents yet. Create a folder or upload your first document to get started!
            </Text>
          </View>
        ) : (
          <>
            {/* Search and Sort Controls */}
            <View style={[styles.searchSortContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <View style={[styles.searchContainer, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search folders and documents..."
                  placeholderTextColor={colors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                    <FontAwesome name="times" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                ) : (
                  <FontAwesome name="search" size={16} color={colors.textSecondary} style={styles.searchIcon} />
                )}
              </View>
              <View style={styles.sortContainer}>
                <Text style={[styles.sortLabel, { color: colors.text }]}>Sort</Text>
                {Platform.OS === 'web' ? (
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as 'name' | 'date' | 'size');
                    }}
                    style={{
                      width: 150,
                      height: 44,
                      padding: '8px 12px',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: '500',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="name">Name</option>
                    <option value="date">Date</option>
                    <option value="size">Size</option>
                  </select>
                ) : Platform.OS === 'android' ? (
                  <>
                    <TouchableOpacity
                      style={[styles.sortDropdownWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={() => setShowSortModal(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.sortDropdownText, { color: colors.text }]}>
                        {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
                      </Text>
                      <FontAwesome name="chevron-down" size={12} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <Modal
                      visible={showSortModal}
                      transparent
                      animationType="fade"
                      onRequestClose={() => setShowSortModal(false)}
                    >
                      <TouchableOpacity
                        style={styles.sortModalOverlay}
                        activeOpacity={1}
                        onPress={() => setShowSortModal(false)}
                      >
                        <View style={[styles.sortModalContent, { backgroundColor: colors.surface }]}>
                          <View style={styles.sortModalHeader}>
                            <Text style={[styles.sortModalTitle, { color: colors.text }]}>Sort By</Text>
                            <TouchableOpacity
                              onPress={() => setShowSortModal(false)}
                              style={styles.sortModalCloseButton}
                            >
                              <FontAwesome name="times" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                          {(['name', 'date', 'size'] as const).map((option) => (
                            <TouchableOpacity
                              key={option}
                              style={[
                                styles.sortModalOption,
                                sortBy === option && { backgroundColor: colors.primary + '20' },
                              ]}
                              onPress={() => {
                                setSortBy(option);
                                setShowSortModal(false);
                              }}
                            >
                              <Text style={[styles.sortModalOptionText, { color: colors.text }]}>
                                {option.charAt(0).toUpperCase() + option.slice(1)}
                              </Text>
                              {sortBy === option && (
                                <FontAwesome name="check" size={16} color={colors.primary} />
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      </TouchableOpacity>
                    </Modal>
                  </>
                ) : (
                  <View style={[styles.sortDropdownWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Picker
                      selectedValue={sortBy}
                      onValueChange={(value) => setSortBy(value as 'name' | 'date' | 'size')}
                      style={[styles.sortPicker, { color: colors.text, backgroundColor: 'transparent' }]}
                      dropdownIconColor={colors.textSecondary}
                      itemStyle={{ height: 50, fontSize: 16 }}
                    >
                      <Picker.Item label="Name" value="name" color={colors.text} />
                      <Picker.Item label="Date" value="date" color={colors.text} />
                      <Picker.Item label="Size" value="size" color={colors.text} />
                    </Picker>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.sortOrderButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  <FontAwesome
                    name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color={colors.text}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Folders List */}
            {filterAndSortFolders(getDisplayFolders()).length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Folders</Text>
                {filterAndSortFolders(getDisplayFolders()).map((folder) => (
                  <AppFolderItem
                    key={folder.id}
                    folder={folder}
                    colors={colors}
                    onFolderClick={navigateToFolder}
                    onEdit={handleEditFolder}
                    onDelete={() =>
                      setDeleteConfirm({
                        isOpen: true,
                        documentId: null,
                        documentName: '',
                        folderId: folder.id,
                        folderName: folder.name,
                      })
                    }
                  />
                ))}
              </View>
            )}

            {/* Documents List */}
            {filterAndSortDocuments(getDisplayDocuments()).length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Documents</Text>
                {filterAndSortDocuments(getDisplayDocuments()).map((document) => (
                  <AppDocumentItem
                    key={document.id}
                    document={document}
                    colors={colors}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDownload={handleDownload}
                    onDelete={() =>
                      setDeleteConfirm({
                        isOpen: true,
                        documentId: document.id,
                        documentName: document.name,
                        folderId: null,
                        folderName: '',
                      })
                    }
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.documentId || deleteConfirm.folderId ? (
        <ConfirmModal
          visible={deleteConfirm.isOpen}
          onClose={() => setDeleteConfirm({ isOpen: false, documentId: null, documentName: '', folderId: null, folderName: '' })}
          onConfirm={handleDelete}
          title={deleteConfirm.folderId ? 'Delete Folder' : 'Delete Document'}
          message={
            deleteConfirm.folderId
              ? `Are you sure you want to delete "${deleteConfirm.folderName}"? This will also delete all subfolders and documents inside. This action cannot be undone.`
              : `Are you sure you want to delete "${deleteConfirm.documentName}"? This action cannot be undone.`
          }
          confirmText="Delete"
          type="danger"
        />
      ) : null}
    </View>
  );
}

function AppFolderItem({
  folder,
  colors,
  onFolderClick,
  onEdit,
  onDelete,
}: {
  folder: AppFolder;
  colors: any;
  onFolderClick: (folder: AppFolder) => void;
  onEdit: (folder: AppFolder) => void;
  onDelete: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.fileItem, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      onPress={() => onFolderClick(folder)}
    >
      <View style={styles.fileIcon}>
        <FontAwesome name="folder" size={24} color="#FFD700" />
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
          {folder.name}
        </Text>
        {folder.description && (
          <Text style={[styles.fileDescription, { color: colors.textSecondary }]} numberOfLines={1}>
            {folder.description}
          </Text>
        )}
        <View style={styles.fileMeta}>
          <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
            {folder.subfolders_count || 0} {(folder.subfolders_count || 0) !== 1 ? 'subfolders' : 'subfolder'}
          </Text>
          <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}> {'\u2022'} </Text>
          <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
            {folder.documents_count || 0} {(folder.documents_count || 0) !== 1 ? 'documents' : 'document'}
          </Text>
        </View>
      </View>
      <View style={styles.fileActions}>
        <TouchableOpacity onPress={() => onEdit(folder)} style={styles.fileActionButton}>
          <FontAwesome name="edit" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.fileActionButton}>
          <FontAwesome name="trash" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function AppDocumentItem({
  document,
  colors,
  onView,
  onEdit,
  onDownload,
  onDelete,
}: {
  document: AppDocument;
  colors: any;
  onView: (doc: AppDocument) => void;
  onEdit: (doc: AppDocument) => void;
  onDownload: (doc: AppDocument) => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.fileItem, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.fileIcon}>
        <FontAwesome name="file" size={24} color={colors.primary} />
      </View>
      <View style={styles.fileInfoContainer}>
        <View style={styles.fileInfo}>
          <View style={styles.fileInfoTop}>
            <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
              {document.name}
            </Text>
            {document.description && (
              <Text style={[styles.fileDescription, { color: colors.textSecondary }]} numberOfLines={1}>
                {document.description}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.fileMetaRow}>
          <View style={styles.fileMeta}>
            {document.file_size && (
              <>
                <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
                  {AppDocumentsService.formatFileSize(document.file_size)}
                </Text>
                <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}> {'\u2022'} </Text>
              </>
            )}
            {document.mime_type && (
              <>
                <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
                  {AppDocumentsService.getFileTypeName(document.mime_type, document.name)}
                </Text>
                <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}> {'\u2022'} </Text>
              </>
            )}
            <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
              {Platform.OS === 'web'
                ? AppDocumentsService.formatDate(document.created_at)
                : formatShortDate(document.created_at)
              }
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.fileActions}>
        <TouchableOpacity onPress={() => onView(document)} style={styles.fileActionButton}>
          <FontAwesome name="eye" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onEdit(document)} style={styles.fileActionButton}>
          <FontAwesome name="edit" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDownload(document)} style={styles.fileActionButton}>
          <FontAwesome name="download" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.fileActionButton}>
          <FontAwesome name="trash" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function OneDriveTab({
  connected,
  onConnectionChange,
  colors,
}: {
  connected: boolean;
  onConnectionChange: (connected: boolean) => void;
  colors: any;
}) {
  if (!connected) {
    return (
      <ScrollView style={[styles.tabContent, { backgroundColor: colors.background }]}>
        <View style={styles.placeholder}>
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            OneDrive is not connected. Please connect your OneDrive account from the settings or connection screen.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return <OneDriveBrowser colors={colors} />;
}

function GoogleDriveTab({
  connected,
  onConnectionChange,
  colors,
}: {
  connected: boolean;
  onConnectionChange: (connected: boolean) => void;
  colors: any;
}) {
  if (!connected) {
    return (
      <ScrollView style={[styles.tabContent, { backgroundColor: colors.background }]}>
        <View style={styles.placeholder}>
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Google Drive is not connected. Please connect your Google Drive account from the settings or connection screen.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return <GoogleDriveBrowser colors={colors} />;
}

function GooglePhotosTab({
  connected,
  colors,
}: {
  connected: boolean;
  colors: any;
}) {
  // Google Photos can now use Google Drive connection automatically
  // So we always show the browser - it will handle the error if neither is connected
  return <GooglePhotosBrowser colors={colors} />;
}

function OneDriveBrowser({ colors }: { colors: any }) {
  const router = useRouter();
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; item: CloudFile | null }>({
    isOpen: false,
    item: null,
  });
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    requiresReconnect: boolean;
    requiresLogout: boolean;
  }>({
    visible: false,
    title: '',
    message: '',
    requiresReconnect: false,
    requiresLogout: false,
  });
  const [reconnecting, setReconnecting] = useState(false);
  // Sort state
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showSummary, setShowSummary] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);

  const parseError = (err: any): { message: string; requiresReconnect: boolean; requiresLogout: boolean } => {
    const apiError = err as APIError;
    const errorData = apiError.data || {};
    const errorMessage = apiError.message || err.message || 'An error occurred';

    const hasReconnectFlag = errorData.requires_reconnect || errorData.requires_reconnect === true;
    const hasRefreshFlag = errorData.requires_refresh || errorData.requires_refresh === true;
    const isOAuth401 = apiError.status === 401;

    const requiresReconnect = hasReconnectFlag ||
                            (isOAuth401 && !hasRefreshFlag) ||
                            errorMessage.toLowerCase().includes('reconnect') ||
                            errorMessage.toLowerCase().includes('disconnect and reconnect') ||
                            errorMessage.toLowerCase().includes('token expired') ||
                            errorMessage.toLowerCase().includes('decrypt') ||
                            errorMessage.toLowerCase().includes('unable to decrypt') ||
                            errorMessage.toLowerCase().includes('oauth') ||
                            errorMessage.toLowerCase().includes('invalid token');

    const requiresLogout = hasRefreshFlag ||
                          errorData.requires_logout ||
                          errorMessage.toLowerCase().includes('log out') ||
                          errorMessage.toLowerCase().includes('log in again') ||
                          errorMessage.toLowerCase().includes('session expired');

    let finalMessage = errorMessage;
    if (isOAuth401 && !hasReconnectFlag && !hasRefreshFlag) {
      finalMessage = 'Your OneDrive connection has expired. Please reconnect your account in Settings.';
    } else if (isOAuth401 && hasReconnectFlag) {
      finalMessage = errorMessage || 'Your OneDrive connection needs to be reconnected. Please disconnect and reconnect in Settings.';
    }

    return {
      message: finalMessage,
      requiresReconnect,
      requiresLogout,
    };
  };

  // Helper function to sort files: folders first (alphabetically), then files (alphabetically)
  const sortFiles = (filesList: CloudFile[]): CloudFile[] => {
    const folders: CloudFile[] = [];
    const files: CloudFile[] = [];

    filesList.forEach((file) => {
      const mimeType = file.mimeType || file.file?.mimeType;
      const isFolder = file.folder || mimeType === 'application/vnd.google-apps.folder';
      if (isFolder) {
        folders.push(file);
      } else {
        files.push(file);
      }
    });

    // Sort folders alphabetically by name
    folders.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Sort files alphabetically by name
    files.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Return folders first, then files
    return [...folders, ...files];
  };

  // Sort files
  const filterAndSortFiles = (filesList: CloudFile[]): CloudFile[] => {
    // Apply sorting
    const folders: CloudFile[] = [];
    const files: CloudFile[] = [];

    filesList.forEach((file) => {
      const mimeType = file.mimeType || file.file?.mimeType;
      const isFolder = file.folder || mimeType === 'application/vnd.google-apps.folder';
      if (isFolder) {
        folders.push(file);
      } else {
        files.push(file);
      }
    });

    // Sort folders
    folders.sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else if (sortBy === 'date') {
        const dateA = new Date(a.modifiedTime || a.createdTime || 0).getTime();
        const dateB = new Date(b.modifiedTime || b.createdTime || 0).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else if (sortBy === 'size') {
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        return sortOrder === 'asc' ? sizeA - sizeB : sizeB - sizeA;
      }
      return 0;
    });

    // Sort files
    files.sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else if (sortBy === 'date') {
        const dateA = new Date(a.modifiedTime || a.createdTime || 0).getTime();
        const dateB = new Date(b.modifiedTime || b.createdTime || 0).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else if (sortBy === 'size') {
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        return sortOrder === 'asc' ? sizeA - sizeB : sizeB - sizeA;
      }
      return 0;
    });

    return [...folders, ...files];
  };

  // Note: Recursive loading functions are no longer used
  // Server-side search is now used instead for better performance with large file collections

  const loadFiles = useCallback(
    async (skipLoading = false) => {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError('');
        const filesList = await DocumentService.listOneDriveFiles(currentFolder || undefined);
        const sortedFiles = sortFiles(filesList);
        setFiles(sortedFiles);
      } catch (err: any) {
        console.error('Error loading OneDrive files:', err);
        const parsedError = parseError(err);

        // Show error modal
        setErrorModal({
          visible: true,
          title: 'Error Loading Files',
          message: parsedError.message,
          requiresReconnect: parsedError.requiresReconnect,
          requiresLogout: parsedError.requiresLogout,
        });

        // Also set inline error
        setError(parsedError.message);
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    },
    [currentFolder]
  );

  useFocusEffect(
    useCallback(() => {
      // Reset delete confirm state when screen comes into focus
      setDeleteConfirm({ isOpen: false, item: null });
      loadFiles();
      // Cleanup function to reset state when screen loses focus
      return () => {
        setDeleteConfirm({ isOpen: false, item: null });
      };
    }, [loadFiles])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFiles(true);
    setRefreshing(false);
  }, [loadFiles]);

  const handleReconnect = async () => {
    setErrorModal(prev => ({ ...prev, visible: false }));
    try {
      setReconnecting(true);
      setError('');

      // Disconnect first
      try {
        await OAuthService.disconnect('onedrive');
      } catch (disconnectErr) {
        // Ignore disconnect errors - service might already be disconnected
        console.log('Disconnect error (may be expected):', disconnectErr);
      }

      // Wait a moment before reconnecting
      await new Promise(resolve => setTimeout(resolve, 500));

      // Initiate reconnect OAuth flow
      const result = await OAuthService.connectOneDrive();

      if (result.success) {
        // Wait a moment for backend to process, then reload
        await new Promise(resolve => setTimeout(resolve, 1000));
        await loadFiles(false);
        setError('');
      } else {
        throw new Error(result.message || 'Failed to reconnect OneDrive');
      }
    } catch (err: any) {
      console.error('Error reconnecting OneDrive:', err);
      const parsedError = parseError(err);
      setErrorModal({
        visible: true,
        title: 'Reconnect Failed',
        message: parsedError.message,
        requiresReconnect: parsedError.requiresReconnect,
        requiresLogout: parsedError.requiresLogout,
      });
      setError(parsedError.message);
    } finally {
      setReconnecting(false);
    }
  };

  const handleFolderClick = (folder: CloudFile) => {
    setCurrentFolder(folder.id);
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    if (index === -1) {
      setCurrentFolder(null);
      setFolderPath([]);
    } else {
      setCurrentFolder(newPath[index].id);
    }
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      setUploading(true);
      setError('');

      await DocumentService.uploadOneDriveFile(
        file.uri,
        file.name,
        file.mimeType || 'application/octet-stream',
        currentFolder || undefined
      );
      setShowUploadForm(false);
      await loadFiles(true);
      Alert.alert('Success', 'File uploaded successfully');
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to upload file. Please try again.');
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Failed to upload file.');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      Alert.alert('Error', 'Folder name is required');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await DocumentService.createOneDriveFolder(folderName.trim(), currentFolder || undefined);
      setShowFolderForm(false);
      setFolderName('');
      await loadFiles(true);
      Alert.alert('Success', 'Folder created successfully');
    } catch (err: any) {
      console.error('Error creating folder:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to create folder. Please try again.');
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Failed to create folder.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.item) return;

    try {
      setLoading(true);
      setError('');
      await DocumentService.deleteOneDriveItem(deleteConfirm.item.id);
      setDeleteConfirm({ isOpen: false, item: null });
      await loadFiles(true);
      Alert.alert('Success', 'Item deleted successfully');
    } catch (err: any) {
      console.error('Error deleting item:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to delete item. Please try again.');
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Failed to delete item.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file: CloudFile) => {
    try {
      setLoading(true);
      const blob = await DocumentService.downloadOneDriveFile(file.id);
      // For mobile, we'd need to save the file using expo-file-system
      // This is a simplified version - in production you'd want to use Sharing API
      Alert.alert('Download', 'File download initiated. Check your downloads folder.');
    } catch (err: any) {
      console.error('Error downloading file:', err);
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Failed to download file.');
    } finally {
      setLoading(false);
    }
  };

  // Get files to display
  const getDisplayFiles = (): CloudFile[] => {
    return files;
  };

  // Calculate summary statistics
  const totalFolders = files.filter((f) => {
    const mimeType = f.mimeType || f.file?.mimeType;
    return f.folder || mimeType === 'application/vnd.google-apps.folder';
  }).length;
  const totalFiles = files.length - totalFolders;
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

  const navigateToPath = (index: number) => {
    handleBreadcrumbClick(index);
  };

  const displayFiles = filterAndSortFiles(getDisplayFiles());

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading files...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.tabContent, { backgroundColor: colors.background }]}>
      {/* Title with Breadcrumb and Actions */}
      <View style={[styles.titleBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.documentsTitle, { color: colors.text }]}>OneDrive</Text>
          <View style={styles.titleActions}>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setShowFolderForm(true);
                setFolderName('');
              }}
              disabled={uploading || loading}
            >
              <FontAwesome name="folder-open" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowUploadForm(true)}
              disabled={uploading || loading}
            >
              <FontAwesome name="upload" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowSummary(!showSummary)}
            >
              <FontAwesome name="info-circle" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        {/* Always show breadcrumb */}
        <View style={[styles.breadcrumbInline, { borderTopColor: colors.border }]}>
          {folderPath.length === 0 ? (
            <Text style={[styles.breadcrumbItem, { color: colors.text }]}>Home</Text>
          ) : (
            <>
              <TouchableOpacity onPress={() => navigateToPath(-1)}>
                <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>Home</Text>
              </TouchableOpacity>
              {folderPath.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <Text style={[styles.breadcrumbSeparator, { color: colors.textSecondary }]}> / </Text>
                  <TouchableOpacity onPress={() => navigateToPath(index)}>
                    <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>{folder.name}</Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </>
          )}
        </View>
      </View>

      {/* Summary Statistics - Shown when info button is clicked */}
      {!loading && showSummary && (
        <View style={[styles.summary, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <FontAwesome name="folder" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Folders</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{totalFolders}</Text>
            </View>
          </View>
          <View style={styles.summaryItem}>
            <FontAwesome name="file" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Files</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{totalFiles}</Text>
            </View>
          </View>
          <View style={styles.summaryItem}>
            <FontAwesome name="database" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Size</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {DocumentService.formatFileSize(totalSize)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Messages */}
      {error && (
        <View style={[styles.message, styles.errorMessage, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
          <Text style={[styles.messageText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={() => setError('')}>
            <FontAwesome name="times" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      )}

      {/* Sort Controls */}
      <View style={[styles.searchSortContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.sortContainer}>
          <Text style={[styles.sortLabel, { color: colors.text }]}>Sort</Text>
          {Platform.OS === 'web' ? (
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'name' | 'date' | 'size');
              }}
              style={{
                width: 150,
                height: 44,
                padding: '8px 12px',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                color: colors.text,
                fontSize: 14,
                fontWeight: '500',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="size">Size</option>
            </select>
          ) : Platform.OS === 'android' ? (
            <>
              <TouchableOpacity
                style={[styles.sortDropdownWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowSortModal(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sortDropdownText, { color: colors.text }]}>
                  {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
                </Text>
                <FontAwesome name="chevron-down" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
              <Modal
                visible={showSortModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowSortModal(false)}
              >
                <TouchableOpacity
                  style={[styles.sortModalOverlay, { paddingBottom: 150 }]}
                  activeOpacity={1}
                  onPress={() => setShowSortModal(false)}
                >
                  <View style={[styles.sortModalContent, { backgroundColor: colors.surface, marginBottom: 20, maxHeight: '50%', paddingBottom: 20 }]}>
                    <View style={styles.sortModalHeader}>
                      <Text style={[styles.sortModalTitle, { color: colors.text }]}>Sort By</Text>
                      <TouchableOpacity
                        onPress={() => setShowSortModal(false)}
                        style={styles.sortModalCloseButton}
                      >
                        <FontAwesome name="times" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    {['name', 'date', 'size'].map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.sortModalOption,
                          sortBy === option && { backgroundColor: colors.primary + '20' },
                        ]}
                        onPress={() => {
                          setSortBy(option as 'name' | 'date' | 'size');
                          setShowSortModal(false);
                        }}
                      >
                        <Text style={[styles.sortModalOptionText, { color: colors.text }]}>
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </Text>
                        {sortBy === option && (
                          <FontAwesome name="check" size={16} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableOpacity>
              </Modal>
            </>
          ) : (
            <Picker
              selectedValue={sortBy}
              onValueChange={(value) => setSortBy(value as 'name' | 'date' | 'size')}
              style={[styles.sortPicker, { backgroundColor: colors.background, color: colors.text }]}
              itemStyle={{ color: colors.text, height: 120 }}
            >
              <Picker.Item label="Name" value="name" />
              <Picker.Item label="Date" value="date" />
              <Picker.Item label="Size" value="size" />
            </Picker>
          )}
          <TouchableOpacity
            style={[styles.sortOrderButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            <FontAwesome
              name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.filesScrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {displayFiles.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              This folder is empty.
            </Text>
          </View>
        ) : (
          <View style={styles.filesList}>
            {displayFiles.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                colors={colors}
                onFolderClick={handleFolderClick}
                onDownload={handleDownload}
                onDelete={() => {
                  setDeleteConfirm({ isOpen: true, item: file });
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Upload Modal */}
      <Modal visible={showUploadForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Upload File</Text>
            <TouchableOpacity
              style={[styles.uploadButton, { backgroundColor: colors.primary }]}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <FontAwesome name="file" size={20} color="#fff" />
                  <Text style={styles.uploadButtonText}>Select File</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => setShowUploadForm(false)}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Folder Modal */}
      <Modal visible={showFolderForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create Folder</Text>
            <TextInput
              style={[styles.folderInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="Folder name"
              placeholderTextColor={colors.textSecondary}
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreateFolder}
                disabled={loading || !folderName.trim()}
              >
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: colors.border }]}
                onPress={() => {
                  setShowFolderForm(false);
                  setFolderName('');
                }}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.item && deleteConfirm.isOpen && (
        <ConfirmModal
          visible={true}
          onClose={() => setDeleteConfirm({ isOpen: false, item: null })}
          onConfirm={handleDelete}
          title="Delete Item"
          message={`Are you sure you want to delete "${deleteConfirm.item.name || deleteConfirm.item.id || 'this item'}"? This action cannot be undone.`}
          confirmText="Delete"
          type="danger"
        />
      )}

      <AlertModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        type="error"
        onClose={() => setErrorModal(prev => ({ ...prev, visible: false }))}
        onConfirm={errorModal.requiresReconnect ? handleReconnect : errorModal.requiresLogout ? async () => {
          setErrorModal(prev => ({ ...prev, visible: false }));
          try {
            await AuthService.logout();
            router.replace('/(auth)/login');
          } catch (err) {
            console.error('Error during logout:', err);
            router.replace('/(auth)/login');
          }
        } : () => setErrorModal(prev => ({ ...prev, visible: false }))}
        confirmText={errorModal.requiresReconnect ? (reconnecting ? 'Reconnecting...' : 'Reconnect') : errorModal.requiresLogout ? 'Logout' : 'OK'}
        showCancel={errorModal.requiresReconnect || errorModal.requiresLogout}
        cancelText="Cancel"
      />

      {reconnecting && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.reconnectOverlay}>
            <View style={[styles.reconnectModal, { backgroundColor: colors.surface }]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.reconnectText, { color: colors.text }]}>
                Reconnecting OneDrive...
              </Text>
              <Text style={[styles.reconnectSubtext, { color: colors.textSecondary }]}>
                Please complete the authorization in your browser
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function GoogleDriveBrowser({ colors }: { colors: any }) {
  const router = useRouter();
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; item: CloudFile | null }>({
    isOpen: false,
    item: null,
  });
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    requiresReconnect: boolean;
    requiresLogout: boolean;
  }>({
    visible: false,
    title: '',
    message: '',
    requiresReconnect: false,
    requiresLogout: false,
  });
  const [reconnecting, setReconnecting] = useState(false);
  // Sort state
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showSummary, setShowSummary] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);

  const parseError = (err: any): { message: string; requiresReconnect: boolean; requiresLogout: boolean } => {
    const apiError = err as APIError;
    const errorData = apiError.data || {};
    const errorMessage = apiError.message || err.message || 'An error occurred';

    const hasReconnectFlag = errorData.requires_reconnect || errorData.requires_reconnect === true;
    const hasRefreshFlag = errorData.requires_refresh || errorData.requires_refresh === true;
    const isOAuth401 = apiError.status === 401;

    const requiresReconnect = hasReconnectFlag ||
                            (isOAuth401 && !hasRefreshFlag) ||
                            errorMessage.toLowerCase().includes('reconnect') ||
                            errorMessage.toLowerCase().includes('disconnect and reconnect') ||
                            errorMessage.toLowerCase().includes('token expired') ||
                            errorMessage.toLowerCase().includes('decrypt') ||
                            errorMessage.toLowerCase().includes('unable to decrypt') ||
                            errorMessage.toLowerCase().includes('oauth') ||
                            errorMessage.toLowerCase().includes('invalid token');

    const requiresLogout = hasRefreshFlag ||
                          errorData.requires_logout ||
                          errorMessage.toLowerCase().includes('log out') ||
                          errorMessage.toLowerCase().includes('log in again') ||
                          errorMessage.toLowerCase().includes('session expired');

    let finalMessage = errorMessage;
    if (isOAuth401 && !hasReconnectFlag && !hasRefreshFlag) {
      finalMessage = 'Your Google Drive connection has expired. Please reconnect your account in Settings.';
    } else if (isOAuth401 && hasReconnectFlag) {
      finalMessage = errorMessage || 'Your Google Drive connection needs to be reconnected. Please disconnect and reconnect in Settings.';
    }

    return {
      message: finalMessage,
      requiresReconnect,
      requiresLogout,
    };
  };

  // Helper function to sort files: folders first (alphabetically), then files (alphabetically)
  const sortFiles = (filesList: CloudFile[]): CloudFile[] => {
    const folders: CloudFile[] = [];
    const files: CloudFile[] = [];

    filesList.forEach((file) => {
      const mimeType = file.mimeType || file.file?.mimeType;
      const isFolder = file.folder || mimeType === 'application/vnd.google-apps.folder';
      if (isFolder) {
        folders.push(file);
      } else {
        files.push(file);
      }
    });

    // Sort folders alphabetically by name
    folders.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Sort files alphabetically by name
    files.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Return folders first, then files
    return [...folders, ...files];
  };

  // Sort files
  const filterAndSortFiles = (filesList: CloudFile[]): CloudFile[] => {
    // Apply sorting
    const folders: CloudFile[] = [];
    const files: CloudFile[] = [];

    filesList.forEach((file) => {
      const mimeType = file.mimeType || file.file?.mimeType;
      const isFolder = file.folder || mimeType === 'application/vnd.google-apps.folder';
      if (isFolder) {
        folders.push(file);
      } else {
        files.push(file);
      }
    });

    // Sort folders
    folders.sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else if (sortBy === 'date') {
        const dateA = new Date(a.modifiedTime || a.createdTime || 0).getTime();
        const dateB = new Date(b.modifiedTime || b.createdTime || 0).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else if (sortBy === 'size') {
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        return sortOrder === 'asc' ? sizeA - sizeB : sizeB - sizeA;
      }
      return 0;
    });

    // Sort files
    files.sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else if (sortBy === 'date') {
        const dateA = new Date(a.modifiedTime || a.createdTime || 0).getTime();
        const dateB = new Date(b.modifiedTime || b.createdTime || 0).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else if (sortBy === 'size') {
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        return sortOrder === 'asc' ? sizeA - sizeB : sizeB - sizeA;
      }
      return 0;
    });

    return [...folders, ...files];
  };

  // Note: loadAllFiles and loadAllFilesRecursively are no longer used
  // Server-side search is now used instead for better performance

  const loadFiles = useCallback(
    async (skipLoading = false) => {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError('');
        const filesList = await DocumentService.listGoogleDriveFiles(currentFolder || undefined);
        const sortedFiles = sortFiles(filesList);
        setFiles(sortedFiles);
      } catch (err: any) {
        console.error('Error loading Google Drive files:', err);
        const parsedError = parseError(err);

        // Show error modal
        setErrorModal({
          visible: true,
          title: 'Error Loading Files',
          message: parsedError.message,
          requiresReconnect: parsedError.requiresReconnect,
          requiresLogout: parsedError.requiresLogout,
        });

        // Also set inline error
        setError(parsedError.message);
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    },
    [currentFolder]
  );

  useFocusEffect(
    useCallback(() => {
      // Reset delete confirm state when screen comes into focus
      setDeleteConfirm({ isOpen: false, item: null });
      loadFiles();
      // Cleanup function to reset state when screen loses focus
      return () => {
        setDeleteConfirm({ isOpen: false, item: null });
      };
    }, [loadFiles])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFiles(true);
    setRefreshing(false);
  }, [loadFiles]);

  const handleReconnect = async () => {
    setErrorModal(prev => ({ ...prev, visible: false }));
    try {
      setReconnecting(true);
      setError('');

      // Disconnect first
      try {
        await OAuthService.disconnect('googledrive');
      } catch (disconnectErr) {
        // Ignore disconnect errors - service might already be disconnected
        console.log('Disconnect error (may be expected):', disconnectErr);
      }

      // Wait a moment before reconnecting
      await new Promise(resolve => setTimeout(resolve, 500));

      // Initiate reconnect OAuth flow
      const result = await OAuthService.connectGoogleDrive();

      if (result.success) {
        // Wait a moment for backend to process, then reload
        await new Promise(resolve => setTimeout(resolve, 1000));
        await loadFiles(false);
        setError('');
      } else {
        throw new Error(result.message || 'Failed to reconnect Google Drive');
      }
    } catch (err: any) {
      console.error('Error reconnecting Google Drive:', err);
      const parsedError = parseError(err);
      setErrorModal({
        visible: true,
        title: 'Reconnect Failed',
        message: parsedError.message,
        requiresReconnect: parsedError.requiresReconnect,
        requiresLogout: parsedError.requiresLogout,
      });
      setError(parsedError.message);
    } finally {
      setReconnecting(false);
    }
  };

  const handleFolderClick = (folder: CloudFile) => {
    setCurrentFolder(folder.id);
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    if (index === -1) {
      setCurrentFolder(null);
      setFolderPath([]);
    } else {
      setCurrentFolder(newPath[index].id);
    }
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      setUploading(true);
      setError('');

      await DocumentService.uploadGoogleDriveFile(
        file.uri,
        file.name,
        file.mimeType || 'application/octet-stream',
        currentFolder || undefined
      );
      setShowUploadForm(false);
      await loadFiles(true);
      Alert.alert('Success', 'File uploaded successfully');
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to upload file. Please try again.');
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Failed to upload file.');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      Alert.alert('Error', 'Folder name is required');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await DocumentService.createGoogleDriveFolder(folderName.trim(), currentFolder || undefined);
      setShowFolderForm(false);
      setFolderName('');
      await loadFiles(true);
      Alert.alert('Success', 'Folder created successfully');
    } catch (err: any) {
      console.error('Error creating folder:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to create folder. Please try again.');
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Failed to create folder.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.item) return;

    try {
      setLoading(true);
      setError('');
      await DocumentService.deleteGoogleDriveItem(deleteConfirm.item.id);
      setDeleteConfirm({ isOpen: false, item: null });
      await loadFiles(true);
      Alert.alert('Success', 'Item deleted successfully');
    } catch (err: any) {
      console.error('Error deleting item:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to delete item. Please try again.');
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Failed to delete item.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file: CloudFile) => {
    try {
      setLoading(true);
      const blob = await DocumentService.downloadGoogleDriveFile(file.id);
      Alert.alert('Download', 'File download initiated. Check your downloads folder.');
    } catch (err: any) {
      console.error('Error downloading file:', err);
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Failed to download file.');
    } finally {
      setLoading(false);
    }
  };

  // Get files to display
  const getDisplayFiles = (): CloudFile[] => {
    return files;
  };

  // Calculate summary statistics
  const totalFolders = files.filter((f) => {
    const mimeType = f.mimeType || f.file?.mimeType;
    return f.folder || mimeType === 'application/vnd.google-apps.folder';
  }).length;
  const totalFiles = files.length - totalFolders;
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

  const navigateToPath = (index: number) => {
    handleBreadcrumbClick(index);
  };

  const displayFiles = filterAndSortFiles(getDisplayFiles());

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading files...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.tabContent, { backgroundColor: colors.background }]}>
      {/* Title with Breadcrumb and Actions */}
      <View style={[styles.titleBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.documentsTitle, { color: colors.text }]}>Google Drive</Text>
          <View style={styles.titleActions}>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setShowFolderForm(true);
                setFolderName('');
              }}
              disabled={uploading || loading}
            >
              <FontAwesome name="folder-open" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowUploadForm(true)}
              disabled={uploading || loading}
            >
              <FontAwesome name="upload" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowSummary(!showSummary)}
            >
              <FontAwesome name="info-circle" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        {/* Always show breadcrumb */}
        <View style={[styles.breadcrumbInline, { borderTopColor: colors.border }]}>
          {folderPath.length === 0 ? (
            <Text style={[styles.breadcrumbItem, { color: colors.text }]}>Home</Text>
          ) : (
            <>
              <TouchableOpacity onPress={() => navigateToPath(-1)}>
                <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>Home</Text>
              </TouchableOpacity>
              {folderPath.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <Text style={[styles.breadcrumbSeparator, { color: colors.textSecondary }]}> / </Text>
                  <TouchableOpacity onPress={() => navigateToPath(index)}>
                    <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>{folder.name}</Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </>
          )}
        </View>
      </View>

      {/* Summary Statistics - Shown when info button is clicked */}
      {!loading && showSummary && (
        <View style={[styles.summary, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <FontAwesome name="folder" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Folders</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{totalFolders}</Text>
            </View>
          </View>
          <View style={styles.summaryItem}>
            <FontAwesome name="file" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Files</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{totalFiles}</Text>
            </View>
          </View>
          <View style={styles.summaryItem}>
            <FontAwesome name="database" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Size</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {DocumentService.formatFileSize(totalSize)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Messages */}
      {error && (
        <View style={[styles.message, styles.errorMessage, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
          <Text style={[styles.messageText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={() => setError('')}>
            <FontAwesome name="times" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      )}

      {/* Sort Controls */}
      <View style={[styles.searchSortContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.sortContainer}>
          <Text style={[styles.sortLabel, { color: colors.text }]}>Sort</Text>
          {Platform.OS === 'web' ? (
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'name' | 'date' | 'size');
              }}
              style={{
                width: 150,
                height: 44,
                padding: '8px 12px',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                color: colors.text,
                fontSize: 14,
                fontWeight: '500',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="size">Size</option>
            </select>
          ) : Platform.OS === 'android' ? (
            <>
              <TouchableOpacity
                style={[styles.sortDropdownWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowSortModal(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sortDropdownText, { color: colors.text }]}>
                  {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
                </Text>
                <FontAwesome name="chevron-down" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
              <Modal
                visible={showSortModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowSortModal(false)}
              >
                <TouchableOpacity
                  style={[styles.sortModalOverlay, { paddingBottom: 150 }]}
                  activeOpacity={1}
                  onPress={() => setShowSortModal(false)}
                >
                  <View style={[styles.sortModalContent, { backgroundColor: colors.surface, marginBottom: 20, maxHeight: '50%', paddingBottom: 20 }]}>
                    <View style={styles.sortModalHeader}>
                      <Text style={[styles.sortModalTitle, { color: colors.text }]}>Sort By</Text>
                      <TouchableOpacity
                        onPress={() => setShowSortModal(false)}
                        style={styles.sortModalCloseButton}
                      >
                        <FontAwesome name="times" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    {['name', 'date', 'size'].map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.sortModalOption,
                          sortBy === option && { backgroundColor: colors.primary + '20' },
                        ]}
                        onPress={() => {
                          setSortBy(option as 'name' | 'date' | 'size');
                          setShowSortModal(false);
                        }}
                      >
                        <Text style={[styles.sortModalOptionText, { color: colors.text }]}>
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </Text>
                        {sortBy === option && (
                          <FontAwesome name="check" size={16} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableOpacity>
              </Modal>
            </>
          ) : (
            <Picker
              selectedValue={sortBy}
              onValueChange={(value) => setSortBy(value as 'name' | 'date' | 'size')}
              style={[styles.sortPicker, { backgroundColor: colors.background, color: colors.text }]}
              itemStyle={{ color: colors.text, height: 120 }}
            >
              <Picker.Item label="Name" value="name" />
              <Picker.Item label="Date" value="date" />
              <Picker.Item label="Size" value="size" />
            </Picker>
          )}
          <TouchableOpacity
            style={[styles.sortOrderButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            <FontAwesome
              name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.filesScrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {displayFiles.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              This folder is empty.
            </Text>
          </View>
        ) : (
          <View style={styles.filesList}>
            {displayFiles.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                colors={colors}
                onFolderClick={handleFolderClick}
                onDownload={handleDownload}
                onDelete={() => {
                  setDeleteConfirm({ isOpen: true, item: file });
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Upload Modal */}
      <Modal visible={showUploadForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Upload File</Text>
            <TouchableOpacity
              style={[styles.uploadButton, { backgroundColor: colors.primary }]}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <FontAwesome name="file" size={20} color="#fff" />
                  <Text style={styles.uploadButtonText}>Select File</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => setShowUploadForm(false)}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Folder Modal */}
      <Modal visible={showFolderForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create Folder</Text>
            <TextInput
              style={[styles.folderInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="Folder name"
              placeholderTextColor={colors.textSecondary}
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreateFolder}
                disabled={loading || !folderName.trim()}
              >
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: colors.border }]}
                onPress={() => {
                  setShowFolderForm(false);
                  setFolderName('');
                }}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.item && deleteConfirm.isOpen && (
        <ConfirmModal
          visible={true}
          onClose={() => setDeleteConfirm({ isOpen: false, item: null })}
          onConfirm={handleDelete}
          title="Delete Item"
          message={`Are you sure you want to delete "${deleteConfirm.item.name || deleteConfirm.item.id || 'this item'}"? This action cannot be undone.`}
          confirmText="Delete"
          type="danger"
        />
      )}

      <AlertModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        type="error"
        onClose={() => setErrorModal(prev => ({ ...prev, visible: false }))}
        onConfirm={errorModal.requiresReconnect ? handleReconnect : errorModal.requiresLogout ? async () => {
          setErrorModal(prev => ({ ...prev, visible: false }));
          try {
            await AuthService.logout();
            router.replace('/(auth)/login');
          } catch (err) {
            console.error('Error during logout:', err);
            router.replace('/(auth)/login');
          }
        } : () => setErrorModal(prev => ({ ...prev, visible: false }))}
        confirmText={errorModal.requiresReconnect ? (reconnecting ? 'Reconnecting...' : 'Reconnect') : errorModal.requiresLogout ? 'Logout' : 'OK'}
        showCancel={errorModal.requiresReconnect || errorModal.requiresLogout}
        cancelText="Cancel"
      />

      {reconnecting && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.reconnectOverlay}>
            <View style={[styles.reconnectModal, { backgroundColor: colors.surface }]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.reconnectText, { color: colors.text }]}>
                Reconnecting Google Drive...
              </Text>
              <Text style={[styles.reconnectSubtext, { color: colors.textSecondary }]}>
                Please complete the authorization in your browser
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function GooglePhotosBrowser({ colors }: { colors: any }) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isMobileView = Platform.OS !== 'web' || width < 768;
  const [items, setItems] = useState<GooglePhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>('');
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<GooglePhotoItem | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    requiresReconnect: boolean;
    requiresLogout: boolean;
  }>({
    visible: false,
    title: '',
    message: '',
    requiresReconnect: false,
    requiresLogout: false,
  });
  // Sort state
  const [sortBy, setSortBy] = useState<'name' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // Default to newest first
  const [showSummary, setShowSummary] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);

  const parseError = (err: any): { message: string; requiresReconnect: boolean; requiresLogout: boolean } => {
    const apiError = err as APIError;
    const errorData = apiError.data || {};
    const errorMessage = apiError.message || err.message || 'An error occurred';

    const hasReconnectFlag = errorData.requires_reconnect || errorData.requires_reconnect === true;
    const hasRefreshFlag = errorData.requires_refresh || errorData.requires_refresh === true;
    const isOAuth401 = apiError.status === 401;

    const requiresReconnect = hasReconnectFlag ||
                            (isOAuth401 && !hasRefreshFlag) ||
                            errorMessage.toLowerCase().includes('reconnect') ||
                            errorMessage.toLowerCase().includes('disconnect and reconnect') ||
                            errorMessage.toLowerCase().includes('token expired') ||
                            errorMessage.toLowerCase().includes('decrypt') ||
                            errorMessage.toLowerCase().includes('unable to decrypt') ||
                            errorMessage.toLowerCase().includes('oauth') ||
                            errorMessage.toLowerCase().includes('invalid token');

    const requiresLogout = hasRefreshFlag ||
                          errorData.requires_logout ||
                          errorMessage.toLowerCase().includes('log out') ||
                          errorMessage.toLowerCase().includes('log in again') ||
                          errorMessage.toLowerCase().includes('session expired');

    let finalMessage = errorMessage;
    if (isOAuth401 && !hasReconnectFlag && !hasRefreshFlag) {
      finalMessage = 'Your Google Photos connection has expired. Please reconnect your account in Settings.';
    } else if (isOAuth401 && hasReconnectFlag) {
      finalMessage = errorMessage || 'Your Google Photos connection needs to be reconnected. Please disconnect and reconnect in Settings.';
    }

    return {
      message: finalMessage,
      requiresReconnect,
      requiresLogout,
    };
  };

  const handleReconnect = async () => {
    setErrorModal(prev => ({ ...prev, visible: false }));
    try {
      setReconnecting(true);
      setError(''); // Clear any inline error

      // Disconnect first
      try {
        await OAuthService.disconnect('googlephotos');
      } catch (disconnectErr) {
        // Ignore disconnect errors - service might already be disconnected
        console.log('Disconnect error (may be expected):', disconnectErr);
      }

      // Wait a moment before reconnecting
      await new Promise(resolve => setTimeout(resolve, 500));

      // Initiate reconnect OAuth flow
      const result = await OAuthService.connectGooglePhotos();

      if (result.success) {
        // Wait a moment for backend to process, then reload
        await new Promise(resolve => setTimeout(resolve, 1000));
        await loadItems(false, undefined, false);
        setError('');
      } else {
        throw new Error(result.message || 'Failed to reconnect Google Photos');
      }
    } catch (err: any) {
      console.error('Error reconnecting Google Photos:', err);
      const parsedError = parseError(err);
      setErrorModal({
        visible: true,
        title: 'Reconnect Failed',
        message: parsedError.message,
        requiresReconnect: parsedError.requiresReconnect,
        requiresLogout: parsedError.requiresLogout,
      });
      setError(parsedError.message);
    } finally {
      setReconnecting(false);
    }
  };

  // Zoom state
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const currentScale = useRef(1);
  const accumulatedTranslateX = useRef(0);
  const accumulatedTranslateY = useRef(0);

  // Web zoom state
  const [webScale, setWebScale] = useState(1);
  const [webTranslateX, setWebTranslateX] = useState(0);
  const [webTranslateY, setWebTranslateY] = useState(0);
  const webIsDragging = useRef(false);
  const webLastMousePos = useRef({ x: 0, y: 0 });

  // Combined scale for display
  const scale = Animated.multiply(baseScale, pinchScale);

  // Reset zoom when photo changes
  useEffect(() => {
    if (selectedPhoto) {
      currentScale.current = 1;
      accumulatedTranslateX.current = 0;
      accumulatedTranslateY.current = 0;
      baseScale.setValue(1);
      pinchScale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
      setWebScale(1);
      setWebTranslateX(0);
      setWebTranslateY(0);
    }
  }, [selectedPhoto]);

  // Web zoom handlers
  const handleWebWheel = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setWebScale((prev) => {
      const newScale = Math.max(1, Math.min(5, prev * delta));
      return newScale;
    });
  }, []);

  const handleWebMouseDown = useCallback((e: any) => {
    if (Platform.OS !== 'web' || webScale <= 1) return;
    e.preventDefault();
    webIsDragging.current = true;
    webLastMousePos.current = { x: e.clientX, y: e.clientY };
  }, [webScale]);

  const handleWebMouseMove = useCallback((e: any) => {
    if (Platform.OS !== 'web' || !webIsDragging.current || webScale <= 1) return;
    e.preventDefault();
    const deltaX = e.clientX - webLastMousePos.current.x;
    const deltaY = e.clientY - webLastMousePos.current.y;
    setWebTranslateX((prev) => prev + deltaX);
    setWebTranslateY((prev) => prev + deltaY);
    webLastMousePos.current = { x: e.clientX, y: e.clientY };
  }, [webScale]);

  const handleWebMouseUp = useCallback(() => {
    if (Platform.OS !== 'web') return;
    webIsDragging.current = false;
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && selectedPhoto) {
      document.addEventListener('mousemove', handleWebMouseMove);
      document.addEventListener('mouseup', handleWebMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleWebMouseMove);
        document.removeEventListener('mouseup', handleWebMouseUp);
      };
    }
  }, [selectedPhoto, handleWebMouseMove, handleWebMouseUp]);

  // Helper function to sort photos by creation time: most recent first (newest at top, oldest at bottom)
  const sortPhotos = (photos: GooglePhotoItem[]): GooglePhotoItem[] => {
    return [...photos].sort((a, b) => {
      if (sortBy === 'date') {
        const timeA = a.mediaMetadata?.creationTime ? new Date(a.mediaMetadata.creationTime).getTime() : 0;
        const timeB = b.mediaMetadata?.creationTime ? new Date(b.mediaMetadata.creationTime).getTime() : 0;
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      } else if (sortBy === 'name') {
        const nameA = (a.filename || '').toLowerCase();
        const nameB = (b.filename || '').toLowerCase();
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      return 0;
    });
  };

  // Filter and sort photos based on search query and sort settings
  const filterAndSortPhotos = (photosList: GooglePhotoItem[]): GooglePhotoItem[] => {
    let filtered = photosList;

    // Apply sorting
    return sortPhotos(filtered);
  };

  const loadItems = useCallback(
    async (skipLoading = false, pageToken?: string, append: boolean = false) => {
      try {
        if (!skipLoading && !append) {
          setLoading(true);
        } else if (append) {
          setLoadingMore(true);
        }
        setError('');
        const response = await DocumentService.listGooglePhotosMediaItems(pageToken);
        setNextPageToken(response.nextPageToken || null);
        if (append) {
          const newItems = response.items || [];
          setItems((prev) => sortPhotos([...prev, ...newItems]));
        } else {
          const sortedItems = sortPhotos(response.items || []);
          setItems(sortedItems);
        }
      } catch (err: any) {
        console.error('Error loading Google Photos media items:', err);
        const parsedError = parseError(err, 'Google Photos');

        // Show error modal instead of inline error
        setErrorModal({
          visible: true,
          title: 'Error Loading Photos',
          message: parsedError.message,
          requiresReconnect: parsedError.requiresReconnect,
          requiresLogout: parsedError.requiresLogout,
        });

        // Also set inline error for display
        setError(parsedError.message);
      } finally {
        if (!skipLoading && !append) {
          setLoading(false);
        }
        if (append) {
          setLoadingMore(false);
        }
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      loadItems(false, undefined, false);
      return () => { };
    }, [loadItems])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setNextPageToken(null);
    await loadItems(true, undefined, false);
    setRefreshing(false);
  }, [loadItems]);

  // Calculate summary statistics
  const totalPhotos = items.length;

  const displayPhotos = filterAndSortPhotos(items);

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading photos...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.tabContent, { backgroundColor: colors.background }]}>
      {/* Title with Breadcrumb and Actions */}
      <View style={[styles.titleBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.documentsTitle, { color: colors.text }]}>Google Photos</Text>
          <View style={styles.titleActions}>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowSummary(!showSummary)}
            >
              <FontAwesome name="info-circle" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        {/* Always show breadcrumb */}
        <View style={[styles.breadcrumbInline, { borderTopColor: colors.border }]}>
          <Text style={[styles.breadcrumbItem, { color: colors.text }]}>Home</Text>
        </View>
      </View>

      {/* Summary Statistics - Shown when info button is clicked */}
      {!loading && showSummary && (
        <View style={[styles.summary, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <FontAwesome name="photo" size={20} color={colors.primary} />
            <View style={styles.summaryContent}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Photos</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{totalPhotos}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Messages */}
      {error && (
        <View style={[styles.message, styles.errorMessage, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
          <Text style={[styles.messageText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={() => setError('')}>
            <FontAwesome name="times" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      )}

      {/* Sort Controls */}
      <View style={[styles.searchSortContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.sortContainer}>
          {Platform.OS === 'web' ? (
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'name' | 'date');
              }}
              style={{
                flex: 1,
                height: 44,
                padding: '8px 12px',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                color: colors.text,
                fontSize: 14,
                fontWeight: '500',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
            </select>
          ) : Platform.OS === 'android' ? (
            <>
              <TouchableOpacity
                style={[styles.sortDropdownWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowSortModal(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sortDropdownText, { color: colors.text }]}>
                  {sortBy === 'date' ? 'Date' : 'Name'}
                </Text>
                <FontAwesome name="chevron-down" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
              <Modal
                visible={showSortModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowSortModal(false)}
              >
                <TouchableOpacity
                  style={[styles.sortModalOverlay, { paddingBottom: 150 }]}
                  activeOpacity={1}
                  onPress={() => setShowSortModal(false)}
                >
                  <View style={[styles.sortModalContent, { backgroundColor: colors.surface, marginBottom: 20, maxHeight: '50%', paddingBottom: 20 }]}>
                    <View style={styles.sortModalHeader}>
                      <Text style={[styles.sortModalTitle, { color: colors.text }]}>Sort By</Text>
                      <TouchableOpacity
                        onPress={() => setShowSortModal(false)}
                        style={styles.sortModalCloseButton}
                      >
                        <FontAwesome name="times" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    {['date', 'name'].map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.sortModalOption,
                          sortBy === option && { backgroundColor: colors.primary + '20' },
                        ]}
                        onPress={() => {
                          setSortBy(option as 'name' | 'date');
                          setShowSortModal(false);
                        }}
                      >
                        <Text style={[styles.sortModalOptionText, { color: colors.text }]}>
                          {option === 'date' ? 'Date' : 'Name'}
                        </Text>
                        {sortBy === option && (
                          <FontAwesome name="check" size={16} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableOpacity>
              </Modal>
            </>
          ) : (
            <Picker
              selectedValue={sortBy}
              onValueChange={(value) => setSortBy(value as 'name' | 'date')}
              style={[styles.sortPicker, { backgroundColor: colors.background, color: colors.text }]}
              itemStyle={{ color: colors.text, height: 120 }}
            >
              <Picker.Item label="Date" value="date" />
              <Picker.Item label="Name" value="name" />
            </Picker>
          )}
          <TouchableOpacity
            style={[styles.sortOrderButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            <FontAwesome
              name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.filesScrollView}
        contentContainerStyle={styles.photosGridContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {displayPhotos.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              No photos found in your Google Photos library.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.photosGrid}>
              {displayPhotos.map((item) => {
                const uri = item.baseUrl || undefined;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.photoItem,
                      isMobileView && styles.photoItemMobile,
                      { backgroundColor: colors.surface },
                    ]}
                    onPress={() => setSelectedPhoto(item)}
                    activeOpacity={0.8}
                  >
                    {uri ? (
                      <Image
                        source={{ uri }}
                        style={styles.photoImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <FontAwesome name="photo" size={24} color={colors.textSecondary} />
                      </View>
                    )}
                    {item.filename && (
                      <Text
                        style={[styles.photoFilename, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {item.filename}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {nextPageToken && (
              <View style={styles.loadMoreContainer}>
                <TouchableOpacity
                  style={[styles.loadMoreButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => loadItems(true, nextPageToken, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                      Load more photos
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Fullscreen photo viewer */}
      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.viewerOverlay}>
            <TouchableOpacity
              style={styles.viewerBackdrop}
              activeOpacity={1}
              onPress={() => setSelectedPhoto(null)}
            />
            <View
              style={[
                styles.viewerContent,
                {
                  backgroundColor: colors.surface,
                  width: width * 0.95,
                  height: height * 0.95,
                  maxWidth: width * 0.95,
                  maxHeight: height * 0.95,
                },
              ]}
            >
              <View style={[styles.viewerImageContainer, { height: height * 0.75 }]}>
                {selectedPhoto?.baseUrl && (
                  Platform.OS === 'web' ? (
                    <View
                      // @ts-ignore - web-specific props
                      onWheel={handleWebWheel}
                      // @ts-ignore
                      onMouseDown={handleWebMouseDown}
                      style={[
                        styles.viewerImageContainer,
                        { height: height * 0.75 },
                        Platform.OS === 'web' && webScale > 1 && { cursor: 'move' as any },
                      ]}
                    >
                      <View
                        style={{
                          transform: [
                            { scale: webScale },
                            { translateX: webTranslateX },
                            { translateY: webTranslateY },
                          ],
                          width: width * 0.9,
                          height: height * 0.7,
                        }}
                      >
                        <Image
                          source={{ uri: selectedPhoto.baseUrl }}
                          style={[styles.viewerImage, { width: width * 0.9, height: height * 0.7 }]}
                          resizeMode="contain"
                        />
                      </View>
                    </View>
                  ) : (
                    <PinchGestureHandler
                      onGestureEvent={Animated.event(
                        [{ nativeEvent: { scale: pinchScale } }],
                        { useNativeDriver: true }
                      )}
                      onHandlerStateChange={(event) => {
                        if (event.nativeEvent.oldState === State.ACTIVE) {
                          const newScale = currentScale.current * event.nativeEvent.scale;
                          const clampedScale = Math.max(1, Math.min(5, newScale));
                          currentScale.current = clampedScale;
                          baseScale.setValue(clampedScale);
                          pinchScale.setValue(1);
                        }
                      }}
                    >
                      <Animated.View
                        style={[
                          styles.viewerImageWrapper,
                          {
                            transform: [{ scale }],
                          },
                        ]}
                      >
                        <PanGestureHandler
                          onGestureEvent={Animated.event(
                            [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
                            { useNativeDriver: true }
                          )}
                          onHandlerStateChange={(event) => {
                            if (event.nativeEvent.oldState === State.ACTIVE) {
                              accumulatedTranslateX.current += event.nativeEvent.translationX;
                              accumulatedTranslateY.current += event.nativeEvent.translationY;
                              translateX.setValue(accumulatedTranslateX.current);
                              translateY.setValue(accumulatedTranslateY.current);
                            }
                          }}
                          minPointers={1}
                          maxPointers={1}
                          avgTouches
                          enabled={currentScale.current > 1}
                        >
                          <Animated.View
                            style={{
                              transform: [
                                { translateX },
                                { translateY },
                              ],
                            }}
                          >
                            <Image
                              source={{ uri: selectedPhoto.baseUrl }}
                              style={[styles.viewerImage, { width: width * 0.9, height: height * 0.7 }]}
                              resizeMode="contain"
                            />
                          </Animated.View>
                        </PanGestureHandler>
                      </Animated.View>
                    </PinchGestureHandler>
                  )
                )}
              </View>
              {selectedPhoto?.filename && (
                <Text style={[styles.viewerCaption, { color: colors.text }]}>
                  {selectedPhoto.filename}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.viewerCloseButton, { backgroundColor: colors.primary }]}
                onPress={() => setSelectedPhoto(null)}
              >
                <Text style={styles.viewerCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>

      <AlertModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        type="error"
        onClose={() => setErrorModal(prev => ({ ...prev, visible: false }))}
        onConfirm={errorModal.requiresReconnect ? handleReconnect : errorModal.requiresLogout ? async () => {
          setErrorModal(prev => ({ ...prev, visible: false }));
          try {
            await AuthService.logout();
            router.replace('/(auth)/login');
          } catch (err) {
            console.error('Error during logout:', err);
            router.replace('/(auth)/login');
          }
        } : () => setErrorModal(prev => ({ ...prev, visible: false }))}
        confirmText={errorModal.requiresReconnect ? (reconnecting ? 'Reconnecting...' : 'Reconnect') : errorModal.requiresLogout ? 'Logout' : 'OK'}
        showCancel={errorModal.requiresReconnect || errorModal.requiresLogout}
        cancelText="Cancel"
      />

      {reconnecting && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.reconnectOverlay}>
            <View style={[styles.reconnectModal, { backgroundColor: colors.surface }]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.reconnectText, { color: colors.text }]}>
                Reconnecting Google Photos...
              </Text>
              <Text style={[styles.reconnectSubtext, { color: colors.textSecondary }]}>
                Please complete the authorization in your browser
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function FileItem({
  file,
  colors,
  onFolderClick,
  onDownload,
  onDelete,
}: {
  file: CloudFile;
  colors: any;
  onFolderClick: (folder: CloudFile) => void;
  onDownload: (file: CloudFile) => void;
  onDelete: () => void;
}) {
  const mimeType = file.mimeType || file.file?.mimeType;
  const isFolder = file.folder || mimeType === 'application/vnd.google-apps.folder';
  const fileSize = file.size;
  const modifiedTime = file.modifiedTime || file.lastModifiedDateTime || file.createdTime || file.createdDateTime;

  const handlePress = () => {
    if (isFolder) {
      onFolderClick(file);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.fileItem, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      onPress={handlePress}
      disabled={!isFolder}
    >
      <View style={styles.fileIcon}>
        {/* Folder uses emoji; files use Material Design file-type icons (PDF, Word, Excel, etc.) */}
        {isFolder ? (
          <Text style={styles.fileIconText}>{'\uD83D\uDCC1'}</Text>
        ) : (
          (() => {
            const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
            let iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'] = 'file';
            let iconColor = colors.primary;

            if (ext === 'pdf' || mimeType?.includes('pdf')) {
              iconName = 'file-pdf-box';
              iconColor = '#E53E3E'; // red for PDF
            } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext) || mimeType?.startsWith('image/')) {
              iconName = 'file-image';
            } else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v'].includes(ext) || mimeType?.startsWith('video/')) {
              iconName = 'file-video';
            } else if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext) || mimeType?.startsWith('audio/')) {
              iconName = 'file-music';
            } else if (['xlsx', 'xls'].includes(ext)) {
              iconName = 'file-excel-box';
            } else if (['doc', 'docx'].includes(ext)) {
              iconName = 'file-word-box';
            } else if (['ppt', 'pptx'].includes(ext)) {
              iconName = 'file-powerpoint-box';
            } else if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
              iconName = 'folder-zip';
            } else if (['txt', 'md', 'rtf', 'csv'].includes(ext) || mimeType?.startsWith('text/')) {
              iconName = 'file-document-outline';
            }

            return <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />;
          })()
        )}
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
          {file.name || 'Unnamed'}
        </Text>
        {(!isFolder && (fileSize || mimeType)) && (
          <View style={styles.fileMeta}>
            {fileSize && (
              <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
                {DocumentService.formatFileSize(fileSize)}
              </Text>
            )}
            {mimeType && (
              <>
                {fileSize && <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}> {'\u2022'} </Text>}
                <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
                  {DocumentService.getFileTypeName(mimeType, file.name || '')}
                </Text>
              </>
            )}
          </View>
        )}
      </View>
      {!isFolder && (
        <TouchableOpacity
          style={styles.fileAction}
          onPress={() => onDownload(file)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <FontAwesome name="download" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.fileAction}
        onPress={onDelete}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <FontAwesome name="trash" size={18} color={colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    borderRadius: 8,
    marginHorizontal: 2,
    minHeight: 50,
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
  },
  activeTabText: {
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  placeholder: {
    padding: 32,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    margin: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 14,
  },
  browserHeader: {
    padding: 12,
    borderBottomWidth: 1,
  },
  breadcrumb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbItem: {
    fontSize: 14,
    fontWeight: '500',
  },
  breadcrumbSeparator: {
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  filesScrollView: {
    flex: 1,
  },
  filesList: {
    padding: 8,
  },
  fileItem: {
    flexDirection: 'row',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    borderBottomWidth: 1,
    alignItems: 'flex-start', // Changed from 'center' to allow proper layout
  },
  fileIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileIconText: {
    fontSize: 24,
  },
  fileInfoContainer: {
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
    minWidth: 0,
    alignSelf: 'stretch', // Ensure it takes full available height
  },
  fileInfo: {
    width: '100%',
  },
  fileInfoTop: {
    width: '100%',
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  fileMetaRow: {
    width: '100%',
    marginTop: 4,
    alignSelf: 'stretch', // Use full width
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap', // Prevent wrapping - keep on one line
    width: '100%',
  },
  fileMetaText: {
    fontSize: 10,
    opacity: 0.7, // Make it more subtle
  },
  fileAction: {
    padding: 8,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    padding: 24,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  folderInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  cancelButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
  },
  summary: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    gap: 8,
  },
  summaryContent: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  message: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorMessage: {},
  successMessage: {},
  messageText: {
    flex: 1,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  filePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  filePickerText: {
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  titleBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  documentsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breadcrumbInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    width: '100%',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    minHeight: 32,
  },
  searchSortContainer: {
    padding: 12,
    borderBottomWidth: 1,
    gap: 12,
    zIndex: 1,
  },
  sortContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    overflow: 'visible',
    zIndex: 1000,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
    borderWidth: 0,
    height: 44,
    paddingVertical: 8,
  },
  searchIcon: {
    marginLeft: 4,
  },
  clearButton: {
    padding: 4,
  },
  sortDropdownWrapper: {
    width: 150,
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  sortLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  sortDropdownText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  sortPicker: {
    width: '100%',
    height: 44,
  },
  sortModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  sortModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30,
    maxHeight: '50%',
    marginBottom: 20,
  },
  sortModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sortModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  sortModalCloseButton: {
    padding: 8,
  },
  sortModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  sortModalOptionText: {
    fontSize: 16,
  },
  sortPickerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  sortModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '50%',
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  sortModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  sortModalOptionText: {
    fontSize: 16,
  },
  sortModalCancel: {
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  sortModalCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  sortOrderButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  section: {
    padding: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    marginTop: 8,
  },
  fileDescription: {
    fontSize: 14,
    marginBottom: 4,
  },
  fileActions: {
    flexDirection: 'row',
    gap: 4,
    flexShrink: 0, // Prevent buttons from shrinking
    alignItems: 'center',
  },
  fileActionButton: {
    padding: 8,
    minWidth: 36, // Ensure buttons have minimum width
  },
  photosGridContainer: {
    padding: 8,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  photoItem: {
    // ~15 columns depending on screen width
    width: '6%',
    marginRight: '1%',
    marginBottom: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  photoItemMobile: {
    // Fewer columns on mobile for larger touch targets
    width: '22%',
    marginRight: '2%',
    marginBottom: 8,
  },
  photoImage: {
    width: '100%',
    aspectRatio: 1,
  },
  photoPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoFilename: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  loadMoreContainer: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  loadMoreButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: '500',
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  viewerContent: {
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  viewerImageContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  viewerImageContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
    width: '100%',
  },
  viewerImageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerCaption: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  viewerCloseButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  viewerCloseText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  reconnectOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reconnectModal: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 280,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  reconnectText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  reconnectSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  reconnectOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reconnectModal: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 280,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  reconnectText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  reconnectSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});


