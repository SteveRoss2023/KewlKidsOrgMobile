# Startup commands

Quick reference for **backend**, **local web dev** (`localhost:8081`), and **refreshing the static web app** used with **Cloudflare Tunnel** (e.g. `organizer.kewlkids.ca`).

---

## 1. Backend (Django API — port 8900)

**Windows (PowerShell):**

```powershell
cd C:\dev\kewlkids\backend
.\venv\Scripts\activate
python manage.py runserver
```

Defaults to **8900**. API: `http://localhost:8900/api/`.

---

## 2. Web dev — Expo (hot reload — `localhost:8081`)

```powershell
cd C:\dev\kewlkids\mobile
npx expo start --web
```

Open **http://localhost:8081**. Code changes reload without running `expo export`.

---

## 3. Static web for Cloudflare Tunnel (App Admin — port 8085)

**App Admin (KewlKids)** — working configuration:

| Field | Value |
|--------|--------|
| Frontend folder | `C:\dev\kewlkids\mobile` |
| Work dir | `C:\dev\kewlkids\mobile` |
| Command | `npx serve -s dist -l 8085` |
| Frontend port | **8085** |

When you **Start** the app from App Admin, that command runs once and keeps serving **`dist`** on **localhost:8085**. The Cloudflare Tunnel / reverse proxy forwards **`organizer.kewlkids.ca`** to that **local** port (Cloudflare does not replace `serve`; it proxies to your PC).

### After code changes (refresh the public site)

Regenerate the export only—**do not** start a second `serve` in a terminal:

```powershell
cd C:\dev\kewlkids\mobile
npm run build
```

The **existing** `serve` process (started by App Admin) continues on **8085** and will serve the updated files; hard-refresh the browser if you see caching.

- Output folder is **`dist`** (not `web-build`).
- Backend in App Admin: Django on **8900** as you have it.
- **PWA / installable web:** see [WEB_PWA_DEPLOY.md](./WEB_PWA_DEPLOY.md) for icons, home-screen install, and full deploy workflow.

---

## Summary

| Goal | Command(s) |
|------|------------|
| API | Backend section above |
| Local web dev | `npx expo start --web` → http://localhost:8081 |
| Refresh public static web (after code changes) | `npm run build` in `mobile/` (see [WEB_PWA_DEPLOY.md](./WEB_PWA_DEPLOY.md)) |
