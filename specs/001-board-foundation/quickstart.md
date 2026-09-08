# Quickstart — Board Foundation

## Run it

```bash
cp .env.example .env      # set POSTGRES_PASSWORD to anything; it never leaves your machine
docker compose up
```

Open <http://127.0.0.1:3000>. The schema is created on first start; the board
appears with six empty columns.

`.env` is gitignored and must stay that way — Principle I admits no exception,
including for a throwaway local database password.

## Verify it works

| Check | Expectation |
|---|---|
| `curl -s 127.0.0.1:3000/api/health` | `{"status":"ok","database":"ok"}` |
| Press `n`, type a title, press Enter | Card appears at the top of Backlog |
| Drag it to In Progress | Moves immediately, survives a reload |
| `docker compose down && docker compose up` | Board is exactly as you left it |
| `curl -s 127.0.0.1:3000/api/cards/<id>/events` | One event per column change |

## Tests

```bash
npm run test:unit         # Vitest — pure functions, no database
npm run test:acceptance   # cucumber-js against the API and a real database
npm run test:e2e          # Playwright — drag, keyboard, no-reload
npm run test:ops          # container lifecycle, persistence, loopback binding
```

The acceptance and ops suites need the stack running. No test in any suite
contacts a live Jira instance — there is no Jira code in this slice at all.

## Reset

```bash
docker compose down
docker volume rm quick-kanban-wall_kanban_data
```

**`kanban_data` is the volume holding everything.** Removing it deletes every
card. Jira-sourced cards would come back on the next sync — but that is Slice
2, and ad-hoc cards exist nowhere else, ever. This is risk R-7 in the BRD and
the reason FR-038 requires the volume to be named in the README.

## Ports and binding

The app publishes to `127.0.0.1:3000` only, never `0.0.0.0` (FR-034). The
database port is not published at all — the app reaches it over the Compose
network. Running without authentication is defensible precisely because of
this; if you ever change the binding, the no-login decision has to be
reopened.
