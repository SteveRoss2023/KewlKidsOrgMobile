# This file is sourced automatically when entering the backend directory
# It activates the virtual environment

$VenvPath = Join-Path $PSScriptRoot "venv\Scripts\Activate.ps1"

if (Test-Path $VenvPath) {
    & $VenvPath
}


