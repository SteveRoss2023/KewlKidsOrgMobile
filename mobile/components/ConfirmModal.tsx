import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  visible,
  title,
  message,
  onClose,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info',
}: ConfirmModalProps) {
  const { colors } = useTheme();

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return { name: 'exclamation-triangle' as const, color: colors.error };
      case 'warning':
        return { name: 'exclamation-circle' as const, color: '#FF9500' };
      default:
        return { name: 'question-circle' as const, color: colors.primary };
    }
  };

  const icon = getIcon();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: colors.surface }]}>
          <View style={styles.iconContainer}>
            <FontAwesome name={icon.name} size={48} color={icon.color} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
              onPress={onClose}
            >
              <Text style={[styles.cancelText, { color: colors.text }]}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                { backgroundColor: type === 'danger' ? colors.error : colors.primary },
              ]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  confirmButton: {},
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
