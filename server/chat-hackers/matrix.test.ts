// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { emptyBrief } from '../../src/domain/brief';
import { readConfig } from './config';
import { matrixAdapter } from './matrix';
const config = readConfig({ CH_SOURCE_ROOM_ID: '!source', CH_STORAGE_ROOM_ID: '!storage', CH_MATRIX_SERVER: 'https://matrix.example.org', CH_MATRIX_TOKEN: 'secret', CH_CONFIRMERS: '@organiser:example.org' });
it.each(['creator', 'additional', 'ordinary', 'legacy'])('handles room creator permissions: %s', async role => {
  const request = vi.fn(async (input: string | URL | Request) => {
    const url = decodeURIComponent(String(input));
    let content: unknown;
    if (url.endsWith('/account/whoami')) content = { user_id: '@service:example.org' };
    else if (url.includes('m.room.member')) content = { membership: 'join' };
    else if (url.includes('m.room.encryption')) return new Response(JSON.stringify({ errcode: 'M_NOT_FOUND' }), { status: 404 });
    else if (url.includes('/state/m.room.create/')) content = { room_version: role === 'legacy' ? '11' : '12', creator: '@service:example.org' };
    else if (url.includes('/event/$storage')) content = { type: 'm.room.create', state_key: '', sender: role === 'creator' ? '@service:example.org' : '@other:example.org', content: { additional_creators: role === 'additional' ? ['@service:example.org'] : [] } };
    else content = { users: {}, users_default: 0, state_default: 50 };
    return new Response(JSON.stringify(content));
  });
  const check = matrixAdapter(config, request).checkRooms('@organiser:example.org');
  if (role === 'creator' || role === 'additional') await expect(check).resolves.toBeUndefined();
  else await expect(check).rejects.toThrow('cannot write');
});
it('reads source events and writes only to storage, with server-only auth', async () => {
  const request = vi.fn().mockResolvedValue(new Response('{}'));
  const matrix = matrixAdapter(config, request);
  await matrix.event('!source', '$original');
  request.mockResolvedValue(new Response('{}'));
  await matrix.publish('com.example.community_brief', 'main', emptyBrief());
  expect(request.mock.calls[0][0]).toContain('/rooms/!source/event/%24original');
  expect(request.mock.calls[1][0]).toContain('/rooms/!storage/state/com.example.community_brief/main');
  expect(request.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: { Authorization: 'Bearer secret' }, redirect: 'error' });
});
it('only treats M_NOT_FOUND as missing state', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ errcode: 'M_NOT_FOUND' }), { status: 404 }));
  expect(await matrixAdapter(config, request).brief()).toBeNull();
  request.mockResolvedValue(new Response(JSON.stringify({ errcode: 'M_FORBIDDEN' }), { status: 403 }));
  await expect(matrixAdapter(config, request).brief()).rejects.toThrow('403');
  request.mockResolvedValue(new Response('{}'));
  await expect(matrixAdapter(config, request).brief()).rejects.toThrow('malformed');
});
it('Hub mode checks storage only, even when portal access is forbidden', async () => {
  const request = vi.fn(async (input: string | URL | Request) => {
    const url = decodeURIComponent(String(input));
    if (url.includes('!source')) throw new Error('Source access is not allowed');
    let content: unknown;
    if (url.endsWith('/account/whoami')) content = { user_id: '@service:example.org' };
    else if (url.includes('m.room.member')) content = { membership: 'join' };
    else if (url.includes('m.room.encryption')) return new Response(JSON.stringify({ errcode: 'M_NOT_FOUND' }), { status: 404 });
    else if (url.includes('m.room.create')) content = { room_version: '11' };
    else content = { users: { '@service:example.org': 50 } };
    return new Response(JSON.stringify(content));
  });
  await expect(matrixAdapter({ ...config, eventSource: 'hub' }, request).checkRooms('@organiser:example.org')).resolves.toBeUndefined();
  expect(request.mock.calls.some(([url]) => String(url).includes('!source'))).toBe(false);
});
it.each(['encryption', 'membership', 'power', 'actor', 'none'])('checks service membership, actor membership, encryption and power: %s', async failure => {
  const request = vi.fn(async (input: string | URL | Request) => {
    const url = decodeURIComponent(String(input));
    let result: unknown;
    if (url.endsWith('/account/whoami')) result = { user_id: '@service:example.org' };
    else if (url.includes('m.room.encryption')) {
      if (failure === 'encryption') result = { algorithm: 'm.megolm.v1.aes-sha2' };
      else return new Response(JSON.stringify({ errcode: 'M_NOT_FOUND' }), { status: 404 });
    } else if (url.includes('m.room.member')) result = { membership: failure === 'membership' || (failure === 'actor' && url.includes('@organiser')) ? 'leave' : 'join' };
    else result = { users: { '@service:example.org': failure === 'power' ? 0 : 50 }, state_default: 50 };
    return new Response(JSON.stringify(result));
  });
  const check = matrixAdapter(config, request).checkRooms('@organiser:example.org');
  if (failure === 'none') await expect(check).resolves.toBeUndefined();
  else await expect(check).rejects.toThrow();
});
