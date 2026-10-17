import { createHash, randomUUID } from 'node:crypto';
import { emptyActivity, emptyBrief, parseBrief, validateDraft, type Activity, type Brief } from '../../src/domain/brief';
import { publishBrief } from '../../src/matrix/eventStore';
import { BRIEF_SITE_URL } from '../../src/matrix/announcements';
import type { Config } from './config';

export interface Event { event_id: string; room_id?: string; sender: string; type: string; origin_server_ts: number; content: Record<string, any>; prevEvent?: Event }
export interface Proposal { id: string; code: string; originalId: string; activity: Activity; createdAt: number; status: 'pending' | 'writing' | 'done' }
export interface Journal { get(id: string): Promise<Proposal | undefined>; find(code: string): Promise<Proposal | undefined>; put(proposal: Proposal): Promise<void> }
export interface Matrix {
  event(room: string, id: string): Promise<Event>;
  checkRooms(actor: string): Promise<void>;
  brief(): Promise<Brief | null>;
  publish(type: string, key: string, brief: Brief): Promise<unknown>;
}
export class InputError extends Error {}
const ttl = 24 * 60 * 60 * 1000;
export const activityId = (room: string, event: string) => 'ch-' + createHash('sha256').update(JSON.stringify([room, event])).digest('hex');

