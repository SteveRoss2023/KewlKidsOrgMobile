"""
OneDrive file management using Microsoft Graph API.
"""
import requests
from typing import List, Dict, Optional, BinaryIO
from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone


class OneDriveSync:
    """OneDrive file management using Microsoft Graph API."""

    def __init__(self, access_token: str, refresh_token: Optional[str] = None):
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.base_url = 'https://graph.microsoft.com/v1.0'

    def refresh_access_token(self) -> str:
        """Refresh the access token using refresh token."""
        if not self.refresh_token:
            raise ValueError("No refresh token available")

        # Use ONEDRIVE settings if available, otherwise fall back to MICROSOFT settings
        client_id = getattr(settings, 'ONEDRIVE_CLIENT_ID', None) or settings.MICROSOFT_CLIENT_ID
        client_secret = getattr(settings, 'ONEDRIVE_CLIENT_SECRET', None) or settings.MICROSOFT_CLIENT_SECRET

        # For token refresh, use the same logic as settings - prefer production if both are set
        redirect_uri_dev = getattr(settings, 'ONEDRIVE_REDIRECT_URI_DEV', '')
        redirect_uri_prod = getattr(settings, 'ONEDRIVE_REDIRECT_URI_PROD', '')
        if redirect_uri_dev and redirect_uri_prod:
            # Prefer production for server-side token refresh (more common scenario)
            redirect_uri = redirect_uri_prod if not settings.DEBUG else redirect_uri_dev
        else:
            redirect_uri = getattr(settings, 'ONEDRIVE_REDIRECT_URI', None) or settings.MICROSOFT_REDIRECT_URI

        # Use consumers endpoint for personal accounts, common for all account types
        tenant = 'consumers'  # Change to 'common' if your app supports all account types
        token_url = f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'
        data = {
            'client_id': client_id,
            'client_secret': client_secret,
            'refresh_token': self.refresh_token,
            'grant_type': 'refresh_token',
            'redirect_uri': redirect_uri,
        }

        response = requests.post(token_url, data=data)
        response.raise_for_status()
        token_data = response.json()

        self.access_token = token_data['access_token']
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
        """Get OneDrive account information."""
        headers = self._get_headers()
        response = requests.get(
            f'{self.base_url}/me/drive',
            headers=headers
        )
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.get(
                f'{self.base_url}/me/drive',
                headers=headers
            )
        response.raise_for_status()
        return response.json()

    def list_files(self, folder_id: Optional[str] = None) -> List[Dict]:
        """
        List files/folders in OneDrive.

        Args:
            folder_id: ID of folder to list. If None, lists root folder.

        Returns:
            List of file/folder items.
        """
        headers = self._get_headers()

        if folder_id:
            url = f'{self.base_url}/me/drive/items/{folder_id}/children'
        else:
            url = f'{self.base_url}/me/drive/root/children'

        response = requests.get(url, headers=headers)
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json().get('value', [])

    def get_file(self, item_id: str) -> Dict:
        """Get file/folder metadata."""
        headers = self._get_headers()
        response = requests.get(
            f'{self.base_url}/me/drive/items/{item_id}',
            headers=headers
        )
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.get(
                f'{self.base_url}/me/drive/items/{item_id}',
                headers=headers
            )
        response.raise_for_status()
        return response.json()

    def download_file(self, item_id: str) -> bytes:
        """Download file content."""
        headers = self._get_headers(include_content_type=False)
        response = requests.get(
            f'{self.base_url}/me/drive/items/{item_id}/content',
            headers=headers
        )
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers(include_content_type=False)
            response = requests.get(
                f'{self.base_url}/me/drive/items/{item_id}/content',
                headers=headers
            )
        response.raise_for_status()
        return response.content

    def upload_file(self, file_data: bytes, filename: str, folder_id: Optional[str] = None) -> Dict:
        """
        Upload file to OneDrive.

        Args:
            file_data: File content as bytes
            filename: Name of the file
            folder_id: ID of folder to upload to. If None, uploads to root.

        Returns:
            Uploaded file metadata.
        """
        headers = self._get_headers(include_content_type=False)

        if folder_id:
            url = f'{self.base_url}/me/drive/items/{folder_id}:/{filename}:/content'
        else:
            url = f'{self.base_url}/me/drive/root:/{filename}:/content'

        response = requests.put(url, headers=headers, data=file_data)
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers(include_content_type=False)
            response = requests.put(url, headers=headers, data=file_data)
        response.raise_for_status()
        return response.json()

    def create_folder(self, name: str, parent_folder_id: Optional[str] = None) -> Dict:
        """
        Create folder in OneDrive.

        Args:
            name: Name of the folder
            parent_folder_id: ID of parent folder. If None, creates in root.

        Returns:
            Created folder metadata.
        """
        headers = self._get_headers()

        if parent_folder_id:
            url = f'{self.base_url}/me/drive/items/{parent_folder_id}/children'
        else:
            url = f'{self.base_url}/me/drive/root/children'

        data = {
            'name': name,
            'folder': {},
            '@microsoft.graph.conflictBehavior': 'rename'
        }

        response = requests.post(url, headers=headers, json=data)
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.post(url, headers=headers, json=data)

        # Log the response for debugging
        import logging
        logger = logging.getLogger(__name__)
        if response.status_code >= 400:
            logger.error(f"OneDrive create_folder failed: {response.status_code} - {response.text}")
        else:
            logger.info(f"OneDrive create_folder success: {response.status_code} - Folder: {name}, Parent: {parent_folder_id or 'root'}")

        response.raise_for_status()
        result = response.json()

        # Validate that the folder was actually created
        if 'id' not in result:
            logger.error(f"OneDrive create_folder response missing 'id': {result}")
            raise ValueError(f"OneDrive API did not return folder ID. Response: {result}")

        return result

    def delete_item(self, item_id: str) -> None:
        """Delete file or folder from OneDrive."""
        headers = self._get_headers()
        response = requests.delete(
            f'{self.base_url}/me/drive/items/{item_id}',
            headers=headers
        )
        if response.status_code == 401:
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.delete(
                f'{self.base_url}/me/drive/items/{item_id}',
                headers=headers
            )
        response.raise_for_status()



