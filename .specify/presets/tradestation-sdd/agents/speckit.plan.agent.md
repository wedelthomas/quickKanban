---
description: Execute the implementation planning workflow using the SDD plan template to generate design artifacts. Requires a passing spec-verification.md.
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the agent workflow below.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before planning)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## SDD Spec Verification Gate

**REQUIRED before planning**: Check that `spec-verification.md` exists in the active feature directory with `**Result:** PASS`.

```bash
branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
feature_id=$(echo "$branch" | sed -n 's|^feat\(ure\)\?/||p')
if [[ -n "$feature_id" && -d "specs/$feature_id" ]]; then
    feature_dir="specs/$feature_id/"
elif [[ $(ls -d specs/*/ 2>/dev/null | wc -l) -eq 1 ]]; then
    feature_dir=$(ls -d specs/*/ 2>/dev/null)
else
    feature_dir=$(ls -d specs/*/ 2>/dev/null | tail -1)
fi
grep -q "Result:.*PASS" "${feature_dir}spec-verification.md" 2>/dev/null
```

If the file is missing or shows `FAIL`:
- **STOP**. Do not proceed with planning.
- Instruct the user: "The spec has not been verified. Please run `speckit.verify-spec` before planning."

## Outline

1. **Setup**: Run `.specify/scripts/bash/setup-plan.sh --json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC and `.specify/memory/constitution.md`. Load the IMPL_PLAN copied from `.specify/presets/tradestation-sdd/templates/plan-template.md`. Check for `specs/<feature-id>/dependency-manifest.md` (canonical; `speckit.specify` Adopt mode puts it there). If absent, check the repo root for `dependency-manifest.md` — when its `# Dependency Manifest — Epic ...` title matches the active feature, tell the user and move it to the canonical path; when it names a different epic, leave it and tell the user. Match on the epic NAME — it echoes the spec title; ignore the leading epic number (adopt mode may renumber the feature locally).

3. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Fill `## Cross-Repo Context` when a dependency manifest exists (see "Cross-Repo Dependency Manifest" below); otherwise delete that section and fill the "Cross-repo contract surface" Architecture Review row with `N/A — no dependency manifest (single-codebase feature)`
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md
   - Phase 1: Update agent context by running the agent script
   - Re-evaluate Constitution Check post-design

4. **Stop and report**: Command ends after Phase 2 planning. Report branch, IMPL_PLAN path, and generated artifacts.

5. **Check for extension hooks**: After reporting, check if `.specify/extensions.yml` exists in the project root.
   - If it exists, read it and look for entries under the `hooks.after_plan` key
   - If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
   - Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
   - For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
     - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
     - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
   - For each executable hook, output the following based on its `optional` flag:
     - **Optional hook** (`optional: true`):
       ```
       ## Extension Hooks

       **Optional Hook**: {extension}
       Command: `/{command}`
       Description: {description}

       Prompt: {prompt}
       To execute: `/{command}`
       ```
     - **Mandatory hook** (`optional: false`):
       ```
       ## Extension Hooks

       **Automatic Hook**: {extension}
       Executing: `/{command}`
       EXECUTE_COMMAND: {command}
       ```
   - If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Phases

### Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Define interface contracts** (if project has external interfaces) → `/contracts/`:
   - Identify what interfaces the project exposes to users or other systems
   - Document the contract format appropriate for the project type
   - Examples: public APIs for libraries, command schemas for CLI tools, endpoints for web services, grammars for parsers, UI contracts for applications
   - Skip if project is purely internal (build scripts, one-off tools, etc.)

3. **Agent context update**:
   - Run `.specify/scripts/bash/update-agent-context.sh copilot`
   - These scripts detect which AI agent is in use
   - Update the appropriate agent-specific context file
   - Add only new technology from current plan
   - Preserve manual additions between markers

**Output**: data-model.md, /contracts/*, quickstart.md, agent-specific file

## Cross-Repo Dependency Manifest (multi-codebase epics)

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

## Complexity Tracking

When constitution gates are violated during planning (e.g., simplicity principle conflicts with a chosen design, or a dependency adds complexity beyond what the constitution allows):

- Fill the **Complexity Tracking** table in `plan.md` with: the principle violated, what triggered it, the justification for accepting the complexity, and any follow-up action.
- If no violations exist, leave the table empty (do not remove it).

## Key rules

- Use absolute paths
- ERROR on gate failures or unresolved clarifications

<!-- AO-MANDATORY: feedback -->
## Auto-feedback (MANDATORY)

This is the final step of the command — **not optional**. After the
artifact is written and you have reported the result, immediately invoke
it in the same turn, without waiting to be asked:

    speckit.feedback plan

It captures friction while it is fresh. The user can still decline by
passing empty answers; the loop runs by default. If `speckit.feedback` is
unavailable, note it in your response and continue — never block.
<!-- END AO-MANDATORY: feedback -->
