import { useEffect, useRef, useState, type ReactNode } from 'react';
import { emptyActivity, emptyBrief, type Activity, type Brief } from '../../domain/brief';
import type { BriefStore, Snapshot } from '../../matrix/eventStore';
import { BriefEditor } from './BriefEditor';
import { Discussion } from './Discussion';
import { buildElementRoomUrl, defaultElementWebUrl } from '../../matrix/roomLink';

function SummaryIcon({ kind }: { kind: 'date' | 'location' | 'people' }) {
  return <svg className={`summary-icon summary-icon--${kind}`} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'date' && <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>}
    {kind === 'location' && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
    {kind === 'people' && <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>}
  </svg>;
}

function ActivityCard({ activity, updatedAt, canEdit, canSignup, signups, userId, onSignup, onEdit, onRemove, children }: { children?: ReactNode; activity: Activity; updatedAt: string; canEdit: boolean; canSignup: boolean; signups: string[]; userId: string; onSignup: (signedUp: boolean) => Promise<void>; onEdit: () => void; onRemove: () => void }) {
  const completedCount = activity.tasks.filter(task => task.completed).length;
  const signedUp = signups.includes(userId);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const anchor = `activity-${encodeURIComponent(activity.id)}`;
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === `#${anchor}` && detailsRef.current) {
        detailsRef.current.open = true;
        detailsRef.current.scrollIntoView?.({ block: 'start' });
      }
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [anchor]);
  return <article className="activity-card" id={anchor}>
    <details className="activity-details" ref={detailsRef}>
      <summary>
        <span className="activity-summary-title" role="heading" aria-level={2}>{activity.title || 'Untitled activity'}</span>
        <span className="activity-summary-meta">
          <span className="activity-summary-fact"><SummaryIcon kind="date" />{activity.scheduledAt ? new Date(activity.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Date not set'}</span>
          <span className="activity-summary-fact"><SummaryIcon kind="location" />{activity.location || 'Location not set'}</span>
          <span>{completedCount}/{activity.tasks.length} tasks complete</span>
        </span>
      </summary>
      <div className="activity-content">
      {activity.announcement && <aside className="notice activity-announcement"><strong>Announcement</strong><p className="preserve">{activity.announcement}</p></aside>}
      {activity.description && <p className="preserve activity-description">{activity.description}</p>}
      <dl className="activity-facts">
        <div><dt>Date and time</dt><dd>{activity.scheduledAt ? new Date(activity.scheduledAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }) : 'Not yet set'}{activity.scheduledAt && <small>Shown in your local timezone · {activity.scheduledAt}</small>}</dd></div>
        <div><dt>Meeting location</dt><dd>{activity.location || 'Not yet set'}</dd></div>
      </dl>
      <section className="activity-signups" aria-label={`Sign-ups for ${activity.title}`}>
        <div className="signup-heading"><h3>Sign-ups</h3><strong>{signups.length}{activity.maxParticipants === null ? '' : ` / ${activity.maxParticipants}`}</strong></div>
        {signups.length > 0 ? <ul className="signup-list">{signups.map(participant => <li key={participant}>{participant}</li>)}</ul> : <p>No one has signed up yet.</p>}
        <p className="muted">Sign-ups are visible to room members in Element.</p>
        {signedUp && canSignup && <div className="signup-action"><details className="signup-cancel-menu"><summary>You’re going</summary><SignupButton signedUp full={false} onSignup={onSignup} /></details></div>}
        {signedUp && !canSignup && <div className="signup-action"><span className="collapsed-signup-status" role="status">You’re going</span></div>}
        {!signedUp && canSignup && <div className="signup-action"><SignupButton signedUp={false} full={activity.maxParticipants !== null && signups.length >= activity.maxParticipants} onSignup={onSignup} /></div>}
        {!canSignup && <p className="muted">Sign-ups need a live connection, loaded room history, and permission to send room messages.</p>}
      </section>
      <section className="activity-tasks" aria-label={`Tasks for ${activity.title}`}><h3>Tasks</h3><ul className="tasks">{activity.tasks.map(task => <li key={task.id}><span aria-label={task.completed ? 'Complete' : 'Incomplete'}>{task.completed ? '☑' : '☐'}</span> {task.text}</li>)}</ul>{activity.tasks.length === 0 && <p>No tasks yet.</p>}</section>
      <p className="muted">Brief last updated: {new Date(updatedAt).toLocaleString()}</p>
      {canEdit && <div className="activity-actions"><button type="button" onClick={onEdit}>Edit activity</button><button type="button" className="secondary" onClick={onRemove}>Remove activity</button></div>}
      </div>
    </details>
    <div className="activity-signup-summary">
      <span className="activity-summary-fact signup-count"><SummaryIcon kind="people" />{signups.length}{activity.maxParticipants === null ? '' : ` / ${activity.maxParticipants}`} signed up</span>
      <div className="collapsed-signup">
        {signedUp && canSignup && <details className="signup-cancel-menu collapsed-cancel-menu"><summary>You’re going</summary><SignupButton signedUp full={false} onSignup={onSignup} /></details>}
        {signedUp && !canSignup && <span className="collapsed-signup-status" role="status">You’re going</span>}
        {!signedUp && canSignup && <SignupButton signedUp={false} full={activity.maxParticipants !== null && signups.length >= activity.maxParticipants} onSignup={onSignup} />}
      </div>
    </div>
    {children}
  </article>;
}

