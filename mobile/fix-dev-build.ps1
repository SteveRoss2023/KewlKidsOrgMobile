# Fix Android Dev Build After Windows Long Paths + Reboot
# This script helps restore the Android development build environment

Write-Host "=== Android Dev Build Fix Script ===" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "✓ Node.js: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found! Please install Node.js." -ForegroundColor Red
    exit 1
}

# Check npm
Write-Host "Checking npm..." -ForegroundColor Yellow
$npmVersion = npm --version 2>$null
if ($npmVersion) {
    Write-Host "✓ npm: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "✗ npm not found!" -ForegroundColor Red
    exit 1
}

# Check Android SDK
Write-Host "Checking Android SDK..." -ForegroundColor Yellow
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $androidHome = $env:ANDROID_SDK_ROOT
}
if (-not $androidHome) {
    # Try common locations
    $commonPaths = @(
        "$env:LOCALAPPDATA\Android\Sdk",
        "$env:USERPROFILE\AppData\Local\Android\Sdk",
        "C:\Android\Sdk"
    )
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $androidHome = $path
            Write-Host "Found Android SDK at: $androidHome" -ForegroundColor Yellow
            break
        }
    }
}

if ($androidHome -and (Test-Path $androidHome)) {
    Write-Host "✓ Android SDK: $androidHome" -ForegroundColor Green
    Write-Host "  Setting ANDROID_HOME environment variable for this session..." -ForegroundColor Yellow
    $env:ANDROID_HOME = $androidHome
    $env:ANDROID_SDK_ROOT = $androidHome
} else {
    Write-Host "✗ Android SDK not found!" -ForegroundColor Red
    Write-Host "  Please install Android Studio and set ANDROID_HOME environment variable." -ForegroundColor Yellow
    Write-Host "  Common location: $env:LOCALAPPDATA\Android\Sdk" -ForegroundColor Yellow
}

# Check Java
Write-Host "Checking Java..." -ForegroundColor Yellow
$javaHome = $env:JAVA_HOME
if (-not $javaHome) {
    # Try to find Java
    $javaPath = Get-Command java -ErrorAction SilentlyContinue
    if ($javaPath) {
        $javaVersion = java -version 2>&1 | Select-Object -First 1
        Write-Host "✓ Java found: $javaVersion" -ForegroundColor Green
    } else {
        Write-Host "✗ Java not found! Please install JDK 17 or higher." -ForegroundColor Red
    }
} else {
    if (Test-Path $javaHome) {
        Write-Host "✓ JAVA_HOME: $javaHome" -ForegroundColor Green
    } else {
        Write-Host "✗ JAVA_HOME points to invalid path: $javaHome" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Cleaning Build Environment ===" -ForegroundColor Cyan

# Clean Gradle cache
Write-Host "Cleaning Gradle cache..." -ForegroundColor Yellow
if (Test-Path "$env:USERPROFILE\.gradle") {
    Remove-Item -Path "$env:USERPROFILE\.gradle\caches" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Gradle cache cleaned" -ForegroundColor Green
} else {
    Write-Host "  No Gradle cache found" -ForegroundColor Gray
}

# Clean Android build folders
Write-Host "Cleaning Android build folders..." -ForegroundColor Yellow
if (Test-Path "android\build") {
    Remove-Item -Path "android\build" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Android build folder cleaned" -ForegroundColor Green
}
if (Test-Path "android\app\build") {
    Remove-Item -Path "android\app\build" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Android app build folder cleaned" -ForegroundColor Green
}

# Clean Expo cache
Write-Host "Cleaning Expo cache..." -ForegroundColor Yellow
if (Test-Path ".expo") {
    Remove-Item -Path ".expo" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Expo cache cleaned" -ForegroundColor Green
}

# Clean Metro cache
Write-Host "Cleaning Metro bundler cache..." -ForegroundColor Yellow
npx expo start --clear --no-dev 2>&1 | Out-Null
Write-Host "✓ Metro cache cleared" -ForegroundColor Green

Write-Host ""
Write-Host "=== Reinstalling Dependencies ===" -ForegroundColor Cyan

# Reinstall node modules
Write-Host "Reinstalling node modules..." -ForegroundColor Yellow
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Dependencies reinstalled" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Stopping Gradle Daemon ===" -ForegroundColor Cyan
cd android
if (Test-Path "gradlew.bat") {
    .\gradlew.bat --stop 2>&1 | Out-Null
    Write-Host "✓ Gradle daemon stopped" -ForegroundColor Green
}
cd ..

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Environment cleaned and dependencies reinstalled." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Make sure ANDROID_HOME is set in your system environment variables:" -ForegroundColor White
Write-Host "   - Open System Properties > Environment Variables" -ForegroundColor Gray
Write-Host "   - Add ANDROID_HOME = $env:LOCALAPPDATA\Android\Sdk" -ForegroundColor Gray
Write-Host "   - Add %ANDROID_HOME%\platform-tools to PATH" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Make sure JAVA_HOME is set (if using custom JDK)" -ForegroundColor White
Write-Host ""
Write-Host "3. Connect an Android device or start an emulator" -ForegroundColor White
Write-Host ""
Write-Host "4. Run: npm run dev:android" -ForegroundColor White
Write-Host ""


