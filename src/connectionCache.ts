import type { Connection } from './matrix/client';
export interface ConnectionPreferences extends Connection { elementWebUrl?: string }

const STORAGE_KEY = 'living-community-brief.connection.v1';
export const defaultConnection = (): ConnectionPreferences => ({ homeserver: 'https://matrix.org', token: '', roomId: '' });

export function loadConnection(): ConnectionPreferences {
  const defaults = defaultConnection();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    const fields = saved as Record<string, unknown>;
    return {
      homeserver: typeof fields.homeserver === 'string' ? fields.homeserver : defaults.homeserver,
      token: typeof fields.token === 'string' ? fields.token : defaults.token,
      roomId: typeof fields.roomId === 'string' ? fields.roomId : defaults.roomId,
      ...(typeof fields.elementWebUrl === 'string' ? { elementWebUrl: fields.elementWebUrl } : {}),
    };
  } catch {
    return defaults;
  }
}

export function saveConnection(connection: ConnectionPreferences): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(connection)); return true; }
  catch { return false; }
}

export function forgetConnection(): boolean {
  try { localStorage.removeItem(STORAGE_KEY); return true; }
  catch { return false; }
}
