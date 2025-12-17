import React, { useState, useEffect } from 'react';
import { Image, ImageProps, View, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { tokenStorage } from '../utils/storage';
import apiClient from '../services/api';
import axios from 'axios';

interface AuthenticatedImageProps extends Omit<ImageProps, 'source'> {
  source: { uri: string };
  placeholder?: React.ReactNode;
}

/**
 * Image component that handles authenticated image URLs
 * Fetches images with auth headers on both web and native platforms
 * - On web: Converts response to blob URL
 * - On native: Converts response to base64 data URI (React Native Image doesn't support custom headers)
 */
export default function AuthenticatedImage({ 
  source, 
  placeholder,
  style,
  ...props 
}: AuthenticatedImageProps) {
  const { colors } = useTheme();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!source.uri) {
      setLoading(false);
      return;
    }

    // Fetch with authentication headers on both web and native
    // React Native Image doesn't support custom headers, so we need to fetch and convert
    const fetchImage = async () => {
      try {
        setLoading(true);
        setError(false);

        const token = await tokenStorage.getAccessToken();
        if (!token) {
          setError(true);
          setLoading(false);
          return;
        }

        // Check if URI is absolute or relative
        const isAbsoluteUrl = source.uri.startsWith('http://') || source.uri.startsWith('https://');
        
        // Normalize ngrok URLs to use https to prevent redirects during CORS preflight
        let imageUrl = source.uri;
        if (isAbsoluteUrl && imageUrl.includes('ngrok.app') && imageUrl.startsWith('http://')) {
          // Ngrok free tier requires HTTPS - convert http to https to avoid redirect
          imageUrl = imageUrl.replace('http://', 'https://');
        }
        
        let response;
        if (Platform.OS === 'web') {
          // On web, use blob response type
          if (isAbsoluteUrl) {
            response = await axios.get(imageUrl, {
              responseType: 'blob',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': '*/*',
              },
            });
          } else {
            response = await apiClient.get(imageUrl, {
              responseType: 'blob',
              headers: {
                'Accept': '*/*',
              },
            });
          }
          
          // Convert blob to object URL for web
          const blob = response.data as Blob;
          const blobUrl = URL.createObjectURL(blob);
          setImageUri(blobUrl);
          
          // Cleanup function for web
          return () => {
            URL.revokeObjectURL(blobUrl);
          };
        } else {
          // On native, use arraybuffer and convert to base64 data URI
          if (isAbsoluteUrl) {
            response = await axios.get(imageUrl, {
              responseType: 'arraybuffer',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': '*/*',
              },
            });
          } else {
            response = await apiClient.get(imageUrl, {
              responseType: 'arraybuffer',
              headers: {
                'Accept': '*/*',
              },
            });
          }
          
          // Determine content type from response headers or default to jpeg
          const contentType = response.headers['content-type'] || 'image/jpeg';
          const arrayBuffer = response.data as ArrayBuffer;
          
          // Convert ArrayBuffer to base64
          // React Native JavaScript environment supports btoa
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          
          // Convert to base64 (btoa is available in React Native)
          const base64 = btoa(binary);
          
          // Convert base64 to data URI for React Native Image component
          const dataUri = `data:${contentType};base64,${base64}`;
          setImageUri(dataUri);
        }
      } catch (err) {
        console.error('Error loading authenticated image:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchImage();
  }, [source.uri]);

  // Cleanup blob URL on unmount (web only)
  useEffect(() => {
    return () => {
      if (Platform.OS === 'web' && imageUri && imageUri.startsWith('blob:')) {
        URL.revokeObjectURL(imageUri);
      }
    };
  }, [imageUri]);

  if (loading) {
    return (
      <View style={[{ justifyContent: 'center', alignItems: 'center' }, style]}>
        {placeholder || <ActivityIndicator size="small" color={colors.primary} />}
      </View>
    );
  }

  if (error || !imageUri) {
    return (
      <View style={[{ justifyContent: 'center', alignItems: 'center' }, style]}>
        {placeholder}
      </View>
    );
  }

  return <Image source={{ uri: imageUri }} style={style} {...props} />;
}
