import { afterEach, expect, it, vi } from 'vitest';
import { loadPublicBrief, publicTarget } from './publicBrief';
import { emptyActivity, emptyBrief } from '../domain/brief';
import { BRIEF_EVENT } from './eventStore';
afterEach(() => vi.unstubAllGlobals());
const state = (visibility = 'world_readable', join = 'public') => [
  { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: visibility } },
  { type: 'm.room.join_rules', state_key: '', content: { join_rule: join } },
  { type: BRIEF_EVENT, state_key: 'main', content: { ...emptyBrief(), activities: [{ ...emptyActivity('a'), title: 'Public meetup' }] } },
];
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
it('reads public state without sending saved credentials or joining', async () => {
  const fetcher = vi.fn().mockResolvedValue(response(state())); vi.stubGlobal('fetch', fetcher);
  const result = await loadPublicBrief({ roomId: '!room', server: 'https://public.example' }, new AbortController().signal);
  expect(result.brief?.activities[0].title).toBe('Public meetup');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', headers: {} });
});
it.each([['shared', 'public'], ['world_readable', 'invite']])('rejects non-public visibility %s / %s', async (visibility, join) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(state(visibility, join))));
  await expect(loadPublicBrief({ roomId: '!room', server: 'https://private.example' }, new AbortController().signal)).rejects.toThrow(/not configured/);
});
it('uses only an in-memory guest token when required and never joins', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({ access_token: 'guest-only' })).mockResolvedValueOnce(response(state()));
  vi.stubGlobal('fetch', fetcher);
  await loadPublicBrief({ roomId: '!room', server: 'https://guest.example' }, new AbortController().signal);
  expect(fetcher.mock.calls[1][0]).toContain('/register?kind=guest');
  expect(fetcher.mock.calls[2][1].headers).toEqual({ Authorization: 'Bearer guest-only' });
  expect(fetcher.mock.calls.some(call => String(call[0]).includes('/join'))).toBe(false);
});
it('rejects encrypted rooms and unsupported guest access', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([...state(), { type: 'm.room.encryption', state_key: '', content: { algorithm: 'encrypted' } }])));
  await expect(loadPublicBrief({ roomId: '!room', server: 'https://encrypted.example' }, new AbortController().signal)).rejects.toThrow(/not configured/);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({}, 403)));
  await expect(loadPublicBrief({ roomId: '!room', server: 'https://no-guests.example' }, new AbortController().signal)).rejects.toThrow(/does not allow guest/);
});
it('validates server hints separately from account credentials', () => {
  expect(publicTarget('https://brief.example/?roomId=!opaque&publicServer=https%3A%2F%2Fpublic.example')).toEqual({ roomId: '!opaque', server: 'https://public.example' });
  for (const server of ['http://example.org', 'https://user:secret@example.org', 'javascript:alert(1)']) {
    expect(publicTarget(`https://brief.example/?${new URLSearchParams({ roomId: '!room', publicServer: server })}`)).toBeNull();
  }
});
