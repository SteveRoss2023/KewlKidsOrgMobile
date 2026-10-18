---
name: Localhost API + prod icons
overview: Make web/API hostnames fully env-driven (defaults organizer.kewlkids.ca + organizer-api.kewlkids.ca), fix local dev API resolution and token mismatch, and fix production icon fonts (static asset / Cloudflare). Same plan covers dev + public + icons.
todos:
  - id: env-driven-hostnames
    content: Add EXPO_PUBLIC_* defaults in code; document mobile/.env (WEB host + API host + local-only EXPO_PUBLIC_API_URL)
    status: completed
  - id: api-ts-localhost-priority
    content: Adjust getApiBaseUrl() so localhost/127.0.0.1 always targets local Django unless runtime override (no ngrok/prod footgun)
    status: completed
  - id: backend-env-web-oauth
    content: Align backend/.env (WEB_APP_URL, OAuth prod URIs, trim spaces); optional CSRF_TRUSTED if needed
    status: completed
  - id: prod-font-diagnosis
    content: organizer.kewlkids.ca — verify font URLs; fix hosting SPA fallback + Cloudflare cache/minify
    status: completed
  - id: doc-startup-notes
    content: Docs — env matrix (local vs public), subdomain label change checklist, icon/CDN notes
    status: completed
isProject: false
---

# Env-driven hosts, local dev, Cloudflare, and icon fonts

## Scope (answers your question)

Yes — **one plan** covers all of this:

1. **Local dev** — Fix wrong API target (ngrok URL in `.env`, `EXPO_PUBLIC_API_URL` precedence) and JWT/storage mismatch so families/lists work on `localhost:8081` + `localhost:8900`.
2. **Public hosts** — Use `**https://organizer.kewlkids.ca`** (web) and `**https://organizer-api.kewlkids.ca`** (API) as **defaults**, overridable entirely via `**.env`** so changing subdomain labels later does not require code edits.
3. **Icons on production** — Diagnose font asset responses (HTML vs font, MIME, cache) and fix static hosting / Cloudflare; separate from API hostname config.

---

## Fully env-driven subdomains (canonical defaults)

**Target defaults (current production):**


| Role    | Hostname                    |
| ------- | --------------------------- |
| Web app | `organizer.kewlkids.ca`     |
| API     | `organizer-api.kewlkids.ca` |


**Implementation principle:** Remove reliance on hardcoded `organizer-api.kewlkids.ca` inside `[mobile/utils/webApiBaseUrl.ts](mobile/utils/webApiBaseUrl.ts)` as the only “magic” default. Instead:

- `**EXPO_PUBLIC_CUSTOM_DOMAIN`** — apex, default `kewlkids.ca` (already used for `*.kewlkids.ca` detection).
- `**EXPO_PUBLIC_WEB_APP_HOST`** (new) — optional; used for docs / deep links if needed; default `organizer.kewlkids.ca` when building public web.
- `**EXPO_PUBLIC_API_HOST`** — API hostname **without** scheme; default `**organizer-api.kewlkids.ca`**. When you change app-admin labels (e.g. `organizer2-api`), update **only `.env`** and rebuild or restart Expo as appropriate.

**Backend** — already env-heavy; ensure:

- `WEB_APP_URL=https://organizer.kewlkids.ca` (trim spaces — current file has a leading space bug).
- All `*_REDIRECT_URI_PROD` point at `https://organizer-api.kewlkids.ca/api/.../`.
- Remove meaningless `EXPO_PUBLIC_API_URL` from `backend/.env` (frontend-only; optional cleanup).

**Changing subdomain later:** Update `mobile/.env`, `backend/.env`, OAuth app registrations in Microsoft/Google, and app-admin DNS labels — **no code change** if env keys and code defaults stay aligned.

---

## Why two different symptoms (unchanged)

(See previous analysis: localhost API URL order + tokens; prod icons = font files / static hosting / Cloudflare.)

---

## Plan to fix

### A) Code: env-driven API host + safe local dev

1. `**[mobile/utils/webApiBaseUrl.ts](mobile/utils/webApiBaseUrl.ts)`**
  - Use `process.env.EXPO_PUBLIC_API_HOST` with default `organizer-api.kewlkids.ca` (single place for the default string, or read from env only — document in `.env.example` if you add one).
  - Optionally add `EXPO_PUBLIC_WEB_APP_HOST` default `organizer.kewlkids.ca` for consistency (minimal use in code unless something already needs explicit web origin).
2. `**[mobile/services/api.ts](mobile/services/api.ts)`**
  - When `hostname` is `localhost` or `127.0.0.1`, **always** use local API base (`http://localhost:8900/api` or from `getWebApiBaseUrl()`), **ignoring** stale `EXPO_PUBLIC_API_URL` pointing at ngrok/production — except when **runtime** override `kewlkids_runtime_api_base_url` is set (dev/testing).
  - Order: runtime override → if localhost → local API → else existing logic (custom domain → `EXPO_PUBLIC_API_URL` → `getWebApiBaseUrl()`).
3. `**mobile/.env`**
  - For **local dev**: `EXPO_PUBLIC_API_URL=http://localhost:8900/api` **or** omit it once localhost branch is implemented.
  - For **public build**: set `EXPO_PUBLIC_API_HOST=organizer-api.kewlkids.ca` (explicit; matches defaults).
  - Remove invalid key `EXPO_PUBLIC_API_URL-EXTERNAL` (not a valid env var name) or rename to documented `EXPO_PUBLIC_*` if still needed.

### B) Backend `.env` alignment

1. Trim `WEB_APP_URL`, set to `https://organizer.kewlkids.ca`.
2. Update OAuth redirect URIs from ngrok to `https://organizer-api.kewlkids.ca/api/...`.
3. Confirm `ALLOWED_HOSTS` / `USE_X_FORWARDED_HOST` for Cloudflare — `[backend/config/settings.py](backend/config/settings.py)` already supports `.kewlkids.ca` and CORS regex for `https://*.kewlkids.ca`.

### C) Production icons

1. DevTools Network on `organizer.kewlkids.ca`: failing font requests — fix origin rules (no SPA fallback for `*.ttf` / `*.woff*`), Cloudflare cache/minify, CSP if present.
2. Re-verify after deploy.

### D) Documentation

Short env matrix in `[Docs/STARTUP_PROCEDURE.md](Docs/STARTUP_PROCEDURE.md)`: local vs public, token reset when switching API, subdomain change checklist.

---

## Cloudflare / app-admin note

Wildcard tunnel ingress still requires **app-admin** subdomain rows for this app; env-driven **code** means you only change **labels in admin + `.env`**, not TypeScript, when you rename `organizer` / `organizer-api`.

---

## Success criteria

- **Local:** `localhost:8081` talks to `http://localhost:8900/api`; families load; no accidental ngrok/prod API from `.env`.
- **Public:** `organizer.kewlkids.ca` + `organizer-api.kewlkids.ca` work; changing only `.env` + OAuth consoles + DNS labels can move to new subdomains.
- **Icons:** Font assets return real font bytes + correct `Content-Type`; UI icons match local dev.

