---
name: spec-testrail-sync
description: Use when a user mentions syncing spec.md to TestRail, generating test cases from acceptance criteria, keeping spec scenarios and test suite in lockstep, or closing the duplicate-authoring gap between developers writing Given/When/Then in specs and SDETs authoring cases in TestRail. Applies to TradeStation ABS team SDD workspaces with the TestRail MCP installed.
author: "twedel <twedel@tradestation.com>"
---

# ABS SDD TestRail Sync

## Overview

SDD specs (`specs/*/spec.md`) contain User Stories with "Acceptance Scenarios" in Given/When/Then form. SDETs separately author equivalent test cases in TestRail. This skill eliminates that double-authoring: parse spec.md, upsert into TestRail via the MCP, maintain a per-spec mapping file so re-runs are idempotent.

**Core invariants:**
- Scenarios in spec.md are the source of truth for Given/When/Then content.
- TestRail is the source of truth for everything operational (runs, results, automation flags).
- The mapping file (`specs/<epic>/testrail-mapping.json`) tracks which spec scenario produced which TestRail case, plus a content hash to detect drift.

## TestRail Setup (one-time, per project) — required for the BH-###/TEST-### path only

The legacy Acceptance-Scenario path needs no setup beyond a project + suite —
skip this section entirely if you're not using `bdd-tdd-workflow`. Everything
below was confirmed by live testing against a real TestRail instance while
building this path; a mocked test alone would not have caught any of it
(TestRail returns `200` and silently drops a value for every misconfigured
field/template/project combination below — never an error).

1. **Confirm the "Behaviour Driven Development" template exists and note its
   ID.** Call `get_templates(project_id)`. On the instance this was built
   against it's ID `4`, but **template IDs are per-instance — never
   hardcode `4` for a project you haven't checked.** If the project has no
   BDD template, an admin needs to add one under Administration → Case
   Templates before this path can work at all.
2. **Enable `custom_automation_id` and `custom_automationstatus` for the
   project.** These two are *not* enabled for every project by default —
   confirm via `get_case_fields()`'s per-field `configs[].context.project_ids`
   before assuming they'll work. If the target project's ID isn't in either
   field's config list:
   - TestRail admin UI → **Administration → Customizations → Case Fields**.
   - Open **"Automation ID"** (`custom_automation_id`). Add the target
     project to its applicable-projects context. Save.
   - Open **"Automation Status"** (`custom_automationstatus`). Same step —
     add the project to a context. If this creates a *new* context (rather
     than reusing an existing one), TestRail will prompt for that context's
     dropdown options. Enter them one per line in `N, Label` format, e.g.:
     ```
     1, Manual
     2, In Progress
     3, Blocked
     4, To Be Automated
     5, Automated
     6, Deprecated/Removed
     7, To Update
     ```
     (Matches an existing option set on this instance — reuse it rather
     than inventing a new one, so "Automated" means the same thing project
     to project where possible. It won't necessarily get the same numeric
     IDs, though — see the next step.)
3. **Re-resolve option IDs after any config change — never reuse an ID from
   a different project.** `configs[]` on a dropdown field can carry a
   different option-to-ID mapping per context. Confirmed live: one
   project's "Automated" is `6`, another (added via step 2 above) is `5`,
   despite both using the same label list. Always read the *target
   project's own* `configs[].options.items` from a fresh `get_case_fields()`
   call before writing a value — don't cache an ID across projects or across
   sessions.
4. **`custom_preconds` cannot be set on a BDD-template case on this
   instance.** Its field config is restricted to `template_ids: [1, 2]`
   (Text, Steps) and does not include the BDD template. This isn't a gap to
   work around — the Given clause is already fully inside
   `custom_testrail_bdd_scenario`'s own content, so there's nothing to move
   into a separate field.
5. **Verify the whole setup before syncing anything real.** Create one
   throwaway case with `template_id` set to the BDD template's ID and every
   field from step 2 populated, then read the case back (`get_case`) and
   confirm each field's value actually persisted — not just that the create
   call returned success. Delete the throwaway case once confirmed.

