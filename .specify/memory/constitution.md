<!--
Sync Impact Report:
Version change: (unset/template) -> 1.0.0 (MAJOR — first real ratification
for this project. The previous constitution was an org-wide, enterprise-scale
document — Architecture Office approval gates, a named security-scanning
tool, Confluence-published runbooks, NuGet/Azure DevOps Artifacts package
management, four-golden-signal dashboards — none of which fit or was ever
fully met by a single-user local tool; every prior slice's Constitution
Check carried "Manageable" and "Monitored" as permanent deviations for
exactly that reason. This replaces it with a project-scoped constitution
sized to what quickKanban actually is.)

Added in 1.0.0:
  - All six principles, each derived from a real, already-established
    practice in this codebase (append-only history, single-field Jira
    writes, the FR→BH→TEST traceability chain, .env-only credentials, the
    Speckit spec→plan→tasks→implement flow) rather than aspirational policy.
  - Technology & Security Standards section naming the actual stack.
  - Development Workflow & Quality Gates section matching the test-first,
    story-gated process specs 001-005 already followed in practice.

Removed in 1.0.0 (relative to the prior org constitution):
  - Architecture Office approval gates and named integration-pattern
    mandates (gRPC/pub-sub prescriptions) — no second system integrates
    with this one.
  - Named third-party tooling (a specific SAST vendor, NuGet/Azure DevOps
    Artifacts) — replaced with generic, tool-agnostic requirements.
  - The four-golden-signals/dashboards/alerts observability mandate and the
    Confluence-runbook requirement — replaced with what a one-person local
    tool actually needs: structured logs and a README.
  - The regulatory audit-log and PII-handling apparatus — this board holds
    no PII and no account-critical data; stated as an explicit exemption
    instead of a conditional rule.

Deferred: none — this is a from-scratch draft, not an amendment.

Source: reconstructed from the principle names and intent still evidenced
in specs/001-board-foundation through specs/005-iteration-and-board-
restructure's plan.md Constitution Check tables (the org original was
removed from this repo along with unrelated corporate branding), and
modeled in scale and tone on a sibling project's lean constitution
(Eureka Studio Lab) rather than restored verbatim.
-->

# Quick Kanban Wall Constitution

## Core Principles

### I. Simplicity First (YAGNI)
Build the smallest thing that solves the current story. Avoid speculative
abstractions, unused configuration, or infrastructure sized for a scale this
board will never reach — it is built, run and used by one person. Do not
anticipate future slices; solve the one in front of you. A new
shared/utility module MUST NOT be created without a second genuine
consumer. Any abstraction with a single implementation or caller MUST be
justified in the plan's Complexity Tracking table, not left implicit.

**Rationale**: Every hour spent on unneeded flexibility is an hour not
spent on the next real requirement, and speculative code is the code most
likely to be wrong about what it speculated on.

### II. The Movement History is the Ledger
Every column change a card makes MUST be recorded in the append-only
movement history, attributed to who or what caused it (user, sync, or
system). The history MUST NOT be edited or deleted after the fact — a
correction is a new event, not a rewritten old one. Deletion elsewhere on
the board MUST be soft: an ad-hoc card's only record of ever existing is
this board, and destroying it destroys work nobody else remembers.

**Rationale**: The board's reports, summaries and burndowns are only as
trustworthy as the ledger they are computed from — a mutable or lossy
history turns every derived number into a guess.

### III. Jira Is Read-Mostly, and Never Written Loosely
An outbound write to Jira MUST touch exactly the field the feature
document names (issue status, and nothing else, unless a future amendment
says otherwise) — never a bulk update, never a field added "while we're
in there." A credential MUST never be returned to a caller, rendered,
logged, or held anywhere but the adapter that built the request from it.
Every outbound Jira touchpoint MUST be listed in
`docs/external-interactions.md` in the same change that adds it.

