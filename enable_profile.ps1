# Script to re-enable the PowerShell profile
# Run this from Command Prompt: powershell -ExecutionPolicy Bypass -File enable_profile.ps1

$ProfilePath = $PROFILE.CurrentUserAllHosts
$DisabledPath = "$ProfilePath.disabled"

if (Test-Path $DisabledPath) {
    Move-Item $DisabledPath $ProfilePath -Force
    Write-Host "Profile re-enabled!" -ForegroundColor Green
} else {
    Write-Host "Disabled profile not found at: $DisabledPath" -ForegroundColor Red
}


