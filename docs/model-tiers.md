# AI Model Selection Guidelines

Model names differ by AI tool. Both tools use the same three-tier strategy — cheap/routine, primary coding, architecture-only. Always switch model **before** starting a task or launching agents.

Tiers: **1** Routine/simple · **2** Primary coding, ~85% of work · **3** Architecture only, <5% of work

| Process | Tier | Copilot model | Claude Code model |
|---|---|---|---|
| Quick questions, doc updates, simple bug fixes | 1 | GPT-5 mini / MAI-Code-1-Flash | claude-haiku-4-5 |
| Admin/env/CI config, linting & formatting checks | 1 | GPT-5 mini / MAI-Code-1-Flash | claude-haiku-4-5 |
| Build / test / format runs | 1 | GPT-5 mini / MAI-Code-1-Flash | claude-haiku-4-5 |
| Git commit messages, merge/rebase/push, branch cleanup | 1 | GPT-5 mini / MAI-Code-1-Flash | claude-haiku-4-5 |
| Feature implementation (`speckit-implement`) | 2 | GPT-5.2-Codex (verify¹) | claude-sonnet-5 |
| `speckit-plan` / `speckit-tasks` | 2 | GPT-5.2-Codex (verify¹) | claude-sonnet-5 |
| Code review / audit of completed phases | 2 | GPT-5.2-Codex (verify¹) | claude-sonnet-5 |
| Non-architectural refactors | 2 | GPT-5.2-Codex (verify¹) | claude-sonnet-5 |
| General debugging & troubleshooting | 2 | GPT-5.2-Codex (verify¹) | claude-sonnet-5 |
| Cross-cutting architecture design (new external touchpoint, schema-wide change) | 3 | GPT-6 Astra (verify¹) | claude-opus-5 |
| Hard-to-solve debugging (Tier 2 exhausted) | 3 | GPT-6 Astra (verify¹) | claude-opus-5 |
| System-level refactor touching multiple areas (routes, services and repositories at once) | 3 | GPT-6 Astra (verify¹) | claude-opus-5 |

¹ Copilot's mid/top tier naming and availability churns fast — check the live model picker (`github.com/copilot`) before trusting the Copilot column; the Claude Code column is stable.

**Guidelines:**

- Both tools: use `/model <name>` to switch
- Default to Tier 1 for simple tasks; reserve Tier 3 for genuinely architecture-level work
- For `speckit-implement`, `speckit-plan`, `speckit-tasks`: use the Tier 2 model
- For architecture decisions — a new external interaction, a schema-wide change, a stack-level swap — switch to Tier 3
- If unsure which tier applies, ask; do NOT default to the Tier 3 (expensive) model
