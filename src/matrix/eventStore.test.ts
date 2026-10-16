import { expect, it, vi } from 'vitest';
import { emptyActivity, emptyBrief } from '../domain/brief';
import { BRIEF_EVENT, STATE_KEY, matrixError, publishBrief } from './eventStore';
it('publishes validated content to the fixed state slot', async () => {
  const publish = vi.fn().mockResolvedValue({ event_id: '$test' });
  const brief = { ...emptyBrief(), activities: [{ ...emptyActivity('clean-up'), title: 'Saturday clean-up' }], updatedAt: '2020-01-01T00:00:00Z' };
  await publishBrief({ canEdit: () => true, publish }, brief);
  expect(publish).toHaveBeenCalledWith(BRIEF_EVENT, STATE_KEY, expect.objectContaining({ activities: brief.activities, schemaVersion: 3 }));
  expect(publish.mock.calls[0][2].updatedAt).not.toBe(brief.updatedAt);
});
it('does not publish without permissions', async () => {
  const publish = vi.fn();
  await expect(publishBrief({ canEdit: () => false, publish }, emptyBrief())).rejects.toThrow('permissions');
  expect(publish).not.toHaveBeenCalled();
});
it('does not publish malformed or untitled briefs', async () => {
  const publish = vi.fn();
  await expect(publishBrief({ canEdit: () => true, publish }, { ...emptyBrief(), activities: [{ ...emptyActivity('untitled'), title: '' }] })).rejects.toThrow('title');
  expect(publish).not.toHaveBeenCalled();
});
it('explains server permission errors without exposing server error text', () => {
  expect(matrixError({ errcode: 'M_FORBIDDEN', message: 'secret' })).toMatch(/denied access/);
  expect(matrixError(new Error('secret'))).not.toContain('secret');
});
it('explains missing date timezone before publishing and accepts a corrected date', async () => {
  const publish = vi.fn().mockResolvedValue(undefined);
  const adapter = { canEdit: () => true, publish };
  const activity = { ...emptyActivity('activity'), title: 'Activity', scheduledAt: '2026-10-24T10:00:00' };
  const brief = { ...emptyBrief(), activities: [activity] };
  await expect(publishBrief(adapter, brief)).rejects.toThrow('Date and time');
  expect(publish).not.toHaveBeenCalled();
  await publishBrief(adapter, { ...brief, activities: [{ ...activity, scheduledAt: '2026-10-24T10:00:00+01:00' }] });
  expect(publish).toHaveBeenCalledWith(BRIEF_EVENT, STATE_KEY, expect.objectContaining({ activities: [expect.objectContaining({ scheduledAt: '2026-10-24T10:00:00+01:00' })] }));
});
