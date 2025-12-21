// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for assets in node_modules (needed for react-native-dropdown-picker)
config.resolver.assetExts.push('png', 'jpg', 'jpeg', 'gif', 'webp', 'css');

// Block react-native-maps on web to prevent native module errors
// Block leaflet/react-leaflet on native platforms to prevent SSR errors
// Block jimp-compact on web to prevent MIME type errors
// Block @rnmapbox/maps on web (we use custom MapBoxWebView for web)
config.resolver.blockList = config.resolver.blockList || [];
if (process.env.EXPO_PUBLIC_PLATFORM === 'web' || process.env.PLATFORM === 'web') {
  // Block react-native-maps on web
  config.resolver.blockList.push(/node_modules\/react-native-maps\/.*/);
  // Block jimp-compact on web (it's a native image processing library)
  config.resolver.blockList.push(/node_modules\/jimp-compact\/.*/);
  // Block @rnmapbox/maps on web (we use custom web implementation)
  config.resolver.blockList.push(/node_modules\/@rnmapbox\/maps\/.*/);
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

  // Block @rnmapbox/maps on web (we use custom web implementation)
  if (platform === 'web' && moduleName === '@rnmapbox/maps') {
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

  // Block jimp-compact on web (it's a native image processing library)
  if (platform === 'web' && (moduleName === 'jimp-compact' || moduleName === 'jimp')) {
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

