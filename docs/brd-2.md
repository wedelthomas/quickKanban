# Business Requirements Document — Quick Kanban Wall, Phase 2

| Field | Value |
|---|---|
| Document | Business Requirements Document (BRD) |
| Product | Quick Kanban Wall |
| Version | 2.0 |
| Date | 2026-08-26 |
| Author | twedel |
| Status | Draft for review |
| Predecessor | `docs/brd.md` v1.0 (BR-01…BR-37, NFR-01…NFR-24) — remains in force except where §3 below supersedes it |
| Downstream artifacts | `specs/005-*/spec.md`, `specs/006-*/spec.md`, and their plans and task lists |

---

## 1. Executive summary

Phase 2 gives the board a sense of **time**. Version 1 answered "what am I
working on?" Version 2 answers three questions it could not: *which iteration
are we in*, *where did my iteration actually go*, and *how much of my work is
the invisible kind*.

Three changes deliver that. The board learns the TradeStation iteration
calendar and displays it. The column set is restructured so that committing
work to an iteration is a first-class move, which costs the Blocked column —
blocked becomes a flag on the card, matching how TradeStation's own Jira
already models it. And the movement history that version 1 has been writing
since Slice 1 is finally read for what it always implied: elapsed time per
card, per iteration, split by whether the work was ever tracked in Jira.

No new manual bookkeeping is introduced. Time is derived, never typed.

---

## 2. Problem statement

Version 1 succeeded at its own goal and, in doing so, exposed the next one.
The board now shows all committed work — but it shows it *undated*, in a flat
present tense, with no notion of the two-week rhythm the rest of the company
runs on.

- **BP-4 — The board has no sense of the iteration.** Every other team artefact
  is organised around "2026 S18". The board is not, so it cannot say what was
  committed to this iteration, what carried over, or how much of it is left.
- **BP-5 — Effort is invisible even though the evidence exists.** The
  append-only movement history (BR-31) already records every transition with a
  timestamp. Nobody reads it for duration, so "where did my week go" remains
  unanswerable despite the data sitting in the database.
- **BP-6 — Ad-hoc work is visible but still unquantified.** Version 1 solved
  BP-2 by putting ad-hoc work on the board. It did not solve the follow-on
  argument: *how much* of the user's capacity that work consumes. Being able to
  point at a card is weaker than being able to say "41% of my hours".
- **BP-7 — Blocked is modelled as a place, not a state.** A card that is
  blocked is still in test, or still in development. Moving it to a Blocked
  column destroys that information, and the column consumes a sixth of the
  board's width to do it.

---

## 3. Relationship to BRD v1 — what this document supersedes

Version 1 remains the authority for everything not listed here. Three of its
provisions are explicitly overridden.

| v1 provision | v1 text | v2 disposition |
|---|---|---|
| **§3 Non-goals** | "Sprint planning, estimation, velocity, burndown or capacity tooling." | **Narrowed.** Estimation, velocity, capacity and **burndown** *for the single user* come into scope (BR-63…BR-69, BR-84…BR-85). Sprint planning as a team ceremony remains out of scope. |
| **BR-01** | "The board MUST present exactly six ordered columns: Backlog, In Progress, Blocked, Test, PO Review, Done." | **Replaced by BR-38.** Still exactly six fixed columns; Blocked is replaced by Iteration Items. |
| **D-7** | Unmapped column means local-only — rationale: "most Jira workflows have no Blocked status". | **Rationale transferred, mechanism unchanged.** Iteration Items has the same property: no Jira status corresponds to it. The local-only column mechanism is reused as-is, not redesigned. |

Two v1 provisions are deliberately **reaffirmed** because Phase 2 puts pressure
on them and the answer is no:

| v1 provision | Pressure from v2 | Ruling |
|---|---|---|
| **BR-22** — no Jira field is modified except status | The blocked flag and story points both exist as Jira fields that could be written | **Holds.** Both are read-only inbound. The board still writes exactly one thing to Jira: status. |
| **BR-23** — local cards never pushed to Jira | Local cards now carry points and accrue time | **Holds.** Points and time on local cards are local facts and stay local. |

