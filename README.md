# Quick Kanban Wall

A small, self-hosted Kanban board for one person, showing **all** your assigned
work in one place — Jira issues alongside the ad-hoc work that never gets a
ticket.

Jira is the system of record for project work, but it is not the system of
record for your day. Requests arrive by chat, email and hallway conversation;
they take real hours and compete with everything else, but no Jira board shows
them. This board does.

> **Current state: slice 1 (board foundation).** Local ad-hoc cards, six
> columns, movement history and durable storage. Jira integration arrives in
> slices 2 and 3 — see [`docs/brd.md`](docs/brd.md) for the full plan.

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
card on the board. Once Jira sync exists, Jira-sourced cards will return on the
next sync — but **ad-hoc cards exist nowhere else, and they are gone for
good.** Reach for this only when you genuinely want an empty board.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | — | Required. Database password; no default on purpose |
| `POSTGRES_USER` | `kanban` | Database user |
| `POSTGRES_DB` | `kanban` | Database name |
| `DATABASE_URL` | — | Connection string the app uses; points at the `db` service |
| `PORT` | `3000` | Port inside the container |
| `HOST` | `0.0.0.0` | Bind address **inside** the container. Do not change this to make the board private — the loopback restriction comes from the `127.0.0.1:3000:3000` publish spec in `docker-compose.yml`, and binding container loopback would only make the board unreachable |

## Keyboard

The board is built to be driven without a mouse.

| Key | Action |
|---|---|
| `n` | New card |
| `/` | Search |
| `j` / `k` | Move focus between cards |
| `1`–`6` | Send the focused card to that column |
| `?` | Show all shortcuts |
| `Esc` | Close a dialog |

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

The acceptance suite starts and stops its own test database. The ops suite
drives `docker compose` directly and **runs `down -v` as part of its setup, so
it deletes the cards on your board** — run it before you start using the board
for real work, not after.

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
