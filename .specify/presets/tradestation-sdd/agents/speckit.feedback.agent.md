---
description: Capture developer feedback and telemetry on the SDD workflow at the end of any phase. Auto-invoked by other SDD agents after their artifacts are written.
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`

<!-- sdd-preset: capability-onboarding nudge -->
Then check whether `.specify/presets/tradestation-sdd/.capability-notice.json`
exists. If it does, and its `available_count` is greater than 0 and
`dismissed` is not `true`, include this near the end of your response for
this command (after the normal feedback-capture output below):

    🎉 New: the SDD Capability System. This project can now add optional
    capabilities on top of the org baseline — observability dashboards, a
    pre-PR security scan, Confluence/TestRail sync, and more. Run
    `speckit.capabilities` any time to browse what's available and install
    some right here in this chat, or read the full rundown:
    https://tsgjira.atlassian.net/wiki/spaces/AP1/pages/3181183237/Capability+System

    Want me to stop mentioning this? Just say so and I won't bring it up
    again — you can still run `speckit.capabilities` yourself whenever you
    want.

If in this or a future turn the user expresses wanting this to stop (e.g.
"stop mentioning capabilities", "don't show that again"), write
`dismissed: true` into that same file, preserving its other fields:

    bash -c '. .specify/presets/tradestation-sdd/scripts/_portable.sh && sdd_py -c "
    import json
    p = \".specify/presets/tradestation-sdd/.capability-notice.json\"
    d = json.load(open(p))
    d[\"dismissed\"] = True
    json.dump(d, open(p, \"w\"))
    "'

`speckit.capabilities` remains fully usable regardless of `dismissed` — this
only silences the passive nudge.

Then proceed with the agent workflow below.

# /speckit.feedback

Capture short, structured feedback about how the active SDD step
went. Auto-invoked by every `/speckit.<phase>` command after the
phase artifact is generated, and by `/speckit.implement` at every
**session-end** (working-session boundary), every Story-Complete
checkpoint, and at end-of-feature. Can also be called ad hoc.
Friction is fastest to fix when reported within minutes of being
felt — the per-phase trigger keeps the loop short.

## Argument parsing

The first whitespace-separated token of the command argument is the
**phase** if it matches one of:

- `constitution`, `specify`, `verify-spec`, `plan`, `tasks`,
  `checklist`, `analyze`, `review` — fired by `/speckit.<phase>`
  after its artifact is written
- `session-end` — fired by `/speckit.implement` at the end of a
  run that completed work but did not reach a Story-Complete
  checkpoint or end-of-feature
- `story-complete` — fired by `/speckit.implement` after a User
  Story Checkpoint passes
- `end-of-feature` — fired by `/speckit.implement` after the final
  Checkpoint or Polish phase
- `ad-hoc` — explicit ad-hoc invocation

If the first token does NOT match a known phase, treat the entire
argument as a one-liner gripe with phase = `ad-hoc`. If a known
phase is followed by additional text, treat the trailing text as
the **What was friction?** answer and skip the other prompts.

## Workflow

1. Auto-capture context (no code, no prompts, no secrets):
   - Phase
   - Feature directory if applicable (e.g., `specs/004-foo`); for
     `constitution` the scope is the project, not a feature
   - Current git branch
   - Agent name and model (if known)
   - Timestamp (UTC, ISO-8601)
2. If a one-liner was supplied, treat it as the **What was
   friction?** answer and skip the other prompts.
3. Otherwise ask the universal three short questions plus the
   phase-specific prompt from the **Phase-specific prompts** table
   below. For implementation phases (`session-end`, `story-complete`,
   `end-of-feature`) **also append** the AI-authorship attestation
   question described below. The developer may skip any:
   - **What worked?** — template behavior worth keeping
   - **What was friction?** — slow, unclear, repetitive, hard to skip
   - **What was wrong?** — drift from spec, gate that should have caught X, missing dimension
   - **Phase-specific prompt** — see table below; one extra question
     tailored to the phase. Render its answer under a `## Phase-specific`
     section in the feedback markdown.
   - **AI-authorship attestation** *(implementation phases only)* —
     "Roughly what share of this work's code was AI-generated?
     (`<25%` / `25–50%` / `50–75%` / `>75%` / `all`)". Optionally a
     one-line comment. Render under `## AI-authorship attestation`
     in the feedback markdown. See **AI authorship signals** below
     for why we capture this *and* a mechanical signal — they
     calibrate each other; mismatches are the interesting data.
