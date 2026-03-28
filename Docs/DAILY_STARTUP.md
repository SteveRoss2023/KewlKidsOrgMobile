# Daily Startup Guide

## At a glance

| What | Where | Command |
|------|-------|---------|
| **Backend** | `backend/` + venv | `python manage.py runserver` |
| **Frontend (dev)** | `mobile/` | `npm start` (then **`w`** for web, or `npm run web`) |
| **Update prod static web** | `mobile/` | `npm run build` |
| **Serve `dist` for Cloudflare tunnel** | `mobile/` | `npx serve -s dist -l 8085` |

**Summary:** Develop with **backend + `npm start`**. Ship web UI changes with **`npm run build`**, then **`serve`** on **8085**; **app-admin / Cloudflare** points **[organizer.kewlkids.ca](https://organizer.kewlkids.ca)** at this PC.

---

Quick reference for starting the app each day (after login or reboot).

---

## Quick Start

**Typical local dev:** Steps 1–4 (Redis → backend → Expo → open web or device).

**Static web preview:** After changing the web app, run `npm run build` in `mobile/`, then serve `dist` (e.g. `npx serve -s dist -l 8085`). This is **not** hot reload; use `npm start` / `npm run web` for day-to-day UI work.

---

### 1. Start Redis (Required for WebSockets)

**Windows:**
```powershell
# If Redis is installed
redis-server
# Or if using WSL:
wsl redis-server
```

**Mac (Homebrew):**
```bash
brew services start redis
```

**Linux:**
```bash
sudo systemctl start redis
```

**✅ Verify:** Run `redis-cli ping` - should return `PONG`

**Note:** If Redis is not available, the server will still start but WebSockets won't work properly.

### 2. Start Backend Server

**Windows:**
```powershell
cd backend
.\venv\Scripts\activate
python manage.py runserver
```

**Mac/Linux:**
```bash
cd backend
source venv/bin/activate
python manage.py runserver
```

**✅ Verify:** Open http://localhost:8900/api/ in browser - should see API response

**Note:** With `daphne` in `INSTALLED_APPS`, `runserver` automatically uses Daphne for WebSocket support. Redis must be running for chat features.

---

### 3. Start Mobile App (Expo dev)

**Open a new terminal/command prompt:**

```bash
cd mobile
npm start
```

(`npm start` → `npx expo start`. Use `npm run web` to open web directly.)

**✅ Verify:** QR code appears in terminal, Metro bundler is running

---

### 4. Connect to App

**For Web Browser:**
- Press `w` in the Expo terminal, or
- Run `npm run web` from `mobile/`
- Expo prints the URL (often http://localhost:8081)

**For Mobile Device:**
- Open Expo Go app on your phone
- Scan the QR code from terminal
- Ensure phone and computer are on same Wi-Fi network

---

### 5. (Optional) Static web build — production-like bundle

Use when you want to test the **exported** site (same workflow as deploying to **organizer.kewlkids.ca**), not the live dev server:

```bash
cd mobile
npm run build
npx serve -s dist -l 8085
```

Rebuild with `npm run build` whenever code changes; `serve` only shows the last export.

---

### 6. Verify Everything Works

- ✅ Backend: http://localhost:8900/api/ responds
- ✅ Mobile app loads in browser or Expo Go
- ✅ Can log in and see data
- ✅ API calls work (check browser console for errors)
- ✅ Email / invitation links: use **production** **organizer.kewlkids.ca** or ensure `WEB_APP_URL` in backend `.env` matches where the user opens the app

---

## Troubleshooting Quick Fixes

### Backend won't start?

**Port 8900 in use:**
```powershell
# Windows - Find and kill process
netstat -ano | findstr :8900
taskkill /PID <PID> /F

# Or use different port
python manage.py runserver 0.0.0.0:8901
```

**Database error:**
```bash
# Make sure PostgreSQL is running, then:
python manage.py migrate
```

---

### Mobile app can't connect to API?

**Check IP address:**
- Update `mobile/services/api.ts` (fallback LAN IP) if needed
- Find IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Or set `EXPO_PUBLIC_API_URL=http://YOUR_IP:8900/api` in `mobile/.env`

**Backend not accessible:**
- Ensure backend is running on `0.0.0.0:8900` (not just `localhost`)
- Check firewall allows port 8900
- Verify same Wi-Fi network for mobile device

**Web on organizer.kewlkids.ca:**
- API should resolve to **organizer-api.kewlkids.ca** via `EXPO_PUBLIC_API_HOST` (see `mobile/.env.example`)

---

## Daily Startup Checklist

```
[ ] Terminal 1: Redis running (redis-cli ping → PONG)
[ ] Terminal 2: Backend started (port 8900)
[ ] Backend accessible at http://localhost:8900/api/
[ ] Terminal 3: Mobile app started (npm start in mobile/)
[ ] App connected (web browser or Expo Go)
[ ] Can log in successfully
[ ] (Optional) npm run build + serve dist — only if testing static export
```

---

## What to Run (Copy-Paste Ready)

### Windows PowerShell - Backend:
```powershell
cd backend
.\venv\Scripts\activate
python manage.py runserver
```

### Windows PowerShell - Mobile (dev):
```powershell
cd mobile
npm start
```

### Windows PowerShell - Static web preview:
```powershell
cd mobile
npm run build
npx serve -s dist -l 8085
```

### Mac/Linux - Backend:
```bash
cd backend
source venv/bin/activate
python manage.py runserver
```

### Mac/Linux - Mobile (dev):
```bash
cd mobile
npm start
```

---

## Ports Reference

| Service | Port | URL |
|---------|------|-----|
| Backend API | 8900 | http://localhost:8900/api/ |
| Expo / Metro (typical) | 8081 | Shown in Expo terminal |
| Static preview (example) | 8085 | After `serve -s dist -l 8085` |
| Admin Panel | 8900 | http://localhost:8900/admin/ |
| Production web | 443 | https://organizer.kewlkids.ca |

---

## First Time Setup (Only Once)

If this is your first time setting up:

1. **Backend:**
   - Create `.env` file in `backend/` (see STARTUP_PROCEDURE.md)
   - Run migrations: `python manage.py migrate`
   - Create superuser: `python manage.py createsuperuser`

2. **Mobile:**
   - Install dependencies: `cd mobile && npm install`
   - Copy `mobile/.env.example` to `mobile/.env` and set LAN IP / `EXPO_PUBLIC_*` as needed

3. **Production:** Cloudflare + tunnel/DNS for **organizer.kewlkids.ca** and **organizer-api.kewlkids.ca** (see STARTUP_PROCEDURE.md)

---

## Stopping Everything

**To stop all services:**

1. **Backend:** Press `Ctrl+C` in backend terminal
2. **Mobile / Expo:** Press `Ctrl+C` in mobile terminal
3. **serve:** Press `Ctrl+C` in static preview terminal

**Deactivate virtual environment (optional):**
```bash
deactivate
```

---

## Reference: ngrok (legacy)

The team **does not** rely on ngrok for production (**organizer.kewlkids.ca** uses Cloudflare). You might still use ngrok for a one-off public tunnel to your **local** API; see [STARTUP_PROCEDURE.md — Reference: ngrok](./STARTUP_PROCEDURE.md#reference-ngrok-optional-tunneling).

---

## Common Issues

| Problem | Quick Fix |
|--------|-----------|
| "Port 8900 already in use" | Kill process or use different port |
| "Can't connect to API" | Check IP address, firewall, same network; `EXPO_PUBLIC_API_URL` on device |
| "Module not found" | Run `npm install` in mobile directory |
| "Database error" | Check PostgreSQL is running |
| "Stale web build" | Run `npm run build` again before `serve` |
| "Email link doesn't work" | Point `WEB_APP_URL` at the URL users actually open (e.g. https://organizer.kewlkids.ca) |

---

**Need more details?** See [STARTUP_PROCEDURE.md](./STARTUP_PROCEDURE.md) for complete documentation.
