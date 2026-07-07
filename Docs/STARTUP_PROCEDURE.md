# KewlKids Organizer Mobile - Startup Procedure

## At a glance

| What | Directory | Command |
|------|-----------|---------|
| **Backend (API)** | `backend/` (venv activated) | `python manage.py runserver` → [http://localhost:8900](http://localhost:8900) |
| **Frontend — developing** | `mobile/` | `npm start` (Expo; press **`w`** for web, or use `npm run web`) |
| **Frontend — refresh production static files** | `mobile/` | `npm run build` (writes `dist`; run again after code changes) |
| **Serve `dist` (origin for Cloudflare / app-admin tunnel)** | `mobile/` | `npx serve -s dist -l 8085` |

**Your production web flow:** **`npm run build`** → **`npx serve -s dist -l 8085`** on this PC → **Cloudflare Tunnel** (app-admin) exposes **[organizer.kewlkids.ca](https://organizer.kewlkids.ca)** to that port. API is separate (**organizer-api.kewlkids.ca** / local `runserver` as you use it).

---

This document covers local development (Django backend + Expo app) and how that relates to **production**, which is served through **Cloudflare** at **[https://organizer.kewlkids.ca](https://organizer.kewlkids.ca)** (API typically **`organizer-api.kewlkids.ca`**). **ngrok** is no longer used for day-to-day work; a [reference section](#reference-ngrok-optional-tunneling) is kept if you ever need tunneling.

## Table of Contents

0. [At a glance](#at-a-glance)
1. [Prerequisites](#prerequisites)
2. [Port Configuration](#port-configuration)
3. [Backend Startup](#backend-startup)
4. [Mobile App Startup](#mobile-app-startup)
5. [Web static build (production preview)](#web-static-build-production-preview)
6. [Environment Variables](#environment-variables) (includes Cloudflare + `kewlkids.ca`)
7. [Troubleshooting](#troubleshooting)
8. [Reference: ngrok (optional tunneling)](#reference-ngrok-optional-tunneling)

---

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js**: 18+ (LTS recommended)
- **Python**: 3.12+
- **PostgreSQL**: 15+ (required for production, optional for development)
- **Expo**: Use `npx expo` via project dependencies (global `expo-cli` is optional)
- **Redis**: Required for WebSockets/chat (see backend section)
- **ngrok**: Not required for normal dev; see [Reference: ngrok](#reference-ngrok-optional-tunneling) if you need a quick public tunnel

---

## Port Configuration

The application uses the following ports:

| Service | Port | Description |
|---------|------|-------------|
| **Django Backend API** | `8900` | Main API server (default) |
| **Expo Metro Bundler** | `8081` | React Native / web dev (default; Expo may show another URL for web) |
| **PostgreSQL** | `5432` | Database server (default) |
| **Production web (Cloudflare)** | `443` | **https://organizer.kewlkids.ca** (not a local port) |
| **Production API (Cloudflare)** | `443` | **https://organizer-api.kewlkids.ca** (hostname from tunnel/DNS config) |

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
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,10.0.0.25,organizer.kewlkids.ca,organizer-api.kewlkids.ca
# Local dev: include your LAN IP (e.g. 10.0.0.25). Production: include Cloudflare hostnames above.
# Legacy tunneling (reference only): *.ngrok.app

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

# Web app URL (email verification, OAuth redirects, invitations)
# Local dev:
WEB_APP_URL=http://localhost:8081
# Production / Cloudflare:
# WEB_APP_URL=https://organizer.kewlkids.ca
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

### Step 5.5: Start Redis (Required for WebSockets)

**Windows:**
```powershell
# If Redis is installed via Chocolatey or Windows installer
redis-server
# Or if using WSL:
wsl redis-server
```

**Mac (Homebrew):**
```bash
brew services start redis
# Or run directly:
redis-server
```

**Linux:**
```bash
sudo systemctl start redis
# Or run directly:
redis-server
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

**Note:** If Redis is not available, Channels will fall back to in-memory channel layer (not recommended for production, but works for development).

### Step 6: Start Django Server

**Option A: Using the Custom Runserver Command (Recommended)**
```bash
python manage.py runserver
# Defaults to port 8900 and listens on all interfaces (0.0.0.0)
# Automatically uses Daphne for WebSocket support when ASGI_APPLICATION is configured
```

**Option B: Using the Batch Script (Windows)**
```bash
.\runserver.bat
```

**Option C: Manual Start with Custom Port**
```bash
python manage.py runserver 0.0.0.0:8900
```

**Note:** With `daphne` in `INSTALLED_APPS` and `ASGI_APPLICATION` configured, `runserver` automatically uses Daphne for WebSocket support. Redis must be running for chat features to work.

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

Copy [`mobile/.env.example`](../mobile/.env.example) to `mobile/.env` and adjust. Typical entries for **production-aligned hostnames** (used when the app is opened on **`*.kewlkids.ca`**):

```env
EXPO_PUBLIC_CUSTOM_DOMAIN=kewlkids.ca
EXPO_PUBLIC_WEB_APP_HOST=organizer.kewlkids.ca
EXPO_PUBLIC_API_HOST=organizer-api.kewlkids.ca
```

For **native / Expo Go** on your LAN, set (replace with your machine’s IP):

```env
EXPO_PUBLIC_API_URL=http://10.0.0.25:8900/api
```

**Note:** The app resolves the API URL by context (see [Environment Variables](#environment-variables)):
- **Web on `localhost`**: `http://localhost:8900/api`
- **Web on `organizer.kewlkids.ca`**: `https://organizer-api.kewlkids.ca/api` (via `EXPO_PUBLIC_API_HOST`)
- **Physical device**: `EXPO_PUBLIC_API_URL` or the fallback in [`mobile/services/api.ts`](../mobile/services/api.ts)

### Step 4: Start Expo Development Server

**npm scripts (from `mobile/`):**

| Script | Command |
|--------|---------|
| `npm start` | `npx expo start` — dev server + QR (press `w` for web) |
| `npm run web` | `npx expo start --web` — open web directly |
| `npm run start:clear` | `npx expo start --clear` — clear Metro cache |
| `npm run build` | `npx expo export --platform web` — static files for hosting (see below) |

**Basic start:**
```bash
npm start
# or: npx expo start
```

**Other start modes:**
```bash
npm run web
npx expo start --android
npx expo start --ios
npx expo start --tunnel   # different network; needs Expo account
npm run start:clear
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

## Web static build (production preview)

The Expo web app is configured for **static export** (`app.json`: `"web.output": "static"`). This produces files you can host behind Cloudflare (e.g. **organizer.kewlkids.ca**) or test locally with a static file server.

**From `mobile/`:**

```bash
npm run build
```

This runs `scripts/build-web.ps1` (Expo static export + PWA manifest/cache-bust patches). Output directory is **`dist`** in `mobile/`. Full PWA deploy guide: [WEB_PWA_DEPLOY.md](./WEB_PWA_DEPLOY.md).

**Preview the build locally** (does not hot-reload; rebuild after code changes):

```bash
npx serve -s dist -l 8085
```

Adjust the port if needed. Unlike `npm run web` / `expo start`, **`serve` only serves what is already in `dist`** — run `npm run build` again whenever you want the latest bundle.

---

## Reference: ngrok (optional tunneling)

**Not used for production.** Public access goes through **Cloudflare** and **organizer.kewlkids.ca**. ngrok is documented here only for occasional tunneling (e.g. quick third-party webhook tests).

Ngrok can still be useful for:
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
ngrok http 8900
# Paid/reserved hostname example:
# ngrok http 8900 --domain=your-name.ngrok.app
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
ngrok http 8081
# Match the port Expo prints for web / Metro
```

### Step 5: Update Configuration (ngrok example only)

If you temporarily use ngrok, add its hostnames to Django and point `WEB_APP_URL` at the **web** tunnel URL. Production should use **organizer.kewlkids.ca** instead.

**Backend `.env` (illustrative ngrok values):**
```env
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,10.0.0.25,your-api-tunnel.ngrok-free.app
WEB_APP_URL=https://your-web-tunnel.ngrok-free.app
```

**Mobile `.env` (native / tunnel testing):**
```env
EXPO_PUBLIC_API_URL=https://your-api-tunnel.ngrok-free.app/api
```

### Step 6: Access via ngrok (example hostnames)

Replace with whatever domain ngrok assigns (reserved domains if you pay for them):

- **API**: `https://<your-ngrok-api-host>/api/`
- **Web app**: `https://<your-ngrok-web-host>/`
- **Admin**: `https://<your-ngrok-api-host>/admin/`

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
| `WEB_APP_URL` | Web app URL for redirects (emails, OAuth UI) | `https://organizer.kewlkids.ca` in production | No |

### Mobile Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `EXPO_PUBLIC_CUSTOM_DOMAIN` | Apex domain for `*.kewlkids.ca` detection | `kewlkids.ca` | No |
| `EXPO_PUBLIC_WEB_APP_HOST` | Public browser hostname (no scheme) | `organizer.kewlkids.ca` | No |
| `EXPO_PUBLIC_API_HOST` | Public API hostname (no scheme) | `organizer-api.kewlkids.ca` | No |
| `EXPO_PUBLIC_API_URL` | API base URL for **native / Expo Go** (and non-localhost web if set) | See below | No |

Copy [`mobile/.env.example`](../mobile/.env.example) to `mobile/.env` and adjust.

**API URL resolution (web):**
- **Runtime override** (`kewlkids_runtime_api_base_url` in session/localStorage): used first for debugging.
- **`localhost` / `127.0.0.1`**: always `http://localhost:8900/api` (ignores stale `EXPO_PUBLIC_API_URL` pointing at ngrok or prod).
- **`*.kewlkids.ca`**: `https://<EXPO_PUBLIC_API_HOST>/api` (defaults to `organizer-api.kewlkids.ca`).
- **Otherwise**: `EXPO_PUBLIC_API_URL` if set, else inferred (localhost / legacy tunnel hostnames).

**Native / physical device:** set `EXPO_PUBLIC_API_URL` to your PC’s LAN URL, e.g. `http://10.0.0.25:8900/api`, or the fallback IP in [`mobile/services/api.ts`](mobile/services/api.ts) if unset.

### Cloudflare + `kewlkids.ca` (app-admin)

**Production web app:** [https://organizer.kewlkids.ca](https://organizer.kewlkids.ca)

For public URLs on your domain, use **app-admin** to assign stable subdomains (recommended: web **`organizer`**, API **`organizer-api`**). Cloudflare Tunnel (or your ingress) should route by hostname; update **OAuth redirect URIs** in Azure/Google and **`WEB_APP_URL`** / **`EXPO_PUBLIC_*`** if you change labels.

**Production web icons (`@expo/vector-icons` fonts):** If icons show as empty boxes, open DevTools → Network and confirm `.ttf` / `.woff` requests return fonts (not `index.html`). Fix static hosting so asset paths are not caught by SPA fallback; on Cloudflare, try disabling Rocket Loader / Auto Minify for the site and purging cache.

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
- If testing via a public URL, confirm Cloudflare/tunnel and `WEB_APP_URL` match that host

**Problem: QR code not working**
- Use tunnel mode: `npx expo start --tunnel`
- Manually enter URL in Expo Go app
- Check firewall/network settings

### Reference: ngrok tunnel issues

Only if you are using ngrok (not required for Cloudflare production):

- Verify ngrok is running and authtoken is set (`ngrok config check`).
- Add the tunnel hostname to `ALLOWED_HOSTS` and match `WEB_APP_URL` to the **web** tunnel.
- Point the API tunnel at port **8900** and the web tunnel at your dev server port (often **8081** for Metro).

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
- [ ] (Optional) `npm run build` + static preview if testing production web bundle locally
- [ ] Production: **organizer.kewlkids.ca** / tunnel healthy (not part of typical local dev)

---

## Development Workflow

### Typical Development Session

1. **Start Backend:**
   ```bash
   cd backend
   .\venv\Scripts\activate  # Windows
   python manage.py runserver
   ```

2. **Start mobile app (dev):**
   ```bash
   cd mobile
   npm start
   ```

3. **Production web (deploy / preview workflow):**
   - Build static web: `cd mobile && npm run build`
   - Deploy the export output (e.g. `dist`) to the host behind **organizer.kewlkids.ca**, or preview with `npx serve -s dist -l 8085`
   - Public site: **https://organizer.kewlkids.ca**

4. **Optional tunneling (reference):** See [Reference: ngrok](#reference-ngrok-optional-tunneling). Normal dev does not require ngrok.

5. **Make changes:**
   - Backend: Restart Django server if needed
   - Mobile (dev): Hot reload via Expo
   - Static web: Re-run `npm run build` after changes before serving `dist`

6. **Test:**
   - Web (dev): URL shown in Expo terminal (often http://localhost:8081) or press `w`
   - Mobile: Scan QR code with Expo Go
   - Production: https://organizer.kewlkids.ca

---

## Additional Resources

- [Expo Documentation](https://docs.expo.dev/) — including [static web export](https://docs.expo.dev/guides/publishing-websites/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [Cloudflare Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [React Native Documentation](https://reactnative.dev/)
- [ngrok Documentation](https://ngrok.com/docs) (reference only)

---

## Notes

- **Port 8900**: Custom Django port to avoid conflicts with other services
- **0.0.0.0 Binding**: Allows connections from any network interface (needed for mobile testing)
- **API URL detection**: Web on **localhost** uses local API; web on **\*.kewlkids.ca** uses **organizer-api.kewlkids.ca** (see `mobile/services/api.ts` and `EXPO_PUBLIC_*` vars)
- **Production**: **organizer.kewlkids.ca** via Cloudflare; keep `WEB_APP_URL` and OAuth redirect URIs aligned
- **Static web**: `npm run build` then deploy `dist` (or preview with `serve`); not the same as `expo start`
- **CORS**: Development mode allows all origins; restrict in production

---

**Last Updated**: March 2026  
**Maintained By**: Development Team

