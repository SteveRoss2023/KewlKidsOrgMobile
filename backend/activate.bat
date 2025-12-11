@echo off
REM Auto-activation script for backend virtual environment
REM Run this script to activate the virtual environment

cd /d "%~dp0"
call venv\Scripts\activate.bat
echo Virtual environment activated!
python --version
cd /d "%~dp0"

