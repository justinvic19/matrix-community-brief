import { parseBrief, type Brief } from '../domain/brief';
import { BRIEF_EVENT, STATE_KEY } from './eventStore';

export interface PublicBrief { brief: Brief | null; name: string; roomId: string; server: string; publishedAt?: string }
export interface PublicTarget { roomId: string; server: string }
export function publicTarget(href: string): PublicTarget | null {
  const url = new URL(href);
  const roomId = url.searchParams.get('roomId');
  const server = url.searchParams.get('publicServer');
  if (!roomId || !/^!\S+$/.test(roomId) || !server) return null;
  try {
    const base = new URL(server);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return null;
    return { roomId, server: base.href.replace(/\/$/, '') };
  } catch { return null; }
}

// Only disposable guest credentials, never the visitor's saved account token.
const guests = new Map<string, Promise<string>>();
async function guestToken(server: string): Promise<string> {
  let pending = guests.get(server);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${server}/_matrix/client/v3/register?kind=guest`, {
        method: 'POST', credentials: 'omit', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || typeof result.access_token !== 'string') throw new Error('This server does not allow guest previews. Sign in to view the room.');
      return result.access_token;
    })();
    guests.set(server, pending);
    pending.catch(() => guests.delete(server));
  }
  return pending;
}

export async function loadPublicBrief(target: PublicTarget, signal: AbortSignal): Promise<PublicBrief> {
  const validated = publicTarget(`https://brief.example/?${new URLSearchParams({ roomId: target.roomId, publicServer: target.server })}`);
  if (!validated) throw new Error('Invalid public room link.');
  const { server, roomId } = validated;
  const read = (token?: string) => fetch(`${server}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`, {
    credentials: 'omit', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let response = await read();
  if (response.status === 401) {
    const token = await guestToken(server);
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    response = await read(token);
  }
  if (!response.ok) {
    if (response.status === 401) guests.delete(server);
    throw new Error('Public viewing is unavailable for this room or server. Sign in to continue.');
  }
  const events: unknown = await response.json();
  if (!Array.isArray(events)) throw new Error('The server returned an invalid room preview.');
  const content = (type: string, key = '') => events.find(event => event?.type === type && event.state_key === key)?.content;
  // Never turn a room into a public export merely because the server returned state.
  if (content('m.room.history_visibility')?.history_visibility !== 'world_readable' || content('m.room.join_rules')?.join_rule !== 'public' || content('m.room.encryption')) {
    throw new Error('This room is not configured for public viewing. Sign in to continue.');
  }
  const name = content('m.room.name')?.name;
  return { server, roomId, name: typeof name === 'string' ? name : 'Community activities', brief: parseBrief(content(BRIEF_EVENT, STATE_KEY)) };
}
