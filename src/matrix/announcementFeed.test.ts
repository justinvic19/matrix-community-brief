import { MatrixEvent, type MatrixClient } from 'matrix-js-sdk';
import { expect, it, vi } from 'vitest';
import { emptyActivity } from '../domain/brief';
import { activityNotice } from './announcements';
import { ANNOUNCEMENT_FEED_EVENT, createAnnouncementFeed } from './announcementFeed';

it('shares one persisted announcement root across activities and reconnects without touching discussion mappings', async () => {
  let mapping: MatrixEvent | null = null;
  const client = {
    getRoom: () => ({ currentState: { getStateEvents: (type: string) => type === ANNOUNCEMENT_FEED_EVENT ? mapping : null } }),
    sendEvent: vi.fn().mockResolvedValue({ event_id: '$feed' }),
    sendStateEvent: vi.fn().mockImplementation(async () => { mapping = new MatrixEvent({ event_id: '$mapping', content: { rootEventId: '$feed' } }); }),
  };
  const first = activityNotice({ ...emptyActivity('a'), title: 'First' }, 'Created:', '!room');
  const second = activityNotice({ ...emptyActivity('b'), title: 'Second' }, 'Created:', '!room');
  const send = createAnnouncementFeed(client as unknown as MatrixClient, '!room', () => true, () => true);
  await send(first); await send(second);
  expect(client.sendStateEvent).toHaveBeenCalledExactlyOnceWith('!room', ANNOUNCEMENT_FEED_EVENT, { rootEventId: '$feed' }, 'main');
  expect(client.sendEvent.mock.calls[0][2].body).toContain('Community activities');
  expect(client.sendEvent.mock.calls[0][2].body).not.toContain('#activity');
  for (const call of client.sendEvent.mock.calls.slice(1)) expect(call[2]['m.relates_to']).toMatchObject({ rel_type: 'm.thread', event_id: '$feed' });
  await createAnnouncementFeed(client as unknown as MatrixClient, '!room', () => true, () => false)(second);
  expect(client.sendStateEvent).toHaveBeenCalledOnce();
  expect(client.sendEvent.mock.calls[3][2]['m.relates_to'].event_id).toBe('$feed');
});

it('reuses a posted root after a mapping failure and checks permissions before posting', async () => {
  const client = { getRoom: () => ({ currentState: { getStateEvents: () => null } }), sendEvent: vi.fn().mockResolvedValue({ event_id: '$feed' }), sendStateEvent: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({}) };
  const notice = activityNotice({ ...emptyActivity('a'), title: 'First' }, 'Created:', '!room');
  const send = createAnnouncementFeed(client as unknown as MatrixClient, '!room', () => true, () => true);
  await expect(send(notice)).rejects.toThrow('offline');
  await send(notice);
  expect(client.sendEvent).toHaveBeenCalledTimes(2);
  const denied = createAnnouncementFeed(client as unknown as MatrixClient, '!room', () => false, () => true);
  await expect(denied(notice)).rejects.toThrow(/permission/);
  expect(client.sendEvent).toHaveBeenCalledTimes(2);
});
