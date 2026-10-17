# Living Community Brief

A Matrix activity interface for community organisers and members, built during the 17 October 2026 Matrix Hack Day. Organisers can create and edit activities; members can read the current plan, sign up and discuss it. It started as a website backed by Matrix room state and was tested alongside Element chat.

A later extension connects this interface to WhatsApp through the bridge and Tool Hub from [Chat Hackers](https://github.com/Chat-Hackers). It was added for the Chat Hackers initiative during the hack day, letting a WhatsApp group create activities on the same board.

[Website](https://justinvic19.github.io/matrix-community-brief/) | [WhatsApp setup](server/chat-hackers/README.md) | [Website guide](docs/website-guide.md) | [Deployment](docs/deployment.md)

## Why build this?

Matrix's federated protocol lets communities keep shared data on their homeservers instead of relying on one central application database. That architectural advantage matters, but it can be hard for everyday users to notice. This project explores a practical reason to use it: making a community's current activities easier to find, especially for newcomers.

The starting point was a monthly book club with a WhatsApp group open to new members. Whenever someone joined, the admin needed to repeat the group introduction and details of the next meeting. Existing members saw the same information again, while newcomers depended on someone reposting it. A separate event platform such as Meetup could provide a lasting link, but would mean maintaining the activity on another centralised service.

Living Community Brief gives the room a persistent activity list. It stores activity details as JSON in a custom **Matrix state event**, which represents the room's current shared state. The website is an editor for organisers and an activity brief with sign-ups for members. Access still follows room permissions; a separate public view can share the brief with people who are not signed in.

The original Matrix interface works independently of WhatsApp. The WhatsApp tool adds a way to bring plans from an existing group into that shared activity list, without asking everyone to move their conversation first.

## Features

| On the website | Through WhatsApp |
| --- | --- |
| Create, edit and remove activities with organiser permissions | Create an activity by reacting 📅 to a message |
| Set descriptions, dates, locations, tasks and signup limits | Parse labelled text without inventing missing details |
| Sign up, withdraw and discuss activities in Matrix threads | Receive a saved-activity reply with a website link |
| Share a read-only public activity list | Handle repeated reactions without creating another copy |

WhatsApp creation was demonstrated through the real bridge and Hub. WhatsApp edits, sign-ups and discussion syncing are not implemented: these remain website/Matrix features.

## Run the website

Use Node.js 24.15+ on the 24.x line, 22.22.2+ on the 22.x line, or 26+.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, usually http://127.0.0.1:5173. Enter your account's homeserver API URL and an existing **unencrypted Matrix room ID**, then choose **Sign in with Matrix**. Room permissions determine who can edit; ordinary members can participate without brief-edit permission. See the [website guide](docs/website-guide.md) for setup and manual checks.

## WhatsApp activity tool

This optional integration extends the original Matrix/Element workflow using the [Chat Hackers](https://github.com/Chat-Hackers) bridge and Tool Hub. It imports activities from WhatsApp; it does not mirror the whole conversation.

The tool runs as a separate TypeScript HTTP server, usually on port **5050**. The organiser's Tool Hub forwards group events to it through a public tunnel. The tool saves activities into a **separate Matrix storage room**, which the website reads.

```text
WhatsApp group → bridge → source Matrix portal → Tool Hub
                                                    ↓ tunnel
                                              activity module
                                                    ↓
                                        storage room → website
```

Once the tool is configured and activated in the group, send:

```text
Title: Community dinner
When: TBC
Where: Newspeak House
Description: Bring something to share.
```

React **📅 (Calendar)**. In the current demo configuration, a valid activity is saved immediately and the bot replies with a website link. For a scheduled time, use an ISO timestamp with an explicit timezone, such as `2026-10-24T19:00:00+01:00`.

Follow the [WhatsApp setup guide](server/chat-hackers/README.md) to fill in `server/chat-hackers/.env`, expose port 5050, and register the generated `living-community-brief.json` with the organiser. Then run:

```sh
npm run module:dev
```

Keep the module and tunnel running. **`npm run dev` starts the website; `npm run module:dev` starts the tool.** GitHub Pages hosts only the website. In Hub mode, the module's Matrix account needs access to storage, not membership in the source portal.

## Live and public viewing

The signed-in website receives live Matrix updates. Public viewing prefers a deployed `public-briefs.json` snapshot exported by GitHub Actions, so newly created activities can appear later. A failed export leaves the previous snapshot online; refreshing the page alone cannot republish it.

The local tool uses `CH_MATRIX_TOKEN`; the GitHub exporter uses a separate `MATRIX_PUBLISH_TOKEN`. These fixed tokens do not currently renew automatically. See [deployment and public publishing](docs/deployment.md) for setup and expired-token troubleshooting.

## Prototype limits

- The current demo explicitly accepts unauthenticated Hub callbacks; forged requests can create activities. Authenticated Hub and confirmation modes are available in the [technical reference](server/chat-hackers/REFERENCE.md).
- Keep tokens out of source control and public bundles. Public snapshot publishing exposes the approved room's activity details, not its chat history.
- The activity list is saved as one Matrix state document. Avoid simultaneous website saves and imports because concurrent writes can overwrite changes.
- Imported activities begin with announcements off. An organiser can use **Start discussion** on the website to create the storage-room thread needed for ordinary-member sign-ups.

## Development

| File or folder | Responsibility |
| --- | --- |
| [src/domain/brief.ts](src/domain/brief.ts) | Shared activity schema and validation |
| [src/matrix/](src/matrix/) | Website authentication, state, announcements and discussion |
| [src/features/community-brief/](src/features/community-brief/) | React views and editor |
| [server/chat-hackers/module.ts](server/chat-hackers/module.ts) | Reaction parsing, activity creation and duplicate handling |
| [server/chat-hackers/index.ts](server/chat-hackers/index.ts) | HTTP server receiving Hub callbacks |
| [scripts/publish-brief.mjs](scripts/publish-brief.mjs) | Public snapshot export |

```sh
npm test
npm run module:typecheck
npm run build
```

On Windows, use `npm.cmd` if PowerShell blocks `npm`.
