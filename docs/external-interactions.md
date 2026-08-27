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

### Jira Cloud REST API — read

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

### Jira Cloud REST API — write (status transitions only)

| Field | Value |
|---|---|
| **Direction** | Outbound HTTPS, from the app container |
| **Introduced in** | Slice 3 (`specs/003-two-way-sync/`) |
| **Contract** | `GET {JIRA_BASE_URL}/rest/api/3/issue/{key}/transitions?expand=transitions.fields` to read what is legal from where the issue currently sits, then `POST` the same path with a body of exactly `{"transition":{"id":"…"}}`. Also `GET /rest/api/3/status`, read-only, so the column mapping is chosen from Jira's own status names rather than typed. |
| **Methods used** | `GET` and `POST` to the transitions path, and nothing else. No `PUT`, no field edit, no comment, no worklog. |
| **What can change in Jira** | The issue's status, and only the status. The POST body carries no field, so no field but status *can* change (FR-209). A unit test asserts the adapter's source contains no other write path. |
| **Which transition** | Matched on the transition's **destination status** (`transition.to.name`), never on the transition's own name. These differ routinely: on tsgjira.atlassian.net the transition named "To Development" leads to the status "Development", and "Pass" leads to "PO Approve". |
| **Authentication** | Same credential as the read direction: HTTP Basic, `email:api-token` from environment, built at call time. |
| **Timeout** | 10s per request (`AbortSignal.timeout`) |
| **Retries** | **None.** A transition is not idempotent from the board's point of view — a retry after an ambiguous failure could move an issue a second time, past where the user asked. A failed push is reported and left for the user. |
| **Refusal — no legal transition** | The target status is not reachable from where the issue is now → `NO_LEGAL_TRANSITION`. The card does not move locally either. |
| **Refusal — transition demands a field** | Jira requires a resolution or similar → `TRANSITION_NEEDS_FIELDS`. Refused rather than guessed: supplying a field the user never chose would write something they did not ask for. |
| **Refusal — column has no mapping** | The column is local-only; Jira is simply never told (FR-207). Not an error. |
| **Refusal — card is conflicted** | `CARD_CONFLICTED`. Enforced before Jira is consulted at all, so it holds even when Jira is unconfigured. |
| **Ordering** | Jira is transitioned **before** the card moves on the board. A refusal therefore leaves nothing half-applied to unwind. |
| **Failure classes** | Identical to the read direction: `credentials`, `connectivity`, `rate_limit`, `malformed`. |
| **Data classification** | An issue key and a transition id. No PII. Writes are visible to the user's whole team, which is why nothing but status is ever sent. |

**Blast radius.** This is the only touchpoint in the system that changes data
other people can see. Everything else is local to the user's machine.

## Planned touchpoints

None. Slice 4 (search, archive, summaries) adds no outside touchpoint.

## Touchpoints deliberately absent

- **No inbound path from Jira.** Webhooks are unavailable to a localhost
  deployment, so synchronisation is poll-based only (BRD constraint C-5).
- **No telemetry, analytics or crash reporting.** Nothing about the user's
  work leaves their machine.
- **No CDN or external asset host.** The SPA is served entirely from the app
  container.