---

## 4. Goals and objectives

| ID | Objective | Measure of success |
|---|---|---|
| G-7 | The board knows what iteration it is | The current TS iteration and its dates are correct on the banner every day, including across a fiscal-year rollover |
| G-8 | Committing work to an iteration is a visible act | Iteration Items holds what the user has committed to; carry-over is observable rather than inferred |
| G-9 | Blocked is a state, not a destination | A blocked card keeps its real column and is identifiable at a glance across a full board |
| G-10 | Effort is measured without being recorded | Time comes from movements already logged; the user never types a duration |
| G-11 | Invisible work becomes a number | The share of hours and points spent on local versus Jira-sourced work is reportable per iteration |
| G-12 | Time and delivery stay distinct | Hours spent and points completed are reported as two independent metrics |
| G-13 | Progress through the iteration is visible while it runs | A burndown shows remaining committed work day by day, distinguishing work finished from scope added |

### Non-goals

Everything in v1 §3's non-goals stands except as narrowed in §3 above.
Additionally out of scope for Phase 2:

- Burn-up charts, and any chart of a team's progress rather than the user's own.
- Team velocity, team capacity, or anyone else's numbers.
- Writing sprint membership, story points, or the blocked flag back to Jira.
- Sprint ceremonies: planning, review, retrospective tooling.
- Forecasting or predicting completion dates from historical velocity.
- Time entry, timers, start/stop controls, or worklog editing of any kind.

---

## 5. Users and stakeholders

Unchanged from v1 §4: exactly one human user, one machine stakeholder (Jira).
Phase 2 adds one read-only dependency:

| Role | Description | Interest |
|---|---|---|
| Jira Agile API (external) | `/rest/agile/1.0` on `tsgjira.atlassian.net` | Source of the iteration calendar: the reference board's active sprint name, ordinal and boundary dates |

---

## 6. Scope

### 6.1 In scope

- Restructuring the six board columns; retiring the Blocked column.
- Blocked as a boolean card attribute, imported from Jira and settable locally.
- Awareness of the TradeStation iteration calendar, shown in a top banner.
- An Iteration Items column holding work committed to the current iteration.
- Elapsed time per card, derived from the existing movement history.
- Story points, imported from Jira and editable locally.
- Per-iteration reporting: where time went, invisible-work share, commitment
  versus completion, velocity, and a burndown of remaining committed work.
- Extending the v1 summary (BR-33) with time and iteration framing.

### 6.2 Out of scope

- Everything listed in §4 non-goals.
- Any change to the conflict model of v1 §6.3. Points and blocked are read-only
  inbound and therefore cannot conflict.
- Multi-board or multi-team iteration views.
- Changing how movements themselves are recorded (BR-31 stands as written).

---

## 7. Business requirements

Numbering continues from v1. RFC 2119 keywords, as before.

### 7.1 Board restructure

| ID | Requirement | Priority |
|---|---|---|
| BR-38 | The board MUST present exactly six ordered columns: **Backlog, Iteration Items, In Progress, Test, PO Review, Done**. Columns remain fixed and not user-editable. Supersedes BR-01. | Must |
| BR-39 | The Blocked column MUST be removed, and blocked MUST become a boolean attribute of a card, orthogonal to its column. | Must |
| BR-40 | On upgrade, every card in the Blocked column MUST move to **In Progress** with the blocked flag set. It MUST NOT be moved to Backlog, which would discard the fact that the work is in flight. | Must |
| BR-41 | The migration in BR-40 MUST be recorded in the movement history, attributed to the system rather than the user, so the board's record of itself stays complete. | Must |
| BR-42 | **Iteration Items** MUST hold the cards the user has committed to the current iteration, and placement MUST be a user action. Membership MUST NOT be derived from Jira sprint membership. | Must |
| BR-43 | Iteration Items MUST default to having no Jira status mapping, making it a local-only column under the existing BR-17 mechanism. | Must |
| BR-44 | Cards remaining in Iteration Items, In Progress, Test or PO Review when an iteration ends MUST remain on the board and MUST carry into the new iteration. | Must |
| BR-86 | A carried-over card MUST show, on the card face, how many iterations it has carried through, so that chronic carry-over is visible on the board rather than only in a report. | Must |

