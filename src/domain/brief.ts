export interface Task { id: string; text: string; completed: boolean }
export interface Activity { id: string; title: string; description: string; scheduledAt: string; location: string; announcement: string; maxParticipants: number | null; tasks: Task[] }
export interface Brief { schemaVersion: 3; activities: Activity[]; updatedAt: string }
interface LegacyBrief { schemaVersion: 1; title: string; description: string; scheduledAt: string; location: string; announcement: string; tasks: Task[]; updatedAt: string }
interface ActivitiesBriefV2 { schemaVersion: 2; activities: Omit<Activity, 'maxParticipants'>[]; updatedAt: string }
type PersistedActivity = Omit<Activity, 'maxParticipants'> & { maxParticipants?: number | null | '' };

export const emptyActivity = (id: string): Activity => ({ id, title: '', description: '', scheduledAt: '', location: '', announcement: '', maxParticipants: null, tasks: [] });
export const emptyBrief = (): Brief => ({ schemaVersion: 3, activities: [], updatedAt: new Date().toISOString() });
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function validTasks(value: unknown): value is Task[] {
  return Array.isArray(value) && value.every(task => isRecord(task) && typeof task.id === 'string' && task.id.length > 0 && typeof task.text === 'string' && typeof task.completed === 'boolean') && new Set(value.map(task => (task as Task).id)).size === value.length;
}

function activityProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'must be an object';
  if (typeof value.id !== 'string' || !value.id.length) return 'is missing its ID';
  for (const key of ['title', 'description', 'scheduledAt', 'location', 'announcement']) {
    if (typeof value[key] !== 'string') return `${key} must be text`;
  }
  if (value.scheduledAt !== '' && !isDate(value.scheduledAt as string)) return 'date and time must be blank or a valid ISO date with timezone';
  if (!(value.maxParticipants === undefined || value.maxParticipants === null || value.maxParticipants === '' || (Number.isSafeInteger(value.maxParticipants) && (value.maxParticipants as number) > 0))) return 'maximum sign-ups must be blank or a positive whole number';
  if (!Array.isArray(value.tasks)) return 'tasks must be a list';
  for (let index = 0; index < value.tasks.length; index++) {
    const task = value.tasks[index];
    if (!isRecord(task) || typeof task.id !== 'string' || !task.id.length || typeof task.text !== 'string' || typeof task.completed !== 'boolean') return `task ${index + 1} has invalid data`;
  }
  if (new Set(value.tasks.map(task => (task as Task).id)).size !== value.tasks.length) return 'contains duplicate task IDs';
  return null;
}

function validActivityV2(value: unknown): value is Omit<Activity, 'maxParticipants'> {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0 &&
    ['title', 'description', 'scheduledAt', 'location', 'announcement'].every(key => typeof value[key] === 'string') &&
    (value.scheduledAt === '' || isDate(value.scheduledAt as string)) && validTasks(value.tasks);
}

function validLegacyBrief(value: Record<string, unknown>): value is Record<string, unknown> & LegacyBrief {
  return ['title', 'description', 'scheduledAt', 'location', 'announcement', 'updatedAt'].every(key => typeof value[key] === 'string') &&
    isDate(value.updatedAt as string) && (value.scheduledAt === '' || isDate(value.scheduledAt as string)) && validTasks(value.tasks);
}

export function validateDraft(brief: Brief): void {
  if (brief.activities.some(activity => !activity.title.trim())) throw new Error('Enter a title for every activity.');
  if (brief.activities.some(activity => activity.scheduledAt !== '' && !isDate(activity.scheduledAt))) throw new Error('Date and time must include a timezone, for example 2026-10-24T10:00:00+01:00. Enter a valid date with an offset or Z, or leave the field blank.');
  if (brief.activities.some(activity => activity.maxParticipants !== null && (!Number.isSafeInteger(activity.maxParticipants) || activity.maxParticipants < 1))) throw new Error('Maximum sign-ups must be a whole number greater than zero, or left blank.');
  if (new Set(brief.activities.map(activity => activity.id)).size !== brief.activities.length) throw new Error('Activity IDs must be unique.');
}

export function parseBrief(value: unknown): Brief | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error('The room brief is malformed: the state content is not an object. It has not been overwritten.');
  if (value.schemaVersion === 1 && validLegacyBrief(value)) {
    const { title, description, scheduledAt, location, announcement, tasks, updatedAt } = value;
    return { schemaVersion: 3, activities: [{ id: 'legacy-activity', title, description, scheduledAt, location, announcement, maxParticipants: null, tasks: tasks.map(task => ({ ...task })) }], updatedAt };
  }
  if (value.schemaVersion === 2 && typeof value.updatedAt === 'string' && isDate(value.updatedAt) && Array.isArray(value.activities) && value.activities.every(validActivityV2)) {
    const activities = value.activities as ActivitiesBriefV2['activities'];
    return { schemaVersion: 3, activities: activities.map(activity => ({ ...activity, maxParticipants: null, tasks: activity.tasks.map(task => ({ ...task })) })), updatedAt: value.updatedAt };
  }
  if (value.schemaVersion !== 3) throw new Error(`The room brief is malformed: unsupported schema version ${String(value.schemaVersion)}. It has not been overwritten.`);
  if (typeof value.updatedAt !== 'string' || !isDate(value.updatedAt)) throw new Error('The room brief is malformed: updatedAt must be a valid ISO date with timezone. It has not been overwritten.');
  if (!Array.isArray(value.activities)) throw new Error('The room brief is malformed: activities must be a list. It has not been overwritten.');
  const rawActivities = value.activities as unknown[];
  for (let index = 0; index < rawActivities.length; index++) {
    const problem = activityProblem(rawActivities[index]);
    if (problem) throw new Error(`The room brief is malformed: activity ${index + 1} ${problem}. It has not been overwritten.`);
  }
  if (!rawActivities.every((activity, index) => rawActivities.findIndex(candidate => isRecord(candidate) && isRecord(activity) && candidate.id === activity.id) === index)) {
    throw new Error('The room brief is malformed: activity IDs must be unique. It has not been overwritten.');
  }
  const activities = rawActivities as PersistedActivity[];
  return {
    schemaVersion: 3,
    activities: activities.map(activity => ({ ...activity, maxParticipants: activity.maxParticipants === '' ? null : activity.maxParticipants ?? null, tasks: activity.tasks.map(task => ({ ...task })) })),
    updatedAt: value.updatedAt,
  };
}

export function setTaskCompleted(activity: Activity, id: string, completed: boolean): Activity {
  return { ...activity, tasks: activity.tasks.map(task => task.id === id ? { ...task, completed } : task) };
}
