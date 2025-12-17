/**
 * Document Service for managing documents from OneDrive and Google Drive
 */
import apiClient from './api';

export interface CloudFile {
  id: string;
  name: string;
  folder?: boolean;
  mimeType?: string;
  size?: number;
  modifiedTime?: string;
  createdTime?: string;
  lastModifiedDateTime?: string; // OneDrive
  createdDateTime?: string; // OneDrive
  file?: {
    mimeType?: string;
  };
  webViewLink?: string;
  parents?: string[];
}

export interface CloudFilesResponse {
  files: CloudFile[];
}

class DocumentService {
  /**
   * List files from OneDrive
   */
  async listOneDriveFiles(folderId?: string): Promise<CloudFile[]> {
    try {
      const params: any = {};
      if (folderId) {
        params.folder_id = folderId;
      }
      const response = await apiClient.get<CloudFilesResponse>('/onedrive/files/', { params });
      return response.data.files || [];
    } catch (error: any) {
      console.error('Error listing OneDrive files:', error);
      throw error;
    }
  }

  /**
   * List files from Google Drive
   */
  async listGoogleDriveFiles(folderId?: string): Promise<CloudFile[]> {
    try {
      const params: any = {};
      if (folderId) {
        params.folder_id = folderId;
      }
      const response = await apiClient.get<CloudFilesResponse>('/googledrive/files/', { params });
      return response.data.files || [];
    } catch (error: any) {
      console.error('Error listing Google Drive files:', error);
      throw error;
    }
  }

  /**
   * Upload file to OneDrive
   */
  async uploadOneDriveFile(fileUri: string, fileName: string, mimeType: string, folderId?: string): Promise<CloudFile> {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        name: fileName,
        type: mimeType || 'application/octet-stream',
      } as any);
      if (folderId) {
        formData.append('folder_id', folderId);
      }
      const response = await apiClient.post<CloudFile>('/onedrive/files/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('Error uploading OneDrive file:', error);
      throw error;
    }
  }

  /**
   * Upload file to Google Drive
   */
  async uploadGoogleDriveFile(fileUri: string, fileName: string, mimeType: string, folderId?: string): Promise<CloudFile> {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        name: fileName,
        type: mimeType || 'application/octet-stream',
      } as any);
      if (folderId) {
        formData.append('folder_id', folderId);
      }
      const response = await apiClient.post<CloudFile>('/googledrive/files/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('Error uploading Google Drive file:', error);
      throw error;
    }
  }

  /**
   * Create folder in OneDrive
   */
  async createOneDriveFolder(name: string, parentFolderId?: string): Promise<CloudFile> {
    try {
      const data: any = { name };
      if (parentFolderId) {
        data.parent_folder_id = parentFolderId;
      }
      const response = await apiClient.post<CloudFile>('/onedrive/folders/create/', data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating OneDrive folder:', error);
      throw error;
    }
  }

  /**
   * Create folder in Google Drive
   */
  async createGoogleDriveFolder(name: string, folderId?: string): Promise<CloudFile> {
    try {
      const data: any = { name };
      if (folderId) {
        data.folder_id = folderId;
      }
      const response = await apiClient.post<CloudFile>('/googledrive/folders/create/', data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating Google Drive folder:', error);
      throw error;
    }
  }

  /**
   * Delete item from OneDrive
   */
  async deleteOneDriveItem(itemId: string): Promise<void> {
    try {
      await apiClient.delete(`/onedrive/files/${itemId}/delete/`);
    } catch (error: any) {
      console.error('Error deleting OneDrive item:', error);
      throw error;
    }
  }

  /**
   * Delete item from Google Drive
   */
  async deleteGoogleDriveItem(itemId: string): Promise<void> {
    try {
      await apiClient.delete(`/googledrive/files/${itemId}/delete/`);
    } catch (error: any) {
      console.error('Error deleting Google Drive item:', error);
      throw error;
    }
  }

  /**
   * Download file from OneDrive
   */
  async downloadOneDriveFile(itemId: string): Promise<Blob> {
    try {
      const response = await apiClient.get(`/onedrive/files/${itemId}/?download=true`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error: any) {
      console.error('Error downloading OneDrive file:', error);
      throw error;
    }
  }

  /**
   * Download file from Google Drive
   */
  async downloadGoogleDriveFile(itemId: string): Promise<Blob> {
    try {
      const response = await apiClient.get(`/googledrive/files/${itemId}/?download=true`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error: any) {
      console.error('Error downloading Google Drive file:', error);
      throw error;
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file type name from mime type and filename
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
    if (['xlsx', 'xls'].includes(extension) || mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return 'Excel';
    if (['docx', 'doc'].includes(extension) || mimeType?.includes('word') || mimeType?.includes('document')) return 'Word';
    if (['pptx', 'ppt'].includes(extension) || mimeType?.includes('presentation') || mimeType?.includes('powerpoint')) return 'PowerPoint';

    // PDF
    if (extension === 'pdf' || mimeType?.includes('pdf')) return 'PDF';

    // Images
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(extension) || mimeType?.startsWith('image/')) {
      if (extension === 'jpg' || extension === 'jpeg') return 'JPEG Image';
      if (extension === 'png') return 'PNG Image';
      if (extension === 'gif') return 'GIF Image';
      return 'Image';
    }

    // Videos
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v'].includes(extension) || mimeType?.startsWith('video/')) {
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
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension) || mimeType?.includes('zip') || mimeType?.includes('archive') || mimeType?.includes('compressed')) {
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

    // Try to extract from MIME type
    if (mimeType) {
      const parts = mimeType.split('/');
      if (parts.length === 2) {
        const type = parts[0];
        const subtype = parts[1];

        if (type === 'application') {
          if (subtype.includes('json')) return 'JSON';
          if (subtype.includes('xml')) return 'XML';
          if (subtype.includes('javascript')) return 'JavaScript';
          return subtype.split('.').pop()?.toUpperCase() || 'File';
        }
        return subtype.split('.').pop()?.toUpperCase() || type.charAt(0).toUpperCase() + type.slice(1);
      }
    }

    // Fallback to extension
    if (extension) {
      return extension.toUpperCase() + ' File';
    }

    return 'File';
  }
}

export default new DocumentService();







