import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import AuthService, { LoginCredentials } from '../../services/authService';
import AlertModal from '../../components/AlertModal';
import { useTheme } from '../../contexts/ThemeContext';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ 
    email?: string; 
    invitation_email?: string;
    error?: string;
    verified?: string;
    message?: string;
    message_type?: 'success' | 'error' | 'info' | 'warning';
  }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const messageShownRef = useRef(false); // Track if we've already shown the message
  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  // Pre-populate email from URL parameters (run first to capture email before clearing URL)
  useEffect(() => {
    const emailParam = params.email || params.invitation_email;
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [params.email, params.invitation_email]);

  // Show error message if present in URL
  useEffect(() => {
    if (params.error && !alertModal.visible) {
      setAlertModal({
        visible: true,
        title: 'Error',
        message: decodeURIComponent(params.error),
        type: 'error',
      });
    }
  }, [params.error]);

  // Show success message if email was verified
  useEffect(() => {
    if (params.verified === 'true' && params.email && !alertModal.visible) {
      setAlertModal({
        visible: true,
        title: 'Email Verified',
        message: `Your email ${params.email} has been successfully verified!`,
        type: 'success',
      });
    }
  }, [params.verified, params.email]);

  // Show info/warning message if present in URL (e.g., invitation already accepted)
  useEffect(() => {
    if (params.message && params.message_type && !messageShownRef.current && !alertModal.visible) {
      messageShownRef.current = true;
      
      const title = params.message_type === 'info' ? 'Information' 
        : params.message_type === 'warning' ? 'Warning'
        : params.message_type === 'error' ? 'Error'
        : 'Notice';
      
      let decodedMessage = params.message;
      try {
        decodedMessage = params.message.replace(/\+/g, ' ');
        decodedMessage = decodeURIComponent(decodedMessage);
      } catch (e) {
        decodedMessage = params.message.replace(/\+/g, ' ');
      }
      
      // Set modal state - this persists regardless of URL changes
      setAlertModal({
        visible: true,
        title: title,
        message: decodedMessage,
        type: params.message_type,
      });
    }
  }, [params.message, params.message_type]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setAlertModal({
        visible: true,
        title: 'Error',
        message: 'Please enter both email and password',
        type: 'error',
      });
      return;
    }

    setLoading(true);
    try {
      // Debug: Log API URL
      console.log('API URL:', process.env.EXPO_PUBLIC_API_URL || 'http://10.0.0.25:8900/api');
      
      const credentials: LoginCredentials = {
        email: email.trim().toLowerCase(),
        password: password,
      };

      await AuthService.login(credentials);
      
      // Navigate to home screen after successful login
      router.replace('/(tabs)');
    } catch (error: any) {
      setAlertModal({
        visible: true,
        title: 'Login Failed',
        message: error.message || 'Invalid username or password. Please try again.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>KewlKids Organizer</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Sign in to your account</Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.passwordInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Password"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                <FontAwesome
                  name={showPassword ? 'eye-slash' : 'eye'}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.push('/(auth)/register')}
              disabled={loading}
            >
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>
                Don't have an account? <Text style={[styles.linkTextBold, { color: colors.primary }]}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      
      <AlertModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => {
          // Close modal first
          setAlertModal(prev => ({ ...prev, visible: false }));
          messageShownRef.current = false; // Reset so it can show again if needed
          
          // Clear URL parameters after a small delay to ensure modal closes smoothly
          setTimeout(() => {
            const emailParam = params.email || params.invitation_email;
            if (emailParam) {
              router.replace(`/(auth)/login?email=${encodeURIComponent(emailParam)}`);
            } else {
              router.replace('/(auth)/login');
            }
          }, 100);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    width: '100%',
  },
  input: {
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  passwordContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  passwordInput: {
    borderRadius: 8,
    padding: 16,
    paddingRight: 50,
    fontSize: 16,
    borderWidth: 1,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    padding: 4,
    zIndex: 1,
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
  },
  linkTextBold: {
    fontWeight: '600',
  },
});

