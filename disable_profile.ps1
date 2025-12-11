# Script to disable the PowerShell profile (rename it)
# Run this from Command Prompt: powershell -ExecutionPolicy Bypass -File disable_profile.ps1

$ProfilePath = $PROFILE.CurrentUserAllHosts
$DisabledPath = "$ProfilePath.disabled"

if (Test-Path $ProfilePath) {
    Move-Item $ProfilePath $DisabledPath -Force
    Write-Host "Profile disabled! Renamed to: $DisabledPath" -ForegroundColor Yellow
    Write-Host "To re-enable, rename it back to: $ProfilePath" -ForegroundColor Cyan
} else {
    Write-Host "Profile not found at: $ProfilePath" -ForegroundColor Red
}


