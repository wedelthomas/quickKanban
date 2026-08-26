<!-- TradeStation SDD — plan addendum. Wraps the Spec Kit core plan template.
     Team layers (priority 0) may wrap or append around this org layer. -->
# TradeStation SDD — Plan Guardrails

> Produced by the TradeStation SDD preset. The org baseline here wraps the
> Spec Kit core plan template below; nothing in core is dropped.

{CORE_TEMPLATE}

## Cross-Repo Context

<!--
  CONDITIONAL: This section exists ONLY when the feature has a dependency
  manifest at specs/[###-feature]/dependency-manifest.md (delivered with
  multi-codebase epic handoffs from pm-spec; /speckit.specify Adopt mode
  copies it there). If there is no manifest, DELETE this section entirely
  and fill the "Cross-repo contract surface" Architecture Review row with:
  N/A — no dependency manifest (single-codebase feature).

  When the manifest exists, fill this section from it and point the
  "Cross-repo contract surface" Architecture Review row here.

  Fill rules (trust rules — non-negotiable):
  - Cite existing contracts ONLY as the manifest (or a fresher deep scan)
    states them, each with its evidence URL, confidence tier, and
    scanned_at date. Never paraphrase a contract into existence; never
    upgrade a confidence tier.
  - medium/low-confidence claims are rendered as "possible, unconfirmed",
    never as fact. Unknown is stated as unknown — do not fill graph gaps
    from imagination.
  - New/changed boundary needs stay in business terms here; the design
    that satisfies them belongs in this plan's main sections (and its
    interface contracts in contracts/).
-->

