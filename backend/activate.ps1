# Auto-activation script for backend virtual environment
# This script activates the virtual environment when you navigate to the backend directory

# Point to local venv in project folder
$VenvPath = Join-Path $PSScriptRoot "venv\Scripts\Activate.ps1"

if (Test-Path $VenvPath) {
    & $VenvPath
    Write-Host "Virtual environment activated!" -ForegroundColor Green
    Write-Host "Python: $(python --version)" -ForegroundColor Cyan
    Write-Host "Working directory: $(Get-Location)" -ForegroundColor Cyan
} else {
    Write-Host "Virtual environment not found at: $VenvPath" -ForegroundColor Red
}


