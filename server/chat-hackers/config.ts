export interface Config { sourceRoom: string; storageRoom: string; confirmers: string[]; homeserver: string; token: string; dataDir: string; port: number; eventSource?: 'matrix' | 'hub'; webhookSecret?: string; allowUnauthenticatedHub?: boolean; requireConfirmation?: boolean }
export function checkSetup(env: Record<string, string | undefined>): void {
  const keys = ['CH_MATRIX_SERVER', 'CH_MATRIX_TOKEN', 'CH_SOURCE_ROOM_ID', 'CH_STORAGE_ROOM_ID', 'CH_CONFIRMERS'];
  if (env.CH_REQUIRE_CONFIRMATION === 'false') keys.splice(keys.indexOf('CH_CONFIRMERS'), 1);
  const incomplete = keys.filter(key => {
    const value = env[key]?.trim() ?? '';
    return !value || /YOUR-|replace-with|WHATSAPP-PORTAL-ROOM-ID|CAMPAIGN-LAB-ROOM-ID|^!source-room$|^!different-storage-room$|^https:\/\/matrix\.example\.org\/?$|^@organiser:example\.org$/i.test(value);
  });
  if (incomplete.length) throw new Error(`Setup incomplete. Replace placeholders in server/chat-hackers/.env: ${incomplete.join(', ')}. Registration alone does not configure Matrix access.`);
}
export function readConfig(env: Record<string, string | undefined>): Config {
  const eventSource = env.CH_EVENT_SOURCE ?? 'matrix';
  if (eventSource !== 'matrix' && eventSource !== 'hub') throw new Error('CH_EVENT_SOURCE must be matrix or hub.');
  const webhookSecret = env.CH_WEBHOOK_SECRET;
  const allowUnauthenticatedHub = env.CH_ALLOW_UNAUTHENTICATED_HUB === 'true';
  if (eventSource === 'hub' && !allowUnauthenticatedHub && (!webhookSecret || !/^[a-f0-9]{64}$/.test(webhookSecret))) throw new Error('Hub mode requires CH_WEBHOOK_SECRET: 64 random hexadecimal characters.');
  const required = (key: string) => { const value = env[key]?.trim(); if (!value) throw new Error(`Missing ${key}`); return value; };
  const sourceRoom = required('CH_SOURCE_ROOM_ID');
  const storageRoom = required('CH_STORAGE_ROOM_ID');
  if (![sourceRoom, storageRoom].every(id => /^!\S+$/.test(id)) || sourceRoom === storageRoom) throw new Error('Configure two distinct Matrix room IDs.');
  if (env.CH_REQUIRE_CONFIRMATION !== undefined && !['true', 'false'].includes(env.CH_REQUIRE_CONFIRMATION)) throw new Error('CH_REQUIRE_CONFIRMATION must be true or false.');
  const requireConfirmation = env.CH_REQUIRE_CONFIRMATION !== 'false';
  const confirmers = (requireConfirmation ? required('CH_CONFIRMERS') : env.CH_CONFIRMERS ?? '').split(',').map(id => id.trim()).filter(Boolean);
  if (!confirmers.every(id => /^@[^\s:]+:\S+$/.test(id))) throw new Error('CH_CONFIRMERS must contain full Matrix IDs.');
  const url = new URL(required('CH_MATRIX_SERVER'));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('CH_MATRIX_SERVER must be an HTTPS URL without credentials.');
  const port = Number(env.CH_PORT ?? 5050);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CH_PORT');
  return { sourceRoom, storageRoom, confirmers, homeserver: url.href.replace(/\/$/, ''), token: required('CH_MATRIX_TOKEN'), dataDir: env.CH_DATA_DIR ?? '.chat-hackers-data', port, eventSource, webhookSecret, allowUnauthenticatedHub, requireConfirmation };
}
