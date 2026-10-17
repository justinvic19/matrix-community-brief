# Website setup and reference

[Back to project overview](../README.md) · [Deployment](deployment.md) · [WhatsApp tool](../server/chat-hackers/README.md)

## Prepare two test accounts in Element

1. Use dedicated development accounts A and B on an existing homeserver. Sign into Element Web/Desktop separately for each account.
2. As A, create a **private, unencrypted** test room with fictional information. Turn encryption off during creation. If your client or server requires encryption, use another permitted test room/client; an already encrypted room cannot be made unencrypted by this app.
3. Leave “Block anyone not part of homeserver” disabled if you intend to test federation. Invite B using its full Matrix ID and accept the invitation as B in Element.
4. In room settings → Advanced, copy the exact **Internal Room ID** beginning with `!`, not a `#…:server` alias or matrix.to link. Room version 12 IDs have no server suffix; older IDs look like `!…:server`. Never append a server name to the copied ID.
5. Keep A as the room administrator and B as an ordinary member. The app never changes power levels.

See Element's [room creation guide](https://docs.element.io/latest/element-support/matrix-rooms/getting-started-creating-a-room/) and [room settings guide](https://docs.element.io/latest/element-support/matrix-rooms/managing-a-room-room-settings/). Labels can vary between Element versions.

### Obtain a development token safely

The recommended option is **Sign in with Matrix**. It uses the homeserver's OAuth device flow, so the app receives a refresh token and renews access as needed. The homeserver may ask you to approve the app with a one-time code. When available, the OAuth session is stored in the current tab's session storage and lasts until the tab is closed or the server ends the session.

