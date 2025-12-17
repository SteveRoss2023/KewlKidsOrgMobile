import * as Speech from 'expo-speech';

/**
 * Speak text using Expo Speech
 * @param text - Text to speak
 * @param callback - Optional callback after speech completes
 */
export function speak(text: string, callback?: () => void): void {
  if (!text) {
    if (callback) callback();
    return;
  }

  // Stop any ongoing speech
  Speech.stop();

  const options: Speech.SpeechOptions = {
    language: 'en-US',
    pitch: 1.0,
    rate: 1.2,
    onDone: () => {
      console.log('ðŸŽ¤ [VOICE] Speech completed');
      if (callback) callback();
    },
    onStopped: () => {
      console.log('ðŸŽ¤ [VOICE] Speech stopped');
      if (callback) callback();
    },
    onError: (error) => {
      console.error('ðŸŽ¤ [VOICE] Speech error:', error);
      if (callback) callback();
    },
  };

  try {
    Speech.speak(text, options);
    console.log('ðŸŽ¤ [VOICE] Speaking:', text.substring(0, 50) + '...');
  } catch (error) {
    console.error('Error speaking:', error);
    if (callback) callback();
  }
}

/**
 * Stop any ongoing speech
 */
export function stopSpeaking(): void {
  Speech.stop();
}
