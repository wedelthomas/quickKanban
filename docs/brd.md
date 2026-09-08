# Business Requirements Document — Quick Kanban Wall

| Field | Value |
|---|---|
| Document | Business Requirements Document (BRD) |
| Product | Quick Kanban Wall |
| Version | 1.0 |
| Date | 2026-08-26 |
| Author | twedel |
| Status | Approved for specification |
| Downstream artifacts | `specs/*/spec.md` (BDD), `plan.md`, `tasks.md` |

---

## 1. Executive summary

Quick Kanban Wall is a small, self-hosted, single-user web application that
gives one engineer a single visual board for **all** of their assigned work.
It pulls issues assigned to the user from Jira Cloud and keeps them in
two-way sync, and it lets the user create local "ad-hoc" cards for the work
that never gets a Jira ticket. The board runs as a two-container Docker
Compose stack on the user's own machine, with data on a persistent volume.

The product exists because a meaningful share of the user's real workload
does not live in Jira, so no Jira board can answer the question "what am I
actually working on right now?"

---

## 2. Problem statement

Jira is the system of record for project-tracked work, but it is not the
system of record for the user's day. Requests arrive through Slack, email,
hallway conversations, incident channels and meetings. That work is real,
takes real time, and competes for the same hours as Jira-tracked work — but
it is invisible on any Jira board.

Today this produces three concrete problems:

- **BP-1 — No single view of committed work.** The user must mentally merge
  a Jira board with an informal list to know their true workload.
- **BP-2 — Ad-hoc work is invisible and therefore unaccounted for.** Work
  that is not on a board cannot be pointed at during standup, planning, or a
  conversation about capacity.
- **BP-3 — Context switching to update status.** Moving work forward means
  leaving the board and going into Jira, which is enough friction that
  statuses drift out of date.

---

## 3. Goals and objectives

| ID | Objective | Measure of success |
|---|---|---|
| G-1 | One board shows all committed work, Jira and non-Jira alike | User can answer "what am I working on" without opening Jira |
| G-2 | Jira stays accurate without a second trip into Jira | Dragging a card on the board transitions the Jira issue |
| G-3 | Ad-hoc work is captured in seconds | New card created from keyboard in under 5 seconds |
| G-4 | The board is trustworthy | Board state and Jira state never silently disagree; disagreements are surfaced, not guessed at |
| G-5 | Nothing is lost | Container recycling, restart or rebuild does not lose data |
| G-6 | Reporting falls out of normal use | Standup and weekly summaries are generated, not hand-written |

### Non-goals

- Team collaboration, shared boards, or multi-user access.
- Replacing Jira. Jira remains the system of record for Jira-sourced work.
- Sprint planning, estimation, velocity, burndown or capacity tooling.
- Mobile applications or native desktop clients.

---

## 4. Users and stakeholders

| Role | Description | Interest |
|---|---|---|
| Primary user | A single engineer (the product owner of this tool) | Daily use; sole operator; sole beneficiary |
| Jira (external system) | The company's Jira Cloud instance (`yourcompany.atlassian.net`) | Source of truth for Jira-sourced cards; receives status transitions |

There is exactly one human user. Every requirement below is written on that
assumption, and multi-user concerns are explicitly out of scope.

---

## 5. Scope

### 5.1 In scope

- A six-column Kanban board: **Backlog, In Progress, Blocked, Test, PO Review, Done**.
- Automatic import of Jira issues assigned to the user and not yet Done.
- Two-way status sync between the board and Jira.
- Locally created ad-hoc cards that never touch Jira.
- Conflict detection and user-driven conflict resolution.
- Search and filtering across the board.
- A dated archive of completed work.
- A generated standup / weekly summary.
- Two-container Docker Compose deployment with persistent storage.

### 5.2 Out of scope

- Any form of user login or account management.
- Creating Jira issues from the board (ad-hoc cards remain local permanently).
- Editing Jira fields other than status (summary, description, assignee,
  comments, worklogs).