## When to Use

- "Sync the spec to TestRail"
- "Generate TestRail cases from the acceptance scenarios"
- "Update the test cases for this story / epic"
- "Add a new spec.md scenario to the test suite"
- Starting a new SDD spec and wanting cases scaffolded before SDET hand-off
- After editing a spec.md — detect which scenarios changed and update only those cases

**Do NOT use for:**
- Authoring cases that have no corresponding spec.md scenario (keep authoring those directly in TestRail; this skill ignores them)
- Deleting TestRail cases (this skill never deletes; orphans are flagged only)

## Quick Reference

| Situation | Action |
|---|---|
| First-ever sync of a spec | Parse → propose section tree → confirm with user → `add_case` each scenario → write mapping file |
| Spec has a `## Verification` table | Parse via the BH-###/TEST-### path instead of Acceptance Scenarios — one TestRail case per `TEST-###` row, pulling Given/When/Then from the `BH-###` its `Pins` names. Everything else in this workflow (diff, preview, mapping) works the same, just keyed by `TEST-###` instead of `us{N}-s{K}`. |
| Re-run after spec edit | Parse → diff vs mapping (hash compare) → show changes → `update_case` for drift, `add_case` for new → update mapping |
| Scenario removed from spec | Mapping entry becomes orphaned → report to user, do NOT delete the TestRail case |
| TestRail case changed out-of-band | Hash matches mapping but title/steps differ in TestRail → report, do not overwrite |
| Mapping file missing | Treat as first-ever sync, but ask user to confirm project + suite IDs before writing cases |

## Workflow

```
1. PARSE    python3 scripts/parse_spec.py <spec.md>         → structured JSON
2. LOAD     specs/<epic>/testrail-mapping.json              → previous state
3. DIFF     compare scenario hashes and keys                → add / update / orphan lists
4. PREVIEW  show user: N to create, M to update, K orphaned → wait for approval
5. APPLY    MCP add_case / update_case per change           → record new IDs
6. PERSIST  write updated mapping file back to disk         → atomic
```

### 1. Parse

```bash
python3 .claude/skills/spec-testrail-sync/scripts/parse_spec.py \
  specs/001-boss-event-consumer/spec.md
```

Emits a JSON document with one entry per User Story and one entry per Acceptance Scenario. Stable keys: `us{N}-s{K}`. Each scenario has a `hash` (SHA256 of canonical text) used for idempotent diffs.

### 1a. Format Detection (per spec, not global)

`parse_spec.py` decides per-file which format a spec uses — checking for a
literal `## Verification` heading is enough; no flag or config is needed.

- **No `## Verification` heading:** legacy path. Output has `user_stories`
  with `scenarios` keyed `us{N}-s{K}` — exactly as before. Everything below
  in this document that references "scenario" and `us{N}-s{K}` describes
  this path.
- **Has a `## Verification` heading:** new path. Output instead has
  `"format": "bh_test"`, a `behavior_pathways` list (each with `id`,
  `satisfies`, `given`/`when`/`then`, or `no_behavior`/`reason` for
  pathways with no observable behavior), and a `verification` list (each
  with `id`, `name`, `pins` — the `BH-###` it verifies). Sync one TestRail
  case per `verification` entry, using its `pins` target's Given/When/Then
  for the case body — see the field-mapping note below.
- A project may have specs in both formats side by side (e.g. only some
  features adopted `bdd-tdd-workflow`). Nothing here treats format choice
  as project-wide; every spec is parsed and synced independently.

### 2. Mapping File

Per-spec state at `specs/<epic>/testrail-mapping.json`. Schema: see `references/testrail-mapping-schema.md`. Never edit by hand during a sync; let the skill write it.

### 3. Diff → Preview

Classify each parsed scenario against the mapping:

| Mapping entry | Current hash | Classification |
|---|---|---|
| missing | — | **NEW** → `add_case` |
| present | matches | **SKIP** (no change) |
| present | differs | **UPDATE** → `update_case` |
| present | n/a (scenario removed) | **ORPHAN** → report, do not touch TestRail |

