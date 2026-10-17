import { parseBrief } from '../domain/brief';
import { loadPublicBrief, type PublicBrief, type PublicTarget } from './publicBrief';

export async function loadPublishedOrPublicBrief(target: PublicTarget, signal: AbortSignal): Promise<PublicBrief> {
  let response: Response | undefined;
  try {
    response = await fetch(new URL('./public-briefs.json', window.location.href).href, {
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
  } catch { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
  if (response?.ok) {
    // A malformed published export must not silently display unrelated data.
    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.rooms) || !Number.isFinite(Date.parse(data.publishedAt))) throw new Error('Invalid public brief snapshot.');
    const room = data.rooms.find((item: PublicTarget) => item.roomId === target.roomId && item.server === target.server);
    if (room) return { roomId: target.roomId, server: target.server, name: typeof room.name === 'string' ? room.name : 'Community activities', brief: parseBrief(room.brief), publishedAt: data.publishedAt };
  }
  return loadPublicBrief(target, signal);
}
