import { getResolvedApiBaseUrl } from '../services/api';

function isPrivateLanHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (/^10\./.test(h) || /^192\.168\./.test(h)) return true;
  const m = /^172\.(\d+)\./.exec(h);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

/**
 * Turn API recipe `image_url` into something `<Image source={{ uri }} />` can load.
 * - Relative `/media/...` → absolute using current API base (minus `/api`).
 * - Loopback → always `http:` (Django runserver has no TLS; forcing https breaks images).
 * - LAN IPs → keep `http:` (same).
 * - Public hosts → `http:` upgraded to `https:` so HTTPS pages avoid mixed-content blocks.
 */
export function resolveRecipeImageUrl(url: string | undefined | null): string | null {
  if (url == null || typeof url !== 'string') return null;
  let u = url.trim();
  if (!u) return null;

  if (u.startsWith('/')) {
    const base = getResolvedApiBaseUrl().replace(/\/api\/?$/, '');
    u = `${base.replace(/\/$/, '')}${u}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return u;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') {
    parsed.protocol = 'http:';
    return parsed.href;
  }
  if (isPrivateLanHost(host)) {
    return parsed.href;
  }
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'https:';
    return parsed.href;
  }
  return parsed.href;
}
