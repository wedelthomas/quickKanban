## Additional Blocking Check (BDD/TDD Workflow)

Add this check to the "Blocking" list above, numbered after the last
existing check (e.g. `B7` if the org baseline currently has `B1`-`B6`),
and add its result to the "## Blocking checks" list in the Output format
below, alongside the existing `[PASS|FAIL]` lines:

- **B<N>. Behavior Pathways traceability.** Read the spec's
  `**Risk Tier:**` line.
  - **At FULL tier:** every `## Behavior Pathways` entry that is not an
    explicit `no-behavior` line MUST have a corresponding row in
    `## Verification` whose `Pins` column names it, and every row in
    `## Verification` MUST `Pin` a `BH-###` that actually exists above
    (no orphaned `TEST-###`). Missing pathways, missing verification
    rows, or an unresolved `Pins` reference are all FAIL.
  - **At STANDARD tier:** this check auto-PASSes. The unnumbered
    Acceptance Scenarios format is an accepted substitute — do not fail
    a STANDARD-tier story for lacking `BH-###`/`TEST-###` content.
  - **No `**Risk Tier:**` line present at all:** treat as STANDARD
    (auto-PASS) — this capability never retroactively fails a spec that
    predates its installation.

This check is **BLOCKING**, same severity class as B1-B6 above — a
FULL-tier story with a broken or absent chain stops `/speckit.plan` from
proceeding, exactly like any other failing blocking check.
