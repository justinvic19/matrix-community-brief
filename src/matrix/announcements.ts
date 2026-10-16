import type { Activity, Brief } from '../domain/brief';
import { MsgType } from 'matrix-js-sdk';

export const BRIEF_SITE_URL = 'https://justinvic19.github.io/matrix-community-brief/';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function activityNotice(activity: Activity, prefix: string) {
  const url = `${BRIEF_SITE_URL}#activity-${encodeURIComponent(activity.id)}`;
  return {
    msgtype: MsgType.Notice as const,
    body: `${prefix} ${activity.title}. ${url}`,
    format: 'org.matrix.custom.html' as const,
    formatted_body: `${escapeHtml(prefix)} <a href="${escapeHtml(url)}">${escapeHtml(activity.title)}</a>.`,
    'm.mentions': {},
  };
}

// Settings-only changes and updatedAt changes do not announce an activity update.
function activityContent({ announcementLevel: _level, ...activity }: Activity) {
  return JSON.stringify(activity);
}

export function activityAnnouncements(before: Brief | null, after: Brief) {
  const previous = new Map((before?.activities ?? []).map(activity => [activity.id, activity]));
  const nextIds = new Set(after.activities.map(activity => activity.id));
  const messages: ReturnType<typeof activityNotice>[] = [];
  for (const activity of after.activities) {
    const old = previous.get(activity.id);
    const level = activity.announcementLevel ?? 'all';
    if (level === 'off') continue;
    if (!old) messages.push(activityNotice(activity, 'Activity created:'));
    else if (level === 'all' && activityContent(old) !== activityContent(activity)) messages.push(activityNotice(activity, 'Activity updated:'));
  }
  for (const activity of previous.values()) {
    if (!nextIds.has(activity.id) && activity.announcementLevel !== 'off') messages.push(activityNotice(activity, 'Activity removed:'));
  }
  return messages;
}
