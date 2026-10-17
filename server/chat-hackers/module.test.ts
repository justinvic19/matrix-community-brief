// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { emptyBrief, type Brief } from '../../src/domain/brief';
import { readConfig } from './config';
import { activityId, createModule, parseActivity, type Event, type Journal, type Matrix, type Proposal } from './module';

const env = { CH_SOURCE_ROOM_ID: '!source', CH_STORAGE_ROOM_ID: '!storage', CH_MATRIX_SERVER: 'https://matrix.example.org', CH_MATRIX_TOKEN: 'private-token', CH_CONFIRMERS: '@organiser:example.org' };
const config = readConfig(env);
const now = Date.parse('2026-10-17T12:00:00Z');
const text = 'Title: Community lunch\nWhen: 2026-10-24T12:00:00+01:00\nWhere: Community hall\nDescription: Bring food';
function fixture(eventSource: 'matrix' | 'hub' = 'matrix', allowUnauthenticatedHub = false, requireConfirmation = true) {
  const records = new Map<string, Proposal>();
  const journal: Journal = {
    get: async id => structuredClone(records.get(id)),
    find: async code => structuredClone([...records.values()].find(p => p.code === code)),
    put: async p => { records.set(p.id, structuredClone(p)); },
  };
  const events: Record<string, Event> = {
    '$original': { event_id: '$original', sender: '@member:example.org', type: 'm.room.message', origin_server_ts: now - 1000, content: { msgtype: 'm.text', body: text } },
    '$reaction': { event_id: '$reaction', sender: '@member:example.org', type: 'm.reaction', origin_server_ts: now, content: { 'm.relates_to': { rel_type: 'm.annotation', key: '📅', event_id: '$original' } } },
  };
  let brief: Brief | null = null;
  const matrix: Matrix = {
    event: vi.fn(async (_room, id) => structuredClone(events[id])), checkRooms: vi.fn(async () => {}),
    brief: vi.fn(async () => structuredClone(brief)),
    publish: vi.fn(async (_type, _key, value) => { brief = structuredClone(value); }),
  };
  const makeHandler = () => createModule({ ...config, eventSource, allowUnauthenticatedHub, requireConfirmation }, matrix, journal, () => now);
  const handle = makeHandler();
  const payload = (id: string) => ({ event: { room_id: '!source', event_id: id } });
  const confirm = (sender = '@organiser:example.org') => {
    const proposal = [...records.values()][0];
    events.$confirm = { event_id: '$confirm', sender, type: 'm.room.message', origin_server_ts: now, content: { msgtype: 'm.text', body: `confirm ${proposal.code}` } };
    return payload('$confirm');
  };
  return { records, journal, events, matrix, handle, makeHandler, payload, confirm, brief: () => brief, setBrief: (value: Brief) => { brief = value; } };
}

describe('configuration and deterministic parsing', () => {
  it('requires a distinct mapping and exact actor IDs', () => {
    expect(() => readConfig({ ...env, CH_STORAGE_ROOM_ID: '!source' })).toThrow('distinct');
    expect(() => readConfig({ ...env, CH_CONFIRMERS: 'Jane' })).toThrow('Matrix IDs');
    expect(() => readConfig({ ...env, CH_MATRIX_TOKEN: '' })).toThrow('CH_MATRIX_TOKEN');
  });
  it('parses explicit fields and leaves explicitly unknown details empty', () => {
    expect(parseActivity(text, 'id')).toMatchObject({ title: 'Community lunch', location: 'Community hall', tasks: [], maxParticipants: null });
    expect(parseActivity('Title: Lunch\nWhen: TBC\nWhere: TBC', 'id')).toMatchObject({ scheduledAt: '', location: '' });
  });
  it.each(['Lunch tomorrow at noon', 'Title: Lunch', 'Title: Lunch\nWhen: tomorrow\nWhere: Park', 'Title: Lunch\nWhen: 2026-02-30T12:00Z\nWhere: Park', 'Title: Lunch\nWhen: 2026-10-24T12:00\nWhere: Park', 'Title: Lunch\nTitle: Another\nWhen: TBC\nWhere: TBC'])('rejects ambiguity or invalid details: %s', body => {
    expect(() => parseActivity(body, 'id')).toThrow();
  });
});

