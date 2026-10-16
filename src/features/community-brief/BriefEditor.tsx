import { useEffect, useState } from 'react';
import { setTaskCompleted, type Activity } from '../../domain/brief';

function toLocalDateTimeInput(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface PlaceSuggestion { label: string }

function placeLabel(properties: Record<string, unknown>): string {
  const houseNumber = typeof properties.housenumber === 'string' ? properties.housenumber : '';
  const street = typeof properties.street === 'string' ? properties.street : '';
  const streetLine = [houseNumber, street].filter(Boolean).join(' ');
  const parts = [
    typeof properties.name === 'string' ? properties.name : '',
    streetLine,
    typeof properties.postcode === 'string' ? properties.postcode : '',
    typeof properties.city === 'string' ? properties.city : typeof properties.town === 'string' ? properties.town : typeof properties.village === 'string' ? properties.village : '',
    typeof properties.state === 'string' ? properties.state : '',
    typeof properties.country === 'string' ? properties.country : '',
  ].filter(Boolean);
  return parts.filter((part, index) => parts.findIndex(candidate => candidate.toLocaleLowerCase() === part.toLocaleLowerCase()) === index).join(', ');
}

function LocationInput({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const url = new URL('https://photon.komoot.io/api/');
        url.searchParams.set('q', query);
        url.searchParams.set('limit', '6');
        url.searchParams.set('lang', navigator.language.split('-')[0] || 'en');
        const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error('Place search failed.');
        const payload: unknown = await response.json();
        if (controller.signal.aborted) return;
        const features = payload && typeof payload === 'object' && Array.isArray((payload as { features?: unknown }).features)
          ? (payload as { features: unknown[] }).features
          : [];
        const labels = features.flatMap(feature => {
          if (!feature || typeof feature !== 'object') return [];
          const properties = (feature as { properties?: unknown }).properties;
          if (!properties || typeof properties !== 'object') return [];
          const label = placeLabel(properties as Record<string, unknown>);
          return label ? [{ label }] : [];
        });
        setSuggestions(labels);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSearchError(true);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);

  return <>
    <input id="meeting-location" type="text" autoComplete="street-address" list="meeting-place-suggestions" placeholder="Search a venue or enter an address" maxLength={500} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} />
    <datalist id="meeting-place-suggestions">{suggestions.map((suggestion, index) => <option key={`${suggestion.label}-${index}`} value={suggestion.label} />)}</datalist>
    <small className="location-search-status" role="status">{searching ? 'Searching places…' : searchError ? 'Place search is unavailable; you can still enter a location.' : value.trim().length >= 3 ? 'Choose a suggestion or keep your own location text.' : 'Enter at least 3 characters to search for a place.'}</small>
    <small className="location-attribution">Search text is sent to <a href="https://github.com/komoot/photon" target="_blank" rel="noopener noreferrer">Photon</a>. Place data: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>.</small>
  </>;
}

export function BriefEditor({ initial, canEdit, changedRemotely, onSave, onCancel }: { initial: Activity; canEdit: boolean; changedRemotely: boolean; onSave: (activity: Activity) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = (key: keyof Activity, value: string) => setDraft({ ...draft, [key]: value });
  return <form onSubmit={async e => { e.preventDefault(); setSaving(true); setError(''); try { await onSave(draft); } catch (e) { setError((e as Error).message); } finally { setSaving(false); } }}>
    <h2>{initial.title ? 'Edit activity' : 'Add an activity'}</h2>
    {changedRemotely && <p role="status" className="notice">The room activities changed while you were editing. Your draft is preserved. Saving updates this activity against the latest room state.</p>}
    {!canEdit && <p role="alert">Editing is unavailable. Your draft is preserved until you cancel or disconnect.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <fieldset disabled={saving || !canEdit}>
      <label>Activity title<input required maxLength={200} value={draft.title} onChange={e => update('title', e.target.value)} /></label>
      <label>Description<textarea maxLength={4000} value={draft.description} onChange={e => update('description', e.target.value)} /></label>
      <label>Date and time (your local timezone; optional)<input type="datetime-local" value={toLocalDateTimeInput(draft.scheduledAt)} onChange={e => update('scheduledAt', e.target.value ? new Date(e.target.value).toISOString() : '')} /></label>
      <label htmlFor="meeting-location">Meeting location or address<LocationInput value={draft.location} onChange={value => update('location', value)} disabled={saving || !canEdit} /></label>
      <label>Announcement (optional)<textarea maxLength={2000} value={draft.announcement} onChange={e => update('announcement', e.target.value)} /></label>
      <label>Maximum sign-ups (optional)<input type="number" min="1" step="1" value={draft.maxParticipants ?? ''} onChange={e => setDraft({ ...draft, maxParticipants: e.target.value ? Number(e.target.value) : null })} /><small>Leave blank for no limit. This is best-effort: simultaneous sign-ups or restricted room history may affect the count.</small></label>
      <div className="task-heading"><h3>Tasks</h3><button type="button" className="icon-button" aria-label="Add task" title="Add task" onClick={() => setDraft({ ...draft, tasks: [...draft.tasks, { id: crypto.randomUUID(), text: '', completed: false }] })}>+</button></div>
      {draft.tasks.map((task, index) => <div className="task-edit" key={task.id}>
        <input aria-label={`Complete task ${index + 1}`} type="checkbox" checked={task.completed} onChange={e => setDraft(setTaskCompleted(draft, task.id, e.target.checked))} />
        <input aria-label={`Task ${index + 1}`} required maxLength={300} value={task.text} onChange={e => setDraft({ ...draft, tasks: draft.tasks.map(t => t.id === task.id ? { ...t, text: e.target.value } : t) })} />
        <button type="button" className="secondary" aria-label={`Remove task ${index + 1}`} onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter(t => t.id !== task.id) })}>Remove</button>
      </div>)}
    </fieldset>
    <div className="actions"><button type="submit" disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save to Matrix'}</button><button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancel</button></div>
  </form>;
}
