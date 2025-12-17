# KewlKids Organizer Mobile - Startup Procedure

This document provides step-by-step instructions for starting the development environment, including the Django backend, Expo mobile app, and ngrok tunnel configuration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Port Configuration](#port-configuration)
3. [Backend Startup](#backend-startup)
4. [Mobile App Startup](#mobile-app-startup)
5. [Ngrok Setup (Optional)](#ngrok-setup-optional)
6. [Environment Variables](#environment-variables)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js**: 18+ (LTS recommended)
- **Python**: 3.12+
- **PostgreSQL**: 15+ (required for production, optional for development)
- **Expo CLI**: Latest (`npm install -g expo-cli`)
- **ngrok**: Latest (optional, for external access) - [Download ngrok](https://ngrok.com/download)

---

## Port Configuration

The application uses the following ports:

| Service | Port | Description |
|---------|------|-------------|
| **Django Backend API** | `8900` | Main API server (default) |
| **Expo Metro Bundler** | `8081` | React Native bundler (default) |
| **Expo Web** | `19000` | Web development server (alternate) |
| **Expo Web (Alternate)** | `19006` | Web development server (alternate) |
| **PostgreSQL** | `5432` | Database server (default) |
| **ngrok API Tunnel** | `8900` â†’ Public URL | Tunnels backend API |
| **ngrok Web Tunnel** | `8081` â†’ Public URL | Tunnels web app (optional) |

### Finding Your Local IP Address

For mobile device testing, you need your computer's local IP address:

**Windows:**
```powershell
ipconfig
# Look for "IPv4 Address" under your active network adapter
# Example: 10.0.0.25
```

**Mac/Linux:**
```bash
ifconfig
# Look for "inet" under your active network adapter
# Example: 192.168.1.100
```

---

## Backend Startup

### Step 1: Navigate to Backend Directory

```bash
cd backend
```

### Step 2: Activate Virtual Environment

**Windows:**
```powershell
.\venv\Scripts\activate
# Or use the provided script:
.\activate.ps1
```

**Mac/Linux:**
```bash
source venv/bin/activate
```

### Step 3: Set Up Environment Variables

Create a `.env` file in the `backend/` directory if it doesn't exist:

```env
# Django Settings
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,10.0.0.25,kewlkidsorganizermobile.ngrok.app,*.ngrok.app,*.ngrok-free.app

# Database (PostgreSQL)
DATABASE_NAME=kewlkidsorganizer_mobile
DATABASE_USER=kewlkids_user
DATABASE_PASSWORD=your-database-password
DATABASE_HOST=localhost
DATABASE_PORT=5432

# JWT Settings
JWT_ACCESS_TOKEN_LIFETIME=60
JWT_REFRESH_TOKEN_LIFETIME=1440
JWT_ALGORITHM=HS256
JWT_SECRET_KEY=your-jwt-secret-key

# Web App URL (for email verification redirects)
WEB_APP_URL=http://localhost:8081
# Or if using ngrok:
# WEB_APP_URL=https://kewlkidsorganizermobile-web.ngrok.app
```

**Generate Secret Keys:**
```bash
# Generate Django SECRET_KEY
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Generate JWT_SECRET_KEY (can be same as SECRET_KEY or different)
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### Step 4: Run Database Migrations

```bash
python manage.py migrate
```

### Step 5: Create Superuser (First Time Only)

```bash
python manage.py createsuperuser
```

### Step 6: Start Django Server

**Option A: Using the Custom Runserver Command (Recommended)**
```bash
python manage.py runserver
# Defaults to port 8900 and listens on all interfaces (0.0.0.0)
```

**Option B: Using the Batch Script (Windows)**
```bash
.\runserver.bat
```

**Option C: Manual Start with Custom Port**
```bash
python manage.py runserver 0.0.0.0:8900
```

### Step 7: Verify Backend is Running

Open your browser and navigate to:
- **API Root**: http://localhost:8900/api/
- **Admin Panel**: http://localhost:8900/admin/
- **Health Check**: http://localhost:8900/api/health/ (if implemented)

You should see the API response or Django admin login page.

---

## Mobile App Startup

### Step 1: Navigate to Mobile Directory

```bash
cd mobile
```

### Step 2: Install Dependencies (First Time Only)

```bash
npm install
```

### Step 3: Set Up Environment Variables (Optional)

Create a `.env` file in the `mobile/` directory:

```env
# API URL Configuration
# For web: uses localhost:8900/api automatically
# For native: uses your local IP (update in mobile/services/api.ts)
EXPO_PUBLIC_API_URL=http://10.0.0.25:8900/api
# Or if using ngrok:
# EXPO_PUBLIC_API_URL=https://kewlkidsorganizermobile.ngrok.app/api
```

**Note:** The app automatically detects the API URL based on platform:
- **Web**: Uses `http://localhost:8900/api`
- **Native (Mobile)**: Uses your local IP address (default: `http://10.0.0.25:8900/api`)
- **Ngrok Web**: Automatically detects ngrok domain and uses corresponding API URL

Update the IP address in `mobile/services/api.ts` (line 43) if your local IP is different.

### Step 4: Start Expo Development Server

**Basic Start:**
```bash
npx expo start
```

**Start Options:**
```bash
# Start for web browser
npx expo start --web

# Start for Android
npx expo start --android

# Start for iOS
npx expo start --ios

# Start with tunnel (works across networks, requires Expo account)
npx expo start --tunnel

# Clear cache and start
npx expo start --clear
```

### Step 5: Connect to Development Server

**For Web Browser:**
- Press `w` in the terminal, or
- Navigate to http://localhost:8081

**For Mobile Device (Expo Go):**
1. Install **Expo Go** app on your phone:
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
2. Ensure phone and computer are on the same Wi-Fi network
3. Scan the QR code displayed in the terminal with:
   - **iOS**: Camera app (tap notification banner)
   - **Android**: Expo Go app (tap "Scan QR code")
4. App will load in Expo Go

**For Simulator/Emulator:**
- Press `i` for iOS simulator (requires Xcode on Mac)
- Press `a` for Android emulator (requires Android Studio)

### Step 6: Verify Mobile App is Running

- Web: Check browser console for API connection logs
- Mobile: Check terminal for Metro bundler logs
- Look for: `API Base URL: http://...` in console logs

---

## Ngrok Setup (Optional)

Ngrok is useful for:
- Testing on mobile devices outside your local network
- Testing webhooks from external services
- Sharing the app with others for testing

### Step 1: Install ngrok

Download from [ngrok.com](https://ngrok.com/download) and add to your PATH, or use:

```bash
# Windows (using Chocolatey)
choco install ngrok

# Mac (using Homebrew)
brew install ngrok

# Or download and extract manually
```

### Step 2: Sign Up and Get Auth Token

1. Sign up at [ngrok.com](https://dashboard.ngrok.com/signup)
2. Get your authtoken from the dashboard
3. Configure ngrok:
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### Step 3: Start Backend Tunnel

**Terminal 1 - Start Django:**
```bash
cd backend
.\venv\Scripts\activate
python manage.py runserver
```

**Terminal 2 - Start ngrok for API:**
```bash
ngrok http 8900 --domain=kewlkidsorganizermobile.ngrok.app
# Or use a random domain:
# ngrok http 8900
```

**Note:** If you have a paid ngrok account with a reserved domain, use the `--domain` flag. Otherwise, ngrok will assign a random domain.

### Step 4: Start Web App Tunnel (Optional)

**Terminal 3 - Start Expo:**
```bash
cd mobile
npx expo start --web
```

**Terminal 4 - Start ngrok for Web:**
```bash
ngrok http 8081 --domain=kewlkidsorganizermobile-web.ngrok.app
# Or use a random domain:
# ngrok http 8081
```

### Step 5: Update Configuration

**Backend `.env`:**
```env
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,10.0.0.25,kewlkidsorganizermobile.ngrok.app,*.ngrok.app,*.ngrok-free.app
WEB_APP_URL=https://kewlkidsorganizermobile-web.ngrok.app
```

**Mobile `.env` (if using):**
```env
EXPO_PUBLIC_API_URL=https://kewlkidsorganizermobile.ngrok.app/api
```

**Note:** The mobile app automatically detects ngrok domains when running on web, so manual configuration may not be needed.

### Step 6: Access via Ngrok

- **API**: https://kewlkidsorganizermobile.ngrok.app/api/
- **Web App**: https://kewlkidsorganizermobile-web.ngrok.app
- **Admin**: https://kewlkidsorganizermobile.ngrok.app/admin/

---

## Environment Variables

### Backend Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SECRET_KEY` | Django secret key | - | Yes |
| `DEBUG` | Debug mode | `True` | No |
| `ALLOWED_HOSTS` | Allowed hostnames | `localhost,127.0.0.1,...` | No |
| `DATABASE_NAME` | PostgreSQL database name | `kewlkidsorganizer_mobile` | No |
| `DATABASE_USER` | PostgreSQL username | `kewlkids_user` | No |
| `DATABASE_PASSWORD` | PostgreSQL password | - | Yes |
| `DATABASE_HOST` | Database host | `localhost` | No |
| `DATABASE_PORT` | Database port | `5432` | No |
| `JWT_ACCESS_TOKEN_LIFETIME` | JWT access token lifetime (minutes) | `60` | No |
| `JWT_REFRESH_TOKEN_LIFETIME` | JWT refresh token lifetime (minutes) | `1440` | No |
| `JWT_ALGORITHM` | JWT algorithm | `HS256` | No |
| `JWT_SECRET_KEY` | JWT signing key | Uses `SECRET_KEY` | No |
| `WEB_APP_URL` | Web app URL for redirects | `http://localhost:8081` | No |

### Mobile Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `EXPO_PUBLIC_API_URL` | API base URL | Auto-detected | No |

**API URL Auto-Detection:**
- **Web (localhost)**: `http://localhost:8900/api`
- **Web (ngrok)**: Automatically detected from window.location
- **Native**: `http://10.0.0.25:8900/api` (update IP in `mobile/services/api.ts`)

---

## Troubleshooting

### Backend Issues

**Problem: Port 8900 already in use**
```bash
# Find process using port 8900
# Windows:
netstat -ano | findstr :8900
taskkill /PID <PID> /F

# Mac/Linux:
lsof -i :8900
kill -9 <PID>

# Or use a different port:
python manage.py runserver 0.0.0.0:8901
```

**Problem: Database connection error**
- Verify PostgreSQL is running
- Check database credentials in `.env`
- Ensure database exists: `createdb kewlkidsorganizer_mobile`

**Problem: CORS errors**
- Verify `CORS_ALLOW_ALL_ORIGINS = True` in `settings.py` (development only)
- Check `ALLOWED_HOSTS` includes your IP/domain
- Restart Django server after changing settings

### Mobile App Issues

**Problem: Can't connect to API from mobile device**
- Verify backend is running on `0.0.0.0:8900` (not just `localhost`)
- Check firewall allows connections on port 8900
- Verify phone and computer are on the same Wi-Fi network
- Update IP address in `mobile/services/api.ts` (line 43)

**Problem: Expo Metro bundler port conflict**
```bash
# Use a different port:
npx expo start --port 8082
```

**Problem: App shows "Network error"**
- Check API URL in console logs
- Verify backend is accessible: `curl http://YOUR_IP:8900/api/health/`
- Check CORS settings in Django
- Verify ngrok tunnel is running (if using)

**Problem: QR code not working**
- Use tunnel mode: `npx expo start --tunnel`
- Manually enter URL in Expo Go app
- Check firewall/network settings

### Ngrok Issues

**Problem: ngrok domain not working**
- Verify ngrok is running: Check ngrok dashboard
- Check ngrok authtoken is configured
- Verify domain is reserved (if using custom domain)
- Restart ngrok tunnel

**Problem: API calls fail through ngrok**
- Verify `ALLOWED_HOSTS` includes ngrok domain
- Check CORS settings allow ngrok origin
- Verify ngrok tunnel is pointing to correct port (8900)

**Problem: Web app can't connect to API through ngrok**
- The app auto-detects ngrok domains on web
- Verify both tunnels are running (API and Web)
- Check browser console for API URL being used

---

## Quick Start Checklist

Use this checklist for a quick startup:

- [ ] Backend virtual environment activated
- [ ] Backend `.env` file configured
- [ ] Database migrations run
- [ ] Django server running on port 8900
- [ ] Backend accessible at http://localhost:8900/api/
- [ ] Mobile dependencies installed (`npm install`)
- [ ] Mobile IP address updated in `api.ts` (if needed)
- [ ] Expo development server started
- [ ] Mobile app connected (web/mobile device)
- [ ] API connection verified (check console logs)
- [ ] (Optional) Ngrok tunnels configured and running

---

## Development Workflow

### Typical Development Session

1. **Start Backend:**
   ```bash
   cd backend
   .\venv\Scripts\activate  # Windows
   python manage.py runserver
   ```

2. **Start Mobile App:**
   ```bash
   cd mobile
   npx expo start
   ```

3. **For External Testing (Optional):**
   ```bash
   # Terminal 1: Backend ngrok
   ngrok http 8900 --domain=kewlkidsorganizermobile.ngrok.app
   
   # Terminal 2: Web app ngrok
   ngrok http 8081 --domain=kewlkidsorganizermobile-web.ngrok.app
   ```

4. **Make Changes:**
   - Backend: Restart Django server if needed
   - Mobile: Hot reload automatically updates

5. **Test:**
   - Web: http://localhost:8081
   - Mobile: Scan QR code with Expo Go
   - External: Use ngrok URLs

---

## Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [ngrok Documentation](https://ngrok.com/docs)
- [React Native Documentation](https://reactnative.dev/)

---

## Notes

- **Port 8900**: Custom Django port to avoid conflicts with other services
- **0.0.0.0 Binding**: Allows connections from any network interface (needed for mobile testing)
- **Auto-Detection**: Mobile app automatically detects API URL based on platform and environment
- **Ngrok Domains**: Update `ALLOWED_HOSTS` and `WEB_APP_URL` when using ngrok
- **CORS**: Development mode allows all origins; restrict in production

---

**Last Updated**: 2024
**Maintained By**: Development Team
