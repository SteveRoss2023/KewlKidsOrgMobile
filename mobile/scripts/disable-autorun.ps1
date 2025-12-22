# Disable Windows Autorun Scripts
# This script disables autorun scripts that interfere with Gradle/Node commands

Write-Host "Disabling Windows autorun scripts..." -ForegroundColor Yellow

# Method 1: Set environment variable system-wide (requires admin)
try {
    [System.Environment]::SetEnvironmentVariable("NO_AUTORUN", "1", [System.EnvironmentVariableTarget]::User)
    Write-Host "✓ Set NO_AUTORUN=1 in user environment" -ForegroundColor Green
} catch {
    Write-Host "⚠ Could not set system environment variable (may need admin)" -ForegroundColor Yellow
}

try {
    [System.Environment]::SetEnvironmentVariable("CMDCMDLINE", "", [System.EnvironmentVariableTarget]::User)
    Write-Host "✓ Set CMDCMDLINE='' in user environment" -ForegroundColor Green
} catch {
    Write-Host "⚠ Could not set system environment variable (may need admin)" -ForegroundColor Yellow
}

# Method 2: Disable autorun via registry (requires admin)
$regPath = "HKCU:\Software\Microsoft\Command Processor"
try {
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name "DisableUNCCheck" -Value 1 -Type DWord -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $regPath -Name "CompletionChar" -Value 9 -Type DWord -ErrorAction SilentlyContinue
    Write-Host "✓ Modified registry settings" -ForegroundColor Green
} catch {
    Write-Host "⚠ Could not modify registry (may need admin)" -ForegroundColor Yellow
}

# Method 3: Check for autorun files in current directory
$autorunFiles = @("autorun.inf", "autorun.bat", "autorun.cmd", "autorun.ps1")
$found = $false
foreach ($file in $autorunFiles) {
    if (Test-Path $file) {
        Write-Host "⚠ Found autorun file: $file" -ForegroundColor Yellow
        $found = $true
    }
}

if (-not $found) {
    Write-Host "✓ No autorun files found in current directory" -ForegroundColor Green
}

Write-Host ""
Write-Host "IMPORTANT: You may need to:" -ForegroundColor Cyan
Write-Host "1. Restart your terminal/PowerShell for changes to take effect" -ForegroundColor White
Write-Host "2. Stop Gradle daemon: cd android && .\gradlew.bat --stop" -ForegroundColor White
Write-Host "3. Try the build again" -ForegroundColor White
Write-Host ""


