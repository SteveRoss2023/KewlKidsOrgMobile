# KewlKidsOrganizer Mobile

A React Native mobile application for family organization, built with Expo and Django backend.

## Project Overview

This mobile app is a migration of the KewlKidsOrganizer web application to React Native, providing a native mobile experience for families to manage:

- **Calendar & Events**: Family calendar with Google Calendar and Outlook integration
- **Lists & Shopping**: Shared shopping lists and to-do lists
- **Secure Messaging**: End-to-end encrypted chat
- **Meal Planning**: Recipe management and meal planning
- **Documents**: Secure document sharing
- **Finance Tracking**: Family budget and expense tracking
- **Location Sharing**: Real-time location sharing on maps

## Technology Stack

### Mobile (React Native/Expo)
- **Expo SDK**: 51+
- **React Native**: 0.74+
- **React**: 18.2.0+
- **Navigation**: Expo Router 3.5.0+
- **State Management**: React Context API

### Backend (Django)
- **Django**: 5.2.8+
- **Django REST Framework**: 3.14.0+
- **PostgreSQL**: 15+ (Production) / SQLite (Development)
- **Redis**: 7+ (for WebSockets and caching)
- **Django Channels**: 4.0.0+ (for real-time features)

## Project Structure

```
KewlKidsOrganizerMobile/
â”œâ”€â”€ mobile/                    # React Native app (Expo)
â”‚   â”œâ”€â”€ app/                   # App router (Expo Router)
â”‚   â”œâ”€â”€ components/            # React Native components
â”‚   â”œâ”€â”€ screens/               # Screen components
â”‚   â”œâ”€â”€ services/              # API services
â”‚   â”œâ”€â”€ utils/                 # Utilities
â”‚   â”œâ”€â”€ contexts/              # React contexts
â”‚   â”œâ”€â”€ hooks/                 # Custom hooks
â”‚   â””â”€â”€ app.json               # Expo configuration
â”œâ”€â”€ backend/                   # Django backend
â”‚   â”œâ”€â”€ config/                # Django settings
â”‚   â”œâ”€â”€ api/                   # API endpoints
â”‚   â”œâ”€â”€ families/              # Family management
â”‚   â”œâ”€â”€ events/                # Calendar events
â”‚   â”œâ”€â”€ lists/                 # Lists & shopping
â”‚   â”œâ”€â”€ chat/                  # Chat with E2EE
â”‚   â”œâ”€â”€ meals/                 # Meal planning
â”‚   â”œâ”€â”€ documents/             # Document sharing
â”‚   â”œâ”€â”€ finance/               # Finance tracking
â”‚   â””â”€â”€ manage.py
â”œâ”€â”€ Docs/                      # Documentation
â”‚   â”œâ”€â”€ MOBILE_APP_PLAN.md     # Complete migration plan
â”‚   â”œâ”€â”€ SETUP.md               # Setup instructions
â”‚   â”œâ”€â”€ TESTING.md             # Testing guide
â”‚   â”œâ”€â”€ DEPLOYMENT.md          # Store deployment guide
â”‚   â””â”€â”€ MIGRATION.md           # Feature migration guide
â””â”€â”€ README.md
```

## Getting Started

### Prerequisites

- **Node.js**: 18+ (LTS recommended)
- **Python**: 3.12+
- **PostgreSQL**: 15+ (optional for development, SQLite works)
- **Redis**: 7+ (for WebSockets)
- **Expo CLI**: Latest (`npm install -g expo-cli`)
- **EAS CLI**: Latest (`npm install -g eas-cli`)

### Quick Start

1. **Clone the repository** (if applicable)
2. **Set up the backend**:
   ```bash
   cd backend
   python -m venv venv
   # Windows: venv\Scripts\activate
   # Mac/Linux: source venv/bin/activate
   pip install -r requirements.txt
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py runserver
   ```

3. **Set up the mobile app**:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```

For detailed setup instructions, see [Docs/SETUP.md](Docs/SETUP.md)

## Development

### Running the Backend

```bash
cd backend
python manage.py runserver
```

**Note:** With `daphne` in `INSTALLED_APPS` and `ASGI_APPLICATION` configured, `runserver` automatically uses Daphne for WebSocket support. Redis must be running for WebSocket features to work.

### Running the Mobile App

```bash
cd mobile
npx expo start
```

- Press `w` to open in web browser
- Scan QR code with Expo Go app on your phone
- Press `i` for iOS simulator
- Press `a` for Android emulator

## Testing

- **Browser Testing**: `npx expo start --web`
- **Phone Testing**: Use Expo Go app to scan QR code
- **Development Build**: Use EAS Build for native features

See [Docs/TESTING.md](Docs/TESTING.md) for detailed testing instructions.

## Migration Status

This project is in active development. See [Docs/MOBILE_APP_PLAN.md](Docs/MOBILE_APP_PLAN.md) for the complete migration plan and progress.

## Documentation

- [Setup Guide](Docs/SETUP.md) - Detailed setup instructions
- [Testing Guide](Docs/TESTING.md) - Testing strategies and tools
- [Deployment Guide](Docs/DEPLOYMENT.md) - App Store deployment
- [Migration Guide](Docs/MIGRATION.md) - Feature migration patterns

## License

[Add your license here]

## Contributing

[Add contributing guidelines here]

