import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import ProfileService from '../services/profileService';
import { APIError } from '../services/api';
import AlertModal from './AlertModal';

interface EmailVerificationBannerProps {
  email: string;
  onVerificationComplete?: () => void;
}

export default function EmailVerificationBanner({
  email,
  onVerificationComplete,
}: EmailVerificationBannerProps) {
  const { colors } = useTheme();
  const [sending, setSending] = useState(false);
  const [alertModal, setAlertModal] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'info' | 'success' | 'error' | 'warning',
  });

  const handleResendEmail = async () => {
    try {
      setSending(true);
      await ProfileService.resendVerificationEmail();
      setAlertModal({
        visible: true,
        title: 'Verification Email Sent',
        message: `A new verification email has been sent to ${email}. Please check your inbox and click the verification link.`,
        type: 'success',
      });
    } catch (error) {
      const apiError = error as APIError;
      setAlertModal({
        visible: true,
        title: 'Error',
        message: apiError.message || 'Failed to send verification email. Please try again later.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <View style={[styles.banner, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}>
        <View style={styles.content}>
          <Ionicons name="mail-outline" size={20} color={colors.warning} style={styles.icon} />
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: colors.text }]}>
              Verify Your Email
            </Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              Please verify your email address ({email}) to access all features, including accepting family invitations.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleResendEmail}
          disabled={sending}
          style={[styles.button, { backgroundColor: colors.warning }]}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Resend Email</Text>
          )}
        </TouchableOpacity>
      </View>

      <AlertModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ ...alertModal, visible: false })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  icon: {
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