4. **Auto-fill a `## Telemetry` section** scoped to the phase. See
   "Telemetry collection" below for per-phase fields. All values are
   counts, booleans, or aggregate numbers — never file content,
   prompts, or tool output.
5. Compose the feedback as Markdown. The first line MUST be a short
   `# Title` since the post script uses it as part of the filename:

   ```
   # SDD feedback — <phase> — <feature-id-or-project>: <one-line summary>

   **Phase:** <phase>
   **Branch:** <branch>
   **Agent:** <agent-model>
   **When:** <iso-timestamp>

   ## What worked
   ...

   ## What was friction
   ...

   ## What was wrong
   ...

   ## Telemetry
   <phase-specific block — see below>
   ```

6. Write a local copy:
   - For `phase = constitution` (project-scope, no feature dir yet):
     `.specify/feedback/constitution.md` (create the directory if
     needed).
   - For all feature-scoped phases:
     `specs/<feature-id>/feedback/<phase>.md`
     (e.g. `feedback/specify.md`, `feedback/story-complete.md`).
     Create the `feedback/` directory if needed.
7. **Also write a sibling JSON payload** next to the `.md`, named
   `<phase>.json` (for `constitution`, `.specify/feedback/constitution.json`).
   It is the exact body the telemetry backend ingests — **identity is NOT
   included** (the server resolves it from the token). Shape:

   ```jsonc
   {
     "phase": "<phase>",
     "project": "<project>",            // SDD_PROJECT_NAME → git remote basename
                                        //   → repo top-level → $PWD basename
     "spec": "<feature-id>",            // null for constitution / ad-hoc
     "branch": "<branch>",
     "agent_model": "<agent-model>",
     "tool": "copilot",                 // originating AI tool
     "client_ts": "<iso-8601-utc>",
     "feedback": {
       "worked": "...", "friction": "...",
       "wrong": "...", "phase_specific": "..."
     },
     "ai_attestation": { "bucket": "50-75%", "comment": "..." },
                                        // bucket is one of: <25%, 25-50%, 50-75%, >75%, all
     "metrics": { /* the per-phase ## Telemetry block, as key/value JSON */ }
   }
   ```

   Use `null` (not empty string) for any prompt the developer skipped, for
   `spec` on project-scoped phases, and omit `ai_attestation` entirely for
   non-implementation phases. The `metrics` object is the same data rendered in
   the `## Telemetry` markdown section, expressed as JSON values (numbers,
   booleans, strings) — **except `session_cost`, which is a nested object**
   `{"input", "output", "cache_creation", "cache_read"}` (numbers, or the literal
   string `"unknown"` for a field not yet known mid-session; see the
   `session_cost` field below), never its `input=…, output=…` string rendering.
   The backend only counts token usage when `session_cost` is an object; the
   string form is silently dropped.
