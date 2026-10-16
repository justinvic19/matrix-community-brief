import type { OAuthSession } from './auth';

const STORAGE_KEY = 'living-community-brief.oauth-session.v1';

export function loadOAuthSession(): OAuthSession | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const fields = value as Record<string, unknown>;
    if (['homeserver', 'accessToken', 'refreshToken', 'oauthClientId', 'deviceId', 'userId'].some(key => typeof fields[key] !== 'string')) return null;
    return fields as unknown as OAuthSession;
  } catch { return null; }
}

export function saveOAuthSession(session: OAuthSession): boolean {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session)); return true; }
  catch { return false; }
}

export function forgetOAuthSession(): boolean {
  try { sessionStorage.removeItem(STORAGE_KEY); return true; }
  catch { return false; }
}
