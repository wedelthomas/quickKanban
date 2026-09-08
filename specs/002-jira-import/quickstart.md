# Quickstart — Jira Import

## Connect it to Jira

1. Generate an API token at <https://id.atlassian.com/manage-profile/security/api-tokens>.
   No administrator involvement is needed.
2. Add three lines to `.env`:

   ```bash
   JIRA_BASE_URL=https://yourcompany.atlassian.net
   JIRA_EMAIL=you@example.com
   JIRA_API_TOKEN=<the token>
   ```

3. `docker compose up -d --build`

**`.env` is gitignored and must stay that way.** This token can act as you in
Jira. It is never written to the database, never sent to the browser, and never
logged — but none of that helps if it is committed.

## Verify

| Check | Expectation |
|---|---|
| Open the board | Your assigned open issues appear in Backlog |
| A card's face | Shows its issue key; clicking through opens it in Jira |
| The header pill | *Synced just now* |
| Try to delete a Jira card | Refused, with the reason stated |
| `curl -s 127.0.0.1:3000/api/sync/status` | `configured: true`, a recent `lastSuccessAt` |

## Without a token

The board runs. The header says Jira is not configured, and ad-hoc cards work
exactly as they did in slice 1. This is a supported state, not a broken one —
so you can deploy this slice before you get around to generating a token.

## Change what gets imported

Settings hold the query and the poll interval. The default is your unfinished
assigned issues:

```
assignee = currentUser() AND statusCategory != Done
```

Widen it if you want issues you are watching or reported. **There is no field
for the credential**, by design.

## What this slice does not do

Dragging a Jira card moves it **on your board only** — Jira is not told. That
arrives in slice 3. Until then the board is your own arrangement and the Jira
status is recorded but not obeyed.

## Tests

```bash
npm run test:unit         # includes the adapter's no-write and redaction guards
npm run test:contract     # the real adapter against recorded fixtures, offline
npm run test:acceptance   # every scenario, against a fake Jira
npm run test:e2e
```

**No test in any suite contacts live Jira**, so none of them can touch your
real backlog.