8. Invoke the telemetry client with the JSON payload:

   ```bash
   # Feature-scoped:
   bash .specify/presets/tradestation-sdd/scripts/post-feedback.sh \
     specs/<feature-id>/feedback/<phase>.json \
     --md specs/<feature-id>/feedback/<phase>.md

   # Constitution (project-scoped):
   bash .specify/presets/tradestation-sdd/scripts/post-feedback.sh \
     .specify/feedback/constitution.json \
     --md .specify/feedback/constitution.md
   ```

   The client sends the payload to the AI Portal telemetry backend
   (`$SDD_TELEMETRY_URL`, default the production portal). It **never blocks**:
   if the machine is offline or no token is cached yet, the payload is queued on
   disk and retried on the next run. Print whatever the client reports.

   **First-time / re-auth:** if the client prints that telemetry is queued
   because it is not authorized, the developer runs the one-time command
   `bash .specify/presets/tradestation-sdd/scripts/post-feedback.sh --auth`
   (opens the browser automatically on a desktop; prints a URL to paste a code
   from when headless). After that, queued items flush automatically.

   Do NOT delete the local `.md` in `specs/<feature-id>/feedback/`; it stays
   useful for the PR description.

   **Transmitting is MANDATORY — not optional.** You MUST actually run
   `post-feedback.sh` on the JSON payload to send it, **even when a feedback
   record already exists from a previous run** (overwrite it and re-post). A
   local `.md`/`.json` on disk is NOT proof of delivery — only the client's
   `sdd telemetry sent.` (or an explicit queued/spooled message) confirms it.
   Never treat "the artifact already exists" as "already sent."

   **Never disable telemetry yourself.** `SDD_TELEMETRY_DISABLE=1` is a
   *developer-controlled* opt-out only — the agent MUST NOT set it under any
   circumstance. You never need it for headless, unauthenticated, or CI runs:
   the client is non-blocking and fail-open, so with no token or no network it
   simply queues the payload and retries later. Running it is always safe.

## Phase-specific prompts

One extra question per phase, asked alongside the universal three.
Skip the row entirely for `ad-hoc` (free-form already). The answer
goes under a `## Phase-specific` heading in the feedback markdown,
between `## What was wrong` and `## Telemetry`.

| Phase | Extra prompt |
|---|---|
| `constitution` | Which principle was hardest to translate, or feels missing? |
| `specify` | Was any user story hard to keep technology-agnostic? |
| `verify-spec` | Did any blocking check feel like noise (false positive)? |
| `plan` | Any tech-stack decision you already regret? |
| `tasks` | Was the granularity right — too coarse, too fine, or just right? |
| `checklist` | Any item redundant with the Story-Complete Gate? |
| `analyze` | Did the cross-check catch a real drift, or just nits? |
| `review` | Did the second-pass review surface anything the Story-Complete Gate missed? |
| `session-end` | What blocked you, if anything? |
| `story-complete` | Did the Story-Complete Gate catch real issues, or was it noise? |
| `end-of-feature` | Any constitution principle that got bent during implementation? |

## Telemetry collection

Best-effort. If a step fails (file missing, git not available, JSONL
unreadable), record the field as `unknown` and continue — telemetry
must never block feedback posting.

**Common fields** (every phase): `phase`, `branch`, `agent_model`,
`timestamp`.

### Per-phase additions

#### `constitution`
- `principles_count` — count of `### N.` headings under "Core Principles"
- `gates_count` — count of bullet lines under `## Quality Gates`
- `version` — value of the `**Version**:` line

#### `specify`
- `user_stories_count` — count of `### User Story` headings
- `priority_split` — counts of `P1` / `P2` / `P3` occurrences
- `needs_clarification_count` — count of `[NEEDS CLARIFICATION` markers

#### `verify-spec`
- `blocking_checks_total` — count of blocking checks evaluated
- `blocking_checks_passed` — count of blocking checks that passed
- `non_blocking_warnings` — count of `WARN`-tagged non-blocking findings
- `result` — `PASS` if all blocking checks passed, else `FAIL`

#### `plan`
- `complexity_tracking_entries` — count of rows in the Complexity
  Tracking table
- `test_strategy_present` — boolean
- `dependency_manifest_present` — boolean: does
  `specs/<feature-id>/dependency-manifest.md` exist
- `manifest_codebases` — count of data rows in the manifest's
  "Codebases in this epic" table; `0` when no manifest
