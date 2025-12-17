"""
Google Drive file management using Google Drive API v3.
"""
import requests
from typing import List, Dict, Optional, BinaryIO
from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone


class GoogleDriveSync:
    """Google Drive file management using Google Drive API v3."""

    def __init__(self, access_token: str, refresh_token: Optional[str] = None):
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.base_url = 'https://www.googleapis.com/drive/v3'

    def refresh_access_token(self) -> str:
        """Refresh the access token using refresh token."""
        if not self.refresh_token:
            raise ValueError("No refresh token available")

        # Use GOOGLEDRIVE settings if available, otherwise fall back to GOOGLE settings
        client_id = getattr(settings, 'GOOGLEDRIVE_CLIENT_ID', None) or settings.GOOGLE_CLIENT_ID
        client_secret = getattr(settings, 'GOOGLEDRIVE_CLIENT_SECRET', None) or settings.GOOGLE_CLIENT_SECRET

        # For token refresh, use the same logic as settings - prefer production if both are set
        redirect_uri_dev = getattr(settings, 'GOOGLEDRIVE_REDIRECT_URI_DEV', '')
        redirect_uri_prod = getattr(settings, 'GOOGLEDRIVE_REDIRECT_URI_PROD', '')
        if redirect_uri_dev and redirect_uri_prod:
            # Prefer production for server-side token refresh (more common scenario)
            redirect_uri = redirect_uri_prod if not settings.DEBUG else redirect_uri_dev
        else:
            redirect_uri = getattr(settings, 'GOOGLEDRIVE_REDIRECT_URI', None) or settings.GOOGLE_REDIRECT_URI

        token_url = 'https://oauth2.googleapis.com/token'
        data = {
            'client_id': client_id,
            'client_secret': client_secret,
            'refresh_token': self.refresh_token,
            'grant_type': 'refresh_token',
        }

        response = requests.post(token_url, data=data)
        response.raise_for_status()
        token_data = response.json()

        self.access_token = token_data['access_token']
        # Note: Google doesn't always return a new refresh_token, so keep the existing one
        if 'refresh_token' in token_data:
            self.refresh_token = token_data['refresh_token']

        return self.access_token

    def _get_headers(self, include_content_type: bool = True) -> Dict[str, str]:
        """Get headers with authorization."""
        headers = {
            'Authorization': f'Bearer {self.access_token}',
        }
        if include_content_type:
            headers['Content-Type'] = 'application/json'
        return headers

    def _ensure_valid_token(self):
        """Ensure access token is valid, refresh if needed."""
        # Simple check - in production, you might want to check expiration time
        # For now, we'll refresh on 401 errors
        pass

    def get_drive_info(self) -> Dict:
        """Get Google Drive account information."""
        headers = self._get_headers()
        response = requests.get(
            f'{self.base_url}/about',
            headers=headers,
            params={'fields': 'user,storageQuota'}
        )
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.get(
                f'{self.base_url}/about',
                headers=headers,
                params={'fields': 'user,storageQuota'}
            )
        response.raise_for_status()
        return response.json()

    def list_files(self, folder_id: Optional[str] = None) -> List[Dict]:
        """
        List files/folders in Google Drive.

        Args:
            folder_id: ID of folder to list. If None, lists root folder.

        Returns:
            List of file/folder items.
        """
        headers = self._get_headers()

        params = {
            'fields': 'files(id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink)',
            'pageSize': 1000,
        }

        if folder_id:
            params['q'] = f"'{folder_id}' in parents and trashed=false"
        else:
            params['q'] = "'root' in parents and trashed=false"

        response = requests.get(
            f'{self.base_url}/files',
            headers=headers,
            params=params
        )
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.get(
                f'{self.base_url}/files',
                headers=headers,
                params=params
            )
        response.raise_for_status()

        files = response.json().get('files', [])
        # Transform to match OneDrive-like structure
        result = []
        for file in files:
            result.append({
                'id': file.get('id'),
                'name': file.get('name'),
                'mimeType': file.get('mimeType'),
                'size': file.get('size'),
                'modifiedTime': file.get('modifiedTime'),
                'createdTime': file.get('createdTime'),
                'parents': file.get('parents', []),
                'webViewLink': file.get('webViewLink'),
                'folder': file.get('mimeType') == 'application/vnd.google-apps.folder',
            })
        return result

    def get_file(self, item_id: str) -> Dict:
        """Get file/folder metadata."""
        headers = self._get_headers()
        response = requests.get(
            f'{self.base_url}/files/{item_id}',
            headers=headers,
            params={'fields': 'id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink,thumbnailLink'}
        )
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.get(
                f'{self.base_url}/files/{item_id}',
                headers=headers,
                params={'fields': 'id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink,thumbnailLink'}
            )
        response.raise_for_status()

        file_data = response.json()
        # Transform to match OneDrive-like structure
        return {
            'id': file_data.get('id'),
            'name': file_data.get('name'),
            'mimeType': file_data.get('mimeType'),
            'size': file_data.get('size'),
            'modifiedTime': file_data.get('modifiedTime'),
            'createdTime': file_data.get('createdTime'),
            'parents': file_data.get('parents', []),
            'webViewLink': file_data.get('webViewLink'),
            'thumbnailLink': file_data.get('thumbnailLink'),
            'folder': file_data.get('mimeType') == 'application/vnd.google-apps.folder',
        }

    def download_file(self, item_id: str) -> bytes:
        """Download file content."""
        headers = self._get_headers(include_content_type=False)

        # First get file metadata to check if it's a Google Workspace file
        file_metadata = self.get_file(item_id)
        mime_type = file_metadata.get('mimeType', '')

        # For Google Workspace files, export as a standard format
        if mime_type.startswith('application/vnd.google-apps.'):
            # Export Google Docs/Sheets/Slides to a standard format
            export_mime_type = 'application/pdf'  # Default export format
            if 'document' in mime_type:
                export_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            elif 'spreadsheet' in mime_type:
                export_mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            elif 'presentation' in mime_type:
                export_mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

            url = f'{self.base_url}/files/{item_id}/export'
            params = {'mimeType': export_mime_type}
        else:
            # Regular file download
            url = f'{self.base_url}/files/{item_id}'
            params = {'alt': 'media'}

        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers(include_content_type=False)
            response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.content

    def upload_file(self, file_data: bytes, filename: str, folder_id: Optional[str] = None) -> Dict:
        """
        Upload file to Google Drive.

        Args:
            file_data: File content as bytes
            filename: Name of the file
            folder_id: ID of folder to upload to. If None, uploads to root.

        Returns:
            Uploaded file metadata.
        """
        # Prepare metadata
        metadata = {
            'name': filename,
        }
        if folder_id:
            metadata['parents'] = [folder_id]

        # For small files (< 5MB), use multipart upload
        if len(file_data) < 5 * 1024 * 1024:
            # Multipart upload using standard approach
            import json
            import uuid

            boundary = uuid.uuid4().hex
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': f'multipart/related; boundary={boundary}',
            }

            # Build multipart body
            body_parts = []
            body_parts.append(f'--{boundary}'.encode())
            body_parts.append(b'Content-Type: application/json; charset=UTF-8')
            body_parts.append(b'')
            body_parts.append(json.dumps(metadata).encode())
            body_parts.append(b'')
            body_parts.append(f'--{boundary}'.encode())
            body_parts.append(b'Content-Type: application/octet-stream')
            body_parts.append(b'')
            body_parts.append(file_data)
            body_parts.append(f'--{boundary}--'.encode())

            body = b'\r\n'.join(body_parts)

            url = f'{self.base_url}/files'
            params = {'uploadType': 'multipart', 'fields': 'id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink'}
            response = requests.post(url, headers=headers, data=body, params=params)
        else:
            # Resumable upload for larger files
            # First, create the file metadata
            headers = self._get_headers()
            url = f'{self.base_url}/files'
            params = {'uploadType': 'resumable', 'fields': 'id'}
            response = requests.post(
                url,
                headers=headers,
                json=metadata,
                params=params
            )
            if response.status_code == 401:
                self.refresh_access_token()
                headers = self._get_headers()
                response = requests.post(
                    url,
                    headers=headers,
                    json=metadata,
                    params=params
                )
            response.raise_for_status()

            # Get upload URL
            upload_url = response.headers.get('Location')
            if not upload_url:
                raise ValueError("No upload URL received from Google Drive")

            # Upload the file
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/octet-stream',
            }
            response = requests.put(upload_url, headers=headers, data=file_data)

        if response.status_code == 401:
            self.refresh_access_token()
            # Retry with refreshed token
            if len(file_data) < 5 * 1024 * 1024:
                import json
                import uuid
                boundary = uuid.uuid4().hex
                headers = {
                    'Authorization': f'Bearer {self.access_token}',
                    'Content-Type': f'multipart/related; boundary={boundary}',
                }
                body_parts = []
                body_parts.append(f'--{boundary}'.encode())
                body_parts.append(b'Content-Type: application/json; charset=UTF-8')
                body_parts.append(b'')
                body_parts.append(json.dumps(metadata).encode())
                body_parts.append(b'')
                body_parts.append(f'--{boundary}'.encode())
                body_parts.append(b'Content-Type: application/octet-stream')
                body_parts.append(b'')
                body_parts.append(file_data)
                body_parts.append(f'--{boundary}--'.encode())
                body = b'\r\n'.join(body_parts)
                url = f'{self.base_url}/files'
                params = {'uploadType': 'multipart', 'fields': 'id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink'}
                response = requests.post(url, headers=headers, data=body, params=params)

        response.raise_for_status()
        file_result = response.json()

        # If resumable upload, get full file metadata
        if 'name' not in file_result:
            file_result = self.get_file(file_result.get('id'))

        # Transform to match OneDrive-like structure
        return {
            'id': file_result.get('id'),
            'name': file_result.get('name'),
            'mimeType': file_result.get('mimeType'),
            'size': file_result.get('size'),
            'modifiedTime': file_result.get('modifiedTime'),
            'createdTime': file_result.get('createdTime'),
            'parents': file_result.get('parents', []),
            'webViewLink': file_result.get('webViewLink'),
            'folder': file_result.get('mimeType') == 'application/vnd.google-apps.folder',
        }

    def create_folder(self, name: str, parent_folder_id: Optional[str] = None) -> Dict:
        """
        Create folder in Google Drive.

        Args:
            name: Name of the folder
            parent_folder_id: ID of parent folder. If None, creates in root.

        Returns:
            Created folder metadata.
        """
        headers = self._get_headers()

        metadata = {
            'name': name,
            'mimeType': 'application/vnd.google-apps.folder',
        }
        if parent_folder_id:
            metadata['parents'] = [parent_folder_id]

        response = requests.post(
            f'{self.base_url}/files',
            headers=headers,
            json=metadata,
            params={'fields': 'id,name,mimeType,createdTime,parents,webViewLink'}
        )
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.post(
                f'{self.base_url}/files',
                headers=headers,
                json=metadata,
                params={'fields': 'id,name,mimeType,createdTime,parents,webViewLink'}
            )
        response.raise_for_status()

        folder_data = response.json()
        # Transform to match OneDrive-like structure
        return {
            'id': folder_data.get('id'),
            'name': folder_data.get('name'),
            'mimeType': folder_data.get('mimeType'),
            'createdTime': folder_data.get('createdTime'),
            'parents': folder_data.get('parents', []),
            'webViewLink': folder_data.get('webViewLink'),
            'folder': True,
        }

    def delete_item(self, item_id: str) -> None:
        """Delete file or folder from Google Drive."""
        headers = self._get_headers()
        response = requests.delete(
            f'{self.base_url}/files/{item_id}',
            headers=headers
        )
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.delete(
                f'{self.base_url}/files/{item_id}',
                headers=headers
            )
        response.raise_for_status()
