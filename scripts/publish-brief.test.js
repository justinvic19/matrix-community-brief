import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicFields, publish } from './publish-brief.mjs';

const brief = { schemaVersion: 3, updatedAt: '2026-10-17T12:00:00Z', token: 'secret', activities: [{
  id: 'a', title: 'Meetup', description: '', scheduledAt: '', location: '', announcement: '',
  maxParticipants: null, participants: ['private'], tasks: [{ id: 't', text: 'Help', completed: false, assignee: 'private' }],
}] };
it('exports only allowed fields, including within activities and tasks', () => {
  const result = JSON.stringify(publicFields(brief));
  expect(result).toContain('Meetup');
  expect(result).not.toMatch(/secret|private|participants|assignee|token/);
});
it('requires explicit opt-in and replaces the export with an empty list when disabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brief-export-'));
  const fetcher = vi.fn();
  try {
    await publish({}, fetcher, dir);
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(join(dir, 'public-briefs.json'), 'utf8')).rooms).toEqual([]);
    fetcher.mockResolvedValue({ ok: true, json: async () => brief });
    await publish({ PUBLIC_BRIEF_ENABLED: 'true', PUBLIC_BRIEF_SERVER: 'https://matrix.example', PUBLIC_BRIEF_ROOM_ID: '!room', MATRIX_PUBLISH_TOKEN: 'secret' }, fetcher, dir);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer secret' } });
    const output = await readFile(join(dir, 'public-briefs.json'), 'utf8');
    expect(output).toContain('Meetup');
    expect(output).not.toContain('secret');
    fetcher.mockResolvedValue({ ok: false, status: 403 });
    await expect(publish({ PUBLIC_BRIEF_ENABLED: 'true', PUBLIC_BRIEF_SERVER: 'https://matrix.example', PUBLIC_BRIEF_ROOM_ID: '!room', MATRIX_PUBLISH_TOKEN: 'secret' }, fetcher, dir)).rejects.toThrow('HTTP 403');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
