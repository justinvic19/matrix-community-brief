import { afterEach, expect, it, vi } from 'vitest';
import { loadPublishedOrPublicBrief } from './publishedBrief';
import { emptyBrief } from '../domain/brief';
vi.mock('./publicBrief', () => ({ loadPublicBrief: vi.fn().mockResolvedValue({ name: 'Live' }) }));
afterEach(() => vi.unstubAllGlobals());
const target = { roomId: '!room', server: 'https://matrix.example' };
it('loads matching published rooms without credentials or Matrix requests', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 1, publishedAt: '2026-10-17T12:00:00Z', rooms: [{ ...target, name: 'Published', brief: emptyBrief() }] }) });
  vi.stubGlobal('fetch', fetcher);
  expect(await loadPublishedOrPublicBrief(target, new AbortController().signal)).toMatchObject({ name: 'Published', publishedAt: '2026-10-17T12:00:00Z' });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store' });
});
it('does not use a snapshot belonging to another room', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 1, publishedAt: '2026-10-17T12:00:00Z', rooms: [{ ...target, roomId: '!other' }] }) }));
  expect(await loadPublishedOrPublicBrief(target, new AbortController().signal)).toEqual({ name: 'Live' });
});