- `manifest_boundaries` — count of `### ` subsections under the
  manifest's "Boundary dependencies" heading; `0` when no manifest
- `manifest_stale_contracts` — count of boundary entries in plan.md's
  Cross-Repo Context marked STALE, "no deep scan available", or
  "re-scan running"; `0` when no manifest
- `manifest_freshness_checked` — boolean: were manifest claims
  re-verified against the graph this session (Impact MCP tools
  available and `get_deep_scan` called); `false` when no manifest

#### `tasks`
- `tasks_total` — count of `- [ ]` and `- [x]` lines in `tasks.md`
- `parallel_tasks` — count of tasks marked `[P]`
- `test_tasks` — count of tasks whose description starts with "Test"
  or whose path is in a `tests/` directory

#### `checklist`
- `checklist_items` — count of `- [ ]` lines in `checklist.md`

#### `analyze`
- `findings_total` — count of finding entries in `analysis.md`
- `blocking_findings` — count of blocking-tagged findings
- `non_blocking_findings` — count of non-blocking-tagged findings
- `dependency_manifest_present` — boolean: does
  `specs/<feature-id>/dependency-manifest.md` exist
- `cross_repo_row_filled` — boolean: does the "Cross-repo contract
  surface" Architecture Review row carry a concrete Decision (not
  N/A); `false` when the row is N/A or missing

#### `review`
- `blocking_findings` — count of entries under `## Blocking findings`
  in `code-review.md` (excluding the literal `None.` line)
- `non_blocking_findings` — count of entries under `## Non-blocking
  findings`
- `skills_run` — comma-separated list of skills that produced output
  (`review`, `security-review`); `none` if both were unavailable
- `diff_files` / `diff_added` / `diff_deleted` — from
  `git diff --shortstat <base> HEAD`

#### `session-end`
- `tasks_completed` / `tasks_total` — same fields as story-complete
  (count `- [x]` and `- [ ]` lines in `tasks.md`)
- `current_story` — story tag for the in-progress story
  (e.g., `US2`) if identifiable from `tasks.md`; otherwise `unknown`
- `session_minutes` — wall-clock minutes from the oldest event in
  the current Copilot CLI session-state log to now, one decimal:
  ```bash
  proj_dir="$HOME/.copilot/session-state"
  jsonl="$(ls -t "$proj_dir"/*/events.jsonl 2>/dev/null | head -1)"
  jq -rs 'min_by(.timestamp).timestamp' "$jsonl" 2>/dev/null
  # Compute minutes between that timestamp and now; render `unknown`
  # if the file or `jq` is missing.
  ```
- `blocked` — boolean: did the agent stop on a question, gate
  failure, or unresolved decision that prevented further progress?
- `files_changed` — same heuristic as story-complete:
  ```bash
  base="$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null || echo HEAD)"
  git diff --name-only "$base" HEAD | wc -l | tr -d ' '
  ```
- `test_files_count`, `test_to_source_ratio`, `coverage_report_present`
  — see **Test coverage proxies** below.
- `spec_modified_after_tasks`, `needs_clarification_added_during_impl`,
  `acceptance_scenarios`, `frs_unreferenced` — see **Spec drift
  heuristics** below.
- `ai_edit_tool_calls`, `ai_files_touched`, `ai_lines_added_estimate`,
  `ai_lines_share` — see **AI authorship signals** below.

#### `story-complete` and `end-of-feature`
- `tasks_completed` / `tasks_total` — count `- [x]` and `- [ ]` lines
  in `tasks.md`. Render as `completed/total`.
- `remediation_tasks_added` — heuristic: tasks added below a line
  containing "remediation" or "Gate gap" within a User Story
  section. Report `0` if no marker is found.
- `files_changed` — count, not names:
  ```bash
  base="$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null || echo HEAD)"
  git diff --name-only "$base" HEAD | wc -l | tr -d ' '
  ```
