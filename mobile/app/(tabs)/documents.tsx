import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useFamily } from '../../contexts/FamilyContext';
import GlobalNavBar from '../../components/GlobalNavBar';
import DocumentService, { CloudFile } from '../../services/documentService';
import OAuthService from '../../services/oauthService';
import AppDocumentsService, { AppDocument, AppFolder } from '../../services/appDocumentsService';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { FontAwesome } from '@expo/vector-icons';
import ConfirmModal from '../../components/ConfirmModal';

type TabType = 'app' | 'onedrive' | 'googledrive';

export default function DocumentsScreen() {
  const { colors } = useTheme();
  const { selectedFamily } = useFamily();
  const [activeTab, setActiveTab] = useState<TabType>('app');
  const [onedriveConnected, setOnedriveConnected] = useState(false);
  const [googledriveConnected, setGoogledriveConnected] = useState(false);

  useFocusEffect(
    useCallback(() => {
      checkConnections();
    }, [])
  );

  const checkConnections = async () => {
    try {
      const [onedriveStatus, googledriveStatus] = await Promise.all([
        OAuthService.checkConnection('onedrive'),
        OAuthService.checkConnection('googledrive'),
      ]);
      setOnedriveConnected(onedriveStatus.connected);
      setGoogledriveConnected(googledriveStatus.connected);
    } catch (error) {
      console.error('Error checking connections:', error);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    checkConnections();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Documents</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Access your files from OneDrive, Google Drive, or app storage
        </Text>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'app' && [styles.activeTab, { borderBottomColor: colors.primary }]]}
          onPress={() => handleTabChange('app')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'app' ? colors.primary : colors.textSecondary }]}>App Documents</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'onedrive' && [styles.activeTab, { borderBottomColor: colors.primary }]]}
          onPress={() => handleTabChange('onedrive')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'onedrive' ? colors.primary : colors.textSecondary }]}>OneDrive</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'googledrive' && [styles.activeTab, { borderBottomColor: colors.primary }]]}
          onPress={() => handleTabChange('googledrive')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'googledrive' ? colors.primary : colors.textSecondary }]}>Google Drive</Text>
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
      </View>
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
  const [documentsFilter, setDocumentsFilter] = useState('');
  const [documentsSortBy, setDocumentsSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [documentsSortOrder, setDocumentsSortOrder] = useState<'asc' | 'desc'>('asc');
  const [foldersFilter, setFoldersFilter] = useState('');
  const [foldersSortBy, setFoldersSortBy] = useState<'name' | 'date'>('name');
  const [foldersSortOrder, setFoldersSortOrder] = useState<'asc' | 'desc'>('asc');

  const loadDocuments = useCallback(
    async (skipLoading = false) => {
      if (!selectedFamily) return;
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError('');
        const docs = await AppDocumentsService.listDocuments(
          selectedFamily.id,
          currentFolder ? currentFolder.id : null
        );
        setDocuments(docs);
      } catch (err: any) {
        console.error('Error loading documents:', err);
        setError(err?.response?.data?.error || err?.message || 'Failed to load documents. Please try again.');
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
      if (!selectedFamily) return;
      try {
        const foldersList = await AppDocumentsService.listFolders(
          selectedFamily.id,
          currentFolder ? currentFolder.id : null
        );
        setFolders(foldersList);
      } catch (err: any) {
        console.error('Error loading folders:', err);
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
    setCurrentFolder(folder);
    setFolderPath([...folderPath, folder]);
  };

  const navigateToPath = (index: number) => {
    if (index === -1) {
      setCurrentFolder(null);
      setFolderPath([]);
    } else {
      const targetFolder = folderPath[index];
      setCurrentFolder(targetFolder);
      setFolderPath(folderPath.slice(0, index + 1));
    }
  };

  const filterAndSortFolders = (foldersList: AppFolder[]) => {
    let filtered = foldersList;
    if (foldersFilter.trim()) {
      const filterLower = foldersFilter.toLowerCase();
      filtered = filtered.filter(
        (folder) =>
          folder.name.toLowerCase().includes(filterLower) ||
          (folder.description && folder.description.toLowerCase().includes(filterLower))
      );
    }
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (foldersSortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (foldersSortBy === 'date') {
        const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
        const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
        comparison = dateA - dateB;
      }
      return foldersSortOrder === 'asc' ? comparison : -comparison;
    });
    return filtered;
  };

  const filterAndSortDocuments = (documentsList: AppDocument[]) => {
    let filtered = documentsList;
    if (documentsFilter.trim()) {
      const filterLower = documentsFilter.toLowerCase();
      filtered = filtered.filter(
        (doc) =>
          doc.name.toLowerCase().includes(filterLower) ||
          (doc.description && doc.description.toLowerCase().includes(filterLower)) ||
          (doc.mime_type && doc.mime_type.toLowerCase().includes(filterLower))
      );
    }
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (documentsSortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (documentsSortBy === 'date') {
        const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
        const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
        comparison = dateA - dateB;
      } else if (documentsSortBy === 'size') {
        const sizeA = a.file_size || 0;
        const sizeB = b.file_size || 0;
        comparison = sizeA - sizeB;
      }
      return documentsSortOrder === 'asc' ? comparison : -comparison;
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
      // In React Native, we'd open this URL in a browser or document viewer
      Alert.alert('View Document', `Document URL: ${url}`);
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
      {/* Header Actions */}
      <View style={[styles.headerActions, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
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
          <Text style={styles.actionButtonText}>{showFolderForm ? 'Cancel' : 'New Folder'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
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
          <Text style={styles.actionButtonText}>{showUploadForm ? 'Cancel' : 'Upload Document'}</Text>
        </TouchableOpacity>
      </View>

      {/* Breadcrumb */}
      {(folderPath.length > 0 || currentFolder) && (
        <View style={[styles.breadcrumb, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
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
        </View>
      )}

      {/* Summary Statistics */}
      {!loading && (
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
            {/* Filter and Sort Controls */}
            <View style={[styles.filterSortContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <View style={styles.filterSortGroup}>
                <Text style={[styles.filterSortLabel, { color: colors.textSecondary }]}>Filter Folders:</Text>
                <TextInput
                  style={[styles.filterInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  placeholder="Search folders..."
                  placeholderTextColor={colors.textSecondary}
                  value={foldersFilter}
                  onChangeText={setFoldersFilter}
                />
              </View>
              <View style={styles.filterSortGroup}>
                <Text style={[styles.filterSortLabel, { color: colors.textSecondary }]}>Sort Folders:</Text>
                <View style={styles.sortControls}>
                  <TouchableOpacity
                    style={[styles.sortButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setFoldersSortBy(foldersSortBy === 'name' ? 'date' : 'name')}
                  >
                    <Text style={[styles.sortButtonText, { color: colors.text }]}>
                      {foldersSortBy === 'name' ? 'Name' : 'Date'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sortButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setFoldersSortOrder(foldersSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    <Text style={[styles.sortButtonText, { color: colors.text }]}>
                      {foldersSortOrder === 'asc' ? 'â†‘' : 'â†“'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.filterSortGroup}>
                <Text style={[styles.filterSortLabel, { color: colors.textSecondary }]}>Filter Documents:</Text>
                <TextInput
                  style={[styles.filterInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  placeholder="Search documents..."
                  placeholderTextColor={colors.textSecondary}
                  value={documentsFilter}
                  onChangeText={setDocumentsFilter}
                />
              </View>
              <View style={styles.filterSortGroup}>
                <Text style={[styles.filterSortLabel, { color: colors.textSecondary }]}>Sort Documents:</Text>
                <View style={styles.sortControls}>
                  <TouchableOpacity
                    style={[styles.sortButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => {
                      const order: ('name' | 'date' | 'size')[] = ['name', 'date', 'size'];
                      const currentIndex = order.indexOf(documentsSortBy);
                      setDocumentsSortBy(order[(currentIndex + 1) % order.length]);
                    }}
                  >
                    <Text style={[styles.sortButtonText, { color: colors.text }]}>{documentsSortBy}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sortButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setDocumentsSortOrder(documentsSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    <Text style={[styles.sortButtonText, { color: colors.text }]}>
                      {documentsSortOrder === 'asc' ? 'â†‘' : 'â†“'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Folders List */}
            {filterAndSortFolders(folders).length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Folders</Text>
                {filterAndSortFolders(folders).map((folder) => (
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
            {filterAndSortDocuments(documents).length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Documents</Text>
                {filterAndSortDocuments(documents).map((document) => (
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
          <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}> â€¢ </Text>
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
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
          {document.name}
        </Text>
        {document.description && (
          <Text style={[styles.fileDescription, { color: colors.textSecondary }]} numberOfLines={1}>
            {document.description}
          </Text>
        )}
        <View style={styles.fileMeta}>
          {document.file_size && (
            <>
              <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
                {AppDocumentsService.formatFileSize(document.file_size)}
              </Text>
              <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}> â€¢ </Text>
            </>
          )}
          {document.mime_type && (
            <>
              <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
                {AppDocumentsService.getFileTypeName(document.mime_type, document.name)}
              </Text>
              <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}> â€¢ </Text>
            </>
          )}
          <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}>
            {AppDocumentsService.formatDate(document.created_at)}
          </Text>
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

function OneDriveBrowser({ colors }: { colors: any }) {
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

  const loadFiles = useCallback(
    async (skipLoading = false) => {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError('');
        const filesList = await DocumentService.listOneDriveFiles(currentFolder || undefined);
        setFiles(filesList);
      } catch (err: any) {
        console.error('Error loading OneDrive files:', err);
        const errorData = err?.response?.data;
        const errorMessage = errorData?.error || err?.message || 'Failed to load files. Please try again.';

        // Handle session expiration specifically
        if (errorData?.requires_refresh) {
          setError('Session expired. Your OneDrive connection is still valid, but you need to refresh your session. Please log out and log back in.');
        } else {
          setError(errorMessage);
        }
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
      {error && (
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      {/* Header with actions */}
      <View style={[styles.browserHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => handleBreadcrumbClick(-1)}>
            <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>Home</Text>
          </TouchableOpacity>
          {folderPath.map((folder, index) => (
            <View key={folder.id} style={styles.breadcrumbRow}>
              <Text style={[styles.breadcrumbSeparator, { color: colors.textSecondary }]}> / </Text>
              <TouchableOpacity onPress={() => handleBreadcrumbClick(index)}>
                <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>{folder.name}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowUploadForm(true)}
            disabled={uploading}
          >
            <FontAwesome name="upload" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>Upload</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowFolderForm(true)}
            disabled={loading}
          >
            <FontAwesome name="folder" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>New Folder</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.filesScrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {files.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>This folder is empty.</Text>
          </View>
        ) : (
          <View style={styles.filesList}>
            {files.map((file) => (
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
    </View>
  );
}

function GoogleDriveBrowser({ colors }: { colors: any }) {
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

  const loadFiles = useCallback(
    async (skipLoading = false) => {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError('');
        const filesList = await DocumentService.listGoogleDriveFiles(currentFolder || undefined);
        setFiles(filesList);
      } catch (err: any) {
        console.error('Error loading Google Drive files:', err);
        const errorData = err?.response?.data;
        const errorMessage = errorData?.error || err?.message || 'Failed to load files. Please try again.';

        // Handle session expiration specifically
        if (errorData?.requires_refresh) {
          setError('Session expired. Your Google Drive connection is still valid, but you need to refresh your session. Please log out and log back in.');
        } else {
          setError(errorMessage);
        }
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
      {error && (
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      {/* Header with actions */}
      <View style={[styles.browserHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => handleBreadcrumbClick(-1)}>
            <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>Home</Text>
          </TouchableOpacity>
          {folderPath.map((folder, index) => (
            <View key={folder.id} style={styles.breadcrumbRow}>
              <Text style={[styles.breadcrumbSeparator, { color: colors.textSecondary }]}> / </Text>
              <TouchableOpacity onPress={() => handleBreadcrumbClick(index)}>
                <Text style={[styles.breadcrumbItem, { color: colors.primary }]}>{folder.name}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowUploadForm(true)}
            disabled={uploading}
          >
            <FontAwesome name="upload" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>Upload</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowFolderForm(true)}
            disabled={loading}
          >
            <FontAwesome name="folder" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>New Folder</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.filesScrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {files.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>This folder is empty.</Text>
          </View>
        ) : (
          <View style={styles.filesList}>
            {files.map((file) => (
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
        <Text style={styles.fileIconText}>{isFolder ? 'ðŸ“' : 'ðŸ“„'}</Text>
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
                {fileSize && <Text style={[styles.fileMetaText, { color: colors.textSecondary }]}> â€¢ </Text>}
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
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
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
    alignItems: 'center',
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
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileMetaText: {
    fontSize: 12,
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
  filterSortContainer: {
    padding: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  filterSortGroup: {
    gap: 6,
  },
  filterSortLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  filterInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
  },
  sortControls: {
    flexDirection: 'row',
    gap: 8,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 60,
    alignItems: 'center',
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '500',
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
    gap: 8,
  },
  fileActionButton: {
    padding: 8,
  },
});
