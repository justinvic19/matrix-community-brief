import { Direction, EventStatus, EventType, MsgType, RelationType, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import type { Activity } from '../domain/brief';
import { activityNotice } from './announcements';

export const DISCUSSION_EVENT = 'com.example.community_brief.discussion';
export interface DiscussionMessage { id: string; sender: string; body: string; timestamp: number }
export interface DiscussionSnapshot { rootId?: string; messages: DiscussionMessage[]; loading: boolean; loaded: boolean; more: boolean; error?: string; canReply: boolean; canStart: boolean }
export interface DiscussionStore {
  subscribe(activityId: string, listener: (state: DiscussionSnapshot) => void): () => void;
  load(activityId: string, older?: boolean): Promise<void>;
  start(activity: Activity): Promise<void>;
  reply(activityId: string, body: string): Promise<void>;
}
export const threadRelation = (rootId: string) => ({ rel_type: RelationType.Thread, event_id: rootId, is_falling_back: true, 'm.in_reply_to': { event_id: rootId } });

export function discussionMessage(event: MatrixEvent, rootId: string): DiscussionMessage | null {
  const content = event.getContent();
  if (content['com.example.community_brief.activity'] || content['com.example.community_brief.signup']) return null;
  if (event.isRedacted() || event.getType() !== EventType.RoomMessage || content['m.relates_to']?.rel_type !== RelationType.Thread || content['m.relates_to']?.event_id !== rootId || !event.getId()) return null;
  const replacement = event.getUnsigned()['m.relations']?.['m.replace'];
  const edited = replacement?.sender === event.getSender() ? replacement?.content?.['m.new_content'] : undefined;
  let body = edited?.body ?? content.body;
  if (typeof body !== 'string') body = '[Attachment: open in Element]';
  if (content['m.relates_to']?.['m.in_reply_to']) body = body.replace(/^(?:>[^\n]*\n)+\n/, '');
  return { id: event.getId()!, sender: event.getSender() ?? 'Unknown sender', body, timestamp: event.getTs() };
}

export function createDiscussions(client: MatrixClient, roomId: string, canSend: () => boolean, canStart: () => boolean) {
  let closed = false;
  const roots = new Map<string, string>();
  const observed = new Map<string, string | undefined>();
  const pendingRoots = new Map<string, string>();
  const locks = new Map<string, Promise<void>>();
  const states = new Map<string, DiscussionSnapshot>();
  const tokens = new Map<string, string | undefined>();
  const redactions = new Set<string>();
  const listeners = new Map<string, Set<(state: DiscussionSnapshot) => void>>();
  const root = (id: string) => {
    const event = client.getRoom(roomId)?.currentState.getStateEvents(DISCUSSION_EVENT, id);
    if (event?.getId() !== observed.get(id)) {
      observed.set(id, event?.getId());
      const value = event?.getContent().rootEventId;
      if (typeof value === 'string' && value.startsWith('$')) roots.set(id, value);
      else roots.delete(id);
    }
    return roots.get(id);
  };
  const snapshot = (id: string): DiscussionSnapshot => {
    const rootId = root(id);
    const old = states.get(id);
    return { ...(old && old.rootId === rootId ? old : { messages: [], loaded: false, loading: false, more: false }), rootId, canReply: canSend(), canStart: canStart() };
  };
  const emit = (id: string) => { if (!closed) listeners.get(id)?.forEach(fn => fn(snapshot(id))); };
  const store: DiscussionStore = {
    subscribe(id, fn) { const group = listeners.get(id) ?? new Set(); group.add(fn); listeners.set(id, group); fn(snapshot(id)); return () => { group.delete(fn); }; },
    async load(id, older = false) {
      const state = snapshot(id);
      if (closed || state.loading || !state.rootId || (older && !state.more)) return;
      const rootId = state.rootId;
      const from = older ? tokens.get(id) : undefined;
      states.set(id, { ...state, loading: true, error: undefined }); emit(id);
      try {
        const result = await client.relations(roomId, rootId, RelationType.Thread, EventType.RoomMessage, { dir: Direction.Backward, limit: 30, ...(from ? { from } : {}) });
        if (closed || root(id) !== rootId) return;
        const messages = new Map(snapshot(id).messages.map(message => [message.id, message]));
        for (const event of result.events) {
          const message = discussionMessage(event, rootId);
          if (message && !redactions.has(message.id)) messages.set(message.id, message);
          else if (event.getId()) messages.delete(event.getId()!);
        }
        const next = result.nextBatch && result.nextBatch !== from ? result.nextBatch : undefined;
        if (older || !state.loaded) tokens.set(id, next);
        states.set(id, { ...state, loading: false, loaded: true, more: older || !state.loaded ? !!next : state.more, messages: [...messages.values()].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)) });
      } catch { if (!closed) states.set(id, { ...state, loading: false, error: 'Could not load discussion. Retry or open it in Element.' }); }
      emit(id);
    },
    async start(activity) {
      if (root(activity.id)) return;
      await announce(activity.id, activityNotice(activity, 'Activity:', roomId), undefined, true);
    },
    async reply(id, input) {
      const body = input.trim();
      if (!body || body.length > 4000) throw new Error('Enter a reply between 1 and 4000 characters.');
      if (closed || !canSend()) throw new Error('A live connection and permission to send room messages are required.');
      const rootId = root(id);
      if (!rootId) throw new Error('An organiser must start the discussion first.');
      await client.sendEvent(roomId, EventType.RoomMessage, { msgtype: MsgType.Text, body, 'm.mentions': {}, 'm.relates_to': threadRelation(rootId) });
      await store.load(id);
    },
  };
  async function announce(id: string, notice: ReturnType<typeof activityNotice>, parent = notice, rootOnly = false) {
    if (locks.has(id)) throw new Error('A discussion update is already in progress. Please wait.');
    const operation = (async () => {
      if (closed || !canSend()) throw new Error('Cannot send discussion messages right now.');
      let rootId = root(id);
      if (!rootId) {
        if (!canStart()) throw new Error('Organiser permission to save discussion state is required.');
        rootId = pendingRoots.get(id);
        if (!rootId) { rootId = (await client.sendEvent(roomId, EventType.RoomMessage, parent)).event_id; pendingRoots.set(id, rootId); }
        await client.sendStateEvent(roomId, DISCUSSION_EVENT, { rootEventId: rootId }, id);
        roots.set(id, rootId); pendingRoots.delete(id);
      }
      if (!rootOnly) await client.sendEvent(roomId, EventType.RoomMessage, { ...notice, 'm.relates_to': threadRelation(rootId) });
      emit(id);
    })();
    locks.set(id, operation);
    try { await operation; } finally { locks.delete(id); }
  }
  return {
    store, announce,
    rootId: root,
    refresh() { for (const id of listeners.keys()) emit(id); },
    timeline(event: MatrixEvent) {
      if (event.getAssociatedStatus() && event.getAssociatedStatus() !== EventStatus.SENT) return;
      for (const id of listeners.keys()) {
        const state = snapshot(id);
        if (!state.loaded || !state.rootId) continue;
        const relation = event.getContent()['m.relates_to'];
        const redacted = event.event.redacts ?? event.getContent().redacts;
        if (event.getType() === EventType.RoomRedaction && typeof redacted === 'string') {
          redactions.add(redacted);
          states.set(id, { ...state, messages: state.messages.filter(message => message.id !== redacted) }); emit(id);
        }
        const message = discussionMessage(event, state.rootId);
        if (message && !redactions.has(message.id)) {
          states.set(id, { ...state, messages: [...state.messages.filter(item => item.id !== message.id), message].sort((a, b) => a.timestamp - b.timestamp) }); emit(id);
        } else if (relation?.rel_type === RelationType.Replace) {
          const body = event.getContent()['m.new_content']?.body;
          if (typeof body === 'string') {
            states.set(id, { ...state, messages: state.messages.map(item => item.id === relation.event_id && item.sender === event.getSender() ? { ...item, body } : item) }); emit(id);
          }
        }
      }
    },
    close() { closed = true; listeners.clear(); },
  };
}
