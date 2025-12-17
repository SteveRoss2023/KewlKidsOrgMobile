import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
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
  // On native, we'll show the button but speech recognition needs to be implemented
  // For now, we'll return true so the button shows, but actual recognition will need
  // a library like @react-native-voice/voice to be installed
  const isSupported = Platform.OS === 'web' 
    ? typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
    : true; // Show button on mobile - actual recognition needs implementation

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
      Voice.onSpeechStart = () => {
        console.log('🎤 [VOICE RECOGNITION] onSpeechStart fired');
        setIsListening(true);
        setError(null);
        lastErrorRef.current = null;
        shouldRestartRef.current = true;
      };

      Voice.onSpeechResults = (e: any) => {
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

      Voice.onSpeechError = (e: any) => {
        console.log('🎤 [VOICE RECOGNITION] onSpeechError fired:', e.error);
        setError(e.error?.message || 'Speech recognition error');
        lastErrorRef.current = e.error?.code || 'error';
        setIsListening(false);

        if (e.error?.code === '7' || e.error?.message?.includes('permission')) {
          shouldRestartRef.current = false;
          setError('Microphone permission denied. Please enable it in your device settings.');
        }
      };

      Voice.onSpeechEnd = () => {
        console.log('🎤 [VOICE RECOGNITION] onSpeechEnd fired');
        setIsListening(false);

        const hasFatalError = lastErrorRef.current === '7' || lastErrorRef.current === 'aborted';
        if (shouldRestartRef.current && continuous && !hasFatalError) {
          console.log('🎤 [VOICE RECOGNITION] Restarting recognition (continuous mode)');
          setTimeout(() => {
            if (shouldRestartRef.current) {
              try {
                Voice.start('en-US');
              } catch (err) {
                console.error('Error restarting recognition:', err);
                shouldRestartRef.current = false;
              }
            }
          }, 100);
        }
      };

      // Cleanup on unmount
      return () => {
        try {
          Voice.destroy().then(() => {
            Voice.removeAllListeners();
          });
        } catch (err) {
          console.error('Error cleaning up voice recognition:', err);
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
      try {
        Voice.start('en-US');
        console.log('🎤 [VOICE RECOGNITION] Voice.start() called successfully');
      } catch (err: any) {
        console.error('Error starting voice recognition:', err);
        setError(err.message || 'Failed to start voice recognition');
        setIsListening(false);
      }
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
      try {
        Voice.stop();
      } catch (err) {
        console.error('Error stopping voice recognition:', err);
      }
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
