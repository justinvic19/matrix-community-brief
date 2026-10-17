import { ClientEvent, EventType, MatrixEvent, RoomEvent, RoomState, RoomStateEvent, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { expect, it, vi } from 'vitest';
import { emptyActivity, emptyBrief } from '../domain/brief';
import { createRoomStore, normalizeHomeserver, validateRoomId } from './client';
import { BRIEF_EVENT, SIGNUP_CONTENT_KEY, STATE_KEY, type Snapshot } from './eventStore';
const userId = '@organiser:example.org';
const roomId = '!test:example.org';
it('announces only after accepted saves, avoids duplicate no-op notices, and distinguishes partial failure', async () => {
  const h = harness(); h.sync();
  const brief = { ...emptyBrief(), activities: [{ ...emptyActivity('notice'), title: 'Notice test' }] };
  h.client.sendStateEvent.mockRejectedValueOnce(new Error('offline'));
  await expect(h.store.save(brief)).rejects.toThrow();
  expect(h.client.sendEvent).not.toHaveBeenCalled();
  await h.store.save(brief);
  expect(h.client.sendEvent).toHaveBeenCalledTimes(2);
  expect(h.client.sendEvent.mock.calls[1]?.[2]).toEqual(expect.objectContaining({ formatted_body: expect.stringContaining('>Notice test</a>') }));
  await h.store.save(brief);
  expect(h.client.sendEvent).toHaveBeenCalledTimes(2);
  h.client.sendEvent.mockRejectedValueOnce(new Error('notice failed'));
  await expect(h.store.save({ ...brief, activities: [] })).resolves.toEqual({ warning: expect.stringContaining('brief was saved') });
  h.store.close();
});
it('does not announce synced changes and respects message permissions independently of state editing', async () => {
  const h = harness(); h.sync();
  const brief = { ...emptyBrief(), activities: [{ ...emptyActivity('notice'), title: 'Notice test' }] };
  h.put(BRIEF_EVENT, STATE_KEY, brief); h.changed();
  expect(h.client.sendEvent).not.toHaveBeenCalled();
  h.put('m.room.power_levels', '', { users: { [userId]: 50 }, state_default: 50, events: { 'm.room.message': 100 } }); h.changed();
  await expect(h.store.save({ ...brief, activities: [] })).resolves.toEqual({ warning: expect.stringContaining('brief was saved') });
  expect(h.client.sendEvent).not.toHaveBeenCalled();
  h.store.close();
});
it('accepts opaque v12 and legacy room IDs without modifying them', () => {
  for (const id of ['!abcdefghijklmnopqrstuvwxyz_0123456789-ABCDEFG', '!test:example.org']) expect(() => validateRoomId(id)).not.toThrow();
  for (const id of ['!', 'room-name', '#room:example.org', 'https://app.element.io/#/room/test', '!room with spaces']) expect(() => validateRoomId(id)).toThrow();
});
function harness(viewerId = userId, homeserver = 'https://matrix.example.org') {
  const state = new RoomState(roomId);
  const timelineEvents: MatrixEvent[] = [];
  let backwardToken: string | null = null;
  const timeline = { getEvents: () => timelineEvents, getPaginationToken: () => backwardToken };
  const currentRoom = { roomId, currentState: state, getMyMembership: () => membership, getLiveTimeline: () => timeline };
  function put(type: string, key: string, content: object) { state.setStateEvents([new MatrixEvent({ type, state_key: key, content, room_id: roomId, sender: userId, event_id: `$${Math.random()}` })]); }
  put('m.room.create', '', { creator: userId, room_version: '10' });
  put('m.room.member', viewerId, { membership: 'join' });
  put('m.room.power_levels', '', { users: { [viewerId]: 100 }, state_default: 50 });
  const handlers = new Map<string, (...args: any[]) => void>();
  let membership = 'join';
  const client = { getRoom: () => currentRoom, on: (event: string, fn: (...args: any[]) => void) => handlers.set(event, fn), off: (event: string) => handlers.delete(event), startClient: vi.fn().mockResolvedValue(undefined), retryImmediately: vi.fn(() => true), stopClient: vi.fn(), setAccessToken: vi.fn(), sendStateEvent: vi.fn().mockResolvedValue({ event_id: '$saved' }), sendEvent: vi.fn().mockResolvedValue({ event_id: '$signup' }), scrollback: vi.fn(async () => { if (backwardToken) { timelineEvents.push(new MatrixEvent({ type: EventType.RoomMessage, content: { msgtype: 'm.notice', body: 'older signup', [SIGNUP_CONTENT_KEY]: { activityId: 'history', signedUp: true } }, room_id: roomId, sender: '@historic:matrix.org', event_id: '$historic' })); backwardToken = null; } return currentRoom; }) };
  const store = createRoomStore(client as unknown as MatrixClient, roomId, viewerId, homeserver);
  let snapshot: Snapshot;
  store.subscribe(value => { snapshot = value; });
  return { store, client, put, snapshot: () => snapshot!, setBackToken: (token: string) => { backwardToken = token; }, sync: (value = SyncState.Prepared) => handlers.get(ClientEvent.Sync)?.(value), changed: () => handlers.get(RoomStateEvent.Events)?.(), message: (sender: string, activityId: string, signedUp: boolean) => { const event = new MatrixEvent({ type: EventType.RoomMessage, content: { msgtype: 'm.notice', body: 'signup', [SIGNUP_CONTENT_KEY]: { activityId, signedUp } }, room_id: roomId, sender, event_id: `$signup-${Math.random()}` }); timelineEvents.push(event); handlers.get(RoomEvent.Timeline)?.(event, currentRoom); }, leave: () => { membership = 'leave'; }, handlers };
}
it('keeps room origin separate from a federated viewer’s homeserver and updates the room name', () => {
  const h = harness('@participant:sk.community', 'https://matrix.sk.community');
  h.put('m.room.name', '', { name: 'Shared activity room' }); h.sync();
  expect(h.store.identity).toEqual({ userId: '@participant:sk.community', homeserver: 'https://matrix.sk.community' });
  expect(h.snapshot().roomCreatorUserId).toBe(userId);
  expect(h.snapshot().roomCreatorServer).toBe('example.org');
  expect(h.snapshot().roomName).toBe('Shared activity room');
  h.put('m.room.name', '', { name: 'Renamed room' }); h.changed();
  expect(h.snapshot().roomName).toBe('Renamed room');
  expect(h.snapshot().roomCreatorServer).toBe('example.org');
  h.store.close();
});
it('loads missing state, publishes the exact state tuple and receives synced changes', async () => {
  const h = harness(); expect(h.snapshot().status).toBe('loading'); h.sync(); expect(h.snapshot().brief).toBeNull(); expect(h.snapshot().canEdit).toBe(true);
  const brief = { ...emptyBrief(), activities: [{ ...emptyActivity('clean-up'), title: 'Community clean-up' }] };
  await h.store.save(brief); expect(h.client.sendStateEvent).toHaveBeenCalledWith(roomId, BRIEF_EVENT, expect.objectContaining({ activities: brief.activities }), STATE_KEY);
  expect(h.snapshot().brief).toBeNull(); // A successful PUT is not a sync echo.
  h.put(BRIEF_EVENT, STATE_KEY, brief); h.changed(); expect(h.snapshot().brief?.activities[0].title).toBe('Community clean-up');
  h.store.close(); expect(h.client.stopClient).toHaveBeenCalled(); expect(h.client.setAccessToken).toHaveBeenCalledWith(''); expect(h.handlers.size).toBe(0);
});
it('asks the Matrix SDK to retry a backed-off sync request immediately', () => {
  const h = harness();
  expect(h.store.reconnect()).toBe(true);
  expect(h.client.retryImmediately).toHaveBeenCalledOnce();
  h.store.close();
  expect(h.store.reconnect()).toBe(false);
});
it('allows room members to sign up by message and tracks each member’s latest response', async () => {
  const h = harness('@participant:sk.community', 'https://matrix.sk.community'); h.sync();
  h.put('m.room.power_levels', '', { users: { '@participant:sk.community': 0 }, state_default: 50 }); h.changed();
  const activity = { ...emptyActivity('clean-up'), title: 'Community clean-up', maxParticipants: 2 };
  h.put('com.example.community_brief.discussion', 'clean-up', { rootEventId: '$activity-root' });
  h.put(BRIEF_EVENT, STATE_KEY, { ...emptyBrief(), activities: [activity] }); h.changed();
  expect(h.snapshot().canEdit).toBe(false);
  expect(h.snapshot().canSignup).toBe(true);
  await h.store.setSignup('clean-up', true);
  expect(h.client.sendEvent.mock.calls.at(-1)?.[2]).toMatchObject({ body: '@participant:sk.community signed up for Community clean-up.' });
  expect(h.client.sendEvent.mock.calls.at(-1)?.[2]).not.toHaveProperty('formatted_body');
  expect(h.client.sendEvent.mock.calls.at(-1)?.[2]['m.relates_to']).toMatchObject({ rel_type: 'm.thread', event_id: '$activity-root' });
  expect(h.client.sendEvent).toHaveBeenCalledWith(roomId, EventType.RoomMessage, expect.objectContaining({ msgtype: 'm.notice', [SIGNUP_CONTENT_KEY]: { activityId: 'clean-up', signedUp: true } }));
  h.message('@participant:sk.community', 'clean-up', true);
  h.message('@other:matrix.org', 'clean-up', true);
  expect(h.snapshot().signups?.['clean-up']).toEqual(['@participant:sk.community', '@other:matrix.org']);
  h.message('@participant:sk.community', 'clean-up', false);
  expect(h.snapshot().signups?.['clean-up']).toEqual(['@other:matrix.org']);
  h.store.close();
});
it('stops new sign-ups when an activity reaches its capacity', async () => {
  const h = harness(); h.sync();
  const activity = { ...emptyActivity('small-meeting'), title: 'Small meeting', maxParticipants: 1 };
  h.put(BRIEF_EVENT, STATE_KEY, { ...emptyBrief(), activities: [activity] }); h.changed();
  h.message('@other:matrix.org', 'small-meeting', true);
  await expect(h.store.setSignup('small-meeting', true)).rejects.toThrow(/reached its sign-up limit/);
  expect(h.client.sendEvent).not.toHaveBeenCalled();
  h.store.close();
});
it('loads existing sign-ups from room history before enabling registration', async () => {
  const h = harness(); h.put(BRIEF_EVENT, STATE_KEY, { ...emptyBrief(), activities: [{ ...emptyActivity('history'), title: 'Historic activity' }] });
  h.setBackToken('older-page'); h.sync();
  await expect.poll(() => h.snapshot().signupsReady).toBe(true);
  expect(h.client.scrollback).toHaveBeenCalledWith(expect.anything(), 100);
  expect(h.snapshot().signups?.history).toEqual(['@historic:matrix.org']);
  expect(h.snapshot().canSignup).toBe(true);
  h.store.close();
});
it('uses SDK power levels, including event overrides, and rechecks before saving', async () => {
  const h = harness(); h.sync(); h.put('m.room.power_levels', '', { users: { [userId]: 0 }, state_default: 50 }); h.changed(); expect(h.snapshot().canEdit).toBe(false);
  await expect(h.store.save({ ...emptyBrief(), activities: [{ ...emptyActivity('denied'), title: 'Denied' }] })).rejects.toThrow('permissions'); expect(h.client.sendStateEvent).not.toHaveBeenCalled();
  h.put('m.room.power_levels', '', { users: { [userId]: 0 }, state_default: 50, events: { [BRIEF_EVENT]: 0 } }); h.changed(); expect(h.snapshot().canEdit).toBe(true); h.store.close();
});
it('handles disconnection, recovery, malformed state and membership loss', () => {
  const h = harness(); h.sync(); h.sync(SyncState.Error); expect(h.snapshot().canEdit).toBe(false); expect(h.snapshot().status).toBe('offline');
  h.sync(SyncState.Syncing); expect(h.snapshot().canEdit).toBe(true);
  h.put(BRIEF_EVENT, STATE_KEY, { schemaVersion: 9 }); h.changed(); expect(h.snapshot().error).toMatch(/malformed/); expect(h.snapshot().canEdit).toBe(false);
  h.leave(); h.changed(); expect(h.snapshot().error).toMatch(/not joined/); h.store.close();
});
it('rejects encrypted test rooms', () => {
  const h = harness(); h.put('m.room.encryption', '', { algorithm: 'm.megolm.v1.aes-sha2' }); h.sync(); expect(h.snapshot().error).toMatch(/unencrypted/); expect(h.snapshot().canEdit).toBe(false); h.store.close();
});
it('validates homeserver URLs before sending a token', () => {
  expect(normalizeHomeserver('https://matrix.example/')).toBe('https://matrix.example');
  expect(normalizeHomeserver('http://localhost:8008')).toBe('http://localhost:8008');
  for (const value of ['http://example.org', 'https://user:pass@example.org', 'https://example.org?token=secret', 'javascript:alert(1)']) expect(() => normalizeHomeserver(value)).toThrow();
});
