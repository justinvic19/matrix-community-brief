# Chat Hackers module reference

[Quick start](README.md) · [Project overview](../../README.md)

## Modes and trust

| Configuration | Source event handling | Account access required |
| --- | --- | --- |
| `CH_EVENT_SOURCE=hub`, `CH_ALLOW_UNAUTHENTICATED_HUB=true` | Trusts forwarded events without authenticating the caller; explicit demo only | Storage room |
| `CH_EVENT_SOURCE=hub`, demo flag false | Requires the shared-secret header, then trusts the Hub's event and `prevEvent` | Storage room |
| `CH_EVENT_SOURCE=matrix` | Re-fetches source events through authenticated Matrix requests | Source and storage rooms |

Old configurations default to direct Matrix mode and confirmation enabled. The
example environment selects Hub mode and immediate saves, but leaves authentication
enabled until explicitly configured otherwise. Follow the quick start to opt into
the unauthenticated demo. Never assume that a health response verifies credentials.

All modes reject unmapped rooms and require distinct source/storage IDs. Storage
must be unencrypted. The service account must be joined and allowed to write
`com.example.community_brief` state; version-12 room creators are recognised as
owners. Direct Matrix mode also checks source membership and encryption. Hub mode
does not independently verify source membership, encryption or sender identity.
It relies on the bridge and Hub, and in demo mode accepts forged identity claims.

## Authenticated Hub mode

Set `CH_ALLOW_UNAUTHENTICATED_HUB=false` and set `CH_WEBHOOK_SECRET` to a random
32-byte value encoded as 64 hexadecimal characters. The organiser sets the same
value as `COMMUNITY_BRIEF_WEBHOOK_SECRET` in the Hub's private environment and adds
this header in `forwardEvent`:

```ts
headers: {
  "Content-type": "application/json",
  ...(module.id === "living-community-brief" ? {
    "X-Community-Brief-Secret": process.env.COMMUNITY_BRIEF_WEBHOOK_SECRET!
  } : {})
}
```

Restart both processes after configuration changes. Missing/wrong headers produce
HTTP 401 before event handling. Share only the webhook secret privately with the
operator, not the Matrix token or whole `.env`. Keep the webhook secret out of
registration JSON and URLs: the inspected Hub exposes registration data through
dashboard APIs. Anyone holding the secret can impersonate forwarded events.

`CH_TOOL_SECRET` is a separate optional registration field for Hub `/api/send`.
It does not authenticate inbound callbacks. This module uses normal HTTP response
messages and does not call `/api/send`.

## Optional confirmation

Set `CH_REQUIRE_CONFIRMATION=true` and configure `CH_CONFIRMERS` with comma-separated
full Matrix sender IDs observed through the bridge. A calendar reaction then saves
an immutable preview locally and returns `confirm <UUID>`. Only a configured sender
may confirm in the source group. Display names and WhatsApp numbers are not IDs.
In direct Matrix mode the actor must still be joined to source; Hub mode trusts the
forwarded identity. Service-account actors are rejected by the permission check.

With `CH_REQUIRE_CONFIRMATION=false`, calendar reactions save immediately and the
confirmer allowlist is unused. A new reaction can save an existing unexpired pending
preview after switching modes. A configuration change alone does not publish it.
Incoming events and pending proposals have a 24-hour window. To change a preview,
post a new original message. Editing the original does not change the stored draft.

## Event processing and schema

1. `index.ts` receives `POST /`, applies request limits and optional authentication,
   and passes the envelope to `module.ts`.
2. `module.ts` checks the room, event ID, sender format and timestamp. It handles
   `m.reaction` with an `m.annotation` calendar key.
3. Hub mode uses `event.prevEvent`; direct mode fetches the original from Matrix.
   The original must match the referenced ID, be unredacted plain text and, when its
   room ID is supplied, belong to source.
4. `parseActivity` accepts labelled Title, When, Where and optional Description
   lines, rejecting ambiguous text, duplicate labels and invalid timestamps.
5. The module reads the storage brief, appends a stable-ID activity, and uses the
   shared `publishBrief`, `validateDraft` and `parseBrief` functions to publish the
   version-3 document to `com.example.community_brief` / `main`.
6. The Hub sends the module's response back to the source group. Success and
   duplicate replies contain a website URL with the **storage** room ID, viewing
   server and activity anchor, never credentials.

No source message becomes a storage-room discussion root. The website's
`Start discussion` creates its own parent and `com.example.community_brief.discussion`
mapping inside storage. Activities begin with no tasks, no capacity limit and
automatic announcements off.

## Journal and retries

Activity IDs are SHA-256 of source room plus original message ID. A serialized queue
and local journal record the proposal, write intent and completion. After an uncertain
write, retrying re-reads storage and does not append an already-present ID. Completed
records prevent a repeated reaction from recreating a deliberately deleted activity.

Keep `CH_DATA_DIR` private, persistent and backed up. Deleting records forfeits
deduplication guarantees. The mapping manifest binds a journal to its homeserver,
source and storage room. If intentionally changing those, use a separate data
directory; retain the old journal. Do not change directories merely to bypass a
failure on an unchanged mapping.

Only one process may use a journal. After a crash, a `service.lock` may remain:
verify that the old process is no longer running before removing **only that lock**.
The lock does not coordinate multiple hosts with separate journals.

Matrix stores the whole activity list without compare-and-swap. Avoid simultaneous
website saves and imports; the queue cannot prevent another client from overwriting
a concurrent append. Do not edit/delete an activity while resolving an uncertain
write. This is not an exactly-once distributed transaction.

Hub replies are best-effort, without a durable delivery acknowledgement. Repeat the
reaction if a response is lost. Replies can repeat while activities are deduplicated.
Transient failures return HTTP 503 with a generic message; automatic Hub retries are
not assumed. Raw credentials and message contents are not logged.

## Upstream contracts inspected

- [Example module](https://github.com/Chat-Hackers/example-tool/blob/main/src/index.ts):
  receives `{ event, botUserId, displayName }` and returns `{ success: true, response }`.
- [Hub forwarding](https://github.com/Chat-Hackers/tool-hub/blob/main/src/index.ts):
  forwards subscribed events for active tools, attaches `prevEvent`, and converts
  response strings or message/context objects into source-chat messages.
- [Hub send API](https://github.com/Chat-Hackers/tool-hub/blob/main/src/webserver.ts):
  accepts POST `/api/send?roomId=…&toolId=…&secret=…`, checks registration and activation,
  but does not await Matrix delivery. It is not used by this module.

Check the deployed Hub for differences. Public root URLs are accepted for registration;
GET `/` is a minimal health summary, not a configuration dashboard.

## Verification

```sh
npm test
npm run module:typecheck
npm run build
```

Automated coverage includes mapping, parsing, authentication modes, permissions,
version-12 ownership, confirmation, immediate saves, retries and journal persistence.
Network boundaries are mocked. The live demo demonstrated WhatsApp calendar reaction
creation appearing on the signed-in website; it did not establish production readiness.

For a deployment, also verify duplicate reactions across restart, malformed messages,
permission loss, unmapped rooms, expired proposals, authenticated header rejection,
and authorised/unauthorised confirmation when enabled. Check website discussion and
sign-ups on imported activities, and public snapshot refresh separately. Never use a
privileged Matrix token in the public browser bundle.
