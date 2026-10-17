# WhatsApp activity tool

React with **📅 (Calendar)** to save a message as a website activity. The current demo saves immediately, without confirmation.

This is an optional extension to Living Community Brief, originally a Matrix activity website tested with Element chat. Added for the [Chat Hackers](https://github.com/Chat-Hackers) initiative during the hack day, it uses their WhatsApp bridge and Tool Hub to bring group messages into the existing activity interface. The website and Matrix storage remain the core application; the tool provides another way to create activities.

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

There are two room IDs: **source** is the WhatsApp group's bridged Matrix portal; **storage** is the separate room connected to the website. Ask the organiser for the actual source ID rather than copying a documentation example. In Hub mode, the original message arrives as `event.prevEvent`, so your Matrix account does not need to join that portal.

1. Create `server/chat-hackers/.env` from [.env.example](.env.example) if absent. Fill in the Matrix credentials, actual WhatsApp source room ID, and separate storage room ID.
2. For the current demo, set `CH_EVENT_SOURCE=hub`, `CH_REQUIRE_CONFIRMATION=false`, and `CH_ALLOW_UNAUTHENTICATED_HUB=true`. Your Matrix account needs write access only to storage. **This demo accepts forged callbacks**; see [authenticated mode](REFERENCE.md#authenticated-hub-mode) for stronger protection.
3. Run `ngrok http 5050` in a separate terminal. Set `CH_MODULE_URL` to its HTTPS URL. Do not reuse an active voice-tool endpoint for both tools.
4. Run `npm run module:dev`. Give the generated root-level `living-community-brief.json` privately to the Hub organiser.
5. The organiser must load the registration and activate the tool in the group. In the inspected Hub, send ⚙️ to list tools, then react ❤️ to its listing. Keep the module and tunnel running.

Restart after changing `.env`. If the tunnel URL changes, update it and give the organiser the regenerated JSON. `npm run module:register` generates that file without starting the server. Never share your Matrix token.

The key settings in `.env` are:

| Setting | Purpose |
| --- | --- |
| `CH_MODULE_URL` | Public HTTPS address forwarding to your module |
| `CH_MATRIX_SERVER`, `CH_MATRIX_TOKEN` | Account used to read/write storage-room activity state |
| `CH_SOURCE_ROOM_ID`, `CH_STORAGE_ROOM_ID` | Source group and separate destination |
| `CH_REQUIRE_CONFIRMATION` | `false` saves immediately; `true` enables the organiser preview/confirmation flow |
| `CH_DATA_DIR` | Persistent processing journal; keep it to retain duplicate protection |

The example file describes the other settings. Authenticated Hub mode requires a shared header from the organiser; the explicitly opted-in demo mode does not. Neither registration nor a running health endpoint verifies Matrix write access.

## Troubleshooting

| Problem | Check |
| --- | --- |
| No response | Open http://127.0.0.1:5050/ and your public URL. Look for `Received module callback.`; if absent, check Hub activation/forwarding. |
| Unmapped room | Correct `CH_SOURCE_ROOM_ID` using an actual group event. |
| Matrix 401 / 403 | Check token validity / storage-room access. |
| Journal or lock error | Follow [recovery instructions](REFERENCE.md#journal-and-retries); preserve the journal. |
| Missing from public view | Check the separate [snapshot publishing workflow](../../docs/deployment.md). |

## Scope and code

For each calendar reaction, the module validates the source room and original text, derives a stable ID from the source message, then appends the activity to the storage brief using the same schema as the website. The journal records processing progress so retrying an uncertain save can check whether the activity already exists.

Only creation crosses from WhatsApp to the website. Website edits, sign-ups and discussion do not sync back. Use **Start discussion** on an imported activity to enable its storage-room thread and ordinary-member sign-ups.

Main logic: [module.ts](module.ts). HTTP server: [index.ts](index.ts). Matrix writes: [matrix.ts](matrix.ts). Retries and modes: [reference](REFERENCE.md).
