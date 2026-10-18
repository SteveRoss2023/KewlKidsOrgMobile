---
name: Kewlkids icons via Cloudflare
overview: Broken nav icons on kewlkids.ca when tunneled through Cloudflare are not caused by app-admin’s UI; they come from how the kewlkids app serves or references assets (fonts/SVGs/images), or from Cloudflare/proxy behavior. App-admin’s reverse proxy only forwards traffic transparently.
todos:
  - id: verify-network
    content: "On kewlkids URL via Cloudflare: DevTools Network → find font/SVG/asset requests; confirm 200 + correct MIME (not text/html)"
    status: pending
  - id: fix-kewlkids
    content: "In c:\\dev\\kewlkids: fix base URLs, CSP, or icon/font loading per findings"
    status: pending
  - id: cf-sanity
    content: "If origin is clean: try disabling Rocket Loader / Auto Minify for that hostname or adjust cache rules"
    status: pending
isProject: false
---

# Why nav icons break on kewlkids (Cloudflare) — not app-admin

## Is this app-admin?

**No, for the kewlkids site UI.** [app-admin](c:\dev\app-admin) is a separate admin app. The tunnel/reverse proxy in app-admin (`[backend/src/reverseProxy.ts](c:\dev\app-admin\backend\src\reverseProxy.ts)`) resolves the hostname and **`proxy.web()`**s to `http://127.0.0.1:<port>` with `changeOrigin: true`. It does **not** rewrite HTML, CSS, or strip icon/font responses. If the page loads but icons are wrong, the response body and asset URLs are coming from **kewlkids’ dev server** (or whatever is bound to that port).

App-admin would only be indirectly involved if:

- The **wrong process/port** is targeted (you’d usually see wrong page or 503, not “icons only” broken).
- The **web vs API** hostname points at the wrong service (again, broader breakage than icons).

So the fix belongs in `**c:\dev\kewlkids`** (or Cloudflare), not in app-admin’s React frontend.

## Typical root causes (kewlkids + Cloudflare)

1. **Font-based icons (e.g. Material Icons, Font Awesome)**
  - Request to `.woff2` / `.woff` returns **404** or **HTML** (SPA fallback) → browser won’t render glyphs.  
  - Check DevTools **Network**: filter by `font` or the icon font filename; status should be **200** and **Content-Type** should be a font type, not `text/html`.
2. **Wrong absolute URLs**
  - Assets hardcoded to `http://localhost:...` or a different host → fails under `https://*.kewlkids.ca`.  
  - Fix: use **relative** paths, `import` for assets, or `PUBLIC_URL` / Vite `base` / Next `assetPrefix` aligned with how you deploy.
3. **Content-Security-Policy (CSP)**
  - `font-src` or `style-src` blocks the icon font CDN or inline data → icons missing.  
  - Check Console for CSP violations.
4. **Cloudflare features**
  - **Rocket Loader**, **Auto Minify** (HTML/JS/CSS), or aggressive **caching** can break some icon setups.  
  - Try **grey-cloud** or bypass for that hostname, or disable those features for testing.
5. **SVG / sprite / image icons**
  - 404, wrong `base` path, or CSP `img-src` / `default-src` blocking.

## What to do in kewlkids (concrete checks)

In **Chrome DevTools** on the broken page (via Cloudflare URL):

1. **Console** — errors about fonts, CSP, or CORS.
2. **Network** — reload; find failed requests (red) for fonts, SVGs, or `/static/...` / `/assets/...`.
3. **Open the failing URL in a new tab** — if you see HTML or a login page, routing/base path is wrong.

Then adjust **kewlkids** build config and asset references; only touch **Cloudflare** if the origin serves files correctly but CF transforms or caches them wrong.

## Summary


| Layer                                     | Affects nav icons?                                     |
| ----------------------------------------- | ------------------------------------------------------ |
| app-admin React UI                        | No                                                     |
| app-admin reverse proxy                   | Only if wrong target / down (unusual for “icons only”) |
| kewlkids app (paths, CSP, build)          | **Yes — primary place to fix**                         |
| Cloudflare (Rocket Loader, minify, cache) | Sometimes                                              |


No code changes in app-admin are required for this symptom unless you discover the proxy is routing to the wrong backend (separate issue).