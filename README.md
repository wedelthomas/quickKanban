# Quick Kanban Wall

A small, self-hosted Kanban board for one person, showing **all** your assigned
work in one place — Jira issues alongside the ad-hoc work that never gets a
ticket.

Jira is the system of record for project work, but it is not the system of
record for your day. Requests arrive by chat, email and hallway conversation;
they take real hours and compete with everything else, but no Jira board shows
them. This board does.

> **Current state: slice 4 (review and reporting), complete. All four slices done.**

## What it does today

- Six fixed columns: Backlog, Iteration Items, In Progress, Test, PO Review, Done
- Cards with a title, description, priority, due date and tags
- Tags come from a shared vocabulary with autocomplete, so they cannot drift
- Drag between columns or reorder within one; the move applies instantly and
  reverts with a reason if it cannot be saved
- Full keyboard operation — press `?` for the list
- Deletion is soft and asks first
- Every column change is recorded in an append-only history

- **Your assigned Jira issues appear automatically**, placed in the column
  their Jira status maps to, refreshed on a configurable interval and on demand
- Jira cards carry their issue key as a link and resist local edits to what
  Jira owns
- Issues that leave your query are archived with a reason, never deleted, and
  restored if they come back
- Sync status is always visible, and a failure never blocks the board

- **Dragging a Jira card transitions the issue in Jira**, to the status that
  column is mapped to — and only the status; no other field is ever written
- Which status each column means is yours to set, chosen from the statuses your
  Jira actually reports rather than typed
- A column left unmapped (Iteration Items ships this way) is local-only: moving
  a card there changes the board and tells Jira nothing
- Changes made in Jira are adopted onto the board on the next sync
- When both sides changed, the board **stops and asks** rather than picking a
  winner — see below

- **Filter the board in place** by text, tag, priority, source or overdue —
  press `/` to reach it, `Escape` to clear it. All six columns stay visible, and
  a filter that matches nothing says so rather than looking like an empty board
- **Finished work archives itself** once it has sat in Done longer than a
  window you set (7 days by default). It leaves the board; it is never deleted
- **Browse the archive by date**, grouped by the day each card finished, with
  the reason a card left where one was recorded
- **Generate your standup update** — what moved, what is in progress, what is
  blocked — and copy it as plain text. Daily or weekly

- **The board knows which TradeStation iteration it is** — read from your
  team's Jira board and shown in the banner with its dates and the working days
  left. When Jira is unreachable it shows the last one it read, marked as such,
  and falls back to a calculated estimate rather than to nothing
- **Blocked is a flag, not a column.** Mark a card stuck wherever the work
  actually is; it keeps its real column and still moves. Blockers your team
  recorded in Jira arrive automatically, and your setting always wins
- **Iteration Items** holds what you have committed to this iteration. You put
  cards there; Jira never does
- **Cards that slip say so**, showing how many iterations they have carried

See [`docs/brd.md`](docs/brd.md) for how the first four slices were scoped, and
[`docs/brd-2.md`](docs/brd-2.md) for the two that follow.

### Upgrading from v1

The upgrade moves every card that was in the Blocked column into **In
Progress**, carrying the blocked flag — not to Backlog, which would discard the
fact that the work is in flight. The Blocked column's record is kept rather
than deleted, because the movement history refers to it; deleting it would
break the archive and every report.

One caveat worth knowing: rolling back to a v1 image without restoring the
database leaves those cards in In Progress, unflagged. Nothing is lost, but the
older code has no idea they were blocked.

## When the board and Jira disagree

If the board moved a card and Jira moved the same issue somewhere else since
the last sync, that is a conflict. The board never resolves one for you: both
changes were somebody's deliberate act, and only you know which one is still
true.

A conflicted card is marked on its face and **frozen** — it refuses to be
dragged until you decide. A count appears in the board bar; opening it shows
both sides side by side, with two buttons and no default:

- **Keep this, update Jira** transitions the issue to match the board. If Jira
  refuses the transition, the conflict stays open — nothing is recorded that
  Jira did not accept.
- **Accept this, move the card** moves the card to match Jira and writes
  nothing to Jira at all.

Either way the card unfreezes, and the choice is recorded.

A push to Jira is never retried. Transitions are not idempotent from the
board's side, and a retry after an ambiguous failure could move an issue twice,
past where you asked it to go.

## Connecting to Jira

Generate a token at <https://id.atlassian.com/manage-profile/security/api-tokens>
— no administrator approval needed — and add three lines to `.env`:

```bash
JIRA_BASE_URL=https://tsgjira.atlassian.net
JIRA_EMAIL=you@tradestation.com
JIRA_API_TOKEN=<the token>
```

**Without them the board still runs**, reports Jira as not configured, and
works with ad-hoc cards exactly as before. That is a supported state, not a
broken one.

### If your network intercepts TLS

Symptom: every sync fails with `connectivity`, and the container logs
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Export your corporate root CA and point
Node at it:

```bash
mkdir -p certs
security find-certificate -c "Zscaler Root CA" -p /Library/Keychains/System.keychain > certs/corporate-root-ca.pem
echo 'NODE_EXTRA_CA_CERTS=/certs/corporate-root-ca.pem' >> .env
docker compose up -d
```

This *adds* to the trust store; verification stays on. **Never set
`NODE_TLS_REJECT_UNAUTHORIZED=0`** — it turns verification off entirely and
makes your token interceptable by anyone on the path.

## Getting started

```bash
cp .env.example .env       # set POSTGRES_PASSWORD to anything you like
docker compose up
```

