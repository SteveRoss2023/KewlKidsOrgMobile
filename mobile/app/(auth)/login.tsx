import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import AuthService, { LoginCredentials } from '../../services/authService';
import AlertModal from '../../components/AlertModal';
import { useTheme } from '../../contexts/ThemeContext';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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
        onClose={() => setAlertModal({ ...alertModal, visible: false })}
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