### 7.2 The blocked flag

| ID | Requirement | Priority |
|---|---|---|
| BR-45 | A blocked card MUST be identifiable at a glance without opening it, and MUST remain identifiable when roughly 50 cards are on screen (NFR-13, NFR-14). | Must |
| BR-46 | Blocked MUST be conveyed by more than colour alone, so that the state survives greyscale and colour-vision deficiency. | Must |
| BR-47 | The user MUST be able to set and clear the blocked flag on any card, local or Jira-sourced. | Must |
| BR-48 | Blocked MUST be filterable alongside the existing v1 filters (BR-29). | Must |
| BR-49 | Being blocked MUST NOT prevent a card from moving between columns. Blocked is an annotation, unlike a conflict, which freezes a card under BR-26. | Must |
| BR-50 | The system MUST import Jira's blocked state for Jira-sourced cards from the configured blocked field. | Must |
| BR-51 | The board MUST NOT write the blocked flag back to Jira. BR-22 stands. | Must |
| BR-52 | Where Jira reports a card as blocked and the user has cleared it locally, or vice versa, the local value MUST win and the divergence MUST be visible on the card. This is not a conflict under v1 §6.3 and MUST NOT freeze the card. | Must |
| BR-53 | The blocked grouping in the generated summary (BR-33) MUST be driven by the flag rather than by column membership. | Must |

### 7.3 Iteration awareness

| ID | Requirement | Priority |
|---|---|---|
| BR-54 | The system MUST determine the current TradeStation iteration: its ordinal name, start date and end date. | Must |
| BR-55 | The iteration MUST be read from a single configured Jira **reference board** via the Agile API, taking its active sprint's name and dates. The board MUST be configurable, defaulting to board 1391 (CRM TradeBlazers). | Must |
| BR-56 | The iteration ordinal MUST be taken from Jira rather than computed by counting, because the ordinal resets at the fiscal-year boundary and a counting rule would drift silently. | Must |
| BR-57 | The current iteration MUST be displayed in a persistent top banner showing its name, its date range, and the working days remaining. | Must |
| BR-58 | The resolved iteration MUST be cached, and the board MUST continue to display the last known iteration when Jira is unreachable, consistent with BR-20. | Must |
| BR-59 | A displayed iteration that is cached or computed rather than freshly read MUST be marked as such, so a stale iteration is never mistaken for a confirmed one. | Must |
| BR-60 | If no reference board yields an iteration and no cache exists, the system MUST fall back to a configured anchor date and cadence length, and MUST mark the result as estimated. | Should |
| BR-61 | Iteration resolution MUST NOT block board load (NFR-15). The banner MAY populate after the board renders. | Must |

### 7.4 Time

| ID | Requirement | Priority |
|---|---|---|
| BR-62 | Elapsed time per card MUST be derived from the append-only movement history (BR-31). It MUST NOT be entered by the user and MUST NOT be read from any Jira field. | Must |
| BR-63 | The clock MUST start when a card first enters **In Progress** and stop when it reaches **Done**, including any time spent in Test and PO Review. | Must |
| BR-64 | Elapsed time MUST count configured working hours only, so that nights, weekends and non-working days do not inflate it. | Must |
| BR-65 | Time MUST NOT accrue while a card is blocked. | Must |
| BR-66 | A card that returns to an earlier column and advances again MUST accumulate time across all its passes rather than restarting. | Must |
| BR-67 | All derived time MUST be recomputable from the movement history, so that a corrected working-hours setting corrects historical figures rather than leaving them frozen and wrong. | Must |
| BR-68 | Time MUST be attributable to the iteration during which it accrued. A card spanning two iterations MUST apportion its time between them rather than assigning all of it to either. | Must |

### 7.5 Points and velocity

