import { expect, it } from 'vitest';
import { emptyActivity, emptyBrief, parseBrief } from '../domain/brief';
import { activityAnnouncements, activityNotice, activityParent, BRIEF_SITE_URL } from './announcements';

const activity = { ...emptyActivity('a/#'), title: '<Meet & greet>' };
const brief = { ...emptyBrief(), activities: [activity] };
it('adds a compact UTC schedule to the linked parent, with an unscheduled fallback', () => {
  expect(activityParent({ ...activity, scheduledAt: '2026-10-24T10:00:00+01:00' }, '!room').body).toContain('24 Oct, 09:00 UTC');
  expect(activityParent(activity, '!room').body).toContain('Time to be confirmed');
});
it('keeps the room and activity link on the parent only', () => {
  const roomId = '!opaque:example.org';
  const notices = [activityParent(activity, roomId)];
  for (const notice of notices) {
    const link = new URL(notice.body.slice(notice.body.indexOf('https://')).split('\n')[0]);
    expect(link.searchParams.get('roomId')).toBe(roomId);
    expect(link.hash).toBe('#activity-a%2F%23');
    expect([...link.searchParams.keys()]).toEqual(['roomId']);
  }
  const replies = [...activityAnnouncements(null, brief, roomId), ...activityAnnouncements(brief, { ...brief, activities: [{ ...activity, location: 'Hall' }] }, roomId), ...activityAnnouncements(brief, emptyBrief(), roomId)];
  for (const reply of replies) {
    expect(reply.body).not.toContain('https://');
    expect(reply.formatted_body).not.toContain('<a ');
  }
});
it('links and escapes activity names, with a plain-text fallback and no mentions', () => {
  const notice = activityNotice(activity, '@member:server signed up for');
  expect(notice.formatted_body).toContain('&lt;Meet &amp; greet&gt;</a>');
  expect(notice.formatted_body).toContain(`href="${BRIEF_SITE_URL}#activity-a%2F%23"`);
  expect(notice.body).toContain('<Meet & greet>');
  expect(notice.body).toContain(BRIEF_SITE_URL);
  expect(notice['m.mentions']).toEqual({});
});
it('announces creation, content updates and deletion but not no-op or settings-only saves', () => {
  expect(activityAnnouncements(null, brief)[0].body).toContain('created:');
  expect(activityAnnouncements(brief, { ...brief, activities: [{ ...activity, location: 'Hall' }] })[0].body).toContain('updated:');
  expect(activityAnnouncements(brief, emptyBrief())[0].body).toContain('removed:');
  expect(activityAnnouncements(brief, { ...brief, updatedAt: '2026-10-18T12:00:00Z' })).toEqual([]);
  expect(activityAnnouncements(brief, { ...brief, activities: [{ ...activity, announcementLevel: 'all' }] })).toEqual([]);
});
it('respects all three announcement levels and validates persisted settings', () => {
  const off = { ...brief, activities: [{ ...activity, announcementLevel: 'off' as const }] };
  expect(activityAnnouncements(null, off)).toEqual([]);
  expect(activityAnnouncements(off, emptyBrief())).toEqual([]);
  const major = { ...brief, activities: [{ ...activity, announcementLevel: 'major' as const }] };
  expect(activityAnnouncements(null, major)).toHaveLength(1);
  expect(activityAnnouncements(major, emptyBrief())).toHaveLength(1);
  expect(activityAnnouncements(major, { ...major, activities: [{ ...major.activities[0], title: 'Changed' }] })).toEqual([]);
  expect(parseBrief(off)?.activities[0].announcementLevel).toBe('off');
  expect(() => parseBrief({ ...brief, activities: [{ ...activity, announcementLevel: 'invalid' }] })).toThrow(/announcement level/);
});
