import { EventType, type MatrixClient } from 'matrix-js-sdk';
import { activityNotice, communityNotice } from './announcements';
import { threadRelation } from './discussions';

export const ANNOUNCEMENT_FEED_EVENT = 'com.example.community_brief.announcement_feed';

// Separate from activity discussions: one shared root per room, persisted across sessions.
export function createAnnouncementFeed(client: MatrixClient, roomId: string, canSend: () => boolean, canCreate: () => boolean) {
  let acceptedRoot: string | undefined;
  let pendingRoot: string | undefined;
  let observedId: string | undefined;
  return async (notice: ReturnType<typeof activityNotice>) => {
    if (!canSend()) throw new Error('Room message permission is required.');
    const mapping = client.getRoom(roomId)?.currentState.getStateEvents(ANNOUNCEMENT_FEED_EVENT, 'main');
    if (mapping?.getId() !== observedId) {
      observedId = mapping?.getId();
      const value = mapping?.getContent().rootEventId;
      acceptedRoot = typeof value === 'string' && value.startsWith('$') ? value : undefined;
    }
    if (!acceptedRoot) {
      if (!canCreate()) throw new Error('Permission to save the announcement thread is required.');
      if (!pendingRoot) {
        pendingRoot = (await client.sendEvent(roomId, EventType.RoomMessage, communityNotice(roomId))).event_id;
      }
      if (!canCreate() || !canSend()) throw new Error('Announcement permissions changed.');
      await client.sendStateEvent(roomId, ANNOUNCEMENT_FEED_EVENT, { rootEventId: pendingRoot }, 'main');
      acceptedRoot = pendingRoot;
      pendingRoot = undefined;
    }
    await client.sendEvent(roomId, EventType.RoomMessage, { ...notice, 'm.relates_to': threadRelation(acceptedRoot) });
  };
}