describe('authenticated Hub events', () => {
  it('saves immediately for an ordinary reactor and deduplicates concurrent retries', async () => {
    const f = fixture('hub', true, false);
    const payload = { event: { ...f.events.$reaction, room_id: '!source', prevEvent: f.events.$original } };
    const results = await Promise.all([f.handle(payload), f.handle(payload)]);
    expect(results[0]).toContain('Activity saved');
    expect(f.matrix.publish).toHaveBeenCalledTimes(1);
    expect(f.brief()?.activities).toHaveLength(1);
    await f.makeHandler()(payload);
    expect(f.matrix.publish).toHaveBeenCalledTimes(1);
  });
  it('immediate mode still validates and recovers a lost write response', async () => {
    const f = fixture('hub', true, false);
    const payload = { event: { ...f.events.$reaction, room_id: '!source', prevEvent: f.events.$original } };
    await expect(f.handle({ event: { ...payload.event, prevEvent: { ...f.events.$original, content: { msgtype: 'm.text', body: 'Lunch tomorrow' } } } })).rejects.toThrow();
    expect(f.matrix.publish).not.toHaveBeenCalled();
    vi.mocked(f.matrix.publish).mockImplementationOnce(async (_t, _k, brief) => { f.setBrief(brief); throw new Error('timeout'); });
    await expect(f.handle(payload)).rejects.toThrow('timeout');
    expect(await f.makeHandler()(payload)).toContain('Activity saved');
    expect(f.matrix.publish).toHaveBeenCalledTimes(1);
  });
  it('an existing pending preview can be saved by a new reaction after switching modes', async () => {
    const f = fixture('hub', true);
    const payload = { event: { ...f.events.$reaction, room_id: '!source', prevEvent: f.events.$original } };
    await f.handle(payload);
    expect(f.matrix.publish).not.toHaveBeenCalled();
    const immediate = createModule({ ...config, eventSource: 'hub', allowUnauthenticatedHub: true, requireConfirmation: false }, f.matrix, f.journal, () => now);
    expect(await immediate(payload)).toContain('Activity saved');
    expect(f.matrix.publish).toHaveBeenCalledTimes(1);
  });
  it('explicit demo mode accepts unsigned callbacks but retains mapping, confirmation and deduplication', async () => {
    const f = fixture('hub', true);
    const event = { ...f.events.$reaction, room_id: '!source', prevEvent: f.events.$original };
    await expect(f.handle({ event: { ...event, room_id: '!other' } })).rejects.toThrow('Unmapped');
    expect(await f.handle({ event })).toContain('confirm ');
    expect(f.matrix.publish).not.toHaveBeenCalled();
    f.confirm('@outsider:example.org');
    await expect(f.handle({ event: { ...f.events.$confirm, room_id: '!source' } })).rejects.toThrow('organiser');
    f.confirm();
    const confirmation = { event: { ...f.events.$confirm, room_id: '!source' } };
    expect(await f.handle(confirmation)).toContain('Activity saved');
    await f.makeHandler()(confirmation);
    expect(f.matrix.publish).toHaveBeenCalledTimes(1);
    expect(f.matrix.event).not.toHaveBeenCalled();
  });
  it('creates and confirms using forwarded prevEvent without fetching source events', async () => {
    const f = fixture('hub');
    const event = { ...f.events.$reaction, room_id: '!source', prevEvent: f.events.$original };
    await expect(f.handle({ event })).rejects.toThrow('Authenticated');
    expect(f.records.size).toBe(0);
    expect(await f.handle({ event }, true)).toContain('confirm ');
    f.confirm();
    const confirmation = { event: { ...f.events.$confirm, room_id: '!source' } };
    expect(await f.handle(confirmation, true)).toContain('Activity saved');
    await f.makeHandler()(confirmation, true);
    expect(f.matrix.event).not.toHaveBeenCalled();
    expect(f.matrix.publish).toHaveBeenCalledTimes(1);
  });
  it('rejects missing, mismatched and cross-room original messages', async () => {
    const f = fixture('hub');
    for (const prevEvent of [undefined, { ...f.events.$original, event_id: '$wrong' }, { ...f.events.$original, room_id: '!other' }]) {
      await expect(f.handle({ event: { ...f.events.$reaction, room_id: '!source', prevEvent } }, true)).rejects.toThrow('prevEvent');
    }
    expect(f.records.size).toBe(0);
  });
  it('retains room mapping and organiser allowlist checks', async () => {
    const f = fixture('hub');
    const event = { ...f.events.$reaction, room_id: '!other', prevEvent: f.events.$original };
    await expect(f.handle({ event }, true)).rejects.toThrow('Unmapped');
    await f.handle({ event: { ...event, room_id: '!source' } }, true);
    f.confirm('@outsider:example.org');
    await expect(f.handle({ event: { ...f.events.$confirm, room_id: '!source' } }, true)).rejects.toThrow('organiser');
    expect(f.matrix.publish).not.toHaveBeenCalled();
  });
});

