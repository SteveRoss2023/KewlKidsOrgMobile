---
name: Add KewlKids to startup script
overview: Add KewlKids Organizer project to the existing batch script that starts multiple Django projects. The script will start both the Django backend server (port 8900) and the Expo mobile app dev client.
todos: []
---

# Add Kew

lKids to Startup Script

## Overview

Add KewlKids Organizer to the existing batch script that starts multiple Django projects. The project needs to start:

1. Django backend server on port 8900
2. Expo mobile app with dev client (`npx expo start --dev-client`)

## Implementation Details

### Project Path

- Use: `C:\dev\kewlkids`
- Backend directory: `C:\dev\kewlkids\backend`
- Mobile directory: `C:\dev\kewlkids\mobile`

### Startup Commands

**Django Backend:**

- Navigate to `backend` directory
- Activate virtual environment: `venv\Scripts\activate`
- Start server: `python manage.py runserver 8900`

**Expo Mobile:**

- Navigate to `mobile` directory  
- Start dev client: `npx expo start --dev-client`

### Script Structure

Add two new sections to the batch script:

1. Start Django backend in a separate command window
2. Start Expo mobile app in a separate command window
3. Place before the ngrok section (so servers start first)

### Notes

- Django runs on port 8900 (as configured in `backend/runserver.bat`)