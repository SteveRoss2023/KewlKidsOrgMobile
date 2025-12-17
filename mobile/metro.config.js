// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for assets in node_modules (needed for react-native-dropdown-picker)
config.resolver.assetExts.push('png', 'jpg', 'jpeg', 'gif', 'webp');

// Block react-native-maps on web to prevent native module errors
// Block leaflet/react-leaflet on native platforms to prevent SSR errors
config.resolver.blockList = config.resolver.blockList || [];
if (process.env.EXPO_PUBLIC_PLATFORM === 'web' || process.env.PLATFORM === 'web') {
  // Block react-native-maps on web
  config.resolver.blockList.push(/node_modules\/react-native-maps\/.*/);
} else {
  // Block leaflet and react-leaflet on native platforms (they require window object)
  config.resolver.blockList.push(/node_modules\/leaflet\/.*/);
  config.resolver.blockList.push(/node_modules\/react-leaflet\/.*/);
  config.resolver.blockList.push(/node_modules\/@react-leaflet\/.*/);
}

// Custom resolver to handle platform-specific modules
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Block react-native-maps on web
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      type: 'empty',
    };
  }

  // Block leaflet/react-leaflet on native platforms
  if (platform !== 'web' && (moduleName === 'leaflet' || moduleName === 'react-leaflet' || moduleName.startsWith('@react-leaflet'))) {
    return {
      type: 'empty',
    };
  }

  // Use default resolver
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;


