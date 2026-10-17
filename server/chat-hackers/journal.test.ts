// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { fileJournal } from './journal';
import { activityId, parseActivity, type Proposal } from './module';
it('persists proposals and completed tombstones across reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brief-journal-'));
  try {
    const id = activityId('!source', '$original');
    const proposal: Proposal = { id, originalId: '$original', code: 'code', createdAt: Date.now(), status: 'pending', activity: parseActivity('Title: Lunch\nWhen: TBC\nWhere: TBC', id) };
    const journal = await fileJournal(directory);
    await journal.put(proposal);
    const reopened = await fileJournal(directory);
    expect(await reopened.find('code')).toEqual(proposal);
    await reopened.put({ ...proposal, status: 'done' });
    expect((await (await fileJournal(directory)).get(id))?.status).toBe('done');
    await expect(journal.get('../outside')).rejects.toThrow('Invalid');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
