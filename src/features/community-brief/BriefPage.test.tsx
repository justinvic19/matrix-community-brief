import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyActivity, emptyBrief } from '../../domain/brief';
import type { BriefStore, Snapshot } from '../../matrix/eventStore';
import { BriefPage } from './BriefPage';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup(canEdit = true, identity: BriefStore['identity'] = { userId: '@test:example.org', homeserver: 'https://matrix.example.org' }) {
  let listener: (state: Snapshot) => void = () => {};
  let state: Snapshot = { brief: { ...emptyBrief(), activities: [{ ...emptyActivity('original'), title: 'Original plan' }] }, status: 'live', canEdit, canSignup: true, signups: {} };
  const unsubscribe = vi.fn();
  const store: BriefStore = { identity, subscribe(fn) { listener = fn; fn(state); return unsubscribe; }, reconnect: vi.fn(() => true), save: vi.fn().mockResolvedValue(undefined), setSignup: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
  const view = render(<BriefPage store={store} roomId="!test:example.org" />);
  return { ...view, store, unsubscribe, incoming(update: Partial<Snapshot>) { state = { ...state, ...update }; act(() => listener(state)); } };
}
it('applies incoming updates to the view and unsubscribes on unmount', () => {
  const app = setup();
  app.incoming({ brief: { ...emptyBrief(), activities: [{ ...emptyActivity('new'), title: 'New meeting place' }] } });
  expect(screen.getByRole('heading', { name: 'New meeting place' })).toBeTruthy();
  app.unmount(); expect(app.unsubscribe).toHaveBeenCalled();
});
it('shows a reconnect button when sync is interrupted', async () => {
  const app = setup(); const user = userEvent.setup();
  app.incoming({ status: 'offline', error: 'Sync interrupted. Displayed information may be out of date.' });
  await user.click(screen.getByRole('button', { name: 'Reconnect' }));
  expect(app.store.reconnect).toHaveBeenCalledOnce();
  expect(screen.getByText('Retrying Matrix sync now…')).toBeTruthy();
});
it.each([
  ['@member:matrix.org', 'https://matrix.org', 'matrix.org', 'app.element.io'],
  ['@member:sk.community', 'https://matrix.sk.community', 'sk.community', 'chat.sk.community'],
])('shows the creator’s homeserver and links to the viewer’s Element client for %s', (userId, homeserver, server, webHost) => {
  const app = setup(false, { userId, homeserver });
  app.incoming({ roomName: 'Shared activity room', roomCreatorUserId: '@roomcreator:matrix.org', roomCreatorServer: 'matrix.org' });
  expect(screen.getByText(/Created by/).textContent).toContain('@roomcreator:matrix.org');
  expect(screen.getByText('Homeserver API URL').nextElementSibling?.textContent).toBe(homeserver);
  expect(screen.getByText('Room creator’s Matrix ID').nextElementSibling?.textContent).toBe('@roomcreator:matrix.org');
  expect(screen.getByText('Creator account’s homeserver').nextElementSibling?.textContent).toBe('matrix.org');
  const link = screen.getByRole('link', { name: /Open Shared activity room in Element/ });
  const url = new URL(link.getAttribute('href')!);
  expect(url.hostname).toBe(webHost);
  expect(new URLSearchParams(url.hash.split('?')[1]).get('via')).toBe(server);
  expect(decodeURIComponent(url.hash.split('?')[0])).toBe('#/room/!test:example.org');
  expect(link.getAttribute('rel')).toContain('noopener');
  expect(link.getAttribute('target')).toBe('_blank');
});
it('allows viewing but disables editing for participants', () => {
  setup(false); expect(screen.getByRole('heading', { name: 'Original plan' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add activity' })).toBeNull();
});
it('keeps the activity compact and lets viewers expand its details', async () => {
  const app = setup();
  app.incoming({ brief: { ...emptyBrief(), activities: [{ ...emptyActivity('clean-up'), title: 'Community clean-up', description: 'A short description', announcement: 'Bring spare gloves', location: 'Community Hall', tasks: [{ id: 'task-1', text: 'Bring gloves', completed: false }] }] } });
  const details = document.querySelector('.activity-details') as HTMLDetailsElement;
  expect(details.open).toBe(false);
  expect(details.querySelector('.summary-icon--date')).toBeTruthy();
  expect(details.querySelector('.summary-icon--location')).toBeTruthy();
  expect(document.querySelector('.activity-signup-summary .summary-icon--people')).toBeTruthy();
  expect(screen.getAllByText('Community Hall').length).toBe(2);
  await userEvent.setup().click(screen.getByText('Community clean-up'));
  expect(details.open).toBe(true);
  const activityContent = details.querySelector('.activity-content')!;
  expect(activityContent.querySelector('.activity-announcement strong')?.textContent).toBe('Announcement');
  expect(activityContent.firstElementChild?.classList.contains('activity-announcement')).toBe(true);
  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy();
  expect(screen.getByText('Bring spare gloves')).toBeTruthy();
  expect(screen.getByText('Bring gloves')).toBeTruthy();
});
it('lets a room member sign up and displays the count against the activity limit', async () => {
  const app = setup(false); const user = userEvent.setup();
  app.incoming({ brief: { ...emptyBrief(), activities: [{ ...emptyActivity('clean-up'), title: 'Community clean-up', maxParticipants: 2 }] }, signups: { 'clean-up': ['@friend:example.org'] } });
  const details = document.querySelector('.activity-details') as HTMLDetailsElement;
  expect(details.open).toBe(false);
  await user.click(document.querySelector('.collapsed-signup button') as HTMLButtonElement);
  expect(app.store.setSignup).toHaveBeenCalledWith('clean-up', true);
  expect(details.open).toBe(false);
  await user.click(screen.getByText('Community clean-up'));
  expect(screen.getByText('1 / 2')).toBeTruthy();
  expect(screen.getByText('@friend:example.org')).toBeTruthy();
});
it('shows a going status while collapsed and reveals cancellation from the expanded sign-up menu', async () => {
  const app = setup(false); const user = userEvent.setup();
  app.incoming({ brief: { ...emptyBrief(), activities: [{ ...emptyActivity('meeting'), title: 'Planning meeting' }] }, signups: { meeting: ['@test:example.org'] } });
  const activity = document.querySelector('.activity-details') as HTMLDetailsElement;
  const collapsedMenu = document.querySelector('.collapsed-cancel-menu') as HTMLDetailsElement;
  expect(collapsedMenu.querySelector('summary')?.textContent).toBe('You’re going');
  expect(activity.open).toBe(false);
  await user.click(collapsedMenu.querySelector('summary')!);
  await user.click(collapsedMenu.querySelector('button')!);
  expect(app.store.setSignup).toHaveBeenCalledWith('meeting', false);
  expect(activity.open).toBe(false);
  await user.click(screen.getByText('Planning meeting'));
  const cancelMenu = document.querySelector('.signup-cancel-menu') as HTMLDetailsElement;
  expect(cancelMenu).not.toBe(collapsedMenu);
  expect(cancelMenu.parentElement?.classList.contains('signup-action')).toBe(true);
  expect(cancelMenu.open).toBe(false);
  await user.click(cancelMenu.querySelector('summary')!);
  await user.click(cancelMenu.querySelector('button')!);
  expect(app.store.setSignup).toHaveBeenCalledTimes(2);
});
it('publishes edits through the store', async () => {
  const app = setup(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit activity' }));
  await user.clear(screen.getByLabelText('Activity title')); await user.type(screen.getByLabelText('Activity title'), 'Updated plan');
  await user.click(screen.getByRole('button', { name: 'Save to Matrix' }));
  expect(app.store.save).toHaveBeenCalledWith(expect.objectContaining({ activities: [expect.objectContaining({ title: 'Updated plan' })] }));
});
it('adds a second activity without replacing the first', async () => {
  const app = setup(); const user = userEvent.setup();
  const addActivity = screen.getByRole('button', { name: 'Add activity' });
  expect(addActivity.textContent).toBe('+');
  await user.click(addActivity);
  await user.type(screen.getByLabelText('Activity title'), 'Planning meeting');
  await user.click(screen.getByRole('button', { name: 'Save to Matrix' }));
  const savedBrief = vi.mocked(app.store.save).mock.calls[0][0];
  expect(savedBrief.activities.map(activity => activity.title)).toEqual(['Original plan', 'Planning meeting']);
});
it('removes an activity by publishing the remaining list', async () => {
  const app = setup(); const user = userEvent.setup();
  vi.stubGlobal('confirm', vi.fn(() => true));
  await user.click(screen.getByRole('button', { name: 'Remove activity' }));
  expect(app.store.save).toHaveBeenCalledWith(expect.objectContaining({ activities: [] }));
});
it('edits the schedule with a local date-time picker and accepts a venue address', async () => {
  const app = setup(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit activity' }));
  const dateTime = screen.getByLabelText(/Date and time/) as HTMLInputElement;
  expect(dateTime.type).toBe('datetime-local');
  const participantLimit = screen.getByLabelText(/Maximum sign-ups \(optional\)/) as HTMLInputElement;
  await user.clear(participantLimit); await user.type(participantLimit, '12');
  expect(screen.getByRole('button', { name: 'Add task' }).textContent).toBe('+');
  await user.type(dateTime, '2026-10-24T10:00');
  const location = screen.getByLabelText(/Meeting location or address/) as HTMLInputElement;
  expect(location.autocomplete).toBe('street-address');
  await user.type(location, 'Community Hall, High Street');
  await user.click(screen.getByRole('button', { name: 'Save to Matrix' }));
  const saved = vi.mocked(app.store.save).mock.calls[0][0];
  expect(saved.activities[0].scheduledAt).toBe(new Date('2026-10-24T10:00').toISOString());
  expect(saved.activities[0].location).toBe('Community Hall, High Street');
  expect(saved.activities[0].maxParticipants).toBe(12);
});
it('offers selectable place suggestions while keeping free-text locations available', async () => {
  const fetchPlaces = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features: [{ properties: { name: 'Central Library', housenumber: '10', street: 'High Street', postcode: 'AB1 2CD', city: 'Town', country: 'United Kingdom' } }] }),
  });
  vi.stubGlobal('fetch', fetchPlaces);
  setup(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit activity' }));
  await user.type(screen.getByLabelText(/Meeting location or address/), 'Central Library');
  await waitFor(() => expect(fetchPlaces).toHaveBeenCalled());
  await waitFor(() => expect(document.querySelector('#meeting-place-suggestions option')?.getAttribute('value')).toBe('Central Library, 10 High Street, AB1 2CD, Town, United Kingdom'));
  expect(screen.getByText(/Search text is sent to/)).toBeTruthy();
});
it('preserves drafts when remote updates arrive and disables save on permission loss', async () => {
  const app = setup(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit activity' }));
  app.incoming({ brief: { ...emptyBrief(), activities: [{ ...emptyActivity('remote'), title: 'Remote update' }] }, canEdit: false });
  expect((screen.getByLabelText('Activity title') as HTMLInputElement).value).toBe('Original plan');
  expect(screen.getByText(/room activities changed/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Save to Matrix' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('heading', { name: 'Remote update' })).toBeTruthy();
});
it('keeps the draft and displays a failed save', async () => {
  const app = setup(); vi.mocked(app.store.save).mockRejectedValue(new Error('Permission denied by homeserver'));
  const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Edit activity' })); await user.click(screen.getByRole('button', { name: 'Save to Matrix' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Permission denied'));
  expect(screen.getByLabelText('Activity title')).toBeTruthy();
});
it('shows loading, empty and malformed-state errors', () => {
  const app = setup(); app.incoming({ brief: null, status: 'loading' }); expect(screen.getByText('Loading room state…')).toBeTruthy();
  app.incoming({ status: 'live' }); expect(screen.getByText(/No brief has been published/)).toBeTruthy();
  app.incoming({ error: 'Malformed state', canEdit: false }); expect(screen.getByRole('alert').textContent).toBe('Malformed state');
});
