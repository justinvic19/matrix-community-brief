import { useEffect, useState } from 'react';
import { loadPublicBrief, type PublicBrief, type PublicTarget } from '../../matrix/publicBrief';

export function PublicBriefPage({ target, onConnect }: { target: PublicTarget; onConnect: (activityId?: string) => void }) {
  const [data, setData] = useState<PublicBrief | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(''); setLoading(true);
    loadPublicBrief(target, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load public activities.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [target.roomId, target.server, revision]);
  return <section className="card" aria-label="Public community brief">
    <div className="discussion-toolbar"><h2>{data?.name ?? 'Public activities'}</h2><button className="secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</button></div>
    <p className="muted">Public read-only view. Sign in to join the room, sign up, or participate in discussions. Sign-up counts are available after connecting.</p>
    {loading && <p role="status">Loading public activities…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {data && !data.brief?.activities.length && <p>No activities have been published yet.</p>}
    {data?.brief?.activities.map(activity => <article key={activity.id} id={`activity-${encodeURIComponent(activity.id)}`} className="public-activity">
      <h3>{activity.title}</h3>
      <p>{activity.scheduledAt ? new Date(activity.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Time to be confirmed'}{activity.location && ` · ${activity.location}`}</p>
      {activity.announcement && <aside className="notice preserve">{activity.announcement}</aside>}
      <p className="preserve">{activity.description}</p>
      {activity.tasks.length > 0 && <details><summary>Tasks ({activity.tasks.length})</summary><ul>{activity.tasks.map(task => <li key={task.id}>{task.completed ? '✓ ' : ''}{task.text}</li>)}</ul></details>}
      <button onClick={() => onConnect(activity.id)}>Sign in to sign up</button>
    </article>)}
    <button className="secondary" onClick={() => onConnect()}>Sign in or connect with a token</button>
  </section>;
}
