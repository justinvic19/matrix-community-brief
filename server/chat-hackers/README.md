# WhatsApp activity tool

React with **📅 (Calendar)** to save a message as a website activity. The current demo saves immediately, without confirmation.

[Overview](../../README.md) | [Technical reference](REFERENCE.md) | [Public publishing](../../docs/deployment.md)

## Try it

```text
Title: Community dinner
When: 2026-10-24T19:00:00+01:00
Where: Newspeak House
Description: Bring something to share.
```

React 📅 and wait for **Activity saved!** with the website link. Title, When and Where are required; Description is optional. Use an ISO timestamp with timezone, or `TBC` for an unknown time/location.

## Setup

Run commands from the repository root after `npm ci`.

1. Create `server/chat-hackers/.env` from [.env.example](.env.example) if absent. Fill in the Matrix credentials, actual WhatsApp source room ID, and separate storage room ID.
2. For the current demo, set `CH_EVENT_SOURCE=hub`, `CH_REQUIRE_CONFIRMATION=false`, and `CH_ALLOW_UNAUTHENTICATED_HUB=true`. Your Matrix account needs write access only to storage. **This demo accepts forged callbacks**; see [authenticated mode](REFERENCE.md#authenticated-hub-mode) for stronger protection.
3. Run `ngrok http 5050` in a separate terminal. Set `CH_MODULE_URL` to its HTTPS URL. Do not reuse an active voice-tool endpoint for both tools.
4. Run `npm run module:dev`. Give the generated root-level `living-community-brief.json` privately to the Hub organiser.
5. The organiser must load the registration and activate the tool in the group. In the inspected Hub, send ⚙️ to list tools, then react ❤️ to its listing. Keep the module and tunnel running.

Restart after changing `.env`. If the tunnel URL changes, update it and give the organiser the regenerated JSON. `npm run module:register` generates that file without starting the server. Never share your Matrix token.

## Troubleshooting

| Problem | Check |
| --- | --- |
| No response | Open http://127.0.0.1:5050/ and your public URL. Look for `Received module callback.`; if absent, check Hub activation/forwarding. |
| Unmapped room | Correct `CH_SOURCE_ROOM_ID` using an actual group event. |
| Matrix 401 / 403 | Check token validity / storage-room access. |
| Journal or lock error | Follow [recovery instructions](REFERENCE.md#journal-and-retries); preserve the journal. |
| Missing from public view | Check the separate [snapshot publishing workflow](../../docs/deployment.md). |

## Scope and code

Only creation crosses from WhatsApp to the website. Website edits, sign-ups and discussion do not sync back. Use **Start discussion** on an imported activity to enable its storage-room thread and ordinary-member sign-ups.

Main logic: [module.ts](module.ts). HTTP server: [index.ts](index.ts). Matrix writes: [matrix.ts](matrix.ts). Retries and modes: [reference](REFERENCE.md).
