#!/usr/bin/env node

/**
 * Android Development Build Script
 * Automatically sets up environment variables and runs expo run:android
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Platform detection
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

/**
 * Find Android SDK location
 */
function findAndroidSdk() {
  // Check environment variables first
  let androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

  if (androidHome && fs.existsSync(androidHome)) {
    return androidHome;
  }

  // Try common locations
  const commonPaths = [];

  if (isWindows) {
    commonPaths.push(
      path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'),
      'C:\\Android\\Sdk',
      path.join(process.env.PROGRAMFILES || '', 'Android', 'Sdk')
    );
  } else if (isMac) {
    commonPaths.push(
      path.join(process.env.HOME || '', 'Library', 'Android', 'sdk'),
      path.join(process.env.HOME || '', 'Library', 'Android', 'Sdk')
    );
  } else if (isLinux) {
    commonPaths.push(
      path.join(process.env.HOME || '', 'Android', 'Sdk'),
      path.join(process.env.HOME || '', '.android', 'sdk'),
      '/opt/android-sdk',
      '/usr/lib/android-sdk'
    );
  }

  for (const sdkPath of commonPaths) {
    if (sdkPath && fs.existsSync(sdkPath)) {
      // Verify it's actually an Android SDK by checking for platform-tools
      const platformTools = path.join(sdkPath, 'platform-tools');
      if (fs.existsSync(platformTools)) {
        return sdkPath;
      }
    }
  }

  return null;
}

/**
 * Find Java/JDK location
 */
function findJavaHome() {
  // Check environment variable first
  let javaHome = process.env.JAVA_HOME;

  if (javaHome && fs.existsSync(javaHome)) {
    return javaHome;
  }

  // Try to find Java in common locations
  const commonPaths = [];

  if (isWindows) {
    // Check Program Files
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    commonPaths.push(
      path.join(programFiles, 'Java'),
      path.join(programFilesX86, 'Java'),
      'C:\\Program Files\\Android\\Android Studio\\jbr',
      'C:\\Program Files\\Android\\Android Studio\\jre'
    );
  } else if (isMac) {
    commonPaths.push(
      '/Library/Java/JavaVirtualMachines',
      path.join(process.env.HOME || '', 'Library', 'Java', 'JavaVirtualMachines'),
      '/usr/libexec/java_home' // macOS specific
    );
  } else if (isLinux) {
    commonPaths.push(
      '/usr/lib/jvm',
      '/usr/java',
      path.join(process.env.HOME || '', '.sdkman', 'candidates', 'java')
    );
  }

  // Try to find JDK 17+ in common locations
  for (const basePath of commonPaths) {
    if (basePath && fs.existsSync(basePath)) {
      try {
        const entries = fs.readdirSync(basePath);
        for (const entry of entries) {
          const fullPath = path.join(basePath, entry);
          if (fs.statSync(fullPath).isDirectory()) {
            // Check if it looks like a JDK
            const binPath = path.join(fullPath, 'bin', isWindows ? 'java.exe' : 'java');
            if (fs.existsSync(binPath)) {
              return fullPath;
            }
          }
        }
      } catch (err) {
        // Skip if can't read directory
      }
    }
  }

  // On macOS, try using /usr/libexec/java_home
  if (isMac) {
    try {
      const { execSync } = require('child_process');
      const javaHomeOutput = execSync('/usr/libexec/java_home -v 17+ 2>/dev/null', { encoding: 'utf8' });
      if (javaHomeOutput && javaHomeOutput.trim()) {
        return javaHomeOutput.trim();
      }
    } catch (err) {
      // Ignore errors
    }
  }

  return null;
}

/**
 * Setup environment and run expo run:android
 */
