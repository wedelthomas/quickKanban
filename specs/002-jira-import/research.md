# Phase 0 Research — Jira Import

## Decisions

### Polling, not webhooks

**Forced, not chosen.** A board bound to loopback has no address Jira could
deliver to (BRD constraint C-5). Recorded here so nobody later reads the poll
as a shortcut — it is the only option available to this deployment.

### Full-state sync, not incremental

**Chosen**: every sync fetches the complete query result and applies it.

**Rejected — incremental** (`updated >= lastSync`). It halves the data
transferred, which for tens of issues is nothing, and it buys a permanent
correctness problem: an issue that stops matching the query never appears in an
incremental result, so the disappearance rule (FR-122) could not see it. The
full result *is* the desired state, which is also what makes the sync
idempotent.

### One transaction for the apply phase

**Chosen**: fetch everything first, then apply inside a single transaction.

This is how FR-131 ("a failed sync leaves no partially applied changes") is
satisfied by construction. Per-issue transactions would need explicit
compensation on failure — code that only runs when something has already gone
wrong, and is therefore the least-exercised code in the system.

Fetching inside the transaction was rejected: it would hold a database
transaction open across network calls of unbounded duration.

### `fetch` over an HTTP client library

**Chosen**: the platform `fetch`, with `AbortSignal.timeout`.

Node 22 has it. Principle XIII: if the standard library suffices, adding
`axios` or `got` is a liability for no gain. Retry and backoff are ten lines of
our own, and we want them explicit because the retry policy is a documented
part of the external-interactions register.

### `undici`'s MockAgent for contract tests

**Chosen** as an explicit dev dependency (already present transitively via
Node's own fetch implementation).

**Rejected — a live Jira in CI**: non-deterministic, network-dependent, and
capable of mutating a real backlog. NFR-23 forbids it outright.
**Rejected — `nock`**: does not intercept `fetch`, only `http`.

### The credential is never persisted

Read from env at call time, held only for the duration of a request, never
written to the database, never returned by an endpoint, never rendered.
Settings hold the query and the interval — things the user changes — and
nothing that authenticates.

A unit test asserts no error the adapter can produce contains the token. That
matters because the most common way a credential leaks is not a log statement
someone wrote on purpose; it is an error object that happened to carry the
request that produced it.

### Jira status is recorded and ignored

The `jira_links` row stores the issue's status and Jira's own `updated`
timestamp. Slice 2 writes them and reads neither.

They exist now because slice 3's three-way comparison needs a last-known state
to compare against, and that state can only be captured as syncs happen. Jira's
timestamp is used rather than the local clock because the two machines' clocks
are not guaranteed to agree, and a comparison against a clock that drifts would
misreport what changed.

## Open questions carried forward

**The API token itself.** Nothing in this slice can be exercised against real
Jira until the user generates one at `id.atlassian.com`. Every behavior pathway
is verifiable without it — the acceptance suite drives a fake and the contract
tests replay fixtures — so implementation is not blocked, but the first live
sync is.
