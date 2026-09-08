# Phase 0 Research — Board Foundation

Unknowns resolved before design. Most technical constraints arrived already
decided (BRD §8, `docs/design/visual-language.md`); what remained were
library and approach choices.

## Decisions

### Card ordering within a column

**Chosen**: integer `position`, renumbered across the affected column inside
the move transaction.

**Rejected — fractional positions** (insert at the midpoint between
neighbours). The standard trick, and genuinely better when a column holds
thousands of rows and renumbering would be expensive. Here a column holds tens
of cards, so renumbering is a single cheap `UPDATE`, and fractional ordering
brings a real cost: repeated insertions between the same pair halve the gap
each time until floating-point precision runs out, which then needs a
rebalancing routine — machinery to solve a problem this board will never have.

### Migrations

**Chosen**: numbered `.sql` files applied in order at process start, tracked
in a `schema_migrations` table. Roughly 40 lines.

**Rejected — a migration framework** (`node-pg-migrate` or similar). It
brings a dependency, a CLI, a config file and a plugin lifecycle to run four
SQL files in order. Principle XIII: if a few lines suffice, do not add a
package.

**Forward-only.** No down-migrations. With one database and one user, a
rollback path is speculative — and the rollback that matters (redeploy the
previous image) does not touch the schema.

### Database access

**Chosen**: `pg` with hand-written SQL.

**Rejected — an ORM** (Prisma, Drizzle, TypeORM). Six tables, one join of any
substance, and queries that are clearer as SQL than as a query builder. An ORM
would add a schema language, a generation step and a migration system that
duplicates the one above.

### Drag and drop

**Chosen**: `@dnd-kit/core` with `@dnd-kit/sortable`.

**Why this one specifically**: the accessibility decision recorded in the spec
(keyboard parity, FR-022) makes a real keyboard sensor a requirement, not a
nice-to-have. `@dnd-kit` ships one, and it drives the same drag lifecycle as
the pointer sensor, so BH-014's keyboard move and BH-007's pointer move share
one code path rather than diverging.

**Rejected — `react-beautiful-dnd`**: no longer actively maintained.
**Rejected — the HTML5 drag-and-drop API directly**: no keyboard story at
all, and its event model would mean writing the keyboard path separately.

### Front-end state

**Chosen**: React context plus `useReducer`, holding the board and a queue of
in-flight optimistic moves.

**Rejected — a state library** (Redux, Zustand, TanStack Query). One screen,
one entity graph, and an optimistic-update pattern small enough to read in one
sitting. TanStack Query is the closest call — its optimistic mutation handling
is exactly this problem — but its cache model would then own the board, and
the revert-on-failure logic (BH-010) is clearer written directly.

### Styling

**Chosen**: plain CSS with custom properties, tokens in `src/web/styles/tokens.css`.

**Rejected — Tailwind or a component library**. The visual language is a
fixed, dark-only palette of about ten colours already written down. A utility
framework or component kit would import a design system in order to override
it.

### Serving the SPA

**Chosen**: `@fastify/static` serving the Vite build from the same process and
port as the API.

**Rejected — a separate nginx container**. The BRD constrains this to exactly
two containers, and a third serving static files would earn its place only if
the API and the front end scaled separately, which for one user they do not.

## Runtime dependencies and their justification

| Dependency | Why it is here | What replaces it if dropped |
|---|---|---|
| `fastify` | HTTP server, routing, structured logging, error hooks | Node's `http` plus several hundred lines |
| `@fastify/static` | Serves the built SPA from the API process | Hand-rolled static file handling with correct caching and MIME types |
| `pg` | PostgreSQL client with pooling | Nothing — this is the driver |
| `zod` | Request validation at the boundary (Principle I) and shared form validation | Hand-written validators duplicated between server and web |
| `react` + `react-dom` | Front end | — |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Drag with a first-class keyboard sensor (FR-022) | The HTML5 API plus a separate keyboard implementation |

Six runtime dependencies. Build and test tooling — `vite`, `typescript`,
`vitest`, `@cucumber/cucumber`, `@playwright/test`, `tsx` — does not ship in
the runtime image.

## Open questions carried forward

None. Every question raised during specification was resolved through
`/speckit.clarify` and is recorded in `spec.md` under `## Clarifications`.