For a server without OAuth device sign-in, the manual option remains available. In Element Web/Desktop, open your profile → All Settings → Help & About → Access Token, then reveal/copy it locally. Use the homeserver URL for that same account. Pasted access tokens do not renew automatically. See [Element's Client-Server API guide](https://docs.element.io/latest/element-support/advanced-administration/getting-started-using-the-client-server-api/).

The token grants account access: paste it only into this local app connected to your trusted homeserver. Do not send it in chat, commit it, put it in a URL, or include it in screenshots/logs. If your Element version does not expose a token, obtain a development token using that homeserver's supported account tooling.

The homeserver defaults to `https://matrix.org`. The app remembers the last entered homeserver, manual access token and room ID in this browser's local storage as you edit them, including before you connect. A saved homeserver overrides the default. Reloading restores the fields; press **Continue as…** to reconnect an OAuth session or **Connect** to use the pasted token. OAuth credentials are held separately in tab-scoped session storage, so two tabs can sign in to different accounts.

The saved manual token is not encrypted in local storage and is accessible to scripts running on this app's origin, so use a trusted browser profile and development account. OAuth access and refresh tokens are kept in session storage for the current tab and are also accessible to scripts on this origin. **Forget saved connection** removes this app's saved fields and tab session, then restores the default homeserver. **Disconnect** stops sync but retains the saved fields and OAuth session. Browser storage is specific to the site address and port; changing between `localhost` and `127.0.0.1`, or changing ports, uses a separate saved connection. SDK room data still uses memory stores. When finished, use the homeserver's device/session management to end the app's session. JavaScript cannot guarantee secure erasure of strings from memory.

## Manual integration checklist

### Public viewing

New activity-parent links carry `roomId` and `publicServer` parameters. Organisers
can also use **Open public viewing link** on the connected brief and share that URL.
`publicServer` is an HTTPS Matrix client API base URL with access to the room; it
does not replace the visitor's account homeserver. Room IDs alone, particularly
opaque v12 IDs, do not identify a server from which to fetch state. Older links
without the viewing-server parameter continue to open the connection form.

The landing page shows a read-only activity list before sign-in only when the room
has both public join rules and `world_readable` history, is unencrypted, and the
server permits preview reads. **Public join access alone is insufficient.** The
app does not change room visibility or permissions. If the server requires a token,
it requests a disposable guest account and keeps that guest token only in memory.
Guest registration is optional server functionality; if disabled, the page offers
sign-in instead. Viewing never joins the room and never uses the visitor's saved
token or cookies. Guest accounts may remain on the server after the tab closes.

Public viewing shows brief content only, without sign-up counts, participant lists
or discussion history. **Refresh** fetches a new snapshot and rechecks visibility.
It is not live sync. **Sign in to sign up** opens the connection form with the room
and activity retained and an explicit **Join this room when connecting** checkbox.
The visitor uses their own account homeserver, signs in or pastes a token, and then
confirms sign-up in the authenticated activity view. Joining can still be refused
by the server. No sign-up or message is sent merely by signing in.

Test with a signed-out browser on a server supporting guest previews, then repeat
with restricted history, an encrypted room and a server with guest access disabled.
Check that changing history visibility prevents subsequent public reads. Automated
tests mock these cases; live server compatibility still needs verification.

See the [Matrix guest-access and room-preview specification](https://spec.matrix.org/v1.19/client-server-api/#guest-access).

### Room announcements

Each activity has one linked parent room message, with creation, update, removal,
sign-up, withdrawal, and human discussion messages all sent as thread replies.
The website's collapsible **Discussion** shows only human discussion: structured
activity and sign-up notices are filtered out, including from its reply count.
Sign-ups and withdrawals contain no added URL or HTML link.

New enabled activity announcements create a neutral **Activity: [title]** parent.
New parents include the scheduled day, month and time in UTC (or **Time to be
confirmed**). Attendance notices say **signed up for the activity** or **withdrew
from the activity**, without repeating its name.
Before an app action posts to a thread, its parent is checked for Matrix redaction.
Organisers can automatically create and save a replacement parent; members without
discussion-state permission need an organiser to restore it. Network/access errors
do not cause replacement messages. Existing replies remain in the old thread;
they cannot be moved to the replacement. Existing undeleted parent text is unchanged.
Existing per-activity discussion roots are reused to preserve conversations; old
messages are not rewritten or moved. The former shared community feed is no
longer used. For an activity without a root (including announcements-off activities),
an organiser must use **Start discussion** before ordinary members can sign up.
An organiser's own sign-up can create the missing root. **Discuss in
Element** opens the root message, where participants can open its thread.

Expand Discussion to load the latest 30 replies. **Load older replies** paginates
the thread; **Refresh discussion** retries loading or checks for missed updates.
Loaded discussions receive live replies, edits and redactions. The website shows
plain text, not Matrix HTML; use Element for rich media, reactions, and moderation.
Room members with message permission can reply without brief-edit permission.
Failed replies keep their draft, and offline reply submission is disabled.

For old activities or activities with automatic announcements off, an organiser
can choose **Start discussion**. This explicitly posts a root notice even when
automatic announcements are off. Existing historical announcements are not
automatically adopted. Root IDs are stored in the separate room state event
`com.example.community_brief.discussion`, keyed by activity ID. Creating a root
requires both brief-edit permission and permission to send that state event;
normal reply sending only requires room-message permission. Roots survive reloads
and activity deletion, so past conversations remain accessible in Element.

Root creation and saving its state mapping are separate requests. If the mapping
fails, retrying in the same session reuses the accepted root. Closing the tab
before recovery can leave an unlinked notice. Simultaneous organisers starting
the same discussion can create competing roots; Matrix resolves the state mapping.
The displayed history is limited to what the viewer's homeserver allows them to
read. Check with two real accounts after deployment: create an activity, reply
from Element and the website, reload, page through replies, update/remove the
activity, and test announcement-off and read-only organiser permissions.

Each activity editor has a **Room announcements** setting: **Off**, **Creation
and deletion only**, or **All changes** (the default, including older activities).
The preference is stored with the activity and can be changed by organisers with
brief-edit permission. Deletion uses the activity's last saved preference.
Settings-only changes and unchanged saves do not post notices.

After an accepted activity change, this app posts an `m.notice` in the same room.
Activity titles in lifecycle notices link to the
published brief site and expand that activity after the viewer connects to the
appropriate room. New links include a `roomId` query parameter that prefills the
connection form, overriding only the saved room selection. They never choose a
homeserver, supply a token, or connect automatically. The visitor uses their own
account's homeserver and credentials. Changing homeserver clears the manual token.
The room ID is visible to anyone with the link; Matrix still enforces membership.
Removed activities no longer have a card; their links still
open the brief. Links contain no credentials. The deployment URL is configured
in `src/matrix/announcements.ts`; update it if moving the site.

Sign-up messages remain visible because they record participation, independently
of the organiser's activity-change setting. Notices do not request mentions or
room-wide pings; actual notifications depend on the viewer's Matrix client.
The existing Announcement text field remains content inside the activity card.

State saves and announcement sends are separate Matrix requests. If the save
succeeds but a notice cannot be confirmed, the UI reports that partial success
without asking you to save again. Check Element before posting a notice manually.
Announcements are best-effort: closing the tab after saving can interrupt them;
concurrent edits still have the whole-document conflict limitations below.
Only changes saved through this version of the app generate these notices;
receiving sync events does not repost them. Existing room messages are unchanged.

Verify on the deployed site: create, edit, and delete a test activity; click its
linked title in Element; repeat with each announcement setting; and sign up and
withdraw from another account. Automated coverage uses mocked Matrix requests.

First use two accounts on the **same** homeserver:

- [ ] Open the app in two tabs/windows. Connect A and B using their respective tokens and the same room ID.
- [ ] A sees an empty room brief and can add an activity. B can view but cannot edit with the usual room defaults.
- [ ] A adds multiple activities, each with a title, description, date/time, location, announcement and tasks, then saves each one.
- [ ] B receives the brief automatically without reloading.
- [ ] A changes the location and task completion, then saves. B sees both changes.
- [ ] Reload A's tab, choose **Continue as…**, and confirm OAuth sign-in can resume and the brief survives. With a manual access token, paste a current token again if it has expired.
- [ ] In browser developer tools → Network, inspect the state PUT (keep headers private): `/rooms/{roomId}/state/com.example.community_brief/main`. Confirm the JSON content. Subsequent `/sync` responses deliver the room's current state.
- [ ] Temporarily disconnect the network: the app reports interrupted sync and disables editing; reconnect and verify recovery. Confirm invalid tokens and wrong room IDs produce useful errors.

Then repeat with B on a **different existing homeserver**. Invite and join B in Element first. B must connect the app to **B's own homeserver**, with B's token, but use the **same room ID**. A writes to A's homeserver; Matrix federation replicates the room event; B learns the current state through its own homeserver's sync. Allow for federation latency and server policies. A room created with federation disabled cannot be repaired by this app.

The separate account panel shows your authenticated Matrix user ID and account server. The room card shows “Viewing through” that account's server. Expand “Room and connection details” to see the exact homeserver API URL, Element Web URL, room ID, and original creator's server (from the sender of `m.room.create`). For example, a room created by an account on `matrix.org` can be accessed through `https://matrix.sk.community` by an account on `sk.community`. The creator's server describes the room's origin, not an exclusive host or current owner, and is separate from the current viewer's server.

### Opening the room in Element

Click the room name to open it in a new tab. For the providers used in this prototype, `https://matrix.org` and `https://matrix-client.matrix.org` default to `https://app.element.io/`, while `https://matrix.sk.community` defaults to `https://chat.sk.community/`. Other homeservers fall back to `https://app.element.io/`; the app does not guess a chat subdomain. Before connecting, expand **Element room links** to enter the Element website where you are signed in. Custom installations under a subpath are supported. The override is remembered with the saved connection and cleared when the homeserver input changes, preventing a previous provider's client setting from carrying over.

The link includes the exact room ID and a `via` hint using the authenticated account's Matrix server name (for example `sk.community`, not the API hostname `matrix.sk.community`). It never includes an access token. Element uses its own login session on the selected web address; the link does not sign you in or switch Element accounts. Switching the prototype's account therefore cannot switch an existing Element session automatically.

Live login, persistence, two-client sync and federation have **not** been verified against real accounts in this implementation session. The checklist above is the remaining acceptance test.

## How it works

```text
React view/editor → BriefStore → matrix-js-sdk → account's homeserver
                                       ↕ /sync + state API
                                 shared Matrix room
```

- `src/matrix/client.ts`: validates the server URL, authenticates with `whoami`, starts/stops sync, reads room state, checks membership/encryption and delegates permissions to the SDK. `ClientEvent.Sync` and `RoomStateEvent.Events` notify the store's subscribers. It waits for initial sync before treating absent brief state as empty.
- `src/matrix/eventStore.ts`: the small UI-facing store contract and validated publishing operation. Server errors are translated without echoing raw server responses.
- `src/matrix/custom-events.d.ts`: extends the SDK's `StateEvents` typing for this custom event; no unsafe cast is needed for publishing.
- `src/domain/brief.ts`: version-3 activity-list schema, parsing and immutable task updates. Existing version-1 single-activity and version-2 activity-list briefs are migrated in memory and carried forward on the next save. Unknown schema versions, bad dates and malformed activities or tasks are rejected. An absent state slot is distinct from malformed existing content.
- `src/features/community-brief/`: readable list of collapsible activities and local activity editor. React components never call low-level SDK methods. Incoming state updates refresh the view; an open draft is retained with a warning if the room activities change.

The brief occupies the `(event type, state key)` slot **`com.example.community_brief`, `main`**. Its version-3 JSON document contains an `activities` array; each `sendStateEvent` publishes the whole list. Version-1 and version-2 briefs are read and upgraded in memory, then saved as version 3 on the next edit. The current state points to the latest resolved event in that slot. Activity sign-ups are ordinary `m.room.message` notice events with an app-specific payload, so joined members can sign up without permission to edit room state. Old revisions and sign-up notices are not deleted simply because current state changes.

After a successful write the app waits for authoritative `/sync` state rather than injecting a local optimistic event. Reloading starts a fresh sync and retrieves the room state again. See the [SDK documentation](https://matrix-org.github.io/matrix-js-sdk/) and [MatrixClient API](https://matrix-org.github.io/matrix-js-sdk/classes/matrix.MatrixClient.html).

### Permissions

For the brief event, `m.room.power_levels.content.events["com.example.community_brief"]` overrides `state_default` (normally 50 when a power-level event exists). The SDK evaluates the member's effective power level. Room administrators normally qualify; ordinary members normally do not. A joined member can still read the brief and sign up by sending a room message without permission to change it. The homeserver remains authoritative and may reject a write even after the local permission check. The app rechecks immediately before sending and shows homeserver rejections.

Use an existing organiser/admin account for the demo instead of lowering the room's permissions. Membership, permission and encryption changes are observed during sync. Offline editing/saving is deliberately disabled.

## Limits and adaptation

- **No end-to-end encryption for state.** Even encrypted chat does not make this custom state private in the same way. The prototype rejects encrypted rooms and must contain fictional data only. Participating homeservers can access and retain state.
- **Whole-document replacement.** Sequential writes behave like last-write-wins. Concurrent federated events are subject to Matrix state resolution, not a simple wall-clock comparison. The app offers no merge, compare-and-swap, revision history or conflict guarantee. Draft warnings reduce surprises but cannot prevent races.
- **Sign-up capacity is best-effort.** The app counts active sign-up notices and blocks new sign-ups once the configured maximum is reached. Simultaneous sign-ups across homeservers or room history visibility restrictions can affect the count. Sign-up notices include Matrix IDs, are visible to room members in Element, and remain in room history after cancellation.
- `updatedAt` is a client-supplied display timestamp, not an authoritative server audit trail. Date/time input accepts ISO 8601 with an explicit timezone; the view also displays the local timezone representation. Empty date/time is permitted.
- Missing membership requires joining in Element. There is no room browser, encryption setup, background service or widget integration. Automatic renewal requires the homeserver to advertise Matrix OAuth device sign-in; pasted manual tokens cannot be renewed.
- The SDK syncs the account's rooms using an in-memory store; use small test accounts. The UI presents only the requested room. Malformed/redacted content is surfaced as an error rather than silently replaced.
- Focused tests cover parsing, malformed/missing state, task changes, publishing, SDK permission checks, sync updates, permission loss, failed saves, drafts, encrypted-room rejection and teardown. They use mocked network boundaries, not a real homeserver.

To adapt the workflow, keep authentication, sync lifecycle and room permission handling in `src/matrix/`; replace the domain schema, custom event name/type declaration and editor. Choose a namespace you control before wider use. Add more state keys only when the data really requires separate independently replaceable objects; use timeline events for a stream of messages. No generic framework is needed.

The most valuable next step is to run the two-account checklist against a real room, then repeat across homeservers and record the results before expanding the feature set.
