/**
 * API base URL (/api suffix) when the Expo app runs in the browser.
 * Used for ngrok, Cloudflare/custom domains (e.g. kewlkids.ca), and localhost.
 *
 * Build-time (Expo public, inlined at build):
 * - EXPO_PUBLIC_CUSTOM_DOMAIN — apex (default: kewlkids.ca). Matched for apex and *.domain.
 * - EXPO_PUBLIC_API_HOST — API hostname only (no scheme). Defaults for kewlkids.ca:
 *   organizer-api.kewlkids.ca; otherwise api.<CUSTOM_DOMAIN>. Override when you change app-admin labels.
 * - EXPO_PUBLIC_WEB_APP_HOST — browser app hostname (no scheme), default organizer.kewlkids.ca.
 *
 * Runtime (web only, no rebuild — checked on every getWebApiBaseUrl / getApiBaseUrl call):
 * - sessionStorage or localStorage key KEWLKIDS_RUNTIME_API_BASE_STORAGE_KEY
 *   Value: full base URL, e.g. https://organizer-api.kewlkids.ca/api
 *   (sessionStorage wins if both are set.)
 */
export const KEWLKIDS_RUNTIME_API_BASE_STORAGE_KEY = 'kewlkids_runtime_api_base_url';

const DEFAULT_WEB_APP_HOST_KEWLKIDS = 'organizer.kewlkids.ca';
const DEFAULT_API_HOST_KEWLKIDS = 'organizer-api.kewlkids.ca';

/** Public web app hostname (no scheme). */
export function getResolvedWebAppHost(): string {
  return process.env.EXPO_PUBLIC_WEB_APP_HOST?.trim() || DEFAULT_WEB_APP_HOST_KEWLKIDS;
}

function resolveDefaultApiHostForApex(customDomainLc: string): string {
  const envHost = process.env.EXPO_PUBLIC_API_HOST?.trim();
  if (envHost) {
    return envHost;
  }
  if (customDomainLc === 'kewlkids.ca') {
    return DEFAULT_API_HOST_KEWLKIDS;
  }
  return `api.${customDomainLc}`;
}

/** True when the web app is served from the configured public apex or its subdomains (e.g. organizer.kewlkids.ca). */
export function isPublicCustomDomainWebHost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const customDomain = (
    process.env.EXPO_PUBLIC_CUSTOM_DOMAIN?.trim() || 'kewlkids.ca'
  ).toLowerCase();
  const h = window.location.hostname.toLowerCase();
  return h === customDomain || h.endsWith(`.${customDomain}`);
}

function normalizeApiBaseUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (!u.endsWith('/api')) {
    u = `${u}/api`;
  }
  return u;
}

/** Full /api base URL from session/localStorage; null if unset or invalid. */
export function getRuntimeWebApiBaseUrlOverride(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw =
      window.sessionStorage.getItem(KEWLKIDS_RUNTIME_API_BASE_STORAGE_KEY) ??
      window.localStorage.getItem(KEWLKIDS_RUNTIME_API_BASE_STORAGE_KEY);
    if (!raw?.trim()) {
      return null;
    }
    const t = raw.trim();
    if (!t.startsWith('http://') && !t.startsWith('https://')) {
      return null;
    }
    return normalizeApiBaseUrl(t);
  } catch {
    return null;
  }
}

export function getWebApiBaseUrl(): string {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';

  if (hostname.includes('ngrok')) {
    if (hostname.includes('kewlkidsorganizermobile-web')) {
      return 'https://kewlkidsorganizermobile.ngrok.app/api';
    }
    return `https://${hostname.replace('-web', '')}/api`;
  }

  const customDomain = (
    process.env.EXPO_PUBLIC_CUSTOM_DOMAIN?.trim() || 'kewlkids.ca'
  ).toLowerCase();
  const hostLc = hostname.toLowerCase();
  const isCustomHost = hostLc === customDomain || hostLc.endsWith(`.${customDomain}`);
  if (isCustomHost) {
    const apiHost = resolveDefaultApiHostForApex(customDomain).toLowerCase();
    if (hostLc === apiHost) {
      return `${protocol}//${apiHost}/api`;
    }
    return `${protocol}//${apiHost}/api`;
  }

  return 'http://localhost:8900/api';
}