**Rationale**: This board acts on the user's behalf inside a system other
people rely on. A narrow, auditable write surface is what makes that
defensible; a wide one is what turns a bug here into someone else's
incident there.

### IV. Test-First, Behavior-Traced (NON-NEGOTIABLE)
A story's acceptance scenarios MUST be expressed as Behavior Pathways
(`BH-###`) tracing to the Functional Requirements they satisfy, each pinned
by a named test (`TEST-###`) in the Verification table. That test MUST be
written and confirmed failing before the implementation task that makes it
pass begins. A task list's test tasks MUST precede the implementation tasks
in the same story.

**Rationale**: This is a personal tool with no QA team and no staging
environment to catch a regression before the user does — the traceability
chain is what lets a future change be verified against everything it might
break, not just the part someone happened to remember.

### V. Security by Default, Sized for One User
No credential of any kind — API token, database password, or anything else
proving identity — may be committed to the repository, ever, including a
throwaway local one. Credentials live only in a gitignored `.env`. The
board binds to loopback only; there is no authentication layer because
there is no network exposure to authenticate against, and widening that
bind is a decision, not a default. Dependencies MUST be reasonably current,
and a scan showing an unresolved Critical or High vulnerability with an
available fix MUST be resolved before merge.

**Rationale**: The absence of a login is defensible only as long as the
board is genuinely unreachable from anywhere but its own machine — the
loopback bind is the fact that makes the rest of this principle sufficient
rather than negligent.

### VI. Spec-Driven, Living Documentation
A feature MUST go through the Speckit flow — spec, then plan, then tasks,
then implementation — before code is written, so the decision and its
rationale live in the repository rather than only in a conversation that
will not be there when the next question comes up. Documentation MUST be
updated in the same change as the code it describes, kept to the *why*
rather than restating the *what* the code already says.

**Rationale**: There is no second engineer to ask what a past decision was
for — the spec/plan trail is that answer, written down before it is
needed rather than reconstructed under pressure later.

## Technology & Security Standards

The stack is established and MUST NOT be replaced without a documented
reason in a plan's Complexity Tracking table: TypeScript throughout, Fastify
for the API, raw SQL against PostgreSQL with a hand-rolled migration runner
(no ORM), React with Vite for the front end, and Docker Compose for
deployment. A new dependency MUST be justified — the standard library or a
few lines of code are preferred over a package where they suffice — and
MUST pass the CVE scan referenced in Principle V. This board holds no PII
and no account-critical data (card titles and dates the user wrote about
their own work); the regulatory audit-log apparatus a system handling such
data would need does not apply here, and that exemption is explicit rather
than assumed.

## Development Workflow & Quality Gates

`main` is always deployable. Every story's tests are written and confirmed
failing before its implementation, per Principle IV. The standard suite —
unit, contract and acceptance — MUST pass before a story is considered
complete; end-to-end tests prove the browser-facing surface a change
touches. A UI-facing change SHOULD be run manually in the browser before
the feature is reported done, not only asserted by its own test suite.
Each story ends with a Story-Complete Review Gate recording spec alignment,
design notes, and any deferred follow-up, matching the pattern already
established in specs/001 through specs/005. A duplicate-code review MUST be
performed before a slice is marked complete.

## Governance

This constitution governs quickKanban's implementation. It supersedes ad
hoc practice — a plan's Constitution Check exists to catch a violation
before code is written, not after the fact. A violation MUST be resolved
or explicitly justified in the plan's Complexity Tracking table before
implementation begins.

**Amendment procedure**: An amendment requires documenting the change and
its rationale, and a new version with a Sync Impact Report prepended to
this file. There being one maintainer, no separate approval body is
needed.

**Versioning policy**: Semantic versioning. MAJOR for principle removals
or redefinitions, MINOR for a new principle or materially expanded
guidance, PATCH for wording clarifications.

**Version**: 1.0.0 | **Ratified**: 2026-09-08 | **Last Amended**: 2026-09-08
