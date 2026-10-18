---
name: DigitalOcean droplet deployment
overview: Deploy the existing Django ASGI API (Daphne), PostgreSQL, Redis, and the static Expo web build on a DigitalOcean droplet, with DNS pointing at the droplet and TLS via Let's Encrypt. No repo changes are strictly required; configuration is primarily server setup, environment variables, Nginx reverse proxy (including WebSocket upgrades), and OAuth/console updates.
todos:
  - id: provision-do
    content: Create DO droplet (2GB+), optional Managed PostgreSQL; configure firewall (22/80/443 only)
    status: pending
  - id: dns-tls
    content: Point A records for web + API hostnames to droplet; Certbot certificates for both names
    status: pending
  - id: stack-install
    content: Install Nginx, Redis, Python 3.12 venv, Node 18+ (if building on server), Postgres client or local PG
    status: pending
  - id: backend-deploy
    content: Clone repo, pip install, .env from .env.example, migrate, collectstatic, systemd unit for Daphne
    status: pending
  - id: nginx-config
    content: "Nginx: serve mobile/dist for SPA; proxy /api /admin /media /ws to Daphne with WebSocket headers"
    status: pending
  - id: frontend-build
    content: Set EXPO_PUBLIC_* for production domain; npm run build; deploy dist to web root
    status: pending
  - id: oauth-cors
    content: Update Google/Microsoft redirect URIs; set DEBUG=False, CORS_PUBLIC_APP_DOMAIN, API_PUBLIC_BASE_URL, WEB_APP_URL
    status: pending
  - id: verify
    content: Test API, JWT login, wss chat, OAuth, media URLs; configure backups
    status: pending
isProject: false
---

# Deploy KewlKids to a DigitalOcean droplet

## What you are deploying

| Piece | Role in this repo |
|--------|-------------------|
| **Backend** | Django 5 + DRF + JWT, served as **ASGI** via **Daphne** ([`backend/config/asgi.py`](backend/config/asgi.py)) because **Channels WebSockets** power chat |
| **Redis** | Required for `channels_redis` and Django cache ([`backend/config/settings.py`](backend/config/settings.py) `CHANNEL_LAYERS`, `CACHES` when `USE_REDIS=True`) |
| **PostgreSQL** | Only supported DB backend in settings (`ENGINE: postgresql`) |
| **Web app** | Static export: `npm run build` in [`mobile/`](mobile/) → `dist/` ([`mobile/app.json`](mobile/app.json) `"web.output": "static"`) |
| **Celery** | Listed in [`backend/requirements.txt`](backend/requirements.txt) but **no Celery app** is wired in `config/`; treat as **optional** unless you add workers later |

Current production-style host split is documented in [`Docs/STARTUP_PROCEDURE.md`](Docs/STARTUP_PROCEDURE.md): **browser app** hostname vs **API** hostname (e.g. `organizer.*` and `organizer-api.*`). The Expo web client resolves the API from `EXPO_PUBLIC_*` and [`mobile/utils/webApiBaseUrl.ts`](mobile/utils/webApiBaseUrl.ts). **Easiest migration from Cloudflare-on-PC** is to keep **two DNS names** on **one droplet** (two Nginx `server_name` blocks, same IP).

```mermaid
flowchart LR
  subgraph dns [DNS]
    A1[app.example.com]
    A2[api.example.com]
  end
  subgraph droplet [Droplet]
    Nginx[Nginx :443 TLS]
    Static[Static files dist]
    Daphne[Daphne ASGI :8000]
    Redis[Redis]
    PG[(PostgreSQL)]
  end
  User[Browser or native app] --> A1
  User --> A2
  A1 --> Nginx
  A2 --> Nginx
  Nginx -->|"/"| Static
  Nginx -->|"/api" "/admin" "/media" "/ws"| Daphne
  Daphne --> PG
  Daphne --> Redis
```

---

## 1. Droplet and data layer choices

