import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { connectMatrix } from './matrix/client';
import { loadConnection, saveConnection } from './connectionCache';

vi.mock('./matrix/client', () => ({ connectMatrix: vi.fn() }));
beforeEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/'); vi.mocked(connectMatrix).mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const edit = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const saved = { homeserver: 'https://other.example.org', token: 'fictional-test-token', roomId: '!example-room' };

it('prefills a linked room without accepting linked credentials or connecting automatically', () => {
  saveConnection(saved);
  window.history.replaceState(null, '', '/?roomId=%21linked%3Aexample.org&homeserver=https://untrusted.example&token=untrusted#activity-one');
  render(<App />);
  expect(value('Room ID')).toBe('!linked:example.org');
  expect(value('Homeserver URL')).toBe(saved.homeserver);
  expect(value('Matrix access token (manual option)')).toBe(saved.token);
  expect(connectMatrix).not.toHaveBeenCalled();
});
it('ignores invalid linked rooms and clears tokens when switching account servers', () => {
  saveConnection(saved);
  window.history.replaceState(null, '', '/?roomId=not-a-room');
  render(<App />);
  expect(value('Room ID')).toBe(saved.roomId);
  edit('Homeserver URL', 'https://different.example');
  expect(value('Matrix access token (manual option)')).toBe('');
  expect(loadConnection().token).toBe('');
});

it('defaults the homeserver and restores all last inputs after reopening, without automatically connecting', () => {
  const first = render(<App />);
  expect(value('Homeserver URL')).toBe('https://matrix.org');
  edit('Homeserver URL', saved.homeserver);
  edit('Matrix access token (manual option)', saved.token);
  edit('Room ID', saved.roomId);
  first.unmount(); render(<App />);
  expect(value('Homeserver URL')).toBe(saved.homeserver);
  expect(value('Matrix access token (manual option)')).toBe(saved.token);
  expect(value('Room ID')).toBe(saved.roomId);
  expect(connectMatrix).not.toHaveBeenCalled();
});

it('retains inputs after failed authentication', async () => {
  saveConnection(saved);
  vi.mocked(connectMatrix).mockRejectedValue(new Error('Invalid token'));
  render(<App />); fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Invalid token'));
  expect(value('Matrix access token (manual option)')).toBe(saved.token);
  expect(loadConnection()).toEqual(saved);
});

it('disconnects and removes only this app’s saved connection when forgotten', async () => {
  saveConnection(saved); localStorage.setItem('unrelated', 'keep');
  const close = vi.fn();
  vi.mocked(connectMatrix).mockResolvedValue({ identity: { userId: '@test:example.org', homeserver: saved.homeserver }, close, reconnect: vi.fn(() => true), save: vi.fn(), setSignup: vi.fn(), subscribe(listener) { listener({ brief: null, canEdit: false, canSignup: true, status: 'live', roomName: 'Test room' }); return () => {}; } });
  const view = render(<App />); fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByRole('button', { name: 'Disconnect' });
  fireEvent.click(screen.getByRole('button', { name: 'Forget saved connection' }));
  expect(close).toHaveBeenCalledOnce();
  view.unmount(); render(<App />);
  expect(value('Homeserver URL')).toBe('https://matrix.org');
  expect(value('Matrix access token (manual option)')).toBe(''); expect(value('Room ID')).toBe('');
  expect(localStorage.length).toBe(1); expect(localStorage.getItem('unrelated')).toBe('keep');
});

it('allows connecting even when the browser cannot save inputs', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  vi.mocked(connectMatrix).mockRejectedValue(new Error('Test connection attempted'));
  render(<App />); edit('Matrix access token (manual option)', saved.token); edit('Room ID', saved.roomId);
  expect(screen.getByText(/Browser storage is unavailable/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByRole('alert');
  expect(connectMatrix).toHaveBeenCalledWith({ ...saved, homeserver: 'https://matrix.org' });
});

it('remembers a custom Element URL and uses it only for room links', async () => {
  saveConnection(saved);
  const first = render(<App />);
  fireEvent.click(screen.getByText('Element room links'));
  edit('Element Web URL (optional)', 'https://my-element.example.org/app/#/room/!previous');
  first.unmount(); render(<App />);
  expect(value('Element Web URL (optional)')).toBe('https://my-element.example.org/app/#/room/!previous');
  vi.mocked(connectMatrix).mockResolvedValue({ identity: { userId: '@test:example.org', homeserver: saved.homeserver }, close: vi.fn(), reconnect: vi.fn(() => true), save: vi.fn(), setSignup: vi.fn(), subscribe(listener) { listener({ brief: null, canEdit: false, canSignup: true, status: 'live', roomName: 'Test room' }); return () => {}; } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  const link = await screen.findByRole('link', { name: /Open Test room in Element/ });
  expect(link.getAttribute('href')).toBe('https://my-element.example.org/app/#/room/!example-room?via=example.org');
  expect(link.getAttribute('href')).not.toContain(saved.token);
  expect(connectMatrix).toHaveBeenCalledWith(saved);
});

it('clears the old provider’s web client override when switching homeserver', () => {
  saveConnection({ ...saved, elementWebUrl: 'https://custom.example.org/' });
  render(<App />);
  edit('Homeserver URL', 'https://matrix.sk.community');
  expect(value('Element Web URL (optional)')).toBe('');
  expect(screen.getByLabelText('Element Web URL (optional)').getAttribute('placeholder')).toBe('https://chat.sk.community/');
  expect(loadConnection().elementWebUrl).toBeUndefined();
});

it('rejects an unsafe cached Element URL before authenticating', async () => {
  saveConnection({ ...saved, elementWebUrl: 'https://user:secret@example.org/' });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/without credentials/));
  expect(connectMatrix).not.toHaveBeenCalled();
});

