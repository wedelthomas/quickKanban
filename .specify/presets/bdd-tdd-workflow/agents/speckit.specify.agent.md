## Risk Tier + Behavior Pathways (BDD/TDD Workflow)

Before filling the Behavior Pathways and Verification sections below the
standard template content:

1. **If this spec was adopted from a PM-authored spec** (existing Adopt
   mode) and already carries a `**Risk Tier:**` line, preserve it exactly
   as-is. Never re-scan an already-decided tier.
2. **Otherwise, scan for these triggers** — any one proposes **FULL**:
   - Touches money, orders, or positions
   - Touches auth, entitlements, or account gating
   - Changes a shared data model
   - Crosses a team or service boundary

   No trigger fires → propose **STANDARD**.
3. **Print the proposed tier and ask the developer to confirm or
   override.** Write the result into `spec.md` right after the feature's
   frontmatter, in either form:

   ```
   **Risk Tier:** FULL
   ```
   or, when overridden:
   ```
   **Risk Tier:** STANDARD
   **Tier Override Reason:** <the developer's stated reason>
   ```

4. **Fill `## Behavior Pathways` and `## Verification`** per the
   template's own instructions. At **STANDARD** tier, the existing
   unnumbered Acceptance Scenarios remain an acceptable substitute for
   `BH-###` pathways — filling them out fully is encouraged, never
   required, and a STANDARD-tier story that does author complete
   pathways still gets full credit for them.
