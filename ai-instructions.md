<!-- This file is the single source of truth for AI coding instructions in this workspace. It is loaded by both tools via symlink: CLAUDE.md -> ai-instructions.md (Claude Code) and .github/copilot-instructions.md -> ../ai-instructions.md (GitHub Copilot, per https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file). Edit only ai-instructions.md — never the symlinks. -->

# Quick Kanban Wall — AI Coding Instructions

## Project Overview

A small, self-hosted Kanban board for **one person**, showing all their assigned work in one place — Jira issues alongside the ad-hoc work that never gets a ticket. See `README.md` for the product pitch and `docs/brd.md` / `docs/brd-2.md` for the business requirements behind slices 1–6.

**Project Type**: web-application (Fastify API + React SPA, one repository, one process)
**Current Status**: Slices 1–5 implemented and merged. Slices 006 (time, points and iteration reporting) and 007 (cancelling stories) are specced (`specs/006-time-points-and-reporting/`, `specs/007-cancelling-stories/`) but not yet planned or built.

**Business Context**: Solo project, one user, one machine. There is no team to coordinate with beyond the single maintainer, no on-call rotation, and no production incident path — see the constitution's explicit exemptions before assuming an enterprise practice applies here.

## Technology Stack — DECIDED

Unlike a fresh project, this stack is established and MUST NOT be replaced without a documented reason in a plan's Complexity Tracking table (constitution, Technology & Security Standards):

- **Language**: TypeScript throughout (Node 22, ES modules)
- **API**: Fastify
- **Storage**: PostgreSQL, raw SQL with a hand-rolled migration runner — no ORM
- **Front end**: React 19 + Vite, CSS custom properties — no CSS framework
- **Testing**: Vitest (unit, contract, ops), cucumber-js (acceptance/Gherkin), Playwright (e2e)
- **Deployment**: Docker Compose, two containers (`app`, `db`), bound to loopback only

## Language

All code, comments, identifiers, commit messages and documentation are English. There is no localization requirement — this is a single-user tool for one English-speaking maintainer.

## Monorepo Workspace

This is a **monorepo SDD workspace**. SDD orchestration artifacts (specs, plans, tasks, constitution) and source code live together in this single git repository.

## Project Context — Read Before Working

Scope reads to what the task actually needs — don't read all of these for a small or unrelated change (typo fix, doc tweak, config change):

1. **`.specify/memory/constitution.md`** — governance principles; read once per session if not already read, not per task. Skip entirely for changes with no architecture/scope/data-handling angle.
2. **`docs/`** — BRDs (`brd.md` for slices 1–4, `brd-2.md` for slices 5–6) and reference docs (`docs/design/visual-language.md`, `docs/external-interactions.md`); read only the doc relevant to the task.
3. **`specs/[feature]/spec.md` / `plan.md` / `tasks.md`** — only for the feature the task belongs to, and only once that phase has run. For large files, prefer a targeted read (relevant section, or grep for the requirement/behavior/task ID — `FR-###`, `BH-###`, `T###`) over reading the whole file, per the token-economy rule below.

Do not invent or assume the contents of a plan or task file that has not been written.

### SDD Workflow Per Feature

Each feature follows this sequence using speckit skills:

1. `speckit-specify` → `spec.md`
2. `speckit-clarify` → refine spec
3. `speckit-plan` → `plan.md` plus supporting design artifacts
4. `speckit-tasks` → `tasks.md`
5. `speckit-implement` → implementation

Feature directories are numbered sequentially: `specs/001-board-foundation/`, `specs/002-jira-import/`, … `specs/007-cancelling-stories/`.

## Constitution Compliance

**Governance Hierarchy**: Constitution → AI Instructions (this file, symlinked as `CLAUDE.md` / `.github/copilot-instructions.md`) → BRDs → Specs → Plans → Tasks → Daily Development

- **Before feature development**: check constitution compliance for all new features
- **During architecture decisions**: re-validate design choices against constitution principles
- **Document deviations**: any constitution violation must be justified in the plan's Complexity Tracking table
- **Constitution updates**: follow the amendment process in the constitution's Governance section

Principles that most often bite in practice (`.specify/memory/constitution.md`):

- **The movement history is the ledger** — append-only, never edited or deleted; a correction is a new event.
- **Jira is read-mostly** — an outbound write touches exactly the field the feature document names, never more; a credential never leaves the adapter that built the request from it.
- **Test-first, behavior-traced** — every acceptance scenario is a Behavior Pathway (`BH-###`) pinned by a named test (`TEST-###`), written and confirmed failing before its implementation task.
- **Security by default, sized for one user** — no credential ever committed; `.env` only; loopback bind only.

## Repository Organization

### Current

