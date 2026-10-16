import { describe, expect, it } from 'vitest';
import { emptyActivity, emptyBrief, parseBrief, setTaskCompleted } from './brief';

describe('community brief', () => {
  it('parses a brief with multiple activities', () => {
    const brief = { ...emptyBrief(), activities: [
      { ...emptyActivity('clean-up'), title: 'Clean-up' },
      { ...emptyActivity('meeting'), title: 'Planning meeting' },
    ] };
    expect(parseBrief(brief)).toEqual(brief);
  });

  it('migrates a valid legacy brief without losing its data', () => {
    const legacy = { schemaVersion: 1, title: 'Clean-up', description: 'Meet by the gate', scheduledAt: '2026-10-24T10:00:00+01:00', location: 'Park', announcement: 'Bring gloves', tasks: [{ id: '1', text: 'Equipment', completed: false }], updatedAt: '2026-10-20T10:00:00Z' };
    expect(parseBrief(legacy)).toEqual({ schemaVersion: 3, activities: [{ id: 'legacy-activity', title: 'Clean-up', description: 'Meet by the gate', scheduledAt: legacy.scheduledAt, location: 'Park', announcement: 'Bring gloves', maxParticipants: null, tasks: legacy.tasks }], updatedAt: legacy.updatedAt });
  });

  it('migrates activity-list briefs and preserves participant limits', () => {
    const oldActivity = { ...emptyActivity('meeting'), title: 'Planning meeting' };
    const { maxParticipants: _oldLimit, ...activityV2 } = oldActivity;
    const v2 = { schemaVersion: 2, activities: [activityV2], updatedAt: '2026-10-20T10:00:00Z' };
    expect(parseBrief(v2)).toEqual({ schemaVersion: 3, activities: [{ ...activityV2, maxParticipants: null }], updatedAt: v2.updatedAt });
    const limited = { ...emptyBrief(), activities: [{ ...oldActivity, maxParticipants: 12 }] };
    expect(parseBrief(limited)?.activities[0].maxParticipants).toBe(12);
    const preLimitV3Activity = { ...oldActivity } as Record<string, unknown>;
    delete preLimitV3Activity.maxParticipants;
    expect(parseBrief({ ...emptyBrief(), activities: [preLimitV3Activity] })?.activities[0].maxParticipants).toBeNull();
    expect(parseBrief({ ...emptyBrief(), activities: [{ ...oldActivity, maxParticipants: '' }] })?.activities[0].maxParticipants).toBeNull();
    expect(() => parseBrief({ ...limited, activities: [{ ...limited.activities[0], maxParticipants: 1.5 }] })).toThrow();
  });

  it('distinguishes missing from malformed state', () => {
    expect(parseBrief(undefined)).toBeNull();
    expect(() => parseBrief({})).toThrow();
    expect(() => parseBrief({ ...emptyBrief(), schemaVersion: 4 })).toThrow();
    expect(() => parseBrief({ ...emptyBrief(), activities: [{ ...emptyActivity('bad-date'), title: 'Bad date', scheduledAt: 'tomorrow' }] })).toThrow(/activity 1 date and time/);
  });

  it('rejects invalid dates and duplicate activity or task IDs', () => {
    const activity = { ...emptyActivity('first'), title: 'Activity' };
    expect(() => parseBrief({ ...emptyBrief(), activities: [{ ...activity, scheduledAt: 'tomorrow' }] })).toThrow();
    expect(() => parseBrief({ ...emptyBrief(), activities: [activity, { ...activity, title: 'Another' }] })).toThrow();
    expect(() => parseBrief({ ...emptyBrief(), activities: [{ ...activity, tasks: [{ id: '1', text: 'a', completed: true }, { id: '1', text: 'b', completed: false }] }] })).toThrow();
  });

  it('updates only the requested task without mutating the activity', () => {
    const activity = { ...emptyActivity('clean-up'), tasks: [{ id: '1', text: 'Equipment', completed: false }] };
    expect(setTaskCompleted(activity, '1', true).tasks[0].completed).toBe(true);
    expect(activity.tasks[0].completed).toBe(false);
  });
});
