# Deployment and public publishing

[Back to project overview](../README.md)

## Deploy with GitHub Pages

The workflow in `.github/workflows/pages.yml` runs `npm ci`, `npm test`, and
`npm run build` (including TypeScript checking) on pull requests targeting `main`
and pushes to `main`. A successful push to `main` also deploys `dist/` to Pages.
The Actions tab can trigger a manual run; only runs on `main` can deploy.
Pull requests do not deploy or receive Pages write permissions.

One-time setup:

1. Put this project at the root of a GitHub repository with a `main` branch.
   Use a public repository for GitHub Pages on GitHub Free.
2. In **Settings > Pages > Build and deployment**, set **Source** to
   **GitHub Actions**. No generated starter workflow is needed.
3. Push these files to `main`, or run **CI and GitHub Pages** from the Actions
   tab if they were already pushed before enabling Pages.
4. Open the URL shown by the deployment, normally
   `https://<owner>.github.io/<repository>/`.
5. For protected merges, configure a branch ruleset for `main` requiring the
   **Test and build** status check. Without this rule, failed checks prevent
   deployment but do not prevent merging.

No personal access token, Matrix credentials, or additional repository secrets
are needed: deployment uses GitHub's automatic token. Only `dist/` is published.
Vite uses relative asset paths, so the repository name does not need to be
hard-coded and custom domains also work. The app currently has no history-based
client routes; revisit the base path and routing if those are added.

After deployment, verify Matrix sign-in, reload/reconnect, and two-client sync
using the checklist below. The homeserver must support HTTPS and allow browser
CORS requests from the hosted site. Localhost credentials are not transferred
to the deployed site's browser storage; sign in again there. Pages hosts the
frontend only, while the existing Matrix homeserver stores room data.

The workflow uses Node.js 24.19.0 and pins actions to commit hashes. Update these
pins deliberately when upgrading the CI tooling. For local checks on Windows,
use `npm.cmd` if PowerShell blocks the `npm.ps1` launcher.

See [Vite's deployment guide](https://vite.dev/guide/static-deploy.html) and
[GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Public snapshots on GitHub Pages

The Pages workflow can publish an explicitly approved room's activity brief as
`public-briefs.json`. This works without Matrix guest accounts and does not require
making chat history public. The website uses a matching snapshot first, then falls
back to the existing public/guest preview for rooms not published here.

### Enable publishing (repository owner / organiser)

1. Create a dedicated Matrix account for publishing and join it to the chosen room.
   It only needs permission to read the brief; do not give it organiser permissions.
2. In GitHub **Settings → Secrets and variables → Actions**, add the account's
   access token as the repository **secret** `MATRIX_PUBLISH_TOKEN`. Never put it
   in source code, a URL, a repository variable, or the public JSON.
3. Add these repository **variables**:
   - `PUBLIC_BRIEF_SERVER`: the publishing account's HTTPS homeserver API URL,
     for example `https://matrix.org`.
   - `PUBLIC_BRIEF_ROOM_ID`: the exact room ID, beginning with `!`.
   - `PUBLIC_BRIEF_NAME`: the public display name (optional).
   - `PUBLIC_BRIEF_ENABLED`: `true`, only after the organiser approves publishing
     **all current and future activity details and task text** in that room.
4. Run **Actions → CI and GitHub Pages → Run workflow**. Check that deployment succeeds.
5. Share `https://justinvic19.github.io/matrix-community-brief/?roomId=ENCODED_ROOM_ID&publicServer=ENCODED_SERVER`.
   Both values must match the publishing configuration. The organiser's existing
   public link works when it uses that same server. Visitors authenticate with
   their own account only when they want to join/sign up; connecting does not
   automatically sign them up.

The workflow runs on main pushes, manual dispatch, and twice an hour. Scheduled
runs can be delayed or disabled by GitHub; this is not a real-time feed. The public
page displays the publication time. Refresh downloads the latest deployed file,
not fresh Matrix state. Sign-up availability is checked by the authenticated app.

Only allowlisted activity fields are exported. Unknown Matrix fields, account
tokens, member lists, sign-ups and discussion messages are excluded. The exporter
reads only the brief state event and never joins rooms automatically. Pull requests
do not run the exporter or receive its secret. Snapshot export is optional: an export
failure (including an expired or missing token) produces an Actions warning and
summary, while tests, builds and deployment still run normally. Test and build
failures continue to block deployment.

Each deployment replaces the site; a failed export does not carry forward the old
snapshot. Public links then try the homeserver's public/guest preview, which may
not be available for the room. Signed-in users can still read the live brief.
Replace `MATRIX_PUBLISH_TOKEN` and rerun the workflow to restore snapshot publishing.
This does not renew tokens automatically or guarantee anonymous access.

To stop publishing, set `PUBLIC_BRIEF_ENABLED` to `false` and manually run the
workflow successfully. It publishes an empty snapshot. Removing the token alone
removes the snapshot on the next successful deployment when the export fails. Previously downloaded copies cannot
be recalled. A successful export replaces the whole snapshot, so deleted activities
disappear on the next successful deployment. This initial version publishes one
explicitly configured room per repository.
