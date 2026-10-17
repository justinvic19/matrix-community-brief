import { useEffect, useRef, useState } from 'react';
import { connectMatrix, normalizeHomeserver, validateRoomId } from './matrix/client';
import { signInWithMatrix, type DeviceAuthorizationPrompt, type OAuthSession } from './matrix/auth';
import { forgetOAuthSession, loadOAuthSession, saveOAuthSession } from './matrix/authSessionCache';
import { defaultConnection, forgetConnection, loadLinkedConnection, saveConnection, type ConnectionPreferences } from './connectionCache';
import { defaultElementWebUrl, matrixServerName, normalizeElementWebUrl } from './matrix/roomLink';
import type { BriefStore } from './matrix/eventStore';
import { BriefPage } from './features/community-brief/BriefPage';
import { PublicBriefPage } from './features/community-brief/PublicBriefPage';
import { publicTarget } from './matrix/publicBrief';

export default function App() {
  const [publicRoom] = useState(() => publicTarget(window.location.href));
  const [showConnection, setShowConnection] = useState(false);
  const [joinOnConnect, setJoinOnConnect] = useState(false);
  const [store, setStore] = useState<BriefStore | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [roomId, setRoomId] = useState('');
  const [elementWebUrl, setElementWebUrl] = useState('');
  const [connection, setConnection] = useState(loadLinkedConnection);
  const [oauthSession, setOAuthSession] = useState(loadOAuthSession);
  const [usingOAuthSession, setUsingOAuthSession] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState<DeviceAuthorizationPrompt | null>(null);
  const [storageMessage, setStorageMessage] = useState('');
  const active = useRef<BriefStore | null>(null);
  const generation = useRef(0);
  const loginAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current++; loginAbort.current?.abort(); active.current?.close(); }, []);

  function disconnect() {
    generation.current++;
    loginAbort.current?.abort();
    loginAbort.current = null;
    setLoginPrompt(null);
    active.current?.close();
    active.current = null;
    setStore(null);
    setUsingOAuthSession(false);
    setBusy(false);
  }

  function changeConnection(field: keyof ConnectionPreferences, value: string) {
    const next = { ...connection, [field]: value };
    // A custom web client belongs to the saved homeserver, not the next provider.
    if (field === 'homeserver' && value !== connection.homeserver) { delete next.elementWebUrl; next.token = ''; }
    setConnection(next);
    setStorageMessage(saveConnection(next) ? '' : 'Browser storage is unavailable. You can still connect, but these changes will not be remembered after a reload.');
  }

  function forget() {
    disconnect();
    setOAuthSession(null);
    setConnection(defaultConnection());
    setError('');
    const connectionRemoved = forgetConnection();
    const sessionRemoved = forgetOAuthSession();
    setStorageMessage(connectionRemoved && sessionRemoved ? 'Saved connection removed.' : 'Could not remove every saved credential. Clear this site’s data in your browser settings.');
  }

  async function openRoom(attempt: number, session: OAuthSession | null) {
    const homeserver = connection.homeserver.trim();
    const selectedRoomId = connection.roomId.trim();
    const webUrl = normalizeElementWebUrl(connection.elementWebUrl?.trim() || defaultElementWebUrl(homeserver));
    const token = session?.accessToken ?? connection.token.trim();
    const connected = await connectMatrix({
      homeserver,
      token,
      roomId: selectedRoomId,
      ...(joinOnConnect ? { joinRoom: true } : {}),
      refreshToken: session?.refreshToken,
      oauthClientId: session?.oauthClientId,
      deviceId: session?.deviceId,
      onTokenRefresh: session ? tokens => {
        const updated = {
          ...session,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? session.refreshToken,
        };
        setOAuthSession(updated);
        setStorageMessage(saveOAuthSession(updated) ? '' : 'The refreshed session is active in this tab, but could not be saved for a reload.');
      } : undefined,
    });
    if (generation.current !== attempt) { connected.close(); return; }
    active.current = connected;
    setRoomId(selectedRoomId);
    setElementWebUrl(webUrl);
    setUsingOAuthSession(!!session);
    setStore(connected);
  }

  async function connectWithSavedSession() {
    if (!oauthSession) return;
    const attempt = ++generation.current;
    setBusy(true);
    setError('');
    try {
      if (normalizeHomeserver(connection.homeserver) !== oauthSession.homeserver) throw new Error('Sign in to the selected homeserver before reconnecting this account.');
      validateRoomId(connection.roomId.trim());
      await openRoom(attempt, oauthSession);
    }
    catch (cause) { if (generation.current === attempt) setError((cause as Error).message); }
    finally { if (generation.current === attempt) setBusy(false); }
  }

  async function startMatrixSignIn() {
    const attempt = ++generation.current;
    const controller = new AbortController();
    loginAbort.current = controller;
    setBusy(true);
    setError('');
    setLoginPrompt(null);
    try {
      normalizeHomeserver(connection.homeserver.trim());
      validateRoomId(connection.roomId.trim());
      normalizeElementWebUrl(connection.elementWebUrl?.trim() || defaultElementWebUrl(connection.homeserver));
      const session = await signInWithMatrix(connection.homeserver, prompt => {
        if (generation.current === attempt) setLoginPrompt(prompt);
      }, controller.signal);
      if (generation.current !== attempt) return;
      setOAuthSession(session);
      setStorageMessage(saveOAuthSession(session) ? '' : 'Sign-in completed, but this browser tab could not save the renewed session for a reload.');
      await openRoom(attempt, session);
    } catch (cause) {
      if (generation.current === attempt && (cause as Error).name !== 'AbortError') setError((cause as Error).message);
    } finally {
      if (generation.current === attempt) {
        loginAbort.current = null;
        setLoginPrompt(null);
        setBusy(false);
      }
    }
  }

  return <main><header><div className="eyebrow">MATRIX HACK DAY · EXPLORATORY PROTOTYPE</div><h1>Living Community Brief</h1><p>The current plan, shared with your community.</p></header>
    {!store && publicRoom && !showConnection ? <PublicBriefPage target={publicRoom} onConnect={activityId => {
      changeConnection('roomId', publicRoom.roomId);
      if (activityId) window.location.hash = `activity-${encodeURIComponent(activityId)}`;
      setShowConnection(true);
      setJoinOnConnect(true);
    }} /> : !store ? <form className="card" onSubmit={async event => {
      event.preventDefault();
      if (!connection.token.trim()) { setError('Paste an access token, or use Sign in with Matrix for automatic renewal.'); return; }
      const attempt = ++generation.current;
      setBusy(true);
      setError('');
      try { await openRoom(attempt, null); }
      catch (cause) { if (generation.current === attempt) setError((cause as Error).message); }
      finally { if (generation.current === attempt) setBusy(false); }
    }}><h2>Connect to your room</h2><p>Join the room in Element first, then enter its room ID below.</p>{error && <p role="alert" className="error">{error}</p>}
      <fieldset disabled={busy}>
        <h3>Room to open</h3>
        <label>Room ID<input name="roomId" placeholder="!room:example.org" value={connection.roomId} onChange={e => changeConnection('roomId', e.target.value)} required /></label>
        <h3>Your Matrix account</h3>
        {publicRoom && <>
          <p className="notice">Connect using your own Matrix account. After connecting, confirm your sign-up on the activity.</p>
          <label className="join-public-room"><input type="checkbox" checked={joinOnConnect} onChange={event => setJoinOnConnect(event.target.checked)} /> Join this room when connecting</label>
          <button type="button" className="secondary" disabled={busy} onClick={() => setShowConnection(false)}>Back to public activities</button>
        </>}
        <p className="muted" id="homeserver-help">Use your account's homeserver API URL, not the room creator's server or the Element website. Your access token must belong to this server. Changing server clears the manual token.</p>
          <label>Homeserver URL<input name="homeserver" type="url" placeholder="https://matrix.org" value={connection.homeserver} onChange={e => changeConnection('homeserver', e.target.value)} aria-describedby="homeserver-help" required /></label>
        <p className="muted">Sign in through your homeserver. No pasted token needed.</p>
        {oauthSession && oauthSession.homeserver === (() => { try { return normalizeHomeserver(connection.homeserver); } catch { return ''; } })() && <button type="button" onClick={() => void connectWithSavedSession()}>{busy ? 'Connecting…' : `Continue as ${oauthSession.userId}`}</button>}
        <button type="button" onClick={() => void startMatrixSignIn()}>{busy ? 'Signing in…' : oauthSession ? 'Sign in with a different account' : 'Sign in with Matrix'}</button>
        {loginPrompt && <div className="notice" role="status">
          <p>Approve this app to access Matrix, then return here.</p>
          <p><a href={loginPrompt.verificationUriComplete || loginPrompt.verificationUri} target="_blank" rel="noopener noreferrer">Open the homeserver sign-in page</a></p>
          <p>Enter this one-time code: <strong className="device-code">{loginPrompt.userCode}</strong></p>
        </div>}
        <section className="manual-connection" aria-label="Connect with an access token">
          <h3>Or use an access token</h3>
          <div className="manual-connection-fields">
            <label>Matrix access token (manual option)<input name="token" type="password" autoComplete="off" value={connection.token} onChange={e => changeConnection('token', e.target.value)} /></label>
            <button type="submit">{busy ? 'Connecting…' : 'Connect with access token'}</button>
          </div>
        </section>
        <details className="element-settings"><summary>Element room links</summary>
          <label>Element Web URL (optional)<input name="elementWebUrl" type="url" placeholder={defaultElementWebUrl(connection.homeserver)} value={connection.elementWebUrl ?? ''} onChange={e => changeConnection('elementWebUrl', e.target.value)} aria-describedby="element-web-help" /></label>
          <p id="element-web-help" className="muted">Use the address of the Element website where you are signed in. Leave blank to use {defaultElementWebUrl(connection.homeserver)}. Changing homeserver resets this preference.</p>
        </details>
      </fieldset>{busy && <button type="button" className="secondary" onClick={disconnect}>Cancel connection</button>}
    </form> : <>
      <aside className="account-panel" aria-label="Your Matrix account">
        <div className="account-identity"><small>Signed in as</small><strong>{store.identity.userId}</strong><small>Account homeserver: {matrixServerName(store.identity.userId)}</small>{usingOAuthSession && <small>Matrix sign-in renews automatically</small>}</div>
        <button className="secondary" onClick={disconnect}>Disconnect</button>
      </aside>
      <BriefPage store={store} roomId={roomId} elementWebUrl={elementWebUrl} />
    </>}
    <button type="button" className="secondary" onClick={forget}>Forget saved connection</button>
    {storageMessage && <p role="status" className="muted">{storageMessage}</p>}
    <footer>One room. One current brief. Stored and synchronised by Matrix.</footer>
  </main>;
}
