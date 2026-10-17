import { EventType, MatrixEvent, type MatrixClient } from 'matrix-js-sdk';
import { expect, it, vi } from 'vitest';
import { emptyActivity } from '../domain/brief';
import { activityNotice } from './announcements';
import { createDiscussions, DISCUSSION_EVENT, threadRelation, type DiscussionSnapshot } from './discussions';

const activity = { ...emptyActivity('a'), title: 'Meetup' };
const roomId = '!room:example.org';
function message(id: string, body = id, timestamp = 1) {
  return new MatrixEvent({ event_id: id, room_id: roomId, type: EventType.RoomMessage, sender: '@member:example.org', origin_server_ts: timestamp, content: { msgtype: 'm.text', body, 'm.relates_to': threadRelation('$root') } });
}
function harness(existing = false) {
  let stateEvent = existing ? new MatrixEvent({ event_id: '$mapping', content: { rootEventId: '$root' } }) : null;
  let allowed = true;
  const client = {
    getRoom: () => ({ currentState: { getStateEvents: () => stateEvent } }),
    sendEvent: vi.fn().mockResolvedValue({ event_id: '$root' }),
    sendStateEvent: vi.fn().mockImplementation(async () => { stateEvent = new MatrixEvent({ event_id: '$mapping', content: { rootEventId: '$root' } }); return { event_id: '$mapping' }; }),
    relations: vi.fn().mockResolvedValue({ events: [], nextBatch: null }),
  };
  const discussions = createDiscussions(client as unknown as MatrixClient, roomId, () => allowed, () => allowed);
  let state: DiscussionSnapshot;
  discussions.store.subscribe('a', value => { state = value; });
  return { client, discussions, state: () => state!, revoke() { allowed = false; discussions.refresh(); } };
}
it('persists one root, threads subsequent notices, and discovers it after reload', async () => {
  const h = harness();
  await h.discussions.announce('a', activityNotice(activity, 'Created:', roomId));
  expect(h.client.sendStateEvent).toHaveBeenCalledWith(roomId, DISCUSSION_EVENT, { rootEventId: '$root' }, 'a');
  await h.discussions.announce('a', activityNotice(activity, 'Updated:', roomId));
  await h.discussions.announce('a', activityNotice(activity, 'Removed:', roomId));
  expect(h.client.sendStateEvent).toHaveBeenCalledOnce();
  expect(h.client.sendEvent.mock.calls[1][2]['m.relates_to']).toEqual(threadRelation('$root'));
  expect(h.client.sendEvent.mock.calls[2][2]['m.relates_to']).toEqual(threadRelation('$root'));
  const reloaded = createDiscussions(h.client as unknown as MatrixClient, roomId, () => true, () => false);
  await reloaded.store.reply('a', 'Hello');
  expect(h.client.sendEvent).toHaveBeenLastCalledWith(roomId, EventType.RoomMessage, expect.objectContaining({ body: 'Hello', 'm.relates_to': threadRelation('$root') }));
});
it('reuses an accepted root if saving its mapping failed', async () => {
  const h = harness(); h.client.sendStateEvent.mockRejectedValueOnce(new Error('offline'));
  await expect(h.discussions.store.start(activity)).rejects.toThrow();
  await h.discussions.store.start(activity);
  expect(h.client.sendEvent).toHaveBeenCalledOnce();
  expect(h.client.sendStateEvent).toHaveBeenCalledTimes(2);
});
it('paginates and deduplicates replies, handles live edits and redactions, and keeps markup as text', async () => {
  const h = harness(true);
  h.client.relations.mockResolvedValueOnce({ events: [message('$b', '<img src=x onerror=alert(1)>', 2)], nextBatch: 'older' });
  await h.discussions.store.load('a');
  expect(h.state().more).toBe(true);
  h.client.relations.mockResolvedValueOnce({ events: [message('$b', 'b', 2), message('$a', 'a', 1)], nextBatch: null });
  await h.discussions.store.load('a', true);
  expect(h.client.relations.mock.calls[1][4]).toMatchObject({ from: 'older' });
  expect(h.state().messages.map(item => item.id)).toEqual(['$a', '$b']);
  h.discussions.timeline(message('$c', 'live', 3));
  expect(h.state().messages).toHaveLength(3);
  h.discussions.timeline(new MatrixEvent({ event_id: '$edit', type: EventType.RoomMessage, sender: '@member:example.org', content: { 'm.relates_to': { rel_type: 'm.replace', event_id: '$a' }, 'm.new_content': { body: 'edited' } } }));
  expect(h.state().messages[0].body).toBe('edited');
  h.discussions.timeline(new MatrixEvent({ event_id: '$redaction', type: EventType.RoomRedaction, redacts: '$a', content: {} }));
  expect(h.state().messages.map(item => item.id)).toEqual(['$b', '$c']);
});
it('reports load failures and checks permissions and reply validation before sending', async () => {
  const h = harness(true); h.client.relations.mockRejectedValueOnce(new Error('offline'));
  await h.discussions.store.load('a');
  expect(h.state().error).toContain('Could not load');
  await expect(h.discussions.store.reply('a', '   ')).rejects.toThrow(/Enter a reply/);
  h.revoke();
  expect(h.state().canReply).toBe(false);
  await expect(h.discussions.store.reply('a', 'Hello')).rejects.toThrow(/permission/);
  expect(h.client.sendEvent).not.toHaveBeenCalled();
});
it('does not emit results after closing', async () => {
  const h = harness(true);
  let finish!: (value: { events: MatrixEvent[] }) => void;
  h.client.relations.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const listener = vi.fn(); h.discussions.store.subscribe('a', listener);
  const pending = h.discussions.store.load('a');
  h.discussions.close(); listener.mockClear(); finish({ events: [message('$reply')] });
  await pending;
  expect(listener).not.toHaveBeenCalled();
});
