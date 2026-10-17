import type { Activity, Brief } from '../domain/brief';
import { MsgType } from 'matrix-js-sdk';

export const BRIEF_SITE_URL = 'https://justinvic19.github.io/matrix-community-brief/';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function communityNotice(roomId: string) {
  const url = new URL(BRIEF_SITE_URL);
  url.searchParams.set('roomId', roomId);
  return {
    msgtype: MsgType.Notice as const,
    body: `Community activities — Open the brief: ${url.href}`,
    format: 'org.matrix.custom.html' as const,
    formatted_body: `Community activities — <a href="${escapeHtml(url.href)}">Open the brief</a>`,
    'm.mentions': {},
  };
}

export function activityNotice(activity: Activity, prefix: string, roomId?: string) {
  const target = new URL(BRIEF_SITE_URL);
  if (roomId) target.searchParams.set('roomId', roomId);
  target.hash = `activity-${encodeURIComponent(activity.id)}`;
  const url = target.href;
  return {
    msgtype: MsgType.Notice as const,
    body: `${prefix} ${activity.title}. ${url}`,
    format: 'org.matrix.custom.html' as const,
    formatted_body: `${escapeHtml(prefix)} <a href="${escapeHtml(url)}">${escapeHtml(activity.title)}</a>.`,
    'm.mentions': {},
    'com.example.community_brief.activity': activity.id,
  };
}

// Settings-only changes and updatedAt changes do not announce an activity update.
export function activityParent(activity: Activity, roomId: string) {
  const notice = activityNotice(activity, 'Activity:', roomId);
  const time = activity.scheduledAt
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(activity.scheduledAt)) + ' UTC'
    : 'Time to be confirmed';
  return { ...notice, body: `${notice.body}\n${time}`, formatted_body: `${notice.formatted_body}<br>${escapeHtml(time)}` };
}

function activityContent({ announcementLevel: _level, ...activity }: Activity) {
  return JSON.stringify(activity);
}

export function activityAnnouncements(before: Brief | null, after: Brief, roomId?: string) {
  const previous = new Map((before?.activities ?? []).map(activity => [activity.id, activity]));
  const nextIds = new Set(after.activities.map(activity => activity.id));
  const messages: ReturnType<typeof activityNotice>[] = [];
  for (const activity of after.activities) {
    const old = previous.get(activity.id);
    const level = activity.announcementLevel ?? 'all';
    if (level === 'off') continue;
    if (!old) messages.push(activityNotice(activity, 'Activity created:', roomId));
    else if (level === 'all' && activityContent(old) !== activityContent(activity)) messages.push(activityNotice(activity, 'Activity updated:', roomId));
  }
  for (const activity of previous.values()) {
    if (!nextIds.has(activity.id) && activity.announcementLevel !== 'off') messages.push(activityNotice(activity, 'Activity removed:', roomId));
  }
  return messages;
}
