/**
 * App Documents Service for managing app documents and folders
 */
import { Platform } from 'react-native';
import apiClient from './api';

export interface AppDocument {
  id: number;
  name: string;
  description?: string;
  file_size?: number;
  mime_type?: string;
  parent_folder?: number | null;
  family: number;
  created_at: string;
  updated_at: string;
  is_encrypted?: boolean;
  uploaded_by_username?: string;
}

export interface AppFolder {
  id: number;
  name: string;
  description?: string;
  parent_folder?: number | null;
  family: number;
  created_at: string;
  updated_at: string;
  subfolders_count?: number;
  documents_count?: number;
}

export interface DocumentsResponse {
  results?: AppDocument[];
  count?: number;
}

export interface FoldersResponse {
  results?: AppFolder[];
  count?: number;
}

class AppDocumentsService {
  /**
   * List documents
   */
  async listDocuments(familyId: number, parentFolderId?: number | null): Promise<AppDocument[]> {
    try {
      const params: any = { family: familyId };
      if (parentFolderId !== undefined) {
        params.parent_folder = parentFolderId === null ? 'null' : parentFolderId;
      }
      const response = await apiClient.get<DocumentsResponse>('/documents/', { params });
      return response.data.results || response.data || [];
    } catch (error: any) {
      console.error('Error listing documents:', error);
      throw error;
    }
  }

  /**
   * List folders
   */
  async listFolders(familyId: number, parentFolderId?: number | null): Promise<AppFolder[]> {
    try {
      const params: any = { family: familyId };
      if (parentFolderId !== undefined) {
        params.parent_folder = parentFolderId === null ? 'null' : parentFolderId;
      }
      const response = await apiClient.get<FoldersResponse>('/folders/', { params });
      return response.data.results || response.data || [];
    } catch (error: any) {
      console.error('Error listing folders:', error);
      throw error;
    }
  }

  /**
   * Upload document
   */
  async uploadDocument(
    fileUri: string,
    fileName: string,
    mimeType: string,
    familyId: number,
    name: string,
    description?: string,
    parentFolderId?: number | null
  ): Promise<AppDocument> {
    try {
      const formData = new FormData();

      // Handle file upload differently for web vs native
      if (Platform.OS === 'web') {
        // On web, we need to convert the URI to a File object
        try {
          // Fetch the file as a blob
          const response = await fetch(fileUri);
          const blob = await response.blob();
          const file = new File([blob], fileName, { type: mimeType || 'application/octet-stream' });
          formData.append('file', file);
        } catch (fetchError) {
          // If fetch fails (e.g., data URI), try to create from base64
          if (fileUri.startsWith('data:')) {
            const base64Data = fileUri.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType || 'application/octet-stream' });
            const file = new File([blob], fileName, { type: mimeType || 'application/octet-stream' });
            formData.append('file', file);
          } else {
            throw fetchError;
          }
        }
      } else {
        // On native (iOS/Android), use the React Native FormData format
        formData.append('file', {
          uri: fileUri,
          name: fileName,
          type: mimeType || 'application/octet-stream',
        } as any);
      }

      formData.append('name', name);
      formData.append('family', familyId.toString());
      if (description) {
        formData.append('description', description);
      }
      if (parentFolderId !== undefined && parentFolderId !== null) {
        formData.append('parent_folder', parentFolderId.toString());
      }

