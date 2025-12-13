# Daily Startup Guide

Quick reference for starting the app each day. Use this after logging in or restarting your computer.

---

## Quick Start

**Choose your setup:**

- **Local Only** (Steps 1-3): Testing on same computer/network
- **With Ngrok** (Steps 1-4): Needed for email links, invitations, or testing on different network

---

### 1. Start Backend Server

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

---

### 2. Start Mobile App

**Open a new terminal/command prompt:**

```bash
cd mobile
npx expo start
```

**✅ Verify:** QR code appears in terminal, Metro bundler is running

---

### 3. Connect to App

**For Web Browser:**
- Press `w` in the Expo terminal, or
- Navigate to http://localhost:8081

**For Mobile Device:**
- Open Expo Go app on your phone
- Scan the QR code from terminal
- Ensure phone and computer are on same Wi-Fi network

---

### 4. Start Ngrok Tunnels

**⚠️ Required if you:**
- Test email verification links
- Test family invitation links
- Test on mobile device not on same Wi-Fi network
- Need webhooks from external services

**Terminal 3 - API Tunnel (Required for email/invitation links):**
```bash
ngrok http 8900 --domain=kewlkidsorganizermobile.ngrok.app
```

**Terminal 4 - Web Tunnel (Required if testing email/invitation links on web):**
```bash
ngrok http 8081 --domain=kewlkidsorganizermobile-web.ngrok.app
```

**✅ Verify:** 
- Check ngrok dashboard shows active tunnels
- API accessible at: https://kewlkidsorganizermobile.ngrok.app/api/
- Web app accessible at: https://kewlkidsorganizermobile-web.ngrok.app

**Note:** If you're only testing locally on the same network and don't need email/invitation links, you can skip ngrok.

---

### 5. Verify Everything Works

- ✅ Backend: http://localhost:8900/api/ responds
- ✅ Mobile app loads in browser/Expo Go
- ✅ Can log in and see data
- ✅ API calls work (check browser console for errors)
- ✅ (If using ngrok) Email/invitation links work correctly

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
- Update `mobile/services/api.ts` line 43 with your current IP
- Find IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Default in code: `http://10.0.0.25:8900/api`

**Backend not accessible:**
- Ensure backend is running on `0.0.0.0:8900` (not just `localhost`)
- Check firewall allows port 8900
- Verify same Wi-Fi network for mobile device

---

### Ngrok not working?

**Check authtoken:**
```bash
ngrok config check
```

**Restart tunnel:**
- Stop ngrok (Ctrl+C)
- Restart: `ngrok http 8900 --domain=kewlkidsorganizermobile.ngrok.app`

---

## Daily Startup Checklist

Copy this checklist and check off as you go:

```
[ ] Terminal 1: Backend started (port 8900)
[ ] Backend accessible at http://localhost:8900/api/
[ ] Terminal 2: Mobile app started (Expo running)
[ ] QR code visible in terminal
[ ] App connected (web browser or Expo Go)
[ ] Can log in successfully
[ ] Terminal 3: Ngrok API tunnel running (if needed)
[ ] Terminal 4: Ngrok Web tunnel running (if needed)
[ ] Email/invitation links work (if testing)
```

---

## What to Run (Copy-Paste Ready)

### Windows PowerShell - Backend:
```powershell
cd backend
.\venv\Scripts\activate
python manage.py runserver
```

### Windows PowerShell - Mobile:
```powershell
cd mobile
npx expo start
```

### Mac/Linux - Backend:
```bash
cd backend
source venv/bin/activate
python manage.py runserver
```

### Mac/Linux - Mobile:
```bash
cd mobile
npx expo start
```

### Ngrok API (required for email/invitation links):
```bash
ngrok http 8900 --domain=kewlkidsorganizermobile.ngrok.app
```

### Ngrok Web (required if testing email/invitation links on web):
```bash
ngrok http 8081 --domain=kewlkidsorganizermobile-web.ngrok.app
```

---

## Ports Reference

| Service | Port | URL |
|---------|------|-----|
| Backend API | 8900 | http://localhost:8900/api/ |
| Mobile Web | 8081 | http://localhost:8081 |
| Admin Panel | 8900 | http://localhost:8900/admin/ |

---

## First Time Setup (Only Once)

If this is your first time setting up:

1. **Backend:**
   - Create `.env` file in `backend/` (see STARTUP_PROCEDURE.md)
   - Run migrations: `python manage.py migrate`
   - Create superuser: `python manage.py createsuperuser`

2. **Mobile:**
   - Install dependencies: `cd mobile && npm install`
   - Update IP address in `mobile/services/api.ts` (line 43)

3. **Ngrok (optional):**
   - Install ngrok and configure authtoken
   - Reserve domains if using custom domains

---

## Stopping Everything

**To stop all services:**

1. **Backend:** Press `Ctrl+C` in backend terminal
2. **Mobile:** Press `Ctrl+C` in mobile terminal
3. **Ngrok:** Press `Ctrl+C` in ngrok terminals

**Deactivate virtual environment (optional):**
```bash
deactivate
```

---

## When Do You Need Ngrok?

**✅ Start ngrok if you:**
- Need to test email verification links (they redirect to web app)
- Need to test family invitation links (they redirect to web app)
- Testing on mobile device not on same Wi-Fi network
- Need webhooks from external services
- Sharing app with others for testing

**❌ Skip ngrok if you:**
- Only testing locally on same computer
- Testing on mobile device on same Wi-Fi network (can use local IP)
- Not testing email/invitation features
- Just doing basic development

## Common Issues

| Problem | Quick Fix |
|--------|-----------|
| "Port 8900 already in use" | Kill process or use different port |
| "Can't connect to API" | Check IP address, firewall, same network |
| "Module not found" | Run `npm install` in mobile directory |
| "Database error" | Check PostgreSQL is running |
| "Ngrok domain not found" | Check authtoken, restart ngrok |
| "Email link doesn't work" | Make sure ngrok is running and WEB_APP_URL is set in backend .env |

---

**Need more details?** See [STARTUP_PROCEDURE.md](./STARTUP_PROCEDURE.md) for complete documentation.