| ID | Requirement | Priority |
|---|---|---|
| BR-69 | The system MUST import story points for Jira-sourced cards from the configured story-points field. | Must |
| BR-70 | The user MUST be able to set points on any card, local or Jira-sourced. | Must |
| BR-71 | Points MUST NOT be written back to Jira. BR-22 stands. | Must |
| BR-72 | Where a local points value differs from the imported Jira value, the local value MUST be used and the difference MUST be visible when the card is opened. | Must |
| BR-73 | Velocity MUST be reported as the sum of points on cards reaching Done within an iteration. | Must |
| BR-74 | Points and elapsed time MUST be reported as separate metrics and MUST NOT be combined into a single derived score such as hours-per-point. | Must |

### 7.6 Reporting

| ID | Requirement | Priority |
|---|---|---|
| BR-75 | The system MUST report, for a chosen iteration, where time went — broken down by card and by Jira project. | Must |
| BR-76 | The system MUST report the share of time and of points attributable to local cards versus Jira-sourced cards, quantifying the invisible work of BP-6. | Must |
| BR-77 | The system MUST report committed points for the iteration against completed points, so that overcommitment is observable. | Must |
| BR-78 | The generated summary (BR-33) MUST be able to use the iteration as its reporting period, alongside the existing day and week. | Must |
| BR-79 | All Phase 2 reports MUST be copyable as plain text, consistent with BR-34. | Should |
| BR-80 | A report covering a period in which data is incomplete — for instance an iteration that began before Phase 2 was installed — MUST say so rather than presenting a partial figure as a total. | Must |
| BR-84 | The system MUST provide a burndown for an iteration, showing committed points remaining at the close of each working day across the iteration. | Must |
| BR-85 | The burndown MUST distinguish work completed from scope added or removed after the iteration began. A chart that shows only a remaining total misrepresents a mid-iteration addition as a failure to progress. | Must |

### 7.7 Settings

| ID | Requirement | Priority |
|---|---|---|
| BR-81 | Settings MUST cover the iteration reference board, working hours and working days, and the fallback anchor date and cadence length. | Must |
| BR-82 | The Jira custom field identifiers for story points, sprint and blocked MUST be configurable, with documented defaults, so that a Jira administration change does not require a code change. | Must |
| BR-83 | Phase 2 settings MUST persist across restarts, consistent with BR-36. | Must |

---

## 8. Non-functional requirements

Numbering continues from v1. All v1 NFRs remain in force.

| ID | Requirement |
|---|---|
| NFR-25 | Agile API access MUST sit behind the same port-and-adapter arrangement as the existing Jira access (NFR-23), with a test double, so no automated test in the standard suite contacts live Jira. |
| NFR-26 | Time derivation MUST be a pure function over the movement history and the working-hours configuration, free of I/O, so every permutation is unit-testable — the same discipline D-5 applied to sync decisions. |
| NFR-27 | The BR-40 column migration MUST be covered by an automated test that asserts no card is lost and every migrated card retains its blocked state. |
| NFR-28 | Failure to resolve the iteration MUST degrade to the cached or estimated value and MUST NOT surface as an application error or block any board interaction. |
| NFR-29 | Derived figures — time, velocity, invisible-work share — MUST NOT be stored as the sole record of themselves. The movement history remains the source of truth and derived values MUST be reproducible from it. |
| NFR-30 | The blocked flag, the iteration banner, and points MUST be reachable and legible by keyboard and to a screen reader, consistent with NFR-12. |
| NFR-31 | Phase 2 MUST follow the BDD/TDD workflow of NFR-21: executable Gherkin acceptance criteria authored before implementation, failing first. |
| NFR-32 | Adding the iteration banner and card-level points MUST NOT breach the density budget of NFR-14: roughly 50 cards remain visible without scrolling within a column. |

---

## 9. Constraints and assumptions

### Constraints

All v1 constraints (C-1…C-5) stand.

