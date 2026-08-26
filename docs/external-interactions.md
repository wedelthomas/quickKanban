# External Interactions Register

Every outside touchpoint this system has, with its contract, failure mode and
timeout/retry policy. Required by constitution Principle XI. **Adding,
changing or removing a touchpoint updates this file in the same change**, and
flags the need for integration tests in `tasks.md`.

## Current touchpoints

### PostgreSQL — primary datastore

| Field | Value |
|---|---|
| **Direction** | Outbound, from the app container |
| **Introduced in** | Slice 1 (`specs/001-board-foundation/`) |
| **Contract** | SQL over TCP on the Compose network. Schema owned by this repo and applied by the migration runner at process start. No other writer exists. |
| **Authentication** | Username and password from `DATABASE_URL`, supplied by env from a gitignored `.env`. Port is not published to the host. |
| **Timeout** | 5s statement timeout; 10s connection acquisition timeout |
| **Retries** | None on writes. A failed mutation surfaces as `DATABASE_UNAVAILABLE` and the client reverts its optimistic update — a silent retry would risk applying a move the user already saw fail. Connection acquisition retries within the pool's normal behavior. |
| **Failure mode — at startup** | Process fails loudly and refuses to serve, rather than presenting a board that discards writes (FR-037) |
| **Failure mode — while running** | `GET /api/health` reports `degraded`; mutations return 503 with a typed code; the board stays interactive and reverts failed changes |
| **Data classification** | No PII, no account-critical data. Card titles and descriptions are the user's own notes about their own work. |

## Planned touchpoints

Not yet present. Listed so the register shows the intended shape, and to be
filled in properly by the slice that introduces each.

| Touchpoint | Arrives in | Shape |
|---|---|---|
| Jira Cloud REST API (read) | Slice 2 | Outbound HTTPS, Basic auth with an Atlassian account email plus API token from env. Rate-limited; bounded backoff and retry. Never reaches the browser. |
| Jira Cloud REST API (write) | Slice 3 | Status transitions only. No other field is ever modified. |

## Touchpoints deliberately absent

- **No inbound path from Jira.** Webhooks are unavailable to a localhost
  deployment, so synchronisation is poll-based only (BRD constraint C-5).
- **No telemetry, analytics or crash reporting.** Nothing about the user's
  work leaves their machine.
- **No CDN or external asset host.** The SPA is served entirely from the app
  container.
