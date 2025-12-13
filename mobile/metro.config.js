// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for assets in node_modules (needed for react-native-dropdown-picker)
config.resolver.assetExts.push('png', 'jpg', 'jpeg', 'gif', 'webp');

module.exports = config;