| ID | Constraint |
|---|---|
| C-6 | Phase 2 additionally depends on the Jira Agile API (`/rest/agile/1.0`), which is a distinct API surface from the REST v3 endpoints used by v1. |
| C-7 | Phase 2 is built on the completed v1 baseline. It assumes Slices 1 through 4 are finished and merged, and modifies that code rather than replacing it. |
| C-8 | Iteration boundary dates differ by up to one day between TradeStation teams. The board reports one team's boundaries — the nominated reference board's — not a company-wide truth, because no such single truth exists in Jira. |

### Assumptions

| ID | Assumption | If wrong |
|---|---|---|
| A-6 | The user's Jira credentials can read the Agile API for the nominated reference boards. | Iteration falls back to the configured anchor and cadence (BR-60), marked as estimated. |
| A-7 | The reference board maintains an active sprint with populated start and end dates. | Same fallback as A-6. Verified true at time of writing for board 1391, whose active sprint is dated even though its future sprints are not. |
| A-8 | The TradeStation cadence remains two weeks. | The fallback cadence length is configurable (BR-81); the Jira-read path is unaffected, since it takes real dates. |
| A-9 | The user's own workload will continue to be sparsely pointed in Jira. | Velocity relies more heavily on locally entered points (BR-70), which is why local entry is a Must rather than a Should. |
| A-10 | Cards do not sit parked in In Progress for long periods without real work. | Derived time overstates effort; the blocked flag (BR-65) is the intended relief valve, and R-9 tracks the residual risk. |

---

## 10. Key decisions and rationale

| # | Decision | Rationale | Alternatives rejected |
|---|---|---|---|
| D-12 | Blocked becomes a card flag, not a column | TradeStation's own Jira already models it this way: `customfield_10003` "Blocked Issue" is set on issues whose status is Development, Test or Open. Blocked is empirically orthogonal to status, and a column forces it to be exclusive | Keeping the Blocked column; a seventh column |
| D-13 | Blocked shown as a card edge **and** a badge | The edge is scannable across 50 cards where a badge is not; the badge names the state, satisfying BR-46 without relying on colour. The freed `--column-blocked` hue transfers to the flag | Recolouring the priority dot, which would overwrite priority on exactly the cards that most need triage |
| D-14 | Iteration Items membership is a local decision | Only 1 of the user's 12 open issues carries a Jira sprint. Deriving membership from Jira would leave the column almost empty and useless | Auto-populating from Jira sprint membership |
| D-15 | The iteration is read from Jira, not computed | The sprint ordinal resets at the fiscal-year boundary — PI ranges of "Sprint 20 - 1" and "Sprints 23 - 3" confirm it. A counting rule would drift silently every January | A pure anchor-plus-cadence calendar rule |
| D-16 | One configurable reference board, defaulting to CRM TradeBlazers | The user's own team's board is the iteration they actually work to, and it carries a live dated active sprint. Making it configurable costs a setting; making it a fallback chain would have been speculative machinery for a problem not yet observed | An ordered list of fallback boards; hard-coding the board |
| D-17 | Time is derived from the movement history | The data already exists under BR-31. Timers require discipline the user will not reliably sustain, and Jira worklogs are empty across every one of the user's issues | Start/stop timers; manual entry; Jira worklogs |
| D-18 | Working-hours clock, not wall clock | A card started Friday afternoon and finished Monday morning is three hours of work, not sixty-six. Wall clock would make every overnight card unreadable as effort | Raw elapsed time |
| D-19 | Time counts Test and PO Review | Waiting on review is part of how long the work took, and it is the part the user most needs evidence for when discussing throughput | Counting only hands-on In Progress time |
| D-20 | Points read from Jira, editable locally, never written | Real values exist on the user's CRM work (1, 3, 5) and are worth importing; local editing covers the majority that have none. Writing back would breach BR-22 and put the board in the business of estimating for other people's teams | Local-only points; read-only Jira points; two-way sync |
| D-21 | Time and points are never combined | Hours-per-point invites treating an estimate as a schedule. They answer different questions and are reported side by side | A derived efficiency or throughput score |
| D-22 | Derived metrics are recomputed, not stored | A wrong working-hours setting should correct history, not leave it frozen. The append-only log makes recomputation cheap and correct | Materialising time onto the card at transition time |
| D-23 | The burndown separates scope change from progress | A single remaining-work line makes a card added on day six look identical to a day lost. Since the movement history records when a card entered the iteration, the distinction is free to compute and dishonest to omit | A plain remaining-total line |