- `gates_run` — two booleans:
  - `analyze` = does `specs/<feature-id>/analysis.md` exist
  - `story_review` = does `tasks.md` contain a phrase like
    "Checkpoint passed" or "Story-Complete Review Gate passed"
- `feature_age_hours` — oldest mtime under `specs/<feature-id>/` to
  now, in hours, one decimal:
  ```bash
  oldest=$(find "specs/<feature-id>" -type f -printf '%T@\n' 2>/dev/null \
    | sort -n | head -1)
  # macOS: stat -f %m <files> instead of -printf
  . .specify/presets/tradestation-sdd/scripts/_portable.sh
  sdd_py -c "import time; print(f'{(time.time()-${oldest})/3600:.1f}')"
  ```
- `session_cost` — token usage for the current Copilot CLI session,
  read from Copilot's own session-state event log:
  ```bash
  proj_dir="$HOME/.copilot/session-state"
  jsonl="$(ls -t "$proj_dir"/*/events.jsonl 2>/dev/null | head -1)"
  jq -s '
    (map(select(.type == "session.shutdown")) | last) as $s
    | if $s != null then
        # Session has ended: full breakdown is available.
        { input:          ($s.data.tokenDetails.input.tokenCount       // 0),
          output:         ($s.data.tokenDetails.output.tokenCount      // 0),
          cache_creation: ($s.data.tokenDetails.cache_write.tokenCount // 0),
          cache_read:     ($s.data.tokenDetails.cache_read.tokenCount  // 0) }
      else
        # Live session (the usual case for /speckit.feedback): only
        # per-message output tokens are logged before shutdown. Report
        # output; mark input/cache unknown so we never report a false 0.
        { input:          "unknown",
          output:         (map(select(.type == "assistant.message")
                               | .data.outputTokens // empty) | add // 0),
          cache_creation: "unknown",
          cache_read:     "unknown" }
      end
  ' "$jsonl"
  ```
  The jq above emits the object directly. In the `## Telemetry` markdown,
  render it as `input=<n>, output=<n>, cache_creation=<n>, cache_read=<n>`
  (write `unknown` for any sub-field whose value is `"unknown"`). In the JSON
  payload (step 7), `metrics.session_cost` MUST be that raw jq object —
  `{"input": …, "output": …, "cache_creation": …, "cache_read": …}` — keeping
  numeric values as numbers and the literal string `"unknown"` for fields not
  yet known; **not** the string rendering. The backend sums whichever sub-fields
  are numbers and ignores `"unknown"`; a string-valued `session_cost` is dropped
  entirely. Render the whole field `unknown` (markdown) / omit `session_cost`
  from the JSON `metrics` if `jq` or the file is missing.

  This is a Copilot CLI internal path (`~/.copilot/session-state/`). If
  it changes upstream, only this field breaks; the rest of telemetry is
  git/filesystem-only. The full input/cache breakdown is only written at
  session end (`session.shutdown`), so a mid-session `/speckit.feedback`
  call reports `output` and leaves `input`/`cache_*` as `unknown` — this
  is expected, not an error.
- `test_files_count`, `test_to_source_ratio`, `coverage_report_present`
  — see **Test coverage proxies** below.
- `spec_modified_after_tasks`, `needs_clarification_added_during_impl`,
  `acceptance_scenarios`, `frs_unreferenced` — see **Spec drift
  heuristics** below.
- `plan_modified_after_tasks`, `new_top_level_dirs_since_plan`,
  `new_runtime_dependencies`, `files_outside_planned_paths` — see
  **Architecture drift heuristics** below.
- `ai_edit_tool_calls`, `ai_files_touched`, `ai_lines_added_estimate`,
  `ai_lines_share` — see **AI authorship signals** below.

### Test coverage proxies

Cheap, language-agnostic. We deliberately do **not** run tests or
parse coverage reports — we report only what the filesystem reveals.

