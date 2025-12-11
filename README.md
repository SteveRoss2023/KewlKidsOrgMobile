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
├── mobile/                    # React Native app (Expo)
│   ├── app/                   # App router (Expo Router)
│   ├── components/            # React Native components
│   ├── screens/               # Screen components
│   ├── services/              # API services
│   ├── utils/                 # Utilities
│   ├── contexts/              # React contexts
│   ├── hooks/                 # Custom hooks
│   └── app.json               # Expo configuration
├── backend/                   # Django backend
│   ├── config/                # Django settings
│   ├── api/                   # API endpoints
│   ├── families/              # Family management
│   ├── events/                # Calendar events
│   ├── lists/                 # Lists & shopping
│   ├── chat/                  # Chat with E2EE
│   ├── meals/                 # Meal planning
│   ├── documents/             # Document sharing
│   ├── finance/               # Finance tracking
│   └── manage.py
├── Docs/                      # Documentation
│   ├── MOBILE_APP_PLAN.md     # Complete migration plan
│   ├── SETUP.md               # Setup instructions
│   ├── TESTING.md             # Testing guide
│   ├── DEPLOYMENT.md          # Store deployment guide
│   └── MIGRATION.md           # Feature migration guide
└── README.md
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

For WebSocket support:
```bash
daphne config.asgi:application --port 8000
```

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


