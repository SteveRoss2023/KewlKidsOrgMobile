@echo off
REM Auto-activation script for backend virtual environment
REM Run this script to activate the virtual environment

cd /d "%~dp0"
call "C:\Users\steve_80f2z1j\Development\project-deps\KewlKidsOrganizerMobile-backend-venv\Scripts\activate.bat"
echo Virtual environment activated!
python --version
cd /d "%~dp0"