Open <http://127.0.0.1:3000>.

The schema is created automatically on first start. There is no login: the
board binds to your machine's loopback interface and is not reachable from the
network.

**`.env` is gitignored and must stay that way** — including for a local
database password you consider throwaway.

## Stopping

```bash
docker compose down          # stops the containers, keeps your data
```

## Resetting — destructive

```bash
docker compose down
docker volume rm quick-kanban-wall_kanban_data
```

**`kanban_data` is the volume holding everything.** Removing it deletes every
card on the board. Jira-sourced cards return on the next sync — but **ad-hoc cards exist nowhere else, and they are gone for
good.** Reach for this only when you genuinely want an empty board.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | — | Required. Database password; no default on purpose |
| `POSTGRES_USER` | `kanban` | Database user |
| `POSTGRES_DB` | `kanban` | Database name |
| `DATABASE_URL` | — | Connection string the app uses; points at the `db` service |
| `PORT` | `3000` | Port inside the container |
| `TZ` | `America/Costa_Rica` | Your timezone, as an IANA name. **Set this.** "Today", "overdue" and a summary's "yesterday" are all local calendar days; the container is UTC without it, so an evening summary would already have rolled into tomorrow and would omit that evening's work |
| `HOST` | `0.0.0.0` | Bind address **inside** the container. Do not change this to make the board private — the loopback restriction comes from the `127.0.0.1:3000:3000` publish spec in `docker-compose.yml`, and binding container loopback would only make the board unreachable |

## Keyboard

The board is built to be driven without a mouse.

| Key | Action |
|---|---|
| `n` | Create a new card |
| `k` / `j` | Focus the next / previous card |
| `Enter` | Open the focused card |
| `1`–`6` | Send the focused card to that column, left to right |
| `/` | Filter the board |
| `,` | Open settings |
| `?` | Show this list |
| `Esc` | Close a dialog |

Press `?` in the board for the same list. It is generated from the shortcut
registry the key handler reads, so it cannot fall out of date.

The numbers are board POSITIONS, not column ids: Iteration Items sits second
and its id is 7. The two matched until slice 5 retired a column and added
another.

## Development

```bash
npm install
npm run dev:api            # API with reload
npm run dev:web            # SPA with reload, proxying /api to the API
```

### Tests

```bash
npm run test:unit          # pure functions, no database
npm run test:acceptance    # Gherkin from the spec, against the API and a real database
npm run test:e2e           # drag-and-drop and the keyboard map, in a browser
npm run test:ops           # container lifecycle, persistence, loopback binding
```

The acceptance suite starts and stops its own test database. `test:e2e` brings
the stack up first, so it works from cold.

The ops suite drives `docker compose` directly. It **runs `down -v` both to set
up and to clean up, so it deletes the cards on your board and leaves the stack
stopped.** Run it before you start using the board for real work, not after,
and expect to `docker compose up -d` afterwards.

The browser tests use the Google Chrome installed on your machine rather than
Playwright's bundled Chromium (`channel: 'chrome'` in `playwright.config.ts`).
The bundled build downloads fully and then stalls during extraction here,
most likely endpoint security scanning the archive. If you would rather have
the hermetic build, `npx playwright install chromium` and drop the `channel`
line.

## How this was built

Spec-driven. Every requirement traces to a behavior pathway and a test:

- [`docs/brd.md`](docs/brd.md) — business requirements and the decision log
- [`specs/001-board-foundation/`](specs/001-board-foundation/) — this slice's
  spec, plan, data model, API contract and tasks
- [`docs/design/visual-language.md`](docs/design/visual-language.md) — the
  visual decisions and why
- [`docs/external-interactions.md`](docs/external-interactions.md) — every
  outside touchpoint, its failure mode and its timeout policy

## Filtering, the archive and summaries

### Filtering

Press `/`, or use the rail on the left. Text matches titles and descriptions
only — tags have their own control, so typing a tag name into the text box will
not surprise you with it.

Filters never survive a reload. That is deliberate: a filtered board must never
be mistaken for a lost one. The rail's collapsed state *is* remembered, since
how wide a panel is and which cards are hidden are different questions.

### Archival

A card that has been in the Done column longer than **Archive after** (7 days
by default) leaves the board on its own. It is archived, never deleted, and the
movement history records it with the system as the actor.

The window is measured from the card's **most recent** arrival in Done, so a
card that finished, was reopened and finished again is measured from the second
time.

Two cards are never taken:

- one that left Done before the window elapsed, and
- one with an **unresolved conflict**, at any age. Slice 3 freezes a conflicted
  card so the disagreement gets settled deliberately; archiving it would dispose
  of the evidence and leave you unable to act. Each pass reports how many it
  skipped for that reason, so a number that stays above zero means there is a
  conflict waiting.

Set the window to `0` to archive at the next pass. Passes run hourly by default
(`Archive every`), on their own schedule rather than the Jira sync's.

### Summaries

**Summary** in the rail. Daily covers yesterday and today — a standup update is
about what you did yesterday and what you are on now. Weekly covers the last
seven days, **including work completed and since archived**.

Movements that came from Jira rather than from you are marked, so you do not
report a teammate's transition as your own progress. **Copy** puts it on the
clipboard as plain text, ready to paste.

### The archive

**Archive** in the rail, defaulting to the last 30 days. Grouped by the day each
card finished; days with nothing in them are omitted. A Jira card that left
because the issue stopped matching your query shows that as its reason —
"I finished it" and "it was reassigned away from me" look identical otherwise.
