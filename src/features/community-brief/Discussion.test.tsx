import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Discussion } from './Discussion';
import { emptyActivity } from '../../domain/brief';
import type { DiscussionStore } from '../../matrix/discussions';
afterEach(cleanup);
function setup(rootId: string | undefined = '$root') {
  const store: DiscussionStore = {
    subscribe(_id, fn) { fn({ rootId, messages: [{ id: '$reply', body: '<script>unsafe</script>', sender: '@member:example.org', timestamp: 1 }], loaded: true, loading: false, more: true, canReply: true, canStart: true }); return () => {}; },
    load: vi.fn().mockResolvedValue(undefined), start: vi.fn().mockResolvedValue(undefined), reply: vi.fn().mockResolvedValue(undefined),
  };
  render(<Discussion activity={{ ...emptyActivity('a'), title: 'Meetup', announcementLevel: 'off' }} store={store} roomId="!room:example.org" userId="@member:example.org" elementWebUrl="https://app.element.io/" />);
  return store;
}
it('starts collapsed, loads on expansion and safely renders text with an Element link', async () => {
  const store = setup(); const details = document.querySelector('details')!;
  expect(details.open).toBe(false); expect(store.load).not.toHaveBeenCalled();
  details.open = true; fireEvent(details, new Event('toggle'));
  await waitFor(() => expect(store.load).toHaveBeenCalledWith('a'));
  expect(screen.getByText('<script>unsafe</script>')).toBeTruthy(); expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('link', { name: 'Discuss in Element' }).getAttribute('href')).toContain('%24root');
  fireEvent.click(screen.getByRole('button', { name: 'Load older replies' }));
  expect(store.load).toHaveBeenCalledWith('a', true);
});
it('preserves a failed reply and clears it after successful sending', async () => {
  const store = setup(); vi.mocked(store.reply).mockRejectedValueOnce(new Error('offline'));
  document.querySelector('details')!.open = true;
  fireEvent.change(screen.getByLabelText('Reply to discussion'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Reply to discussion') as HTMLTextAreaElement).value).toBe('Hello');
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await screen.findByText('Reply sent.');
  expect((screen.getByLabelText('Reply to discussion') as HTMLTextAreaElement).value).toBe('');
});
it('lets an organiser explicitly start a discussion even when announcements are off', async () => {
  const store = setup(undefined);
  // Explicitly create the root-less variant (undefined uses the default argument).
  cleanup();
  render(<Discussion activity={{ ...emptyActivity('a'), title: 'Meetup', announcementLevel: 'off' }} store={{ ...store, subscribe(_id, fn) { fn({ messages: [], loaded: false, loading: false, more: false, canReply: true, canStart: true }); return () => {}; } }} roomId="!room" userId="@member:example.org" elementWebUrl="https://app.element.io/" />);
  document.querySelector('details')!.open = true;
  fireEvent.click(screen.getByRole('button', { name: 'Start discussion' }));
  await waitFor(() => expect(store.start).toHaveBeenCalled());
});