- `docs/` — BRDs and project-wide reference documentation
- `specs/` — SDD feature artifacts (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`)
- `.specify/` — Spec Kit engine: templates, scripts, constitution
- `.claude/`, `.github/` — AI assistant configuration (skills)
- `src/` — application source: `src/server/` (Fastify: routes, services, repositories, db), `src/domain/` (pure functions, no I/O), `src/web/` (React SPA), `src/shared/` (types shared by server and web)
- `tests/` — `tests/unit/`, `tests/contract/`, `tests/features/` (Gherkin), `tests/e2e/` (Playwright), `tests/ops/`
- `docker/`, `docker-compose*.yml` — deployment

### Organization Guidelines

- Maintain consistent naming conventions across all project files
- Preserve logical separation of concerns (documentation, source, tests, configuration)
- Keep `ai-instructions.md` as the authoritative development workflow reference, loaded by both tools via the `CLAUDE.md` / `.github/copilot-instructions.md` symlinks
- Keep `README.md` as the project overview and quick reference
- Follow the layer boundaries already established: routes (HTTP shape) → services (behavior) → repositories (SQL); pure domain functions stay separate from all I/O

## Git & CI/CD Workflow

### Git Workflow Control

**Local-first, push-on-request only — applies to every workflow, agentic or interactive:**

- **Work and commit locally by default.** `git commit` (including multiple commits across a session) requires no special confirmation — commit freely as work completes.
- **NEVER run `git push` and NEVER run `gh pr create` (or otherwise open a PR) unless the user explicitly instructs it in that turn** — e.g. "push this," "create the PR," "let's open a PR." A prior approval to push does not carry forward to later commits in the same or a later session; ask again each time it is not explicit.
- This applies to **agentic workers** (speckit skills, subagents executing plans) as much as interactive sessions: `speckit-implement` and similar flows still commit per task/phase as they complete, but must stop short of `git push` / `gh pr create` until told.
- Before ending a turn or session where local commits exist unpushed, briefly note that they are local-only and ready to push whenever asked — don't go silent about it.
- Maintain clean repository status with comprehensive `.gitignore` protection
- **`.env` and any secrets must always be gitignored** and never committed

### Branching & PRs

- Branch per feature, named after its spec directory: `006-time-points-and-reporting`, `007-cancelling-stories`. Use an isolated worktree for feature work (`superpowers:using-git-worktrees` if that skill is available).
- `main` is always deployable — no direct commits for feature work; small consistency/cleanup fixes on `main` are acceptable, matching how this repo has operated so far.
- Merges to `main` for feature work go through Pull Requests, so there is a review trail.
- Features are not implemented in parallel — one feature branch is actively worked at a time.

**Commit messages**: imperative subject line, followed by a body explaining *why* the change was made when that is not obvious from the diff — matching the voice already used throughout this repo's history.

**CI/CD is not yet set up.** No GitHub Actions workflows exist in this repository. Do not reference, assume, or depend on pipeline behavior until it is built.

## Working Style

### Development Approach

- **Never assume requirements**: verify against the spec or ask, rather than guessing.
- **Investigate before reviving anything disabled/dormant**: before re-enabling, porting, or copying logic from disabled code, find out *why* it was turned off first (git history, commit messages, or ask).
- **Verify ported logic in its new context, not its old one**: when moving or duplicating logic between environments, re-verify every assumption against the *new* context, ideally by running it.
- **Reason about concurrency explicitly when it exists**: this board already has one real race to respect — a scheduled sync and a manual refresh share `SyncLock` so they cannot both run at once. Any new concurrent path needs the same explicit treatment, not an assumption that independent checks rule out interleaving.

### Progress Tracking

- If tools are available to manage todo lists, use them to track progress through project tasks.
- **Feature task tracking**: when implementing a task belonging to a feature, mark it done in that feature's `specs/[feature]/tasks.md` (`- [ ]` → `- [x]`) as soon as it is completed — do not batch this at the end.

### Communication Rules

- **Token economy is a standing constraint.** Prefer targeted reads (specific line ranges, grep/search) over reading whole files; avoid re-reading files already seen this session; avoid redundant tool calls (e.g. Read right after Edit/Write, whose result already confirms the change). Batch independent tool calls together.
- **Present non-trivial changes before implementing them.** For anything beyond a small, mechanical, or explicitly-requested edit, summarize the planned change and let the user confirm or redirect before writing code.
- Keep explanations concise: no verbose walkthroughs, full command-output dumps, or unrequested project-structure tours.
- User instruction priority: explicit user constraints override default assistant preferences or conventional tooling assumptions.

### Local Build & Test Before Commit (MANDATORY)

**Before committing ANY code changes**, you MUST:

1. `npm run typecheck`
2. Relevant test tier(s) for the change — at minimum `npm run test:unit`; `npm run test:contract` and `npm run test:acceptance` when the change touches routes, services or acceptance behavior; `npm run test:e2e` when it touches the browser-facing surface.
3. `npm run lint`
4. Verify zero errors before committing.

**Why**: committing broken code wastes the next session's time re-diagnosing something already known. Non-negotiable.

### Task Completion Rules

Your task is complete when:

- All requested changes are implemented and tested
- Documentation is updated to reflect changes
- No compilation or runtime errors are introduced
- The user confirms the work meets their requirements

## Code & Content Standards

### Code Design Standards

- Apply **SOLID principles** — single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion, at the **class level**. Decouple by shrinking a class's surface and injecting its collaborators, not by creating a new shared/utility module for a single caller.
- Match the surrounding code's conventions when editing existing files — this repo's comments explain *why*, not *what*; keep that ratio.
- Reach for a new package only when the standard library or a few lines of code do not suffice, and justify it in the PR description (constitution, Technology & Security Standards).

### Folder Creation Rules

- Always use the workspace root directory (`.`) as the project root.
- Do not create a new top-level folder unless the user explicitly requests it, or the plan calls for it.

### Project Content Rules

- Avoid adding unnecessary dependencies, media, links, or integrations unless explicitly required.
- Ensure all generated components serve a clear purpose in the requested workflow.
- If a feature is assumed but not confirmed by the spec, ask before including it.

## Documentation Standards

- **Facts only.** Do not document behavior that has not been verified to exist. If something is planned but not built, label it as such.
- Use clearly marked placeholders (not invented values) for unverified information.

## AI Model Selection Guidelines

Three-tier strategy (1 routine, 2 primary coding ~85%, 3 architecture-only <5%) — full table and per-tool model names: `docs/model-tiers.md`. Switch model **before** starting a task or launching agents; if unsure which tier applies, ask rather than defaulting to Tier 3.
