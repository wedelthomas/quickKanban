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

### Jira Cloud REST API — read only

| Field | Value |
|---|---|
| **Direction** | Outbound HTTPS, from the app container |
| **Introduced in** | Slice 2 (`specs/002-jira-import/`) |
| **Contract** | `GET {JIRA_BASE_URL}/rest/api/3/search/jql?jql=…&maxResults=…&fields=summary,status,updated&nextPageToken=…`. Paginated by opaque token, not offset: the response carries `nextPageToken` and `isLast`. **`/rest/api/3/search` was removed by Atlassian and answers 410 Gone** — verified against tsgjira.atlassian.net on 2026-08-26. |
| **Methods used** | `GET` only. A unit test asserts the adapter's source contains no other verb and that the port exposes no write operation. |
| **Authentication** | HTTP Basic, `email:api-token` from environment, built at call time. Never persisted, never sent to the browser, never logged. |
| **Timeout** | 10s per request (`AbortSignal.timeout`) |
| **Retries** | Bounded exponential backoff, 3 attempts at 500/1000/2000ms, honouring `Retry-After` on 429. Not retried on 401/403 — a rejected credential will be rejected again. |
| **Failure — rejected credentials** | `JiraUnauthorized` → recorded as `failure_kind: credentials`, worded distinctly in the interface from a connectivity failure |
| **Failure — unreachable, timeout, 5xx** | `JiraUnreachable` → retried, then `failure_kind: connectivity`. The board stays fully usable. |
| **Failure — rate limited past retries** | `failure_kind: rate_limit` |
| **Failure — unexpected response shape** | `JiraMalformedResponse` → nothing is applied |
| **Partial failure** | Impossible by construction: issues are fetched in full, then applied in one transaction |
| **Data classification** | Issue keys, summaries and statuses for the user's own assigned work. No PII. The credential is the sensitive item and is never stored. |

**TLS note.** On a network that intercepts TLS, the container must trust the
interceptor's root CA or every call fails with
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. `NODE_EXTRA_CA_CERTS` adds that CA
*alongside* the normal trust store. `NODE_TLS_REJECT_UNAUTHORIZED=0` must never
be used: it disables verification entirely and would make the token
interceptable by anyone on the path.

## Planned touchpoints

| Touchpoint | Arrives in | Shape |
|---|---|---|
| Jira Cloud REST API (write) | Slice 3 | Status transitions only, via `POST /rest/api/3/issue/{key}/transitions`. No other field is ever modified. |

## Touchpoints deliberately absent

- **No inbound path from Jira.** Webhooks are unavailable to a localhost
  deployment, so synchronisation is poll-based only (BRD constraint C-5).
- **No telemetry, analytics or crash reporting.** Nothing about the user's
  work leaves their machine.
- **No CDN or external asset host.** The SPA is served entirely from the app
  container.