      // Don't set Content-Type header - let axios set it automatically with boundary
      const response = await apiClient.post<AppDocument>('/documents/', formData);
      return response.data;
    } catch (error: any) {
      console.error('Error uploading document:', error);
      throw error;
    }
  }

  /**
   * Create folder
   */
  async createFolder(
    familyId: number,
    name: string,
    description?: string,
    parentFolderId?: number | null
  ): Promise<AppFolder> {
    try {
      const data: any = {
        name,
        family: familyId,
      };
      if (description) {
        data.description = description;
      }
      if (parentFolderId !== undefined && parentFolderId !== null) {
        data.parent_folder = parentFolderId;
      }

      const response = await apiClient.post<AppFolder>('/folders/', data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating folder:', error);
      throw error;
    }
  }

  /**
   * Update document
   */
  async updateDocument(
    documentId: number,
    name?: string,
    description?: string,
    fileUri?: string,
    fileName?: string,
    mimeType?: string,
    parentFolderId?: number | null
  ): Promise<AppDocument> {
    try {
      const formData = new FormData();
      if (name) {
        formData.append('name', name);
      }
      if (description !== undefined) {
        formData.append('description', description || '');
      }
      if (fileUri && fileName) {
        // Handle file upload differently for web vs native
        if (Platform.OS === 'web') {
          // On web, we need to convert the URI to a File object
          try {
            const response = await fetch(fileUri);
            const blob = await response.blob();
            const file = new File([blob], fileName, { type: mimeType || 'application/octet-stream' });
            formData.append('file', file);
          } catch (fetchError) {
            if (fileUri.startsWith('data:')) {
              const base64Data = fileUri.split(',')[1];
              const byteCharacters = atob(base64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: mimeType || 'application/octet-stream' });
              const file = new File([blob], fileName, { type: mimeType || 'application/octet-stream' });
              formData.append('file', file);
            } else {
              throw fetchError;
            }
          }
        } else {
          // On native (iOS/Android), use the React Native FormData format
          formData.append('file', {
            uri: fileUri,
            name: fileName,
            type: mimeType || 'application/octet-stream',
          } as any);
        }
      }
      if (parentFolderId !== undefined) {
        formData.append('parent_folder', parentFolderId === null ? '' : parentFolderId.toString());
      }

      // Don't set Content-Type header - let axios set it automatically with boundary
      const response = await apiClient.patch<AppDocument>(`/documents/${documentId}/`, formData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating document:', error);
      throw error;
    }
  }

  /**
   * Update folder
   */
  async updateFolder(
    folderId: number,
    name?: string,
    description?: string,
    parentFolderId?: number | null
  ): Promise<AppFolder> {
    try {
      const data: any = {};
      if (name) {
        data.name = name;
      }
      if (description !== undefined) {
        data.description = description || '';
      }
      if (parentFolderId !== undefined) {
        data.parent_folder = parentFolderId;
      }

      const response = await apiClient.patch<AppFolder>(`/folders/${folderId}/`, data);
      return response.data;
    } catch (error: any) {
      console.error('Error updating folder:', error);
      throw error;
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId: number): Promise<void> {
    try {
      await apiClient.delete(`/documents/${documentId}/`);
    } catch (error: any) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Delete folder
   */
  async deleteFolder(folderId: number): Promise<void> {
    try {
      await apiClient.delete(`/folders/${folderId}/`);
    } catch (error: any) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  }

  /**
   * Download document
   */
  async downloadDocument(documentId: number): Promise<Blob> {
    try {
      const response = await apiClient.get(`/documents/${documentId}/download/`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error: any) {
      console.error('Error downloading document:', error);
      throw error;
    }
  }

  /**
   * Get view token for document
   */
  async getViewToken(documentId: number): Promise<{ url: string }> {
    try {
      const response = await apiClient.get<{ url: string }>(`/documents/${documentId}/view-token/`);
      return response.data;
    } catch (error: any) {
      console.error('Error getting view token:', error);
      throw error;
    }
  }

  /**
   * Format file size
   */
  formatFileSize(bytes: number | undefined): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file type name
   */
  getFileTypeName(mimeType?: string, fileName?: string): string {
    if (!mimeType && !fileName) return 'File';

    const getExtension = (name?: string) => {
      if (!name) return '';
      const parts = name.split('.');
      return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    };

    const extension = getExtension(fileName);

    // Google Workspace files
    if (mimeType === 'application/vnd.google-apps.document') return 'Google Docs';
    if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheets';
    if (mimeType === 'application/vnd.google-apps.presentation') return 'Google Slides';

    // Microsoft Office
    if (['xlsx', 'xls'].includes(extension) || mimeType?.includes('excel') || mimeType?.includes('spreadsheet'))
      return 'Excel';
    if (['docx', 'doc'].includes(extension) || mimeType?.includes('word') || mimeType?.includes('document'))
      return 'Word';
    if (['pptx', 'ppt'].includes(extension) || mimeType?.includes('presentation') || mimeType?.includes('powerpoint'))
      return 'PowerPoint';

    // PDF
    if (extension === 'pdf' || mimeType?.includes('pdf')) return 'PDF';

    // Images
    if (
      ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(extension) ||
      mimeType?.startsWith('image/')
    ) {
      if (extension === 'jpg' || extension === 'jpeg') return 'JPEG Image';
      if (extension === 'png') return 'PNG Image';
      if (extension === 'gif') return 'GIF Image';
      return 'Image';
    }

    // Videos
    if (
      ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v'].includes(extension) ||
      mimeType?.startsWith('video/')
    ) {
      if (extension === 'mp4') return 'MP4 Video';
      if (extension === 'avi') return 'AVI Video';
      if (extension === 'mov') return 'QuickTime Video';
      return 'Video';
    }

    // Audio
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(extension) || mimeType?.startsWith('audio/')) {
      if (extension === 'mp3') return 'MP3 Audio';
      if (extension === 'wav') return 'WAV Audio';
      return 'Audio';
    }

    // Archives
    if (
      ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension) ||
      mimeType?.includes('zip') ||
      mimeType?.includes('archive') ||
      mimeType?.includes('compressed')
    ) {
      if (extension === 'zip') return 'ZIP Archive';
      if (extension === 'rar') return 'RAR Archive';
      return 'Archive';
    }

    // Text files
    if (['txt', 'md', 'rtf', 'csv'].includes(extension) || mimeType?.includes('text/')) {
      if (extension === 'txt') return 'Text Document';
      if (extension === 'csv') return 'CSV File';
      if (extension === 'md') return 'Markdown';
      return 'Text';
    }

    // Fallback
    if (extension) {
      return extension.toUpperCase() + ' File';
    }

    return 'File';
  }

  /**
   * Format date
   */
  formatDate(dateString: string | undefined): string {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Unknown';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Unknown';
    }
  }
}

const appDocumentsService = new AppDocumentsService();
export default appDocumentsService;