describe('proposal and confirmation', () => {
  it('rejects unmapped rooms before any network call', async () => {
    const f = fixture();
    await expect(f.handle({ event: { room_id: '!storage', event_id: '$reaction' } })).rejects.toThrow('Unmapped');
    expect(f.matrix.event).not.toHaveBeenCalled();
  });
  it('fetches the original from source, previews, and writes nothing before confirmation', async () => {
    const f = fixture();
    expect(await f.handle(f.payload('$reaction'))).toContain('confirm ');
    expect(f.matrix.event).toHaveBeenCalledWith('!source', '$original');
    expect(f.matrix.publish).not.toHaveBeenCalled();
  });
  it('ignores non-calendar reactions and refuses redacted originals', async () => {
    const f = fixture();
    f.events.$reaction.content['m.relates_to'].key = '👍';
    expect(await f.handle(f.payload('$reaction'))).toBeUndefined();
    f.events.$reaction.content['m.relates_to'].key = '📅';
    f.events.$original.content = {};
    await expect(f.handle(f.payload('$reaction'))).rejects.toThrow('unredacted');
  });
  it('does not trust a forged webhook sender or content', async () => {
    const f = fixture(); await f.handle(f.payload('$reaction'));
    const payload = f.confirm('@outsider:example.org');
    await expect(f.handle({ event: { ...payload.event, sender: '@organiser:example.org', content: f.events.$confirm.content } })).rejects.toThrow('organiser');
    expect(f.matrix.publish).not.toHaveBeenCalled();
  });
  it('publishes shared schema, preserving existing activities', async () => {
    const f = fixture(); await f.handle(f.payload('$reaction'));
    f.setBrief({ ...emptyBrief(), activities: [parseActivity(text, 'existing')] });
    expect(await f.handle(f.confirm())).toContain('Activity saved');
    expect(f.matrix.checkRooms).toHaveBeenLastCalledWith('@organiser:example.org');
    expect(f.matrix.publish).toHaveBeenCalledWith('com.example.community_brief', 'main', expect.objectContaining({ schemaVersion: 3, activities: [expect.objectContaining({ id: 'existing' }), expect.objectContaining({ id: activityId('!source', '$original') })] }));
  });
  it('rejects stale confirmations, permission loss and malformed existing state', async () => {
    const f = fixture(); await f.handle(f.payload('$reaction'));
    const payload = f.confirm();
    f.events.$confirm.origin_server_ts = now - 1;
    await expect(f.handle(payload)).rejects.toThrow('predates');
    f.events.$confirm.origin_server_ts = now;
    vi.mocked(f.matrix.checkRooms).mockRejectedValueOnce(new Error('Permission lost'));
    await expect(f.handle(payload)).rejects.toThrow('Permission lost');
    vi.mocked(f.matrix.brief).mockRejectedValueOnce(new Error('Malformed existing state'));
    await expect(f.handle(payload)).rejects.toThrow('Malformed');
    expect(f.matrix.publish).not.toHaveBeenCalled();
  });
  it('deduplicates reactions and concurrent confirmations, including after restart and deletion', async () => {
    const f = fixture();
    await Promise.all([f.handle(f.payload('$reaction')), f.handle(f.payload('$reaction'))]);
    f.events.$another = { ...f.events.$reaction, event_id: '$another' };
    await f.handle(f.payload('$another'));
    expect(f.records.size).toBe(1);
    const payload = f.confirm();
    await Promise.all([f.handle(payload), f.handle(payload)]);
    expect(f.matrix.publish).toHaveBeenCalledTimes(1);
    f.setBrief(emptyBrief());
    await f.makeHandler()(payload);
    expect(f.matrix.publish).toHaveBeenCalledTimes(1);
  });
  it('recovers an accepted state write whose response was lost', async () => {
    const f = fixture(); await f.handle(f.payload('$reaction'));
    vi.mocked(f.matrix.publish).mockImplementationOnce(async (_type, _key, brief) => { f.setBrief(brief); throw new Error('timeout'); });
    const payload = f.confirm();
    await expect(f.handle(payload)).rejects.toThrow('timeout');
    expect(await f.makeHandler()(payload)).toContain('Activity saved');
    expect(f.matrix.publish).toHaveBeenCalledTimes(1);
    expect(f.brief()?.activities).toHaveLength(1);
  });
  it('retries a failed write without marking the proposal completed', async () => {
    const f = fixture(); await f.handle(f.payload('$reaction'));
    vi.mocked(f.matrix.publish).mockRejectedValueOnce(new Error('offline'));
    const payload = f.confirm();
    await expect(f.handle(payload)).rejects.toThrow('offline');
    await f.makeHandler()(payload);
    expect(f.brief()?.activities).toHaveLength(1);
  });
});
