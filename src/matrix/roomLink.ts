const ELEMENT_WEB = 'https://app.element.io/';
// Explicit known defaults, not a guessed transformation of an API hostname.
const WEB_CLIENTS: Record<string, string> = {
  'https://matrix.org': ELEMENT_WEB,
  'https://matrix-client.matrix.org': ELEMENT_WEB,
  'https://matrix.sk.community': 'https://chat.sk.community/',
};

export function matrixServerName(userId: string): string {
  const separator = userId.indexOf(':');
  if (!userId.startsWith('@') || separator < 2 || separator === userId.length - 1) throw new Error('Invalid Matrix account ID.');
  return userId.slice(separator + 1);
}

export function defaultElementWebUrl(homeserver: string): string {
  try { return WEB_CLIENTS[new URL(homeserver).origin] ?? ELEMENT_WEB; }
  catch { return ELEMENT_WEB; }
}

export function normalizeElementWebUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error('Enter a valid Element Web URL, such as https://chat.sk.community.'); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new Error('Use an HTTPS Element Web URL (HTTP is only allowed on localhost).');
  if (url.username || url.password || url.search) throw new Error('Use an Element Web URL without credentials or query parameters.');
  // Accept a pasted client room link, but always navigate to our selected room.
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

export function buildElementRoomUrl(webUrl: string, roomId: string, userId: string): string {
  // via is a Matrix server name, not the API hostname or room creator's server.
  const query = new URLSearchParams({ via: matrixServerName(userId) });
  return `${normalizeElementWebUrl(webUrl)}#/room/${encodeURIComponent(roomId)}?${query}`;
}
