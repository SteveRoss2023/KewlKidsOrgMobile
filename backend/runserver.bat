@echo off
REM Django development server startup script
REM Runs Django on port 8900

cd /d "%~dp0"
call "C:\Users\steve_80f2z1j\Development\project-deps\KewlKidsOrganizerMobile-backend-venv\Scripts\activate"
python manage.py runserver 8900