function SignupButton({ signedUp, full, onSignup }: { signedUp: boolean; full: boolean; onSignup: (signedUp: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <><button type="button" disabled={busy || (!signedUp && full)} onClick={async () => { setBusy(true); setError(''); try { await onSignup(!signedUp); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }}>{busy ? 'Saving…' : signedUp ? 'Cancel sign-up' : full ? 'Activity full' : 'Sign up'}</button>{error && <p className="error" role="alert">{error}</p>}</>;
}

export function BriefPage({ store, roomId, elementWebUrl = defaultElementWebUrl(store.identity.homeserver) }: { store: BriefStore; roomId: string; elementWebUrl?: string }) {
  const [state, setState] = useState<Snapshot>({ brief: null, canEdit: false, status: 'loading' });
  const [editing, setEditing] = useState<{ activityId: string | null; activity: Activity; baseline: string } | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => store.subscribe(setState), [store]);
  const brief = state.brief;
  const elementRoomUrl = buildElementRoomUrl(elementWebUrl, roomId, store.identity.userId);

  function startEditing(activity?: Activity) {
    setMessage('');
    setEditing({ activityId: activity?.id ?? null, activity: activity ?? emptyActivity(crypto.randomUUID()), baseline: JSON.stringify(brief) });
  }

  async function saveActivity(activity: Activity) {
    const latest = brief ?? emptyBrief();
    const existingIndex = editing?.activityId ? latest.activities.findIndex(item => item.id === editing.activityId) : -1;
    const activities = existingIndex >= 0
      ? latest.activities.map((item, index) => index === existingIndex ? activity : item)
      : [...latest.activities, activity];
    const next: Brief = { schemaVersion: 3, activities, updatedAt: new Date().toISOString() };
    const result = await store.save(next);
    setEditing(null);
    if (result?.warning) { setMessage(result.warning); return; }
    setMessage('Save accepted by Matrix. The activities below follow the room’s live state.');
  }

  async function removeActivity(activityId: string) {
    if (!window.confirm('Remove this activity from the shared room brief?')) return;
    const latest = brief ?? emptyBrief();
    try {
      const result = await store.save({ schemaVersion: 3, activities: latest.activities.filter(activity => activity.id !== activityId), updatedAt: new Date().toISOString() });
      if (result?.warning) { setMessage(result.warning); return; }
      setMessage('Activity removed from the shared room brief.');
    } catch (cause) { setMessage((cause as Error).message); }
  }

  async function setActivitySignup(activityId: string, signedUp: boolean) {
    try { await store.setSignup(activityId, signedUp); }
    catch (cause) { setMessage((cause as Error).message); }
  }

  function reconnect() {
    try {
      const retried = store.reconnect();
      setMessage(retried ? 'Retrying Matrix sync now…' : 'No sync request is waiting to retry. Disconnect and reconnect to start a fresh session.');
    } catch (cause) { setMessage((cause as Error).message); }
  }

  return <section className="card" aria-label="Community brief">
    <header className="brief-room-header">
      <div className="room-heading"><div><small>Room</small><strong className="room-name"><a href={elementRoomUrl} target="_blank" rel="noopener noreferrer" title="Open room in Element (new tab)" aria-label={`Open ${state.roomName || 'room'} in Element (new tab)`}>{state.roomName || 'Matrix room'} <span aria-hidden="true">↗</span></a></strong></div><div className="room-status-controls"><span className="eyebrow" role="status">{state.status === 'live' ? 'Connected · live sync' : state.status === 'loading' ? 'Loading room state…' : 'Connection interrupted'}</span>{state.status === 'offline' && <button type="button" className="secondary reconnect-button" onClick={reconnect}>Reconnect</button>}</div></div>
      <p className="room-servers">{state.roomCreatorUserId && <span>Created by <strong>{state.roomCreatorUserId}</strong></span>}<span>Room link opens in <strong>{new URL(elementRoomUrl).host}</strong></span></p>
      <details className="room-technical-details"><summary>Room and connection details</summary><dl><dt>Room ID</dt><dd>{roomId}</dd><dt>Homeserver API URL</dt><dd>{store.identity.homeserver}</dd><dt>Element Web URL</dt><dd>{elementWebUrl}</dd>{state.roomCreatorUserId && <><dt>Room creator’s Matrix ID</dt><dd>{state.roomCreatorUserId}</dd></>}{state.roomCreatorServer && <><dt>Creator account’s homeserver</dt><dd>{state.roomCreatorServer}</dd></>}</dl></details>
    </header>
    {state.error && <p role="alert" className="error">{state.error}</p>}
    {message && <p role="status">{message}</p>}
    {editing ? <BriefEditor initial={editing.activity} canEdit={state.canEdit} changedRemotely={editing.baseline !== JSON.stringify(brief)} onCancel={() => setEditing(null)} onSave={saveActivity} /> : <>
      {brief ? <>
        <div className="activity-list-heading"><h2>Activities</h2>{state.canEdit && <button type="button" className="icon-button" aria-label="Add activity" title="Add activity" onClick={() => startEditing()}>+</button>}</div>
        {brief.activities.map(activity => <ActivityCard key={activity.id} activity={activity} updatedAt={brief.updatedAt} canEdit={state.canEdit} canSignup={!!state.canSignup} signups={state.signups?.[activity.id] ?? []} userId={store.identity.userId} onSignup={signedUp => setActivitySignup(activity.id, signedUp)} onEdit={() => startEditing(activity)} onRemove={() => void removeActivity(activity.id)}>{store.discussions && <Discussion activity={activity} store={store.discussions} roomId={roomId} userId={store.identity.userId} elementWebUrl={elementWebUrl} />}</ActivityCard>)}
        {brief.activities.length === 0 && <p>No activities have been added to this room yet.</p>}
        {brief.activities.length > 0 && <p className="muted">Last updated: {new Date(brief.updatedAt).toLocaleString()}</p>}
      </> : state.status === 'live' && !state.error ? <><h2>A shared place for the current plan</h2><p>No brief has been published in this room yet.</p>{state.canEdit && <button type="button" className="icon-button" aria-label="Add activity" title="Add activity" onClick={() => startEditing()}>+</button>}</> : null}
      {!state.canEdit && state.status !== 'loading' && <p className="muted">Read-only: editing requires a live connection and sufficient room permissions.</p>}
    </>}
  </section>;
}
