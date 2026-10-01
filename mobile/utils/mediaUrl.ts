/**
 * Resolve API media URLs so phones can load them.
 * Rewrites localhost/127.0.0.1 to the current API origin (e.g. organizer-api.kewlkids.ca).
 */
import { getResolvedApiBaseUrl } from '../services/api';

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

export function resolveMediaUrl(url: string | undefined | null): string | null {
  if (url == null || typeof url !== 'string') return null;
  let u = url.trim();
  if (!u) return null;

  const apiOrigin = getResolvedApiBaseUrl().replace(/\/api\/?$/, '');

  if (u.startsWith('/')) {
    return `${apiOrigin.replace(/\/$/, '')}${u}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return u;
  }

  if (isLoopbackHost(parsed.hostname)) {
    return `${apiOrigin.replace(/\/$/, '')}${parsed.pathname}${parsed.search}`;
  }

  // Avoid mixed-content blocks on HTTPS pages for public hosts
  if (parsed.protocol === 'http:' && !isLoopbackHost(parsed.hostname)) {
    const h = parsed.hostname.toLowerCase();
    const isLan =
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h);
    if (!isLan) {
      parsed.protocol = 'https:';
      return parsed.href;
    }
  }

  return parsed.href;
}
