---
description: "Generate the implementation plan from plan-template.md, then auto-trigger feedback"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.plan

Generate `plan.md` per spec-kit conventions.

## Workflow

1. **Pre-flight: confirm `/speckit.verify-spec` has passed.** Look
   for `specs/<feature-id>/spec-verification.md`. If it does not
   exist, **stop** and ask the user to run `/speckit.verify-spec`
   first. If it exists but its `**Result:**` line is `FAIL`,
   **stop** and ask the user to address the failing checks
   (typically by re-running `/speckit.specify` followed by
   `/speckit.verify-spec`). Do NOT begin planning on a spec that
   has not passed verification.
2. Read the active `specs/<feature-id>/spec.md`.
3. **Dependency manifest pick-up.** Check for
   `specs/<feature-id>/dependency-manifest.md` (the canonical spot —
   `/speckit.specify` Adopt mode puts it there). If absent, check the
   repo root for `dependency-manifest.md` (multi-codebase epic ZIPs
   unpack it there): when the root file's `# Dependency Manifest —
   Epic ...` title matches the active feature, tell the user and move
   it to the canonical path; when it names a different epic, leave it
   and tell the user. Match on the epic NAME — it echoes the spec
   title; ignore the leading epic number (adopt mode may renumber the
   feature locally). If no manifest exists anywhere, this is a
   single-codebase feature: skip the `## Cross-Repo Context` section
   (delete it from the generated plan) and fill the "Cross-repo
   contract surface" Architecture Review row with `N/A — no dependency
   manifest (single-codebase feature)`. See "Cross-repo dependency
   manifest" below for what to do when one IS present.
4. Obtain the plan template by running
   `bash .specify/presets/tradestation-sdd/scripts/render-template.sh plan-template`
   and use its (composed) stdout as the template to fill in. Do NOT read the
   preset `.md` file directly — the composed output layers the org (and any
   team) addenda over the Spec Kit core plan template.
5. Generate `specs/<feature-id>/plan.md`. Run the Constitution Check
   gate before Phase 0 research; re-check after Phase 1 design. When
   a dependency manifest exists, fill the `## Cross-Repo Context`
   section per its fill rules and point the "Cross-repo contract
   surface" Architecture Review row at it.
6. Fill the Test Strategy section if the spec defines coverage,
   success criteria reference tests/CI, or constitution mandates
   tests. Every test file MUST become a task downstream.
7. Fill the Complexity Tracking table when constitution gates are
   violated.

## Cross-repo dependency manifest (multi-codebase epics)

`dependency-manifest.md` arrives with pm-spec's multi-codebase epic
handoffs: a coordination artifact (NOT a specification) listing the
sibling codebases, the suggested coordination order, and the contracts
crossing each boundary — every graph-sourced claim with evidence URL,
confidence tier, and `scanned_at` date. The adopted spec may reference
it as `../../dependency-manifest.md` (its path in the PM-side layout);
the engineer-side canonical location is always
`specs/<feature-id>/dependency-manifest.md`.

When one exists, while filling `## Cross-Repo Context`:

- **Trust rules (non-negotiable, same as the manifest's own):** cite
  existing contracts only as the manifest or a fresher deep scan states
  them, with evidence + confidence + scanned date; render medium/low
  claims as "possible, unconfirmed", never as fact; state unknown as
  unknown. Never design the other repo's side here — changes needed
  stay in business terms.
- **Freshness (only if Impact MCP tools are available in this
  session):** call `get_deep_scan(repo_id)` for THIS repo and each
  boundary counterpart. `stale: true`, or a `scanned_at` newer than the
  manifest cites, means the citation may be outdated: mark the entry
  **STALE** in Cross-Repo Context and OFFER
  `request_deep_scan(repo_id, force=true)` — run it only on an explicit
  yes, and never wait for it (async, takes minutes; note "re-scan
  running" on the affected entry and move on). The section's
  **Freshness** line takes one of its two template states: re-verified
  with today's date (you read the scans), or the static fallback below.
  If the tools are not available, add one line —
  "Impact MCP connector unavailable — manifest treated as static;
  contracts cited as of their scanned_at dates" — and proceed.
- **Corrections (only if Impact MCP tools are available):** when the
  engineer contradicts a graph-sourced claim ("we don't call that API
  anymore"), offer ONCE to record the correction via `confirm_edge` /
  `reject_edge` with this session as evidence — the human decides;
  never automatic. Declined or unavailable → note the disagreement in
  Cross-Repo Context and continue.
- **Planning never blocks on the graph.** Connector errors, running
  scans, missing manifest sections — note what is missing in the
  section's gaps list and keep going. A malformed manifest is consumed
  best-effort: use what parses, list the rest under "Confidence & gaps
  carried from the manifest".

<!-- AO-MANDATORY: feedback -->
## Auto-feedback (MANDATORY)

After plan.md is written, automatically
invoke `/speckit.feedback plan` so any friction from this step is
captured while it is fresh. The user can decline by passing empty
answers; the loop runs by default. If `/speckit.feedback` is
unavailable, note it in the response and continue — never block.
<!-- END AO-MANDATORY: feedback -->


## Behavior Pathways: Note the TestRail Sync Point (BDD/TDD Workflow)

If `spec.md` has a `## Behavior Pathways` section, add a line to `plan.md`
(near where test strategy is normally discussed) naming the point where
`/speckit.implement` will first touch TestRail for this story: the first
task in each story's phase that has a `BH-###`/`TEST-###` pair authors or
syncs that case via `spec-testrail-sync` *before* any implementation task
in the same story runs. This is informational for whoever reads `plan.md`
next (usually `/speckit.tasks`) — it does not change how `plan.md` itself
is structured otherwise.