- `test_files_count`:
  ```bash
  find . -type f \( \
    -name '*_test.go' -o \
    -name 'test_*.py' -o -name '*_test.py' -o \
    -name '*.spec.ts' -o -name '*.spec.js' -o \
    -name '*.test.ts' -o -name '*.test.js' -o \
    -name '*Tests.cs' -o -name '*Test.cs' -o \
    -name '*Test.java' -o -name '*Spec.scala' \
    \) -not -path '*/node_modules/*' -not -path '*/.git/*' \
       -not -path '*/dist/*' -not -path '*/build/*' \
    | wc -l | tr -d ' '
  ```
- `test_to_source_ratio` — `test_files / (source_files − test_files)`,
  rendered as a fraction with two decimals; `unknown` if denominator is 0:
  ```bash
  source_files=$(find . -type f \( \
    -name '*.go' -o -name '*.py' -o -name '*.ts' -o -name '*.js' -o \
    -name '*.cs' -o -name '*.java' -o -name '*.scala' -o -name '*.rb' \
    \) -not -path '*/node_modules/*' -not -path '*/.git/*' \
       -not -path '*/dist/*' -not -path '*/build/*' \
    | wc -l | tr -d ' ')
  awk -v t="$test_files_count" -v s="$source_files" \
    'BEGIN { d = s - t; if (d > 0) printf "%.2f", t/d; else print "unknown" }'
  ```
- `coverage_report_present` — boolean, `true` if any of these exist:
  `coverage.xml`, `lcov.info`, `coverage.out`, `coverage/index.html`,
  `.coverage`, `*.cobertura.xml` (anywhere in the tree, excluding
  `node_modules`, `.git`, `dist`, `build`).

### Spec drift heuristics

All cheap. Each one's a *prompt to look*, not a verdict — the
feedback markdown should render them as raw values without
interpretation.

- `spec_modified_after_tasks` — boolean. Did `spec.md` get edited
  after `tasks.md` was generated?
  ```bash
  feature_dir="specs/<feature-id>"
  tasks_mtime=$(stat -f %m "$feature_dir/tasks.md" 2>/dev/null \
                || stat -c %Y "$feature_dir/tasks.md" 2>/dev/null)
  if [[ -n "$tasks_mtime" ]]; then
    iso=$(date -u -r "$tasks_mtime" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
          || date -u -d "@$tasks_mtime" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
    git log --since="$iso" --oneline -- "$feature_dir/spec.md" \
      | grep -q . && echo true || echo false
  else
    echo unknown
  fi
  ```
- `needs_clarification_added_during_impl` — count delta. How many new
  `[NEEDS CLARIFICATION` markers appeared in `spec.md` after the spec
  passed verification?
  ```bash
  current=$(grep -c '\[NEEDS CLARIFICATION' "$feature_dir/spec.md" \
              2>/dev/null || echo 0)
  v_commit=$(git log --diff-filter=A --format=%H \
              -- "$feature_dir/spec-verification.md" 2>/dev/null | tail -1)
  if [[ -n "$v_commit" ]]; then
    past=$(git show "$v_commit:$feature_dir/spec.md" 2>/dev/null \
            | grep -c '\[NEEDS CLARIFICATION' || echo 0)
    echo $((current - past))
  else
    echo unknown
  fi
  ```
- `acceptance_scenarios` — `<covered>/<total>`. Total = count of
  `**Given**` lines in `spec.md`. Covered ≈ count of distinct user
  story tags (`US1`, `US2`, …) referenced in any test file:
  ```bash
  total=$(grep -c '^\*\*Given\*\*' "$feature_dir/spec.md" 2>/dev/null || echo 0)
  covered=$(grep -rEho 'US[0-9]+' \
              --include='*test*' --include='*spec*' --include='*Test*' . \
              2>/dev/null | sort -u | wc -l | tr -d ' ')
  # Cap covered at total to avoid > 100% noise.
  [[ "$covered" -gt "$total" ]] && covered="$total"
  echo "$covered/$total"
  ```