function main() {
  console.log('🔧 Setting up Android development build environment...\n');

  // Find Android SDK
  const androidSdk = findAndroidSdk();
  if (androidSdk) {
    process.env.ANDROID_HOME = androidSdk;
    process.env.ANDROID_SDK_ROOT = androidSdk;
    console.log(`✓ Found Android SDK: ${androidSdk}`);

    // Add platform-tools to PATH if not already there
    const platformTools = path.join(androidSdk, 'platform-tools');
    if (fs.existsSync(platformTools)) {
      const currentPath = process.env.PATH || '';
      if (!currentPath.includes(platformTools)) {
        const pathSeparator = isWindows ? ';' : ':';
        process.env.PATH = `${platformTools}${pathSeparator}${currentPath}`;
      }
    }
  } else {
    console.warn('⚠️  Android SDK not found!');
    console.warn('   Please install Android Studio or set ANDROID_HOME environment variable.');
    console.warn('   Common location: %LOCALAPPDATA%\\Android\\Sdk (Windows)');
    console.warn('');
  }

  // Find Java
  const javaHome = findJavaHome();
  if (javaHome) {
    process.env.JAVA_HOME = javaHome;
    console.log(`✓ Found Java: ${javaHome}`);

    // Add Java bin to PATH if not already there
    const javaBin = path.join(javaHome, 'bin');
    if (fs.existsSync(javaBin)) {
      const currentPath = process.env.PATH || '';
      if (!currentPath.includes(javaBin)) {
        const pathSeparator = isWindows ? ';' : ':';
        process.env.PATH = `${javaBin}${pathSeparator}${currentPath}`;
      }
    }
  } else {
    console.warn('⚠️  JAVA_HOME not found!');
    console.warn('   Android Studio usually includes a bundled JDK.');
    console.warn('   If build fails, install JDK 17+ and set JAVA_HOME.');
    console.warn('');
  }

  // Check if device/emulator is available
  if (androidSdk) {
    const adbPath = path.join(androidSdk, 'platform-tools', isWindows ? 'adb.exe' : 'adb');
    if (fs.existsSync(adbPath)) {
      try {
        const { execSync } = require('child_process');
        const devices = execSync(`"${adbPath}" devices`, { encoding: 'utf8' });
        const deviceCount = (devices.match(/\n.*\tdevice/g) || []).length;
        if (deviceCount === 0) {
          console.warn('⚠️  No Android devices or emulators detected!');
          console.warn('   Connect a device via USB or start an emulator.');
          console.warn('');
        } else {
          console.log(`✓ Found ${deviceCount} Android device(s)/emulator(s)`);
        }
      } catch (err) {
        // Ignore adb errors
      }
    }
  }

  console.log('\n🚀 Starting Android development build...\n');

  // Run expo run:android
  // Get the mobile directory (parent of scripts directory)
  const mobileDir = path.resolve(__dirname, '..');

  // Set NO_AUTORUN to suppress Windows autorun scripts
  // These MUST be set before any Node/Gradle processes start
  process.env.NO_AUTORUN = '1';
  process.env.CMDCMDLINE = '';

  // Also set as system properties for Gradle
  if (isWindows) {
    // Ensure these are set in the environment that Gradle will inherit
    // This is critical - Gradle spawns Node processes that need these
    process.env.NO_AUTORUN = '1';
    process.env.CMDCMDLINE = '';
  }

  // Find npx - on Windows, we need to use the full path or npm exec
  let npxCommand = 'npx';
  let npxArgs = ['expo', 'run:android'];

  // On Windows, try to find npx in node_modules or use npm exec
  if (isWindows) {
    // Try to find npx in node_modules/.bin or use npm exec
    const npxPath = path.join(mobileDir, 'node_modules', '.bin', 'npx.cmd');
    if (fs.existsSync(npxPath)) {
      npxCommand = npxPath;
    } else {
      // Fall back to npm exec (which works cross-platform)
      npxCommand = 'npm';
      npxArgs = ['exec', '--', 'expo', 'run:android'];
    }
  }

  const child = spawn(npxCommand, npxArgs, {
    stdio: 'inherit',
    shell: isWindows, // Windows needs shell for PATH resolution
    env: process.env,
    cwd: mobileDir
  });

  child.on('error', (error) => {
    console.error('❌ Failed to start build:', error.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// Run main function
main();

