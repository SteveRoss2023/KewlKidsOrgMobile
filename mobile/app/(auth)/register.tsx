import { useState, useEffect } from 'react';
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
import AuthService, { RegisterData } from '../../services/authService';
import AlertModal from '../../components/AlertModal';
import { useTheme } from '../../contexts/ThemeContext';

export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ 
    invitation_email?: string; 
    invitation_token?: string; 
    family_name?: string;
  }>();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    password2: '',
    display_name: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Pre-populate email from invitation if present
  useEffect(() => {
    if (params.invitation_email) {
      setFormData(prev => ({
        ...prev,
        email: params.invitation_email || '',
      }));
    }
  }, [params.invitation_email]);
  const [alertModal, setAlertModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    onConfirm?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): boolean => {
    if (!formData.email.trim()) {
      setAlertModal({
        visible: true,
        title: 'Error',
        message: 'Email is required',
        type: 'error',
      });
      return false;
    }
    if (!formData.email.includes('@')) {
      setAlertModal({
        visible: true,
        title: 'Error',
        message: 'Please enter a valid email address',
        type: 'error',
      });
      return false;
    }
    if (!formData.password) {
      setAlertModal({
        visible: true,
        title: 'Error',
        message: 'Password is required',
        type: 'error',
      });
      return false;
    }
    if (formData.password.length < 8) {
      setAlertModal({
        visible: true,
        title: 'Error',
        message: 'Password must be at least 8 characters',
        type: 'error',
      });
      return false;
    }
    if (formData.password !== formData.password2) {
      setAlertModal({
        visible: true,
        title: 'Error',
        message: 'Passwords do not match',
        type: 'error',
      });
      return false;
    }
    return true;
  };

  const handleRegister = async () => {
    console.log('Register button clicked');
    
    if (!validateForm()) {
      console.log('Form validation failed');
      return;
    }

    console.log('Starting registration with data:', {
      email: formData.email.trim().toLowerCase(),
      hasPassword: !!formData.password,
      hasPassword2: !!formData.password2,
      display_name: formData.display_name.trim() || undefined,
    });
    console.log('API URL:', process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8900/api (web) or http://10.0.0.25:8900/api (native)');

    setLoading(true);
    try {
      const registerData: RegisterData = {
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        password2: formData.password2,
        display_name: formData.display_name.trim() || undefined,
      };

      console.log('Calling AuthService.register...');
      const response = await AuthService.register(registerData);
      console.log('Registration successful:', response);
      
      // Show success modal
      setAlertModal({
        visible: true,
        title: 'Success',
        message: 'Account created successfully!',
        type: 'success',
        onConfirm: () => {
          setAlertModal({ ...alertModal, visible: false });
          router.replace('/(tabs)');
        },
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        data: error.data,
        stack: error.stack,
      });
      
      const errorMessage = error.message || error.data?.detail || error.data?.message || 'Unable to create account. Please try again.';
      
      // Show error modal
      setAlertModal({
        visible: true,
        title: 'Registration Failed',
        message: errorMessage,
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
          <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Sign up to get started</Text>

          <View style={styles.form}>
            {params.invitation_email && params.family_name && (
              <View style={[styles.invitationBanner, { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }]}>
                <FontAwesome name="envelope" size={16} color={colors.primary} />
                <Text style={[styles.invitationText, { color: colors.primary }]}>
                  You've been invited to join {params.family_name}
                </Text>
              </View>
            )}
            <TextInput
              style={[
                styles.input, 
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                params.invitation_email && styles.inputDisabled
              ]}
              placeholder="Email *"
              placeholderTextColor={colors.textSecondary}
              value={formData.email}
              onChangeText={(value) => updateField('email', value)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading && !params.invitation_email}
            />

            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Display Name (optional)"
              placeholderTextColor={colors.textSecondary}
              value={formData.display_name}
              onChangeText={(value) => updateField('display_name', value)}
              autoCapitalize="words"
              editable={!loading}
            />

            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.passwordInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Password *"
                placeholderTextColor={colors.textSecondary}
                value={formData.password}
                onChangeText={(value) => updateField('password', value)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
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

            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.passwordInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Confirm Password *"
                placeholderTextColor={colors.textSecondary}
                value={formData.password2}
                onChangeText={(value) => updateField('password2', value)}
                secureTextEntry={!showPassword2}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                onSubmitEditing={handleRegister}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword2(!showPassword2)}
                disabled={loading}
              >
                <FontAwesome
                  name={showPassword2 ? 'eye-slash' : 'eye'}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.back()}
              disabled={loading}
            >
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>
                Already have an account? <Text style={[styles.linkTextBold, { color: colors.primary }]}>Sign in</Text>
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
        onClose={() => setAlertModal({ ...alertModal, visible: false })}
        onConfirm={alertModal.onConfirm}
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
    paddingVertical: 20,
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
  invitationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    gap: 8,
  },
  invitationText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  inputDisabled: {
    opacity: 0.6,
  },
});
