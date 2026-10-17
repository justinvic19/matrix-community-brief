import { useEffect, useState } from 'react';
import type { Activity } from '../../domain/brief';
import type { DiscussionSnapshot, DiscussionStore } from '../../matrix/discussions';
import { buildElementDiscussionUrl } from '../../matrix/roomLink';

export function Discussion({ activity, store, roomId, userId, elementWebUrl }: { activity: Activity; store: DiscussionStore; roomId: string; userId: string; elementWebUrl: string }) {
  const [state, setState] = useState<DiscussionSnapshot>({ messages: [], loaded: false, loading: false, more: false, canReply: false, canStart: false });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => store.subscribe(activity.id, setState), [store, activity.id]);
  useEffect(() => { if (open && state.rootId) void store.load(activity.id); }, [open, state.rootId, store, activity.id]);
  return <details className="activity-discussion" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Discussion{state.loaded ? ` (${state.messages.length}${state.more ? '+' : ''})` : ''}</summary>
    <div className="discussion-content">
      {state.rootId ? <>
        <div className="discussion-toolbar">
          <a href={buildElementDiscussionUrl(elementWebUrl, roomId, userId, state.rootId)} target="_blank" rel="noopener noreferrer">Discuss in Element</a>
          <button type="button" className="secondary" disabled={state.loading} onClick={() => void store.load(activity.id)}>Refresh discussion</button>
        </div>
        <p className="muted">Replies are shared with the Matrix room. Attachments and rich formatting are best viewed in Element.</p>
        {state.loading && <p role="status">Loading discussion…</p>}
        {state.error && <p role="alert" className="error">{state.error}</p>}
        {state.more && <button type="button" className="secondary" disabled={state.loading} onClick={() => void store.load(activity.id, true)}>Load older replies</button>}
        <ol className="discussion-messages">{state.messages.map(item => <li key={item.id}><div className="discussion-message-meta"><strong>{item.sender}</strong><small>{new Date(item.timestamp).toLocaleString()}</small></div><p className="preserve">{item.body}</p></li>)}</ol>
        {state.loaded && !state.messages.length && <p>No replies yet.</p>}
        <form onSubmit={async event => {
          event.preventDefault(); setBusy(true); setError('');
          try { await store.reply(activity.id, draft); setDraft(''); }
          catch { setError('Could not confirm your reply. Check the discussion before retrying. Your draft is preserved.'); }
          finally { setBusy(false); }
        }}>
          <div className="discussion-composer">
          <label>Reply to discussion<textarea rows={2} placeholder="Write a reply…" maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)} disabled={busy || !state.canReply} /></label>
          <button type="submit" disabled={busy || !state.canReply || !draft.trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
          </div>
          {!state.canReply && <p className="muted">Replying requires a live connection and room message permission.</p>}
        </form>
      </> : <>
        <p>No discussion has been started for this activity.</p>
        {state.canStart ? <><p className="muted">Starting a discussion posts a room announcement, even when automatic announcements are off.</p><button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { await store.start(activity); }
          catch { setError('Could not finish starting the discussion. A room announcement may already exist; retrying in this session reuses it.'); }
          finally { setBusy(false); }
        }}>{busy ? 'Starting…' : 'Start discussion'}</button></> : <p className="muted">An organiser can start the discussion.</p>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  </details>;
}
