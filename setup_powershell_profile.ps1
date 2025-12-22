# PowerShell Profile Setup Script
# This script sets up auto-activation of the virtual environment when entering the backend directory

$ProfilePath = $PROFILE.CurrentUserAllHosts
$BackendPath = Join-Path $PSScriptRoot "backend"

# Create profile directory if it doesn't exist
$ProfileDir = Split-Path -Parent $ProfilePath
if (-not (Test-Path $ProfileDir)) {
    New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
}

# Check if the auto-activation code already exists
$AutoActivateCode = @"

# Auto-activate virtual environment when entering backend directory
`$BackendPath = '$BackendPath'

# Function to activate venv if in backend directory
function Activate-BackendVenv {
    if (`$PWD.Path -like "`$BackendPath*" -and -not `$env:VIRTUAL_ENV) {
        `$VenvPath = Join-Path `$BackendPath "venv\Scripts\Activate.ps1"
        if (Test-Path `$VenvPath) {
            & `$VenvPath | Out-Null
            Write-Host "[VENV Activated] " -ForegroundColor Green -NoNewline
        }
    }
}

# Check on startup
Activate-BackendVenv

# Override prompt to check on every directory change
`$originalPrompt = Get-Command prompt -ErrorAction SilentlyContinue
function global:prompt {
    Activate-BackendVenv

    # Call the original prompt
    if (`$originalPrompt) {
        & `$originalPrompt
    } else {
        "PS `$(`$executionContext.SessionState.Path.CurrentLocation)`$('>' * (`$nestedPromptLevel + 1)) "
    }
}
"@

# Read existing profile or create new one
if (Test-Path $ProfilePath) {
    $ExistingContent = Get-Content $ProfilePath -Raw
    if ($ExistingContent -notmatch "Auto-activate virtual environment when entering backend directory") {
        Add-Content -Path $ProfilePath -Value "`n$AutoActivateCode"
        Write-Host "Added auto-activation to PowerShell profile!" -ForegroundColor Green
    } else {
        Write-Host "Auto-activation already configured in PowerShell profile." -ForegroundColor Yellow
    }
} else {
    Set-Content -Path $ProfilePath -Value $AutoActivateCode
    Write-Host "Created PowerShell profile with auto-activation!" -ForegroundColor Green
}

Write-Host "`nPowerShell profile location: $ProfilePath" -ForegroundColor Cyan
Write-Host "To apply changes, restart PowerShell or run: . `$PROFILE" -ForegroundColor Yellow