export function parseActivity(body: string, id: string): Activity {
  const activity = { ...emptyActivity(id), announcementLevel: 'off' as const };
  const fields: Record<string, 'title' | 'description' | 'scheduledAt' | 'location'> = { title: 'title', description: 'description', when: 'scheduledAt', where: 'location' };
  const seen = new Set<string>();
  for (const line of body.split(/\r?\n/).filter(line => line.trim())) {
    const match = /^(Title|Description|When|Where):\s*(.*)$/i.exec(line.trim());
    if (!match || seen.has(match[1].toLowerCase())) throw new InputError('Use one line each: Title: …, When: ISO date/time with timezone (or TBC), Where: … (or TBC), and optional Description: …');
    const key = match[1].toLowerCase();
    seen.add(key);
    activity[fields[key]] = match[2].trim();
  }
  if (!activity.title || !seen.has('when') || !seen.has('where') || !activity.scheduledAt || !activity.location) throw new InputError('Title, When and Where are required. Write TBC explicitly for an unknown time or location.');
  if (activity.scheduledAt === 'TBC') activity.scheduledAt = '';
  if (activity.location === 'TBC') activity.location = '';
  if (activity.scheduledAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(activity.scheduledAt)) throw new InputError('When must be an ISO date/time with an explicit timezone, or TBC.');
  if (activity.scheduledAt) {
    const day = activity.scheduledAt.slice(0, 10);
    if (!Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new InputError('When contains an invalid calendar date.');
  }
  try { validateDraft({ ...emptyBrief(), activities: [activity] }); } catch (error) { throw new InputError((error as Error).message); }
  return activity;
}

export function createModule(config: Config, matrix: Matrix, journal: Journal, now = Date.now) {
  // One process and one durable journal per mapping. Queue includes reads and writes.
  let tail: Promise<unknown> = Promise.resolve();
  function activityLink(id: string): string {
    const url = new URL(BRIEF_SITE_URL);
    url.searchParams.set('roomId', config.storageRoom);
    url.searchParams.set('publicServer', config.homeserver);
    url.hash = `activity-${encodeURIComponent(id)}`;
    return url.href;
  }
  async function save(proposal: Proposal): Promise<string> {
    const brief = await matrix.brief() ?? emptyBrief();
    if (!brief.activities.some(a => a.id === proposal.id)) {
      proposal.status = 'writing';
      await journal.put(proposal);
      await publishBrief({ canEdit: () => true, publish: (type, key, content) => matrix.publish(type, key, content) }, parseBrief({ ...brief, activities: [...brief.activities, proposal.activity] })!);
    }
    proposal.status = 'done';
    await journal.put(proposal);
    return `Activity saved!\nView the activity: ${activityLink(proposal.id)}\nAn organiser can use Start discussion on the website to enable its activity thread and sign-ups.`;
  }
  async function handle(payload: unknown, authenticated: boolean): Promise<string | undefined> {
    if (config.eventSource === 'hub' && !config.allowUnauthenticatedHub && !authenticated) throw new InputError('Authenticated Hub callback required.');
    const hint = (payload as { event?: Event } | null)?.event;
    if (!hint || hint.room_id !== config.sourceRoom) throw new InputError('Unmapped source room.');
    if (typeof hint.event_id !== 'string' || !hint.event_id.startsWith('$')) throw new InputError('Invalid event ID.');
    // In Hub mode the HTTP boundary authenticates the trusted Hub before accepting
    // its sender/content claims. Matrix mode retains independent event re-fetch.
    const event = config.eventSource === 'hub' ? hint : await matrix.event(config.sourceRoom, hint.event_id);
    if (typeof event.sender !== 'string' || !/^@[^\s:]+:\S+$/.test(event.sender) || !event.content || typeof event.content !== 'object' || Array.isArray(event.content)) throw new InputError('Malformed Matrix event.');
    if (event.event_id !== hint.event_id || (event.room_id && event.room_id !== config.sourceRoom)) throw new InputError('Event does not match source room.');
    if (!Number.isFinite(event.origin_server_ts) || event.origin_server_ts > now() + 60000 || now() - event.origin_server_ts > ttl) throw new InputError('Event is outside the 24-hour processing window.');
    if (event.type === 'm.reaction') {
      const relation = event.content?.['m.relates_to'];
      if (relation?.rel_type !== 'm.annotation' || relation.key?.replace(/\uFE0F/g, '') !== '📅') return;
      if (typeof relation.event_id !== 'string' || !relation.event_id.startsWith('$')) throw new InputError('Reaction has no referenced message.');
      await matrix.checkRooms(event.sender);
      const id = activityId(config.sourceRoom, relation.event_id);
      let proposal = await journal.get(id);
      if (proposal?.status === 'done') return `This message already created an activity.\nView the activity: ${activityLink(proposal.id)}`;
      if (!proposal) {
        const original = config.eventSource === 'hub' ? event.prevEvent : await matrix.event(config.sourceRoom, relation.event_id);
        if (!original || original.event_id !== relation.event_id || (original.room_id && original.room_id !== config.sourceRoom) || original.type !== 'm.room.message' || original.content?.msgtype !== 'm.text' || typeof original.content.body !== 'string' || original.content['m.relates_to']?.rel_type === 'm.replace') throw new InputError('React to an original, unredacted text message. The Hub must supply the matching prevEvent.');
        proposal = { id, code: randomUUID(), originalId: relation.event_id, activity: parseActivity(original.content.body, id), createdAt: now(), status: 'pending' };
        await journal.put(proposal);
      }
      if (now() - proposal.createdAt > ttl) throw new InputError('Proposal expired. Post a new activity message and react to it.');
      if (config.requireConfirmation === false) return save(proposal);
      const a = proposal.activity;
      return `Activity proposal (copies these details to the separate website storage room):\nTitle: ${a.title}\nWhen: ${a.scheduledAt || 'TBC'}\nWhere: ${a.location || 'TBC'}\nDescription: ${a.description || '(none)'}\nNo tasks or capacity limit. Automatic announcements off.\nAn authorised organiser must send exactly:\nconfirm ${proposal.code}\nExpires in 24 hours. Discussion can be started on the website.`;
    }
    if (config.requireConfirmation === false || event.type !== 'm.room.message' || event.content?.msgtype !== 'm.text' || typeof event.content.body !== 'string' || event.content['m.relates_to']?.rel_type === 'm.replace') return;
    const match = /^confirm ([a-f0-9-]{36})$/.exec(event.content.body.trim());
    if (!match) return;
    if (!config.confirmers.includes(event.sender)) throw new InputError('Only a configured organiser may confirm an activity.');
    const proposal = await journal.find(match[1]);
    if (!proposal) throw new InputError('Unknown proposal. React with 📅 to an activity message first.');
    if (proposal.status === 'done') return `This activity was already saved.\nView the activity: ${activityLink(proposal.id)}`;
    if (now() - proposal.createdAt > ttl || event.origin_server_ts < proposal.createdAt) throw new InputError('Confirmation is expired or predates the proposal.');
    await matrix.checkRooms(event.sender);
    return save(proposal);
  }
  return (payload: unknown, authenticated = false) => {
    const result = tail.then(() => handle(payload, authenticated));
    tail = result.catch(() => undefined);
    return result;
  };
}