Before making any MCP call, show the user the full change list with case titles. Wait for explicit approval.

### 4. Apply via MCP

**Narrate this step out loud, before making any MCP call**: state plainly
that test cases are being created/updated in TestRail *before* any
implementation code is written (e.g. "🔴 Creating TEST-001, TEST-002 in
TestRail now — no code has been written yet"). This is the visible
proof of the test-first ordering `/speckit.tasks` and `/speckit.implement`
enforce; a silent sync defeats the point of narrating the TDD loop. After
the calls complete, state the resulting case IDs (e.g. "✅ TEST-001 →
case 19988801, TEST-002 → case 19988802") so the change is visible, not
just implied by a tool call the user may not be watching.

For each change, call the TestRail MCP:

- `mcp__testrail__add_case` — creates new case under the section bound to the User Story. Use template `2` (Test Case (Steps)). Set `refs` to the spec's JIRA ID.
- `mcp__testrail__update_case` — updates an existing case. Always re-write all custom fields derived from the scenario; never partial merge.

**Case field mapping from a parsed scenario:**

| TestRail field | Source |
|---|---|
| `title` | User Story title + ` - S{K}: ` + first ~50 chars of `then` |
| `section_id` | Resolved per user story (see Section Mapping below) |
| `template_id` | `2` (Test Case (Steps)) — set implicitly by the suite default |
| `refs` | Spec's JIRA ref (e.g. `CRM-13228`) |
| `priority_id` | Derived from User Story priority: P1→4 (Must Test), P2→3 (Medium), P3→2, default 2 |
| `custom_steps_separated` | Single step — `content` = `"Given: {given}\n\nWhen: {when}"`; `expected` = `"Then: {then}"` |

**For the BH-###/TEST-### path**, map fields from a `verification` entry
plus its `pins` target instead:

| TestRail field | Source |
|---|---|
| `title` | The `verification` entry's `name` |
| `template_id` | `4` ("Behaviour Driven Development") — **required**, confirmed live: `custom_testrail_bdd_scenario` is restricted to this template (`template_ids: [4]`, not `include_all`); on any other template the field is silently accepted (HTTP 200) and silently dropped, never persisted. Call `get_templates(project_id)` rather than hardcoding `4` — template IDs are per-instance. |
| `custom_testrail_bdd_scenario` | The pinned `behavior_pathways` entry's Given/When/Then, as `[{"content": "Given {given}\nWhen {when}\nThen {then}"}]` — **a list of one (or more) dicts with a `content` key, not a plain string.** Confirmed live: a bare string is also silently dropped, same failure mode as the wrong template. One dict per Given/When/Then line also works if you want them as separate paragraphs; a single combined dict is simpler and is what this skill uses. |
| `refs` | Spec's JIRA ref, same as the legacy path |
| `priority_id` | `4` (Must Test) if the spec's `**Risk Tier:**` is `FULL`, else `3` (Medium) |

This requires the TestRailMCP wrapper's `add_case`/`update_case` to accept
`template_id` and `custom_testrail_bdd_scenario` in the shape above — if
the wrapper doesn't yet, use the legacy `custom_steps_separated` field as
a fallback (same content, `Given/When` in `content`, `Then` in
`expected`) and note in the sync summary that the native BDD field
wasn't available.

**Note on the preconditions field**: `custom_preconds` is **not usable
together with the BDD path on this instance** — confirmed live, its
field config is restricted to `template_ids: [1, 2]` (Text, Steps) and
does not include template `4` (BDD). A BDD-template case has no
Preconditions field to set at all; this isn't a gap, since the Given
clause is already fully captured inside `custom_testrail_bdd_scenario`'s
own content. For the legacy Acceptance-Scenario path (template 1 or 2),
`custom_preconds` still isn't used — the Given clause stays embedded as
a prefix in the first step's `content`, unchanged from before. Don't set
`custom_preconds` alongside `template_id: 4`; TestRail will silently
drop it the same way it drops any field not on the active template.

**Note on automation fields**: `custom_automation_type` and any other
dropdown-typed custom field takes an **integer selecting a configured
option**, not free text (e.g. `2` = PyTest on this instance) — call
`get_case_fields()` and read the field's `configs[].options.items` for
the live option list rather than assuming an ID. **IDs are per-context,
not global** — on project 114 ("BDD-TDD Workflow POC"), `custom_
automationstatus`'s option 5 is "Automated"; other projects on this
same instance have a different option set where "Automated" is 6.
Always resolve the ID from that project's own config, never hardcode
one across projects. `custom_automation_id` and `custom_automationstatus`
are not enabled for every TestRail project by default — check they're
enabled for the target project (via
`get_case_fields()`'s per-field `configs[].context.project_ids`) before
relying on them; a field not enabled for a project silently drops its
value the same way an unsupported template does.

### 5. Section Mapping

TestRail sections are per-User-Story. The skill must NOT invent section IDs — at first sync, list existing sections under the target suite and either:

- Match by name (User Story title, or the ref ticket like `CRM-13228 - ...`) if a candidate exists.
- If none matches: propose creating a new section to the user and use `mcp__testrail__add_section` only after approval.

Record the resolved `section_id` in the mapping file under `user_stories.us{N}.section_id` so subsequent runs are one-shot.

### 6. Persist Mapping

Write the new `testrail-mapping.json` atomically (write to `.tmp`, then rename). Commit-ready: the file is plain JSON, human-readable, meant to be checked in alongside the spec.

## Guardrails (read these even if the user is in a hurry)

- **No silent deletes.** Orphaned mapping entries are reported but never removed from TestRail or from the mapping file (user may want to keep them). Ask the user explicitly whether to prune.
- **No title-based de-duplication.** Only the mapping file determines identity. If the mapping says "new case", add it — do not grep TestRail for a similar title.
- **No partial field updates on `update_case`.** Always re-derive the full set of scenario-driven fields from the parsed spec; Let other fields (automation flags, assignee, etc.) remain untouched by *omitting* them from the update payload.
- **Credentials only via env.** The TestRail MCP is pre-authenticated; never accept a TestRail token as a user-supplied argument.
- **Show the diff.** Even on a first sync, show the list of cases about to be created, grouped by section, and wait for approval. Exec feedback drove this skill — the audit trail matters.
- **User Story `priority` ≠ TestRail `priority_id`.** Map explicitly (see table above); do not pass `P1` as a number.
- **Do not fabricate scenarios.** If the parser returns 0 scenarios for a User Story, report the gap — do not invent a placeholder case.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Running the script and going straight to `add_case` calls | Always diff first against mapping. Show preview. Wait for approval. |
| Using the User Story number (e.g. `1`, `2`) as the TestRail `section_id` | Section IDs are TestRail-native. Resolve by listing sections and matching by name/refs. |
| Writing markdown into `custom_steps_separated[].content` with `**bold**` | TestRail stores HTML — either leave plain text, or convert to `<strong>`. Current cases use plain text with `\n`. |
| Updating the mapping file before MCP calls succeed | Persist *after* successful MCP writes. If a call fails mid-batch, the next run will retry just the failures. |
| Auto-deleting orphan cases when a scenario is removed from spec | Never. Report only. Let a human decide. |

## Inputs / Outputs

**Inputs:** path to `spec.md`, TestRail project ID, TestRail suite ID. First-run prompts for project/suite; subsequent runs read them from the mapping file.

**Outputs:** updated `testrail-mapping.json`, summary of changes (N created, M updated, K orphaned), and the TestRail MCP calls made.

## See Also

- `scripts/parse_spec.py` — the parser; stdlib-only, safe to run on any spec.md.
- `references/testrail-mapping-schema.md` — mapping-file JSON schema and field semantics.
- `docs/skills/spec-testrail-sync.md` — team-facing deep dive (rationale, install instructions for the TestRail MCP, expected spec.md shape, limitations).