---

## 11. Delivery slices

Phase 2 delivers in two slices, each ending with something runnable, and each
beginning only after the v1 baseline is complete.

| Slice | Contents | Requirements | Outcome |
|---|---|---|---|
| **5. Iteration and board restructure** | Column set changed to Backlog / Iteration Items / In Progress / Test / PO Review / Done; blocked becomes a flag with edge and badge; migration of existing blocked cards; iteration resolution from the reference board; the banner | BR-38…BR-61, BR-81…BR-83, NFR-25, NFR-27, NFR-28, NFR-30, NFR-32 | The board knows the iteration, and blocked stops costing a column |
| **6. Time, points and iteration reporting** | Time derived from movement history; working-hours model; points import and local entry; velocity; the Phase 2 reports and the iteration burndown; summary extended to the iteration period | BR-62…BR-80, BR-84…BR-85, NFR-26, NFR-29 | The board answers where the iteration went, and shows it going |

NFR-31 is cross-cutting.

Sequencing rationale: Slice 5 carries the schema migration and the riskiest
change to existing behaviour, and it ships value on its own. Slice 6's time
model depends on the blocked flag existing (BR-65) and its reporting depends on
the iteration existing (BR-68), so the order is forced by the requirements
rather than chosen.

---

## 12. Success metrics

| ID | Metric | Target |
|---|---|---|
| M-7 | Correctness of the iteration shown on the banner | Always correct, including across the fiscal-year ordinal reset |
| M-8 | Manual time entry performed by the user | Zero |
| M-9 | Share of the user's hours attributable to a card and an iteration | The large majority; unattributed time is reported as such rather than hidden |
| M-10 | Ability to state the invisible-work share as a number | Available per iteration without manual analysis |
| M-11 | Time to identify every blocked card on a full board | At a glance, without filtering |
| M-12 | Cards lost or mis-migrated during the column restructure | Zero |

---

## 13. Risks

| ID | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R-8 | The reference board stops maintaining dated sprints, as board 1391 already does for its *future* sprints | Iteration silently stale | Medium | Staleness is marked (BR-59); estimated fallback (BR-60); the board is configurable, so another can be nominated without a code change (BR-81) |
| R-9 | A card parked in In Progress accrues time that was never worked | Time reports overstate effort and lose credibility | High | Blocked pauses the clock (BR-65); working hours cap the damage (BR-64); figures are recomputable once corrected (BR-67) |
| R-10 | The BR-40 migration loses or misplaces in-flight cards | Data loss, and loss of trust in the board | Low | Tested migration is a requirement, not a practice (NFR-27); migration is recorded in history (BR-41) |
| R-11 | Points remain sparse, making velocity and the burndown noisy or meaningless | Two headline outputs that cannot be trusted | High | Local entry on any card (BR-70); incomplete periods are declared (BR-80); points and time are independent (BR-74), so time reporting survives unpointed work |
| R-12 | Agile API access is unavailable to the user's token or the endpoint changes | Iteration cannot be read | Low | Degrades to cache then to estimate (BR-58, BR-60) without blocking the board (NFR-28) |
| R-13 | The reference board's boundaries differ by a day from another team's | Minor disagreement with a colleague's dates | Medium | Recorded as constraint C-8; the banner shows the actual dates, so the basis is visible rather than implied |
| R-14 | Jira administration renumbers a custom field | Points or blocked silently stop importing | Low | Field identifiers are configurable (BR-82) |
| R-15 | The banner and points erode card density below the NFR-14 budget | The board stops showing a full workload | Medium | Density is an explicit requirement of the change (NFR-32) |

---

## 14. Glossary additions

Terms from v1 §13 stand. Phase 2 adds:

| Term | Definition |
|---|---|
| **Iteration** | The two-week TradeStation timebox, identified by an ordinal such as "2026 S18". The ordinal is common across teams; the boundary dates vary by up to a day between them. |
| **Reference board** | The configured Jira board whose active sprint supplies the current iteration's name and dates. Defaults to 1391, CRM TradeBlazers. |
| **Iteration Items** | The board column holding work the user has committed to the current iteration. A local decision, unrelated to Jira sprint membership. |
| **Carry-over** | A card still unfinished when the iteration it was committed to has ended. |
| **Elapsed time** | Working-hours duration from a card's first entry into In Progress to its arrival in Done, excluding time while blocked, accumulated across repeat passes. |
| **Invisible work** | Work on local cards — the share of hours or points that no Jira board would ever show. |
| **Velocity** | Points on cards reaching Done within one iteration. A record, not a forecast. |
| **Burndown** | Committed points still outstanding at the end of each working day of an iteration, with scope changes shown separately from completed work. |

---

## Appendix A — Live Jira findings

Verified against `tsgjira.atlassian.net` on 2026-08-26 while drafting this
document. Recorded because these values are assumptions the design rests on,
and because each one was checked rather than presumed.

### Field identifiers

| Field | Id | Evidence |
|---|---|---|
| Sprint | `customfield_10000` | Type `greenhopper:gh-sprint`. The only sprint field among four name matches; the others are migrated text areas. |
| Story Points | `customfield_10005` | Confirmed as the estimation field by three independent board configurations: 1391 (CRM), 837 (CORP), 5600 (AIP). Type `customfieldtypes:float`. |
| Blocked Issue | `customfield_10003` | Multi-checkbox with value `Blocked`. Observed set on live issues in TSPRO, OXS, EA, HT, AI and BOWI. |

`customfield_20512` "Story point estimate" is the team-managed-project variant
(`jsw-story-points`) and is empty throughout, because every project the user
works in is company-managed. It is the wrong field here.

### The iteration ordinal is shared; the dates are not

| Source | Iteration 18 |
|---|---|
| Board 1391 — `CRM TradeBlazers 2026 S18` | 2026-08-24 → 2026-09-07 |
| Board 1391 — `MDS 2026 S18` | 2026-08-24 → 2026-09-07 |
| Board 837 — `CRMOPs2026 S18 (08/25-09/08)` | 2026-08-25 → 2026-09-08 |
| Confluence, TPT space — `2026 i18` | 2026-08-24 → 2026-09-04 |

Three teams, one ordinal, three date ranges. The Confluence pages quote the
Monday-to-Friday working window; Jira quotes boundary timestamps. This is the
evidence behind constraint C-8.

### Reference board suitability — why 1391 is the default

| Board | Type | Active sprint | Dated future sprints |
|---|---|---|---|
| 1391 CRM TradeBlazers | scrum | Yes | **No** — future entries are undated backlogs ("Ronin - Automation", "IE Deprecation") |
| 837 CRM Ops | scrum | Yes | **Yes** — S19 through S23, dated to 2026-11-17 |
| 5600 AIP board | scrum | **No** | No — zero sprints of any state |
| 3506 ABSARCH board | kanban | n/a | n/a — no estimation field configured |

This is the evidence behind D-16 and R-8.

### The fiscal-year ordinal reset

The Confluence page ["PI Planning Dates - FYE2027"](https://tsgjira.atlassian.net/wiki/spaces/TDM/pages/2538274817)
describes program increments spanning `Sprint 20 - 1` and `Sprints 23 - 3`.
The sprint ordinal wraps to 1 at the fiscal-year boundary rather than
incrementing indefinitely. This is the evidence behind BR-56 and D-15, and the
reason a computed calendar rule was rejected.

### The user's current workload

Twelve open assigned issues across five projects — ABSARCH, AIP, CRM, CORP,
PMO. Of these, one carries a sprint and one carries a story-point value (0.0).
No issue carries any value in `timespent` or `timeoriginalestimate`.

This is the evidence behind D-14, D-17, A-9 and R-11: iteration membership,
points and time all have to work primarily from local data, because the Jira
data is sparse precisely where this user's work lives.
