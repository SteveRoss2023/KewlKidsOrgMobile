# One-Time Setup Script for Android Build
# Run this ONCE to permanently fix the autorun script issue

Write-Host "=== Android Build Setup - One Time Fix ===" -ForegroundColor Cyan
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

# Step 2: Set environment variables at USER level (persists across reboots)
Write-Host ""
Write-Host "2. Setting environment variables (USER level)..." -ForegroundColor Yellow
try {
    [System.Environment]::SetEnvironmentVariable("NO_AUTORUN", "1", [System.EnvironmentVariableTarget]::User)
    [System.Environment]::SetEnvironmentVariable("CMDCMDLINE", "", [System.EnvironmentVariableTarget]::User)
    Write-Host "   Set NO_AUTORUN=1" -ForegroundColor Green
    Write-Host "   Set CMDCMDLINE=''" -ForegroundColor Green
    Write-Host "   These will persist across reboots" -ForegroundColor Green
} catch {
    Write-Host "   Failed to set environment variables: $_" -ForegroundColor Red
    Write-Host "   You may need to run PowerShell as Administrator" -ForegroundColor Yellow
}

# Step 3: Set for current session
Write-Host ""
Write-Host "3. Setting for current session..." -ForegroundColor Yellow
$env:NO_AUTORUN = "1"
$env:CMDCMDLINE = ""
Write-Host "   Set for current PowerShell session" -ForegroundColor Green

# Step 4: Verify
Write-Host ""
Write-Host "4. Verifying setup..." -ForegroundColor Yellow
if ($env:NO_AUTORUN -eq "1") {
    Write-Host "   NO_AUTORUN is set" -ForegroundColor Green
} else {
    Write-Host "   NO_AUTORUN is NOT set" -ForegroundColor Red
}

if ($env:CMDCMDLINE -eq "") {
    Write-Host "   CMDCMDLINE is set" -ForegroundColor Green
} else {
    Write-Host "   CMDCMDLINE is NOT set" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Close and reopen your terminal/PowerShell" -ForegroundColor White
Write-Host "   (This ensures environment variables are loaded)" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Try the build:" -ForegroundColor White
Write-Host "   npm run dev:android" -ForegroundColor Cyan
Write-Host ""
Write-Host "If it still fails, the Gradle daemon may need to be restarted:" -ForegroundColor Yellow
Write-Host "   cd android" -ForegroundColor Gray
Write-Host "   .\gradlew.bat --stop" -ForegroundColor Gray
Write-Host ""