- `frs_unreferenced` — list of `FR-NNN` tokens in `spec.md` that don't
  appear in any committed file outside `specs/`. Render as
  `<count>: FR-003, FR-007` or `0: —`:
  ```bash
  mapfile -t frs < <(grep -oE 'FR-[0-9]+' "$feature_dir/spec.md" \
                      2>/dev/null | sort -u)
  missing=()
  for fr in "${frs[@]}"; do
    if ! grep -rq "$fr" \
          --exclude-dir=specs --exclude-dir=.git \
          --exclude-dir=node_modules --exclude-dir=dist \
          --exclude-dir=build . 2>/dev/null; then
      missing+=("$fr")
    fi
  done
  if [[ ${#missing[@]} -eq 0 ]]; then echo "0: —"
  else printf '%d: %s\n' "${#missing[@]}" "$(IFS=,; echo "${missing[*]}")"
  fi
  ```

### Architecture drift heuristics

Compares HEAD against the commit that first added `plan.md`. All
proxies — non-zero is a *prompt to look*, not a guaranteed regression.

- `plan_modified_after_tasks` — boolean, same shape as
  `spec_modified_after_tasks`, but for `plan.md`.
- `new_top_level_dirs_since_plan` — count of top-level directories
  present at HEAD that didn't exist when `plan.md` was committed:
  ```bash
  plan_commit=$(git log --diff-filter=A --format=%H \
                  -- "$feature_dir/plan.md" 2>/dev/null | tail -1)
  if [[ -n "$plan_commit" ]]; then
    past=$(git ls-tree --name-only -d "$plan_commit" 2>/dev/null | sort -u)
    now=$(git ls-tree --name-only -d HEAD 2>/dev/null | sort -u)
    comm -13 <(echo "$past") <(echo "$now") | wc -l | tr -d ' '
  else
    echo unknown
  fi
  ```
- `new_runtime_dependencies` — count of *added* lines in dependency
  manifests between `plan_commit` and HEAD. Counts every manifest type
  present; render `unknown` if no manifests exist.
  ```bash
  total=0; found=false
  for f in package.json requirements.txt go.mod pyproject.toml \
           Cargo.toml Gemfile pom.xml; do
    [[ -f "$f" ]] && found=true
    [[ -f "$f" ]] && total=$((total + $(git diff "$plan_commit"..HEAD \
                              -- "$f" 2>/dev/null \
                              | grep -c '^+[^+]')))
  done
  $found && echo "$total" || echo unknown
  ```
  Note: this counts every `+` line in the diff, including comment/version
  bumps. Use it as a "did the dependency surface change" signal, not an
  exact dep count.
- `files_outside_planned_paths` — count of files in the working diff
  that are not under any path declared in `plan.md`'s
  `## Source Code` or `## Project Structure` section.
  ```bash
  planned=$(awk '
    /^## (Source Code|Project Structure)/ { flag=1; next }
    /^## / { flag=0 }
    flag
  ' "$feature_dir/plan.md" 2>/dev/null \
    | grep -oE '^[a-zA-Z][a-zA-Z0-9_/-]+' | sort -u)
  if [[ -z "$planned" ]]; then
    echo unknown
  else
    base="$(git merge-base HEAD main 2>/dev/null \
            || git merge-base HEAD master 2>/dev/null || echo HEAD)"
    outside=0
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      hit=false
      while IFS= read -r root; do
        [[ "$f" == "$root"* ]] && hit=true && break
      done <<< "$planned"
      $hit || outside=$((outside + 1))
    done < <(git diff --name-only "$base" HEAD 2>/dev/null)
    echo "$outside"
  fi
  ```

### AI authorship signals

Mechanical companion to the **AI-authorship attestation** prompt
(implementation phases only). The attestation captures the developer's
self-report; these fields capture what Copilot CLI's session-state log
actually shows. Mismatches between the two are the interesting signal.