- Jira webhooks or any inbound network path from Jira to the application.
- Cloud hosting, backup or off-machine data replication.
- Attachments or file uploads.

---

## 6. Business requirements

Requirements use **MUST** / **SHOULD** / **MAY** per RFC 2119. Each ID is a
traceability anchor for the BDD specifications.

### 6.1 Board and cards

| ID | Requirement | Priority |
|---|---|---|
| BR-01 | The board MUST present exactly six ordered columns: Backlog, In Progress, Blocked, Test, PO Review, Done. Columns are fixed and not user-editable. | Must |
| BR-02 | A card MUST carry a title, a description, and a column position. | Must |
| BR-03 | A card MUST carry a priority and MAY carry a due date. | Must |
| BR-04 | A card MUST support zero or more free-form tags, and tags MUST be filterable. | Must |
| BR-05 | A card MUST be identifiable as either **Jira-sourced** or **local** at a glance. | Must |
| BR-06 | The user MUST be able to move a card between columns by dragging it, and by keyboard alone. | Must |
| BR-07 | Card order within a column MUST be user-controlled and MUST persist. | Must |
| BR-08 | The user MUST be able to create, edit and delete local cards. | Must |
| BR-09 | The user MUST NOT be able to delete a Jira-sourced card from the board while it remains in the configured Jira query. | Must |

### 6.2 Jira integration

