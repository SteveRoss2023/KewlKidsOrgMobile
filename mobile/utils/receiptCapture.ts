/**
 * Capture a receipt image from gallery (preferred: Samsung Scan saved photo)
 * or optional camera photo.
 */
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type ReceiptCaptureResult = {
  uri: string;
  fileName: string;
  mimeType: string;
} | null;

export async function takePhoto(): Promise<ReceiptCaptureResult> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Required', 'Camera permission is needed to photograph a receipt.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: Platform.OS !== 'web',
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.fileName || `receipt-${Date.now()}.jpg`,
    mimeType: asset.mimeType || 'image/jpeg',
  };
}

export async function pickFromGallery(): Promise<ReceiptCaptureResult> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Required', 'Photo library permission is needed to pick a receipt.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: Platform.OS !== 'web',
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.fileName || `receipt-${Date.now()}.jpg`,
    mimeType: asset.mimeType || 'image/jpeg',
  };
}