This is **not a code-quality metric**. High AI share is not bad, low
share is not good. The fields exist to understand *how* the team uses
the SDD loop, not whether the code is right — that's what the gates
and `/speckit.review` are for. Render this disclaimer next to the
fields in the feedback markdown so the data is not misread.

Same Copilot CLI session-state path as `session_cost`
(`~/.copilot/session-state`). If Copilot's event-log format changes
upstream, only these fields break; everything else is
git/filesystem-only. Render every field as `unknown` if `jq` or the
event log is missing.

```bash
proj_dir="$HOME/.copilot/session-state"
jsonl="$(ls -t "$proj_dir"/*/events.jsonl 2>/dev/null | head -1)"

jq -s '
  [.[] | select(.type == "tool.execution_start"
                and (.data.toolName == "create" or .data.toolName == "edit"))
   | .data]
  | { calls: length,
      files: ([.[].arguments.path] | unique | length),
      lines: ([.[]
        | if   .toolName == "create" then (.arguments.file_text | split("\n") | length)
          elif .toolName == "edit"   then (
                 ((.arguments.new_str | split("\n") | length))
               - ((.arguments.old_str | split("\n") | length))
               | if . < 0 then 0 else . end)
          else 0 end] | add // 0)
    }
' "$jsonl"
```

- `ai_edit_tool_calls` — `.calls` from the jq output. Count of
  `create` + `edit` tool uses by the agent in the current session.
- `ai_files_touched` — `.files`. Distinct file paths the agent wrote
  to. Compare against `files_changed` (git-derived) to see fraction
  touched by the agent vs. by hand.
- `ai_lines_added_estimate` — `.lines`. Net new lines from agent tool
  calls. For `edit`, computed as `max(0, new_str_lines − old_str_lines)`,
  so it does not count line-for-line replacements. For `create`, the full
  `file_text` (overcounts when overwriting an existing file). Best-effort.
- `ai_lines_share` — `ai_lines_added_estimate / git_insertions`,
  rendered with two decimals; capped at 1.0. `git_insertions` from
  `git diff --shortstat <base> HEAD`:
  ```bash
  base="$(git merge-base HEAD main 2>/dev/null \
          || git merge-base HEAD master 2>/dev/null || echo HEAD)"
  ins=$(git diff --shortstat "$base" HEAD 2>/dev/null \
        | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+')
  awk -v a="$ai_lines_added_estimate" -v g="${ins:-0}" \
    'BEGIN { if (g > 0) { v = a/g; if (v > 1) v = 1; printf "%.2f", v }
             else        print "unknown" }'
  ```

**Caveats** (worth keeping inline in the feedback markdown alongside
the values):
- **Copilot CLI tool-calls only.** Code typed by hand or pasted in is
  *not* counted as AI here. The attestation prompt is the catch-all for
  those.
- **Edit-replacement undercount.** A large Edit that swaps similar
  amounts of code in and out registers near-zero net lines, even
  though it was AI work. Combine with `ai_edit_tool_calls` for a
  fuller picture.
- **Write-overwrite overcount.** A Write that replaces an existing
  file inflates `ai_lines_added_estimate` by the size of the prior
  content. Rare in normal workflows but real.
- **Multi-session features.** A session is one Copilot CLI run; a
  feature spans many. The fields reflect the *current session*, not
  the lifetime of the feature. End-of-feature telemetry will reflect
  only the final session unless we widen the event-log scan — out of
  scope for this version.

## Privacy

This command MUST NOT include:
- Source code, diffs, or file contents
- File names from the working tree (counts only)
- Agent prompts, transcripts, or tool outputs
- Customer data, account numbers, or anything resembling PII

Anything the developer types into the three prompts is sent verbatim;
they are responsible for what they paste in. Telemetry numbers are
aggregates by design — no field above carries content.
