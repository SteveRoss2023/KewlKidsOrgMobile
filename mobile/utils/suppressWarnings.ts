// This file must be imported before any other modules that might trigger warnings
// It sets up LogBox and console suppression immediately

if (__DEV__) {
  // Import LogBox first to suppress warnings before any modules are loaded
  try {
    const { LogBox } = require('react-native');
    if (LogBox) {
      // Suppress NativeEventEmitter warnings from @react-native-voice/voice
      LogBox.ignoreLogs([
        /new NativeEventEmitter\(\) was called with a non-null argument without the required `removeListeners` method/,
        /new NativeEventEmitter\(\) was called with a non-null argument without the required `addListener` method/,
      ]);
    }
  } catch (e) {
    // LogBox might not be available in all environments
  }

  // Also override console methods as backup
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('new NativeEventEmitter() was called with a non-null argument without the required `removeListeners` method') ||
       args[0].includes('new NativeEventEmitter() was called with a non-null argument without the required `addListener` method'))
    ) {
      return; // Suppress this warning (library issue, not our code)
    }
    originalWarn.apply(console, args);
  };

  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('new NativeEventEmitter() was called with a non-null argument without the required `removeListeners` method') ||
       args[0].includes('new NativeEventEmitter() was called with a non-null argument without the required `addListener` method'))
    ) {
      return; // Suppress this warning (library issue, not our code)
    }
    originalError.apply(console, args);
  };
}





