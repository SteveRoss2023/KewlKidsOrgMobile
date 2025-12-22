# Fix CMake Infinite Regeneration Loop
# This script cleans CMake caches that cause infinite regeneration loops

Write-Host "=== Fixing CMake Infinite Regeneration Loop ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop Gradle daemon
Write-Host "1. Stopping Gradle daemon..." -ForegroundColor Yellow
$gradlewPath = Join-Path $PSScriptRoot "..\android\gradlew.bat"
if (Test-Path $gradlewPath) {
    Push-Location (Split-Path $gradlewPath)
    & .\gradlew.bat --stop 2>&1 | Out-Null
    Pop-Location
    Write-Host "   Gradle daemon stopped" -ForegroundColor Green
} else {
    Write-Host "   gradlew.bat not found, skipping" -ForegroundColor Yellow
}

# Step 2: Clean CMake caches (more aggressive cleanup)
Write-Host ""
Write-Host "2. Cleaning CMake caches..." -ForegroundColor Yellow

$cmakeCachePaths = @(
    "node_modules\react-native-worklets\android\.cxx",
    "node_modules\react-native-reanimated\android\.cxx",
    "node_modules\react-native-gesture-handler\android\.cxx",
    "node_modules\@react-native-async-storage\async-storage\android\.cxx",
    "node_modules\@react-native-community\datetimepicker\android\.cxx",
    "node_modules\react-native-safe-area-context\android\.cxx",
    "node_modules\react-native-screens\android\.cxx",
    "android\app\.cxx",
    "android\.cxx"
)

$cleaned = $false
foreach ($cachePath in $cmakeCachePaths) {
    $fullPath = Join-Path $PSScriptRoot "..\$cachePath"
    if (Test-Path $fullPath) {
        Write-Host "   Removing: $cachePath" -ForegroundColor Yellow
        Remove-Item -Path $fullPath -Recurse -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500  # Give Windows time to release file locks
        Write-Host "   Cleaned: $cachePath" -ForegroundColor Green
        $cleaned = $true
    }
}

# Also clean any build.ninja files that might be locked
Write-Host ""
Write-Host "   Cleaning locked build.ninja files..." -ForegroundColor Yellow
$ninjaFiles = Get-ChildItem -Path (Join-Path $PSScriptRoot "..") -Filter "build.ninja" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like "*\.cxx*" }
foreach ($ninjaFile in $ninjaFiles) {
    try {
        Remove-Item -Path $ninjaFile.FullName -Force -ErrorAction Stop
        Write-Host "   Removed: $($ninjaFile.FullName)" -ForegroundColor Green
        $cleaned = $true
    } catch {
        Write-Host "   Could not remove: $($ninjaFile.FullName) - may be locked" -ForegroundColor Yellow
    }
}

if (-not $cleaned) {
    Write-Host "   No CMake caches found to clean" -ForegroundColor Yellow
}

# Step 3: Clean Gradle build folders
Write-Host ""
Write-Host "3. Cleaning Gradle build folders..." -ForegroundColor Yellow

$buildPaths = @(
    "android\build",
    "android\app\build"
)

foreach ($buildPath in $buildPaths) {
    $fullPath = Join-Path $PSScriptRoot "..\$buildPath"
    if (Test-Path $fullPath) {
        Remove-Item -Path $fullPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   Cleaned: $buildPath" -ForegroundColor Green
    }
}

# Step 4: Wait a moment for file system to settle
Write-Host ""
Write-Host "4. Waiting for file system to settle..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Write-Host "   Ready" -ForegroundColor Green

Write-Host ""
Write-Host "=== Cleanup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Close any processes that might be locking files (Android Studio, Gradle daemon)" -ForegroundColor White
Write-Host "2. Try the build again:" -ForegroundColor White
Write-Host "   npm run dev:android" -ForegroundColor Cyan
Write-Host ""
Write-Host "If it still fails:" -ForegroundColor Yellow
Write-Host "- The issue may be with react-native-worklets on Windows with long paths" -ForegroundColor Yellow
Write-Host "- Consider temporarily removing react-native-worklets if not essential" -ForegroundColor Yellow
Write-Host "- Or move the project to a shorter path (e.g., C:\Dev\KewlKids)" -ForegroundColor Yellow
Write-Host "- Or enable Windows long path support (requires admin):" -ForegroundColor Yellow
Write-Host "  New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -Value 1 -PropertyType DWORD -Force" -ForegroundColor Cyan
Write-Host ""

