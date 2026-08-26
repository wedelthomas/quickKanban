---
description: "Check SDD setup readiness (config, Spec-Kit, preset, portal telemetry) and offer fixes"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.doctor

Verify this developer's Spec-Driven Development setup is ready, then fix what
you can.

## Workflow

1. Run the deterministic checker and read its JSON:
   `bash .specify/presets/tradestation-sdd/scripts/doctor.sh --json --tool claude`
   It returns checks R1 (model — Opus 4.8 or later; `opus[1m]`), R2 (effort `high`), R3 (superpowers
   plugin), R5 (Spec-Kit initialized), R6 (preset installed), and R7 (portal
   telemetry authentication). R1–R3, R5, R6 are hard PASS/FAIL; R7 is advisory.

2. Render each check as PASS/FAIL/WARN/INFO with its `detail`. For any check
   with a `fix`, show it.

3. **R4 — Closed-loop testing capability** (judgment check, not in the script).
   The SDD workflow requires interacting with the running app as a user would,
   then validating functional requirements. Confirm the project has at least one
   tool for this, by project type:
   - Web apps: a browser MCP (Playwright `@playwright/mcp` or Chrome DevTools).
   - iOS: an iOS-simulator MCP or Xcode integration.
   - Android: an Android-emulator MCP or ADB integration.
   - Backend/API: a `Bash(curl:*)` permission or an HTTP-client MCP.
   Inspect `mcpServers` and `permissions.allow` in `~/.claude/settings.json` and
   the project settings. If none is found, ask the user the project type, then
   recommend the matching tool (web fix:
   `"playwright": { "command": "npx", "args": ["-y", "@playwright/mcp"] }` under
   `mcpServers`).

4. If R7 is WARN and carries a non-null `fix` field (the portal-auth cases —
   "not authenticated" / "token expired"), offer to run that fix:
   `bash .specify/presets/tradestation-sdd/scripts/post-feedback.sh --auth`.
   It opens the browser once — have the user complete the login there — then
   re-run step 1 to confirm. A WARN with no `fix` (e.g. "portal unreachable")
   needs no action; just report it.

5. For any hard FAIL, offer to apply the exact fix — write the JSON/command to
   the right file — then re-run step 1.

6. End with this exact summary. The six hard checks are R1, R2, R3, R4, R5, R6
   (R7 telemetry is the advisory warning):
   `"X/6 passed, Y warning(s). You are [ready / not yet ready] for Spec-Driven Development."`
   where X counts hard PASSes among R1, R2, R3, R4, R5, R6, and Y counts WARNs.
   Do NOT use the JSON's `hard_passed` field as X — it counts only the five
   script checks (R1–R3, R5, R6) and excludes the R4 judgment check. Compute X
   yourself by adding your R4 result to the script's hard PASSes.

Do not auto-invoke `/speckit.feedback` — `/speckit.doctor` is a setup check, not
a workflow phase.