| ID | Requirement | Priority |
|---|---|---|
| BR-10 | The system MUST import Jira issues matching *assigned to the current user and not in the Done status category*. | Must |
| BR-11 | The Jira query MUST be viewable and adjustable in settings. | Should |
| BR-12 | The system MUST poll Jira on a configurable interval, defaulting to 5 minutes. | Must |
| BR-13 | The user MUST be able to trigger an immediate refresh on demand. | Must |
| BR-14 | The system MUST show when the last successful sync occurred and MUST show sync failures without blocking use of the board. | Must |
| BR-15 | The system MUST hold a per-issue record of the last known Jira state (status and Jira's own last-updated timestamp) to enable three-way comparison. | Must |
| BR-16 | Settings MUST let the user map each board column to a Jira status. | Must |
| BR-17 | A column with no configured Jira mapping MUST be treated as **local-only**: moving a Jira card into it changes the board and leaves the Jira issue untouched. | Must |
| BR-18 | Moving a Jira-sourced card into a **mapped** column MUST attempt the corresponding Jira status transition. | Must |
| BR-19 | If no legal Jira transition exists from the issue's current status to the mapped target, the move MUST be rejected, the card MUST return to its prior column, and the user MUST be told why. | Must |
| BR-20 | If Jira is unreachable, board interaction MUST continue to work and the failure MUST be surfaced without data loss. | Must |
| BR-21 | A Jira issue that disappears from the configured query (closed, or reassigned away) MUST be moved to Done and archived with the reason recorded, and MUST NOT be silently deleted. | Must |
| BR-22 | The system MUST NOT modify any Jira field other than issue status. | Must |
| BR-23 | Local cards MUST never be pushed to Jira under any circumstance. | Must |

### 6.3 Conflict handling

| ID | Requirement | Priority |
|---|---|---|
| BR-24 | When a Jira-sourced card has changed **both** locally and in Jira since the last sync, and the two disagree, the system MUST record a conflict rather than choosing a winner. | Must |
| BR-25 | A card in conflict MUST be visibly marked on the board. | Must |
| BR-26 | A card in conflict MUST hold its position and MUST NOT be auto-moved by subsequent syncs until the conflict is resolved. | Must |
| BR-27 | Conflict resolution MUST present both states side by side and MUST offer exactly two outcomes: keep the local state (pushing it to Jira) or accept the Jira state. | Must |
| BR-28 | Resolving a conflict MUST be recorded in the movement history. | Should |

### 6.4 Finding and reviewing work

| ID | Requirement | Priority |
|---|---|---|
| BR-29 | The user MUST be able to filter the board by free text, tag, priority, and source (Jira vs local). | Must |
| BR-30 | Filtering MUST operate in place on the board rather than navigating to a separate results page. | Should |
| BR-31 | Every card movement MUST be recorded in an append-only history: which card, from where, to where, when, and whether the user or the sync process caused it. | Must |
| BR-32 | Completed work MUST leave the active board on archival and MUST remain retrievable by date. | Must |
| BR-33 | The system MUST generate a summary of recent activity covering what moved, what is in progress, and what is blocked, for a chosen period (day or week). | Must |
| BR-34 | The generated summary MUST be copyable as plain text suitable for pasting into a chat or document. | Should |

### 6.5 Settings

| ID | Requirement | Priority |
|---|---|---|
| BR-35 | Settings MUST cover the Jira query, poll interval, and column-to-status mapping. | Must |
| BR-36 | Settings MUST persist across restarts. | Must |
| BR-37 | Jira credentials MUST NOT be editable or viewable through the user interface. | Must |

---

## 7. Non-functional requirements

### 7.1 Security and privacy

| ID | Requirement |
|---|---|
| NFR-01 | Jira credentials MUST be supplied by environment configuration only, MUST live in a gitignored file or container secret, and MUST NEVER be committed to the repository. |
| NFR-02 | Jira credentials MUST NEVER be transmitted to the browser. All Jira calls originate from the server. |
| NFR-03 | The application MUST bind to the loopback interface only. Operating without authentication is acceptable **only** because the service is not network-reachable. |
| NFR-04 | Credentials MUST NOT appear in logs, error messages, or diagnostic output. |
| NFR-05 | Dependencies MUST be free of known Critical or High vulnerabilities with an available fix at release. |

### 7.2 Reliability and data integrity

| ID | Requirement |
|---|---|
| NFR-06 | Application data MUST survive container recreation, image rebuild, and host restart, via a persistent database volume. |
| NFR-07 | Concurrent sync executions MUST NOT overlap; a scheduled poll and a manual refresh MUST NOT both apply changes at once. |
| NFR-08 | A failed Jira write MUST leave board state and Jira state consistent with each other or explicitly flagged, never silently divergent. |
| NFR-09 | Jira API errors, rate limits and timeouts MUST be handled with retry and backoff rather than surfacing as an application crash. |

### 7.3 Usability and performance

| ID | Requirement |
|---|---|
| NFR-10 | Card movement MUST appear applied immediately and reconcile with the server in the background. |
| NFR-11 | No routine action may require a full page reload. |
| NFR-12 | Every action available by mouse MUST also be reachable by keyboard, including creating a card, searching, and moving a card between columns. |
| NFR-13 | Cards MUST be information-dense: key, title, priority, due date and tags legible without opening the card. |
| NFR-14 | The board MUST render a typical workload (about 50 cards) without scrolling within a column on a standard laptop display. |
| NFR-15 | Board load MUST complete in under 1 second against a local database. |
| NFR-16 | Sync progress and failure MUST be communicated without blocking interaction with the board. |

### 7.4 Operability

| ID | Requirement |
|---|---|
| NFR-17 | The full stack MUST start from a single `docker compose up`. |
| NFR-18 | Database schema migrations MUST apply automatically on application start. |
| NFR-19 | The application MUST expose a health endpoint suitable for a container healthcheck. |
| NFR-20 | Setup — obtaining a Jira API token, configuring environment values, starting the stack — MUST be documented in the repository README. |

### 7.5 Quality and process

| ID | Requirement |
|---|---|
| NFR-21 | Development MUST follow the BDD/TDD workflow: executable Gherkin acceptance criteria authored before implementation, failing first. |
| NFR-22 | The sync decision logic MUST be implemented as a pure function, free of I/O, so that every state permutation is unit-testable without a live Jira. |
| NFR-23 | Jira access MUST sit behind an interface with a test double, so that no automated test in the standard suite contacts live Jira. |
| NFR-24 | Drag-and-drop and keyboard navigation MUST be covered by browser-level end-to-end tests. |

---

## 8. Constraints and assumptions

### Constraints

| ID | Constraint |
|---|---|
| C-1 | Deployment target is Docker Compose: one application container, one database container, one persistent volume. |
| C-2 | Jira is Atlassian Cloud at `tsgjira.atlassian.net`, accessed via its REST API using an Atlassian account email plus a personal API token (HTTP Basic). |
| C-3 | Implementation is TypeScript end to end — React front end, Node backend, PostgreSQL. |
| C-4 | Single user, single machine, no authentication layer. |
| C-5 | Inbound connections from Jira (webhooks) are unavailable; synchronisation is poll-based only. |

### Assumptions

| ID | Assumption | If wrong |
|---|---|---|
| A-1 | The user can generate an Atlassian API token without administrator approval. | Falls back to OAuth 2.0 (3LO), which requires developer-console registration. |
| A-2 | The user's Jira permissions allow transitioning their own assigned issues. | Two-way sync degrades to read-only; the board still delivers value. |
| A-3 | Jira workflows expose the statuses the user wants to map to board columns. | Unmapped columns remain local-only, which BR-17 already accommodates. |
| A-4 | Assigned open issues number in the tens, not thousands. | Pagination and incremental sync would need explicit design. |
| A-5 | Docker Desktop or an equivalent runtime is available on the user's machine. | Deployment approach must be reconsidered. |

---

## 9. Key decisions and rationale

| # | Decision | Rationale | Alternatives rejected |
|---|---|---|---|
| D-1 | Two-way sync rather than read-only | Removes the context switch into Jira that causes status drift (BP-3) | Read-only sync; manual import |
| D-2 | Jira REST API with a personal API token | Works headlessly for background polling, needs no administrator involvement or consent flow | OAuth 2.0 3LO (heavier); reusing an MCP server (not callable from a container — MCP tools are session-bound, not a network service the app can consume) |
| D-3 | Conflicts are flagged for the user, never auto-resolved | Silent resolution can lose either a deliberate local decision or a legitimate teammate update; visible conflicts preserve trust (G-4) | Jira always wins; last write wins; local always wins |
| D-4 | All Jira I/O is server-side | Keeps credentials out of the browser and lets sync continue with no tab open | Browser-side calls (blocked by CORS and exposes the token) |
| D-5 | Sync decisions are a pure function over (local, remote, snapshot) | Makes every conflict permutation a fast table-driven unit test instead of an integration test against live Jira | Decision logic embedded in the sync service |
| D-6 | Store a last-known-Jira-state snapshot per issue | Without it, "Jira changed" is indistinguishable from "I changed", and every disagreement would look like a conflict | Comparing local and remote alone |
| D-7 | Unmapped column means local-only | Most Jira workflows have no "Blocked" status — it is a flag or label — so this handles the common case without special-casing it in code | Requiring a mapping for all six columns; rejecting Jira cards in unmapped columns |
| D-8 | Append-only movement log alongside mutable state | The archive and the standup summary both need "what moved this week", which current-state-only storage cannot answer | Full event sourcing (disproportionate); no history (defeats BR-32/BR-33) |
| D-9 | Ad-hoc cards never become Jira issues | Keeps the sync model unambiguous: a card's source is fixed for its lifetime | A "Create in Jira" promotion action |
| D-10 | Six fixed columns | Matches the user's actual workflow; configurable columns would make the status mapping dynamic for no present benefit | User-configurable columns |
| D-11 | No authentication, bound to loopback | Single user on their own machine; network isolation, not a login form, is the correct control at this scale | Password gate; full user accounts |

---

## 10. Delivery slices

The BRD describes the whole product. Delivery proceeds in four slices, each
with its own specification, plan, task list and implementation cycle. Every
slice ends with something the user can run.

| Slice | Contents | Requirements | Outcome |
|---|---|---|---|
| **1. Board foundation** | Six columns, local ad-hoc cards, drag and keyboard movement, persistence, Docker Compose stack | BR-01…BR-08, NFR-06, NFR-10…NFR-20 | A usable personal Kanban board |
| **2. Jira import** | Read-only pull of assigned issues, snapshot storage, sync status, manual refresh | BR-05, BR-09…BR-15, BR-21, NFR-01…NFR-04, NFR-07, NFR-09 | Jira work appears on the board |
| **3. Two-way sync** | Column-to-status mapping, transitions on move, conflict detection and resolution | BR-16…BR-20, BR-22…BR-28, BR-35…BR-37, NFR-08, NFR-22, NFR-23 | The board drives Jira |
| **4. Review and reporting** | Search and filter, dated archive, standup and weekly summary | BR-29…BR-34 | Reporting falls out of daily use |

NFR-05, NFR-21 and NFR-24 are cross-cutting: they apply to every slice rather
than belonging to one.

Sequencing rationale: each slice depends on tested ground beneath it.
Synchronisation cannot be meaningfully tested before a board exists, and
conflict handling cannot be tested before issues are being imported.

---

## 11. Success metrics

| ID | Metric | Target |
|---|---|---|
| M-1 | Share of the user's committed work visible on one board | 100% |
| M-2 | Trips into the Jira UI to change a status | Approaches zero |
| M-3 | Time to capture an ad-hoc item | Under 5 seconds, keyboard only |
| M-4 | Silent divergence between board and Jira | Zero occurrences |
| M-5 | Data loss across container recycling | Zero occurrences |
| M-6 | Effort to produce a standup update | Generated, not written |

---

## 12. Risks

| ID | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R-1 | Jira workflow forbids a mapped transition from the issue's current status | Moves rejected; user frustration | High | BR-19 rejects clearly and explains; mapping is user-adjustable |
| R-2 | Jira API token expires or is revoked | Sync stops | Medium | BR-14 surfaces failure prominently; board remains usable offline (BR-20) |
| R-3 | Conflicts accumulate unresolved and clutter the board | Board becomes untrustworthy | Medium | Conflicts are visually prominent and resolvable in two clicks (BR-25, BR-27) |
| R-4 | Poll interval too aggressive and trips Jira rate limits | Sync degradation | Low | Configurable interval (BR-12); backoff and retry (NFR-09) |
| R-5 | Optimistic UI shows a move that Jira later rejects | User believes a false state | Medium | Immediate revert with a specific reason (BR-19); typed failure modes |
| R-6 | Scope creep toward a team tool | Delivery slips; authentication and multi-tenancy pulled in | Medium | Multi-user is an explicit non-goal; slices deliver value early |
| R-7 | Persistent volume deleted during troubleshooting | Total data loss | Low | Named volume documented in the README (NFR-20); local cards are the only irreplaceable data |

---

## 13. Glossary

| Term | Definition |
|---|---|
| **Ad-hoc card** | A card created directly on the board, with no Jira issue behind it. Local and permanent. |
| **Jira-sourced card** | A card representing a Jira issue, kept in sync with it. |
| **Snapshot** | The last-known Jira state (status plus Jira's last-updated timestamp) recorded for a Jira-sourced card. |
| **Three-way comparison** | Comparing local state, remote state and snapshot to distinguish a local change from a remote change from a genuine conflict. |
| **Conflict** | A Jira-sourced card that changed both locally and in Jira since the last sync, in disagreeing ways. |
| **Mapped column** | A board column with a configured Jira status; moving a Jira card into it triggers a transition. |
| **Local-only column** | A board column with no configured Jira status; moves within it never contact Jira. |
| **Optimistic update** | Applying a change in the interface immediately, then reconciling with the server, reverting on failure. |
| **Slice** | A vertically complete increment delivering usable functionality end to end. |
