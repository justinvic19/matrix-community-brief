import { describe, expect, it } from 'vitest';
import { buildElementRoomUrl, defaultElementWebUrl, matrixServerName, normalizeElementWebUrl } from './roomLink';

describe('Element room links', () => {
  it.each([
    ['https://matrix.org', 'https://app.element.io/'],
    ['https://matrix-client.matrix.org', 'https://app.element.io/'],
    ['https://matrix.sk.community/', 'https://chat.sk.community/'],
    ['https://unlisted.example.org', 'https://app.element.io/'],
    ['https://matrix.sk.community.attacker.example', 'https://app.element.io/'],
  ])('uses the known web client for %s without guessing client subdomains', (homeserver, expected) => {
    expect(defaultElementWebUrl(homeserver)).toBe(expected);
  });

  it.each([
    ['@organiser:matrix.org', 'https://app.element.io/', 'matrix.org'],
    ['@participant:sk.community', 'https://chat.sk.community/', 'sk.community'],
  ])('links the same opaque room for %s through the account server', (userId, webUrl, via) => {
    const roomId = '!opaque_room-id';
    const url = new URL(buildElementRoomUrl(webUrl, roomId, userId));
    const [path, query] = url.hash.slice(1).split('?');
    expect(url.origin + url.pathname).toBe(webUrl);
    expect(decodeURIComponent(path)).toBe(`/room/${roomId}`);
    expect(new URLSearchParams(query).getAll('via')).toEqual([via]);
    expect(url.search).toBe('');
  });

  it('supports a custom Element installation under a subpath and encodes the room ID', () => {
    const url = new URL(buildElementRoomUrl('https://client.example.org/element', '!room:example.org?extra=1&x=#', '@member:example.org:8448'));
    expect(url.pathname).toBe('/element/');
    const [path, query] = url.hash.slice(1).split('?');
    expect(decodeURIComponent(path)).toBe('/room/!room:example.org?extra=1&x=#');
    expect(new URLSearchParams(query).getAll('via')).toEqual(['example.org:8448']);
  });

  it('extracts the Matrix server name, including a port or IPv6 address', () => {
    expect(matrixServerName('@member:example.org:8448')).toBe('example.org:8448');
    expect(matrixServerName('@member:[::1]:8448')).toBe('[::1]:8448');
  });

  it('accepts a pasted Element room link but discards its old room fragment', () => {
    expect(normalizeElementWebUrl('https://chat.sk.community/#/room/!old?via=sk.community')).toBe('https://chat.sk.community/');
  });

  it.each(['javascript:alert(1)', 'http://remote.example.org', 'https://user:secret@example.org', 'https://example.org?access_token=secret'])('rejects unsafe or credential-bearing web URLs: %s', value => {
    expect(() => normalizeElementWebUrl(value)).toThrow();
  });
});
