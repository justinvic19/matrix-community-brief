# Living Community Brief

A Matrix-backed activity board: create activities, sign up, and discuss them on the website. The optional WhatsApp tool imports messages with a calendar reaction.

[Website](https://justinvic19.github.io/matrix-community-brief/) | [WhatsApp setup](server/chat-hackers/README.md) | [Website guide](docs/website-guide.md) | [Deployment](docs/deployment.md)

## Run locally

Use Node.js 24.15+ on the 24.x line, 22.22.2+ on the 22.x line, or 26+.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173 and sign in to an existing **unencrypted Matrix room**.

The WhatsApp server runs separately with `npm run module:dev`; follow its [setup guide](server/chat-hackers/README.md) first. GitHub Pages hosts only the website.

## Data and limits

- Signed-in users see live Matrix updates. Public visitors see an exported snapshot; failed publishing leaves older data online.
- WhatsApp activity creation was demonstrated live. WhatsApp edits, sign-ups and discussion syncing are not implemented.
- The current demo accepts unauthenticated callbacks. Keep credentials private and avoid concurrent website saves and imports.

## Development

Main files: [activity schema](src/domain/brief.ts), [Matrix client](src/matrix/client.ts), [WhatsApp logic](server/chat-hackers/module.ts), and [public exporter](scripts/publish-brief.mjs).

```sh
npm test
npm run module:typecheck
npm run build
```

On Windows, use `npm.cmd` if PowerShell blocks `npm`.