- **OS**: Ubuntu 22.04 or 24.04 LTS.
- **Size**: Start with at least **2 GB RAM** (PostgreSQL + Redis + Daphne + Nginx + occasional `npm run build` is tight on 1 GB). Scale up if traffic or DB grows.
- **PostgreSQL** (pick one):
  - **Recommended**: [DigitalOcean Managed PostgreSQL](https://www.digitalocean.com/products/managed-databases) — backups, updates, and you set `DATABASE_HOST` to the managed hostname (see [`backend/.env.example`](backend/.env.example)).
  - **On-droplet**: Install PostgreSQL on the same VM — cheaper, but you own backups and upgrades.
- **Redis**: Typically **on the droplet** (localhost) is enough for Channels + cache; ensure it listens on `127.0.0.1` only and is not exposed publicly.

---

## 2. DNS and TLS

1. Create an **A record** (or AAAA if you use IPv6) for each hostname you need, e.g. `organizer.yourdomain.com` and `organizer-api.yourdomain.com`, both pointing to the **droplet’s public IPv4**.
2. Install **Certbot** and obtain certificates (HTTP-01): one cert with **both names** (`-d app -d api`) or separate certs per server block.
3. On the droplet, open **UFW** (or DO Cloud Firewall): allow **22** (SSH, restrict to your IP if possible), **80** (ACME), **443** (HTTPS). Do **not** expose PostgreSQL or Redis to the internet.

---

## 3. Server packages

On the droplet (conceptually):

- **System**: `nginx`, `certbot` + nginx plugin, `postgresql` client libs (if using managed DB, client only).
- **Runtime**: Python **3.12+** (match local dev), `venv`, build deps for `psycopg2` if needed.
- **Redis**: `redis-server` package, enable systemd service.
- **Node.js** **18+ LTS**: only required **on the machine that runs** `npm run build` (can be the droplet, or your CI machine that `rsync`s `dist/` to the server).

---

## 4. Application layout and deploy user

- Create a non-root deploy user (e.g. `deploy`) with SSH key access.
- Clone the repo to e.g. `/srv/kewlkids` (or pull via CI).
- **Backend**:
  - `python3 -m venv venv && source venv/bin/activate`
  - `pip install -r backend/requirements.txt` (or `requirements_freeze.txt` for reproducibility).
  - Copy [`backend/.env.example`](backend/.env.example) to `backend/.env` on the server — **never commit real `.env`**.
  - `cd backend && python manage.py migrate && python manage.py collectstatic --noinput`
- **Media**: `MEDIA_ROOT` is `backend/media` ([`backend/config/settings.py`](backend/config/settings.py)); ensure this directory persists across deploys and is **writable** by the Daphne process user. Plan **backups** (snapshots + periodic copy of `media/` and DB dumps).

---

## 5. Production environment variables (critical)

Align with [`backend/config/settings.py`](backend/config/settings.py) and [`backend/.env.example`](backend/.env.example):

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY`, `JWT_SECRET_KEY` | Strong random values |
| `DEBUG=False` | Production |
| `ALLOWED_HOSTS` | Include your API hostname(s) and optionally droplet IP for debugging |
| `USE_X_FORWARDED_HOST=True` | When TLS terminates at Nginx so Django sees correct host/scheme |
| `API_PUBLIC_BASE_URL` | `https://your-api-host` (no path) — fixes media/profile URLs in API responses |
| `WEB_APP_URL` | `https://your-web-host` — email links, OAuth flows that reference the SPA |
| `CORS_PUBLIC_APP_DOMAIN` | Apex domain used for `CORS_ALLOWED_ORIGIN_REGEXES` when `DEBUG=False` (defaults to `kewlkids.ca`; set to **your** apex, e.g. `example.com`) |
| `CORS_ALLOWED_ORIGINS` | Explicit origins if you do not rely only on regex |
| `DATABASE_*` | Point at managed DB or local Postgres |
| `REDIS_HOST` / `REDIS_PORT` or `REDIS_URL` | Match local Redis; cache uses DB **1** in default `REDIS_URL` |
| `FERNET_KEY` | **Must match** any existing encrypted data — copy from current env, do not rotate blindly |
| All `*_REDIRECT_URI_PROD` / provider URIs | Must exactly match **https://api-host/...** paths registered in Google Cloud and Microsoft Entra |

**OAuth / third-party consoles**: Update authorized redirect URIs to the **public API URL** on the droplet (same paths as in `.env.example`, different host). Missed updates are a common post-migration failure.

**Native / Expo builds**: Set `EXPO_PUBLIC_API_URL=https://your-api-host/api` (or LAN IP for dev) per [`mobile/services/api.ts`](mobile/services/api.ts) and [`Docs/STARTUP_PROCEDURE.md`](Docs/STARTUP_PROCEDURE.md).

**Web build**: Set `EXPO_PUBLIC_CUSTOM_DOMAIN`, `EXPO_PUBLIC_WEB_APP_HOST`, `EXPO_PUBLIC_API_HOST` before `npm run build` so the static bundle resolves the correct API (see [`mobile/utils/webApiBaseUrl.ts`](mobile/utils/webApiBaseUrl.ts)).

---

## 6. Run Daphne under systemd

- Bind Daphne to **127.0.0.1:8000** (or a Unix socket if you prefer).
- Working directory: `backend/`; command like: `daphne -b 127.0.0.1 -p 8000 config.asgi:application`
- User should be unprivileged; ensure read/write to `media/` and logs.
- `Restart=always`, `After=network.target redis.service` (and `postgresql` if local).

Do **not** use plain `gunicorn` **alone** for this project unless you add a separate WebSocket-capable worker; **Daphne (or uvicorn)** is the right process for HTTP + WebSocket together.

---

## 7. Nginx configuration (HTTP, HTTPS, WebSockets)

Two `server` blocks (or one with multiple `server_name`):

1. **Web app host** (`organizer...`): `root` → path to `mobile/dist`; `try_files $uri $uri/ /index.html` for SPA routing; long cache for hashed assets if applicable.
2. **API host** (`organizer-api...`): `proxy_pass` to Daphne for `/`, or use **path-based** routing on one hostname (only if you intentionally change client URLs).

For the **API** server block, proxy these to Daphne (adjust paths to match your URL layout):

- `/api/`, `/admin/`, `/static/`, `/media/` (or serve `/static/` via Nginx from `STATIC_ROOT` after `collectstatic` — common pattern)
- **WebSockets**: location matching Django Channels paths (e.g. `/ws/`) with:
  - `proxy_http_version 1.1`
  - `Upgrade` and `Connection` headers for upgrade
  - reasonable `proxy_read_timeout` for long-lived WS

See [`Docs/WEBSOCKET_SETUP.md`](Docs/WEBSOCKET_SETUP.md) production notes. The client builds WS URLs from the API base ([`mobile/services/websocketService.ts`](mobile/services/websocketService.ts)); ensure **wss://** works behind your certificate.

---

## 8. Static and media files

- **`collectstatic`**: Nginx can serve `STATIC_ROOT` directly for efficiency; Django still handles `/media/` through the app **or** Nginx can serve `MEDIA_ROOT` with `internal`/`alias` rules — either is fine if permissions are correct.
- **Expo `dist/`**: Re-run `npm run build` and sync to the web root on each frontend release.

---

## 9. Verification checklist

- `https://api-host/api/` responds (DRF or your root view).
- Login / JWT from the SPA works (CORS errors → fix `CORS_*` and `DEBUG=False` origins).
- **Chat**: open two browsers, confirm **WebSocket** connects (`wss://`) and messages flow.
- OAuth flows (Google Drive, OneDrive, Outlook, Google Photos) complete with new redirect URIs.
- Uploaded images/media load using URLs that show `API_PUBLIC_BASE_URL`, not `127.0.0.1`.

---

## 10. Operational extras (recommended)

- **Automated backups**: Managed Postgres backups + periodic `media` archive.
- **Log rotation** for Gunicorn/Daphne/nginx (journald or files).
- **Security**: `fail2ban` on SSH; keep system packages updated; rotate any credentials that were ever in local-only `.env` files.
- **Note**: [`backend/config/settings.py`](backend/config/settings.py) contains **default** email-related env fallbacks in code; in production rely on **real env vars** only and avoid committing secrets.

---

## Summary

You **do not** migrate “off” Django — you **host** the existing stack. The work is: **droplet + DNS + TLS**, **Postgres + Redis**, **systemd + Daphne**, **Nginx** (static SPA + reverse proxy with **WebSocket** support), **production `.env`**, **OAuth console updates**, and **rebuilt Expo web** (and native env) pointing at the new API host. Using **DigitalOcean Managed PostgreSQL** and keeping **Redis on the droplet** is a practical default for this codebase.
