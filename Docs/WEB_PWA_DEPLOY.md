# Web PWA deploy — KewlKids Organizer

Guide for deploying the **installable PWA** at [organizer.kewlkids.ca](https://organizer.kewlkids.ca).

For backend and general startup, see [STARTUP_COMMANDS.md](./STARTUP_COMMANDS.md) and [STARTUP_PROCEDURE.md](./STARTUP_PROCEDURE.md).

---

## Art and icons (this repo)

All icon art lives in **this repo**:

| Path | Purpose |
|------|---------|
| `mobile/assets/icon.png` | Expo app icon (1024) |
| `mobile/assets/splash-icon.png` | Splash screen |
| `mobile/assets/adaptive-icon.png` | Android adaptive icon |
| `mobile/assets/favicon.png` | Browser favicon |
| `mobile/assets/branding/organizer-source.png` | Optional master source |
| `mobile/public/icons/Icon-192.png` | PWA + Apple touch icon |
| `mobile/public/icons/Icon-512.png` | PWA |
| `mobile/public/icons/Icon-maskable-192.png` | PWA (maskable) |
| `mobile/public/icons/Icon-maskable-512.png` | PWA (maskable) |

Organizer art was originally created in the KewlKidsGolfApp project and copied here once. **Future art changes:** edit/replace these files in `kewlkids` — you do not need GolfApp for deploys.

After changing icons:

1. Replace the PNGs above
2. Run `npm run build` (see below)
3. On phones: **remove** the old home-screen shortcut and **Add to Home Screen** again (iOS caches icons)

---

## Day-to-day: deploy web / PWA changes

From `mobile/`:

```powershell
cd C:\dev\kewlkids\mobile
npm run build
```

This runs `scripts/build-web.ps1`:

1. `npx expo export --platform web` → writes **`dist/`**
2. Cache-busts `manifest.json`, favicon, and icon URLs (Cloudflare / CDN)
3. Writes `dist/version.json` with build timestamp

**App Admin** already runs `npx serve -s dist -l 8085`. You do **not** restart `serve` unless it stopped. Hard-refresh the browser after build.

Public URL: **https://organizer.kewlkids.ca** (Cloudflare Tunnel → your PC port **8085**).

API (unchanged): **https://organizer-api.kewlkids.ca**

---

## Local development (hot reload)

No build step — use the Expo dev server:

```powershell
cd C:\dev\kewlkids\mobile
npx expo start --web
```

Open **http://localhost:8081**.

---

## Preview production build locally

```powershell
cd C:\dev\kewlkids\mobile
npm run build
npx serve -s dist -l 8085
```

Open **http://localhost:8085**.

Escape hatch (skip PWA post-build patches):

```powershell
npm run build:expo
```

---

## Backend API

```powershell
cd C:\dev\kewlkids\backend
.\venv\Scripts\activate
python manage.py runserver
```

Defaults to **8900**. Production API: **organizer-api.kewlkids.ca**.

---

## Install PWA on a phone

### Android (Chrome)

1. Open **https://organizer.kewlkids.ca**
2. Menu → **Install app** or **Add to Home screen**
3. Confirm — app opens in standalone mode (no browser chrome)

### iOS (Safari)

1. Open **https://organizer.kewlkids.ca**
2. Share → **Add to Home Screen**
3. Confirm — icon appears on home screen

**After an icon update:** delete the old shortcut and add again.

---

## PWA behavior

| Feature | Status |
|---------|--------|
| Add to Home Screen | Yes |
| Standalone (no browser UI) | Yes |
| Offline / cached assets | **No** — network-only (by design) |
| Push notifications | Not implemented |

No service worker caches app JS — deploys stay fresh without stale-cache issues.

---

## App Admin reference

| Field | Value |
|--------|--------|
| Frontend folder | `C:\dev\kewlkids\mobile` |
| Work dir | `C:\dev\kewlkids\mobile` |
| Command | `npx serve -s dist -l 8085` |
| Frontend port | **8085** |

---

## Quick reference

| Goal | Command |
|------|---------|
| Deploy web/PWA changes | `cd mobile && npm run build` |
| Local web dev | `npx expo start --web` |
| Preview `dist` locally | `npm run build` then `npx serve -s dist -l 8085` |
| API (local) | `cd backend && python manage.py runserver` |