**Manifest**: [dependency-manifest.md](dependency-manifest.md) — Epic [###]: [Epic Name]
**Freshness**: [re-verified against the graph on YYYY-MM-DD | static — Impact MCP connector unavailable; contracts cited as of their scanned_at dates]

### Sibling codebases

| Codebase | System(s) | Owning team | Slack | Link confidence |
|---|---|---|---|---|
| [repo_id] | [system name] | [owner_team] | [#channel] | [confirmed/high] |

### This repo's slot in the coordination order

[N of M] — [why, from the manifest's suggested order: name the upstream
codebases whose contract changes this plan depends on, and the downstream
codebases consuming this repo's changes. "1 of M" = nothing upstream.]

### Boundary contracts touching this repo

<!-- One entry per Boundary-dependencies subsection in the manifest that
     involves THIS codebase. Omit boundaries between two sibling repos. -->

- **[consumer-slug] → [producer-slug]** — FR-[NNN] ([consumer]) depends on
  FR-[NNN] ([producer]) [or "no producer-side FR; existing capability"].
  - Existing contract (fact): [verbatim contract line from the manifest] —
    evidence: [URL]; confidence: [tier]; scanned: [date]
    [; **STALE** — repo HEAD moved since the scan, re-scan offered]
    [; re-scan running — forced re-scan in flight; contract cited as of
    its scanned date until it lands]
    [or: no deep scan available — engineering confirms the contract during
    planning]
  - Change needed: [none — existing contract suffices | business-terms
    statement from the manifest]

### Confidence & gaps carried from the manifest

[Copy the manifest's "Confidence & gaps" items verbatim, or "none carried".]

## Architecture Review

*GATE: Every row MUST have either a concrete **Decision** (1–2 sentences,
pointing at where in this plan the dimension is addressed) or
`N/A — <reason>` (one sentence explaining why the dimension does not
apply to this feature). An empty cell or a bare `N/A` is a blocker —
`/speckit.analyze` will fail the build until each row is filled.*

The point is to **force consideration**, not to fill boxes. If a
dimension applies, point to the section/file where it is addressed
rather than restating the design here.

| Category | Dimension | Decision or N/A reason |
|---|---|---|
| Cross-cutting | Authentication / authorization | |
| Cross-cutting | Input validation & sanitization | |
| Cross-cutting | Error handling strategy | |
| Cross-cutting | Logging & observability (metrics, tracing, structured logs) | |
| Cross-cutting | Secrets / config management | |
| Cross-cutting | Idempotency (for state-changing ops) | |
| Cross-cutting | Retries, timeouts, circuit breakers | |
| Cross-cutting | Backwards compatibility / API versioning | |
| Failure modes | Partial-failure behavior | |
| Failure modes | Downstream outage handling | |
| Failure modes | Concurrent writes / race conditions | |
| Failure modes | Replay / duplicate request handling | |
| Integration | Integration boundaries (callers + dependencies) | |
| Integration | Contract evolution strategy | |
| Integration | Cross-repo contract surface (dependency manifest) | |
| Data | PII / sensitive-data classification | |
| Data | Tenant isolation (if multi-tenant) | |
| Data | Data lifecycle (retention, deletion) | |
| Data | Money / decimal handling (if financial) | |
| Operational | Deployment & rollback strategy | |
| Operational | Schema / data migration plan | |
| Alternatives | Alternatives considered + rejection rationale | |

**Drift signal**: `/speckit.feedback`'s architecture-drift heuristics
(`new_top_level_dirs_since_plan`, `new_runtime_dependencies`,
`files_outside_planned_paths`) compare HEAD against this plan at
story-complete and end-of-feature. Non-zero values are a prompt to
revisit this table — either the implementation drifted, or the table
was incomplete.

## Architecture Diagram

*MANDATORY. A picture of the components introduced or changed by this
feature and how they fit together. Use **Mermaid** — it renders in
GitHub, GitLab, VS Code, IntelliJ, and most modern IDEs. Prefer Mermaid
over ASCII art, screenshots, or external image links.*

**At minimum**, include a **component / system-context diagram**
showing this feature's components, their callers, and their direct
dependencies. Add other diagrams only when they earn their keep:

| Diagram type | Add when |
|---|---|
| Component / context | **Always** (the minimum) |
| Sequence | Non-trivial interaction across 3+ components, or async flows |
| State | The feature has a finite state machine (orders, jobs, sessions) |
| Data flow | Pipeline / ETL features where data shape changes between stages |
| Deployment | The deployment surface changes (new service, new region, new tier) |
| ER (data) | Schema is non-trivial; covers what `data-model.md` shows in prose |

Replace the placeholder below with the actual diagram(s) for this
feature. The diagram MUST stay in sync with reality — the
End-of-Feature step in the tasks template includes a verification
task. If a diagram type is genuinely not applicable, omit that
sub-section (don't include an empty placeholder); the component
diagram itself is non-negotiable.

### Component diagram

```mermaid
flowchart LR
  Caller["Upstream caller<br/>(e.g., API gateway)"] -->|request| Service["New / changed component"]
  Service -->|reads / writes| Store[("Datastore")]
  Service -->|emits| Bus[("Event bus / queue")]
  Service -->|calls| Downstream["Downstream service"]
```

> Replace the placeholder above. Label every edge with what flows
> across it (request, event name, table name) — unlabeled arrows
> are a frequent review finding.

<!-- Add additional diagrams (Sequence, State, etc.) below ONLY if
     the table above flagged them as needed. Each gets its own
     `### <Type> diagram` heading and a Mermaid block. -->

## Test Strategy

<!--
  ACTION REQUIRED: If the spec defines coverage targets (NFRs, success criteria)
  or the constitution requires automated tests, this section is MANDATORY.
  Otherwise, delete this section entirely.

  The test files listed here will be used by /speckit.tasks to generate
  test-creation tasks. Every test file listed MUST become a task.
-->

**Coverage Target**: [e.g., >=95% line and branch, or N/A if spec has no coverage NFR]
**Test Framework**: [from Technical Context above]
**Test Types**: [unit, integration, contract — based on what the spec requires]

| Test File | Type | Covers |
| --- | --- | --- |
| [tests/unit/test_service.py] | Unit | [JobService logic, edge cases] |
| [tests/integration/test_endpoint.py] | Integration | [Acceptance scenario 1, 2] |

## TradeStation SDD — Required plan close-outs

- **Test Strategy is mandatory.** Every test file named in the plan MUST become a
  task in `/speckit.tasks`.
- **Constitution Check** runs before Phase 0 research and again after Phase 1 design.
