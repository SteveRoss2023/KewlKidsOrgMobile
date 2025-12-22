import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';
import Voice from '@react-native-voice/voice';

/**
 * Custom hook for speech recognition in React Native
 *
 * Note: This is a simplified implementation that provides the interface.
 * For actual speech recognition, you'll need to install and configure:
 * - @react-native-voice/voice (for native speech recognition)
 * - Or use a cloud-based solution like Google Cloud Speech-to-Text
 *
 * This hook provides the same interface as the web version for consistency.
 */
export function useVoiceRecognition(options: { continuous?: boolean; interimResults?: boolean } = {}) {
  const { continuous = true, interimResults = false } = options;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const shouldRestartRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);
  const ignoreTranscriptsUntilRef = useRef<number | null>(null);

  // Check if speech recognition is available
  // On web, we can use Web Speech API
  // On native, check if we're in Expo Go (which doesn't support native modules)
  // Constants.executionEnvironment values:
  // - 'storeClient' = Expo Go
  // - 'standalone' = Standalone app (production)
  // - 'bare' = Bare React Native
  // - undefined = Development build
  const isSupported = Platform.OS === 'web'
    ? typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
    : Constants.executionEnvironment !== 'storeClient'; // Voice works in dev builds and standalone, not in Expo Go

  // Initialize recognition
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (!isSupported) return;
      // Web Speech API implementation
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SpeechRecognition) return;

      const recognition = new SpeechRecognition();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;

      recognition.onstart = () => {
        console.log('🎤 [VOICE RECOGNITION] onstart fired');
        setIsListening(true);
        setError(null);
        lastErrorRef.current = null;
        shouldRestartRef.current = true;
      };

      recognition.onresult = (event: any) => {
        // Ignore transcripts if we're still waiting for instruction to finish
        if (ignoreTranscriptsUntilRef.current && Date.now() < ignoreTranscriptsUntilRef.current) {
          console.log('🎤 [VOICE RECOGNITION] Ignoring transcript (instruction still playing)');
          return;
        }

        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(' ');
        setTranscript(transcript);
      };

      recognition.onerror = (event: any) => {
        console.log('🎤 [VOICE RECOGNITION] onerror fired:', event.error);
        setError(event.error);
        lastErrorRef.current = event.error;
        setIsListening(false);

        if (event.error === 'not-allowed') {
          shouldRestartRef.current = false;
          setError('Microphone permission denied. Please enable it in your browser settings.');
        } else if (event.error === 'aborted') {
          shouldRestartRef.current = false;
        }
      };

      recognition.onend = () => {
        console.log('🎤 [VOICE RECOGNITION] onend fired');
        setIsListening(false);

        const hasFatalError = lastErrorRef.current === 'not-allowed' || lastErrorRef.current === 'aborted';
        if (shouldRestartRef.current && continuous && !hasFatalError) {
          console.log('🎤 [VOICE RECOGNITION] Restarting recognition (continuous mode)');
          setTimeout(() => {
            if (recognitionRef.current && shouldRestartRef.current) {
              try {
                recognitionRef.current.start();
              } catch (err) {
                console.error('Error restarting recognition:', err);
                shouldRestartRef.current = false;
              }
            }
          }, 100);
        }
      };

      recognitionRef.current = recognition;

      return () => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (err) {
            // Ignore errors when stopping
          }
        }
      };
    } else {
      // Native implementation using @react-native-voice/voice
      const onSpeechStartHandler = () => {
        console.log('🎤 [VOICE RECOGNITION] onSpeechStart fired');
        setIsListening(true);
        setError(null);
        lastErrorRef.current = null;
        shouldRestartRef.current = true;
      };

      const onSpeechResultsHandler = (e: any) => {
        if (e.value && e.value.length > 0) {
          const transcript = e.value[0];
          // Ignore transcripts if we're still waiting for instruction to finish
          if (ignoreTranscriptsUntilRef.current && Date.now() < ignoreTranscriptsUntilRef.current) {
            console.log('🎤 [VOICE RECOGNITION] Ignoring transcript (instruction still playing)');
            return;
          }
          setTranscript(transcript);
        }
      };

      const onSpeechErrorHandler = (e: any) => {
        console.log('🎤 [VOICE RECOGNITION] onSpeechError fired:', e.error);
        setError(e.error?.message || 'Speech recognition error');
        lastErrorRef.current = e.error?.code || 'error';
        setIsListening(false);

        if (e.error?.code === '7' || e.error?.message?.includes('permission')) {
          shouldRestartRef.current = false;
          setError('Microphone permission denied. Please enable it in your device settings.');
        }
      };

      const onSpeechEndHandler = () => {
        console.log('🎤 [VOICE RECOGNITION] onSpeechEnd fired');
        setIsListening(false);

        const hasFatalError = lastErrorRef.current === '7' || lastErrorRef.current === 'aborted';
        if (shouldRestartRef.current && continuous && !hasFatalError) {
          console.log('🎤 [VOICE RECOGNITION] Restarting recognition (continuous mode)');
          setTimeout(() => {
            if (shouldRestartRef.current) {
              try {
                Voice.start('en-US').catch((err) => {
                  console.error('Error restarting recognition:', err);
                  shouldRestartRef.current = false;
                });
              } catch (err) {
                console.error('Error restarting recognition:', err);
                shouldRestartRef.current = false;
              }
            }
          }, 100);
        }
      };

      // Set up event listeners
      try {
        if (Voice) {
          Voice.onSpeechStart = onSpeechStartHandler;
          Voice.onSpeechResults = onSpeechResultsHandler;
          Voice.onSpeechError = onSpeechErrorHandler;
          Voice.onSpeechEnd = onSpeechEndHandler;
        }
      } catch (err) {
        console.error('Error setting up voice listeners:', err);
      }

      // Cleanup on unmount
      return () => {
        shouldRestartRef.current = false;
        try {
          // First remove all listeners (this is safe even if Voice is null)
          if (Voice && typeof Voice.removeAllListeners === 'function') {
            Voice.removeAllListeners().catch((removeErr: any) => {
              // Ignore errors if Voice is already destroyed or null
              if (removeErr?.message?.includes('null') || removeErr?.message?.includes('destroyed')) {
                console.debug('Voice already destroyed, ignoring removeAllListeners error');
              } else {
                console.debug('Error removing voice listeners (non-fatal):', removeErr);
              }
            });
          }

          // Then destroy if it's still available
          if (Voice && typeof Voice.destroy === 'function') {
            Voice.destroy().catch((destroyErr: any) => {
              // Ignore errors if already destroyed
              if (destroyErr?.message?.includes('null') || destroyErr?.message?.includes('destroyed')) {
                console.debug('Voice already destroyed, ignoring destroy error');
              } else {
                console.debug('Error destroying voice recognition (non-fatal):', destroyErr);
              }
            });
          }
        } catch (err) {
          // Ignore cleanup errors - component is unmounting anyway
          console.debug('Error in voice cleanup (ignored):', err);
        }
      };
    }
  }, [continuous, interimResults, isSupported]);

  const start = useCallback((options: { ignoreTranscriptsForMs?: number } = {}) => {
    if (Platform.OS === 'web' && !isSupported) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    const { ignoreTranscriptsForMs = 0 } = options;
    console.log('🎤 [VOICE RECOGNITION] start() called');

    shouldRestartRef.current = true;

    if (ignoreTranscriptsForMs > 0) {
      ignoreTranscriptsUntilRef.current = Date.now() + ignoreTranscriptsForMs;
      console.log('🎤 [VOICE RECOGNITION] Will ignore transcripts for', ignoreTranscriptsForMs, 'ms');
    } else {
      ignoreTranscriptsUntilRef.current = null;
    }

    if (Platform.OS === 'web' && recognitionRef.current) {
      try {
        recognitionRef.current.start();
        console.log('🎤 [VOICE RECOGNITION] recognition.start() called successfully');
      } catch (err: any) {
        console.error('Error starting recognition:', err);
        if (err.name !== 'InvalidStateError') {
          setError(err.message);
          if (err.message && err.message.includes('not allowed')) {
            lastErrorRef.current = 'not-allowed';
          }
        }
      }
    } else {
      // Native implementation using @react-native-voice/voice
      if (!Voice) {
        console.error('Voice module is not available');
        setError('Voice recognition is not available on this device');
        setIsListening(false);
        return;
      }

      // Check if the native module is actually registered in NativeModules
      // The module uses NativeModules.Voice internally, but the native module is registered as "RCTVoice"
      // Check both names in case of a mismatch
      const voiceModule = NativeModules.Voice || NativeModules.RCTVoice;
      if (!voiceModule) {
        console.error('NativeModules.Voice and NativeModules.RCTVoice are both null - native module not registered');
        console.log('Available NativeModules:', Object.keys(NativeModules).filter(k => k.toLowerCase().includes('voice') || k.toLowerCase().includes('rct')).join(', '));
        setError('Voice recognition native module is not registered. This may be a compatibility issue with Expo/React Native. Please rebuild the app with: npm run dev:android');
        setIsListening(false);
        return;
      }

      // Log which module name worked
      if (NativeModules.RCTVoice && !NativeModules.Voice) {
        console.warn('Voice module found as RCTVoice but not as Voice - this may indicate a module name mismatch');
      }

      // Check if the native module is actually connected
      // The Voice object might exist but the native bridge might be null
      try {
        // Try to access a property that requires native module
        // If this throws, the native module isn't connected
        if (typeof Voice.start !== 'function') {
          throw new Error('Voice.start is not a function - native module not connected');
        }
      } catch (checkErr: any) {
        console.error('Voice module native bridge check failed:', checkErr);
        setError('Voice recognition native module is not connected. Please fully restart the app (close and reopen), or rebuild if the issue persists.');
        setIsListening(false);
        return;
      }

      // Try to start voice recognition directly
      Promise.resolve()
        .then(() => {
          // Try to start directly - this will work if the module is properly linked
          return Voice.start('en-US');
        })
        .then(() => {
          console.log('🎤 [VOICE RECOGNITION] Voice.start() called successfully');
        })
        .catch((err: any) => {
          // Handle all error cases - including when native module is null
          const errorMessage = err?.message || err?.toString() || String(err) || 'Unknown error';
          console.error('Error starting voice recognition:', errorMessage, err);

          // Check for common error patterns
          if (errorMessage.includes('null') ||
              errorMessage.includes('startSpeech') ||
              errorMessage.includes('isSpeechAvailable') ||
              errorMessage.includes('isAvailable') ||
              errorMessage.includes('not available') ||
              errorMessage.includes('Cannot read property')) {
            console.warn('Voice module not properly initialized or not available');
            setError('Voice recognition native module is not connected. Please fully close and restart the app, or rebuild if the issue persists.');
          } else {
            setError('Failed to start voice recognition. Please try again.');
          }
          setIsListening(false);
        });
    }
  }, [isSupported, continuous]);

  const stop = useCallback(() => {
    console.log('🎤 [VOICE RECOGNITION] stop() called');
    shouldRestartRef.current = false;
    lastErrorRef.current = null;

    if (Platform.OS === 'web' && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // Ignore errors when stopping
        console.debug('Error stopping recognition (ignored):', err);
      }
    } else {
      // Native implementation
      if (!Voice) {
        console.debug('Voice module is not available, skipping stop');
        setIsListening(false);
        return;
      }

      // Try to stop, but ignore errors (might already be stopped or module not initialized)
      Voice.stop()
        .catch((err: any) => {
          // Ignore errors when stopping - might already be stopped or module not initialized
          if (err?.message?.includes('null') || err?.message?.includes('stopSpeech')) {
            console.debug('Voice module not properly initialized, ignoring stop error');
          } else {
            console.debug('Error stopping voice recognition (ignored):', err);
          }
        });
    }

    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    start,
    stop,
    reset,
  };
}

