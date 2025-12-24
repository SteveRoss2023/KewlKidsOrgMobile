"""
Google Photos media management using Google Photos Library API v1.
"""
from typing import Dict, Optional

import requests
from django.conf import settings


class GooglePhotosClient:
    """
    Minimal Google Photos client for listing media items.

    This is intentionally small – just enough to power the Documents > Google Photos
    tab by returning viewable image URLs.
    """

    def __init__(self, access_token: str, refresh_token: Optional[str] = None):
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.base_url = "https://photoslibrary.googleapis.com/v1"

    def refresh_access_token(self) -> str:
        """Refresh the access token using the stored refresh token."""
        if not self.refresh_token:
            raise ValueError("No refresh token available")

        # Use Google Drive OAuth client (consolidated - same client for both services)
        client_id = getattr(settings, "GOOGLEDRIVE_CLIENT_ID", None) or getattr(
            settings, "GOOGLE_CLIENT_ID"
        )
        client_secret = getattr(
            settings, "GOOGLEDRIVE_CLIENT_SECRET", None
        ) or getattr(settings, "GOOGLE_CLIENT_SECRET")

        if not client_id or not client_secret:
            raise ValueError("Google OAuth client not configured")

        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": self.refresh_token,
            "grant_type": "refresh_token",
        }

        response = requests.post(token_url, data=data)
        response.raise_for_status()
        token_data = response.json()

        self.access_token = token_data["access_token"]
        # Google may or may not return a new refresh_token; keep the old one if missing
        if "refresh_token" in token_data and token_data["refresh_token"]:
            self.refresh_token = token_data["refresh_token"]

        return self.access_token

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
        }

    def list_media_items(
        self,
        page_size: int = 100,
        page_token: Optional[str] = None,
        album_id: Optional[str] = None,
    ) -> Dict:
        """
        List media items from Google Photos.

        Returns the raw API response dict so the caller can normalize the fields.
        """
        headers = self._get_headers()

        # For now we use the simple /mediaItems endpoint; this can be expanded later
        # to use search if we want album filters or date ranges.
        url = f"{self.base_url}/mediaItems"
        params: Dict[str, str] = {"pageSize": str(page_size)}
        if page_token:
            params["pageToken"] = page_token
        if album_id:
            params["albumId"] = album_id

        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 401:
            # Access token likely expired – try a refresh once
            self.refresh_access_token()
            headers = self._get_headers()
            response = requests.get(url, headers=headers, params=params)

        response.raise_for_status()
        return response.json()


