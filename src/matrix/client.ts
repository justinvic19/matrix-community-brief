import { createClient, ClientEvent, EventStatus, EventTimeline, EventType, RoomEvent, RoomStateEvent, SyncState, type MatrixClient, type MatrixEvent, type Room } from 'matrix-js-sdk';
import { parseBrief } from '../domain/brief';
import { BRIEF_EVENT, SIGNUP_CONTENT_KEY, STATE_KEY, matrixError, parseSignupAction, publishBrief, type BriefStore, type Snapshot } from './eventStore';
export interface Connection {
  homeserver: string;
  token: string;
  roomId: string;
  refreshToken?: string;
  oauthClientId?: string;
  deviceId?: string;
  onTokenRefresh?: (tokens: { accessToken: string; refreshToken?: string }) => void;
}
export function validateRoomId(roomId: string): void {
  // Room v12 IDs have no server suffix. Treat IDs as opaque, not aliases.
  if (!/^!\S+$/.test(roomId)) throw new Error('Copy the complete Internal Room ID from Element, beginning with !. Do not use a room name, alias or link.');
}
export function normalizeHomeserver(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use an HTTPS homeserver URL (HTTP is only allowed on localhost).');
  if (url.username || url.password || url.search || url.hash) throw new Error('Enter a homeserver URL without credentials, query parameters or fragments.');
  return url.href.replace(/\/$/, '');
}
export async function connectMatrix(input: Connection): Promise<BriefStore> {
  const baseUrl = normalizeHomeserver(input.homeserver);
  validateRoomId(input.roomId);
  // Authenticate first. SDK state stays in memory; the UI manages its saved connection.
  const auth = createClient({
    baseUrl,
    accessToken: input.token,
    refreshToken: input.refreshToken,
    oauthClientId: input.oauthClientId,
    deviceId: input.deviceId,
    onTokenRefresh: input.onTokenRefresh,
    localTimeoutMs: 15000,
  });
  let userId: string;
  let accessToken = input.token;
  let refreshToken = input.refreshToken;
  try {
    userId = (await auth.whoami()).user_id;
    accessToken = auth.getAccessToken() ?? accessToken;
    refreshToken = auth.getRefreshToken() ?? refreshToken;
  } catch (error) { throw new Error(matrixError(error)); }
  finally { auth.setAccessToken(''); }
  const client = createClient({
    baseUrl,
    accessToken,
    refreshToken,
    oauthClientId: input.oauthClientId,
    deviceId: input.deviceId,
    onTokenRefresh: input.onTokenRefresh,
    userId,
    localTimeoutMs: 15000,
  });
  return createRoomStore(client, input.roomId, userId, baseUrl);
}
export function createRoomStore(client: MatrixClient, roomId: string, userId: string, homeserver: string): BriefStore {
  let closed = false;
  let prepared = false;
  let snapshot: Snapshot = { brief: null, canEdit: false, canSignup: false, signupsReady: false, signups: {}, status: 'loading' };
  const listeners = new Set<(snapshot: Snapshot) => void>();
  const room = () => client.getRoom(roomId);
  const canEdit = () => !closed && prepared && snapshot.status === 'live' && room()?.getMyMembership() === 'join' && !room()?.currentState.getStateEvents('m.room.encryption', '') && !!room()?.currentState.maySendStateEvent(BRIEF_EVENT, userId);
  const canSignup = () => !closed && prepared && snapshot.status === 'live' && room()?.getMyMembership() === 'join' && !room()?.currentState.getStateEvents('m.room.encryption', '') && !!room()?.currentState.maySendEvent('m.room.message', userId);
  const collectSignups = (current: Room): Record<string, string[]> => {
    const latest = new Map<string, Map<string, boolean>>();
    for (const event of current.getLiveTimeline().getEvents()) {
      if (event.getType() !== 'm.room.message') continue;
      const status = event.getAssociatedStatus();
      if (status && status !== EventStatus.SENT) continue;
      const action = parseSignupAction(event.getContent()[SIGNUP_CONTENT_KEY]);
      const sender = event.getSender();
      if (action && sender) {
        const activitySignups = latest.get(action.activityId) ?? new Map<string, boolean>();
        activitySignups.set(sender, action.signedUp);
        latest.set(action.activityId, activitySignups);
      }
    }
    const signups: Record<string, string[]> = {};
    for (const [activityId, activitySignups] of latest) signups[activityId] = [...activitySignups].filter(([, signedUp]) => signedUp).map(([user]) => user);
    return signups;
  };
  const emit = () => listeners.forEach(listener => listener(snapshot));
  const refresh = () => {
    if (closed || !prepared) return;
    const current = room();
    const name = current?.currentState.getStateEvents('m.room.name', '')?.getContent().name;
    const createEvent = current?.currentState.getStateEvents('m.room.create', '');
    const creator = createEvent?.getSender() ?? createEvent?.getContent().creator;
    const roomCreatorUserId = typeof creator === 'string' ? creator : undefined;
    const roomCreatorServer = roomCreatorUserId?.includes(':') ? roomCreatorUserId.slice(roomCreatorUserId.indexOf(':') + 1) : undefined;
    snapshot = { ...snapshot, roomName: typeof name === 'string' ? name.trim() || undefined : undefined, roomCreatorUserId, roomCreatorServer };
    try {
      if (!current) throw new Error(`Room ${roomId} was not found in the synced rooms for ${userId}. Check the Internal Room ID and that the token belongs to the Element account that joined this room.`);
      if (current.getMyMembership() !== 'join') throw new Error(`Account ${userId} has not joined room ${roomId} (membership: ${current.getMyMembership() || 'unknown'}). Open this room in Element using that account, join or accept its invitation, then reconnect.`);
      if (current.currentState.getStateEvents('m.room.encryption', '')) throw new Error('Use a dedicated unencrypted test room. This prototype does not open encrypted rooms.');
      const event = current.currentState.getStateEvents(BRIEF_EVENT, STATE_KEY);
      snapshot = { ...snapshot, brief: parseBrief(event?.getContent()), canEdit: canEdit(), canSignup: canSignup() && signupHistoryLoaded && !signupHistoryFailed, signups: collectSignups(current), error: undefined };
    } catch (error) { snapshot = { ...snapshot, brief: null, canEdit: false, canSignup: false, error: (error as Error).message }; }
    emit();
  };
  const onState = () => refresh();
  let loadingSignupHistory = false;
  let signupHistoryLoaded = false;
  let signupHistoryFailed = false;
  const onTimeline = (event: MatrixEvent, eventRoom?: Room) => {
    if (closed || eventRoom?.roomId !== roomId || loadingSignupHistory || !parseSignupAction(event.getContent()[SIGNUP_CONTENT_KEY])) return;
    refresh();
  };
  const loadSignupHistory = async () => {
    const current = room();
    if (!current || signupHistoryLoaded || signupHistoryFailed || loadingSignupHistory) return;
    loadingSignupHistory = true;
    try {
      let token = current.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS);
      while (!closed && token) {
        await client.scrollback(current, 100);
        const nextToken = current.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS);
        if (nextToken === token) break;
        token = nextToken;
      }
      signupHistoryLoaded = true;
    } catch { signupHistoryFailed = true; }
    finally { loadingSignupHistory = false; if (!closed) { snapshot = { ...snapshot, signupsReady: signupHistoryLoaded }; refresh(); } }
  };
  const onSync = (state: SyncState) => {
    if (closed) return;
    if (state === SyncState.Prepared || state === SyncState.Syncing) { prepared = true; snapshot = { ...snapshot, status: 'live' }; refresh(); void loadSignupHistory(); }
    else if (state === SyncState.Error || state === SyncState.Reconnecting) { snapshot = { ...snapshot, status: 'offline', canEdit: false, canSignup: false, error: 'Sync interrupted. Displayed information may be out of date. Select Reconnect to retry now.' }; emit(); }
  };
  client.on(ClientEvent.Sync, onSync);
  client.on(RoomStateEvent.Events, onState);
  client.on(RoomEvent.Timeline, onTimeline);
  void client.startClient({ initialSyncLimit: 0 }).catch(() => { if (!closed) { snapshot = { ...snapshot, status: 'offline', error: 'Could not start sync. Disconnect and try again.' }; emit(); } });
  return {
    identity: { userId, homeserver },
    subscribe(listener) { listeners.add(listener); listener(snapshot); return () => { listeners.delete(listener); }; },
    reconnect() { return !closed && client.retryImmediately(); },
    async save(brief) {
      await publishBrief({ canEdit: () => canEdit() && !snapshot.error, publish: async (type, key, content) => {
        try { await client.sendStateEvent(roomId, type, content, key); } catch (error) { throw new Error(matrixError(error)); }
        // The authoritative current state arrives via /sync; never inject a local echo.
      } }, brief);
    },
    async setSignup(activityId, signedUp) {
      if (!canSignup()) throw new Error('Your room permissions do not allow signing up.');
      const current = room();
      const activity = snapshot.brief?.activities.find(item => item.id === activityId);
      if (!current || !activity) throw new Error('This activity is no longer available. Refresh the room brief and try again.');
      const activeUsers = snapshot.signups?.[activityId] ?? [];
      const alreadySignedUp = activeUsers.includes(userId);
      if (signedUp && alreadySignedUp) return;
      if (!signedUp && !alreadySignedUp) return;
      if (signedUp && activity.maxParticipants !== null && activeUsers.length >= activity.maxParticipants) throw new Error('This activity has reached its sign-up limit.');
      try {
        await client.sendEvent(roomId, EventType.RoomMessage, {
          msgtype: 'm.notice',
          body: signedUp ? `${userId} signed up for ${activity.title}.` : `${userId} withdrew from ${activity.title}.`,
          [SIGNUP_CONTENT_KEY]: { activityId, signedUp },
        } as never);
      } catch (error) { throw new Error(matrixError(error)); }
    },
    close() { closed = true; client.off(ClientEvent.Sync, onSync); client.off(RoomStateEvent.Events, onState); client.off(RoomEvent.Timeline, onTimeline); client.stopClient(); client.setAccessToken(''); listeners.clear(); },
  };
}
