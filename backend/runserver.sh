#!/bin/bash
# Django development server startup script
# Runs Django on port 8900

cd "$(dirname "$0")"
source venv/bin/activate
python manage.py runserver 8900


