<!--
Sync Impact Report:
Version change: 1.6.0 -> 2.0.0 (MAJOR -- this round is named
"Constitution v2" by the AO Core team; the version reflects both AO's
explicit naming request and a genuine principle merge/removal below,
so it holds under the doc's own MAJOR == removal/redefinition rule in
substance, not just by designation)

Added in 2.0.0:
  - Principle V: runbooks MUST be published to Confluence and kept in
    sync, not merely "discoverable" in-repo. DoD checks existence, not
    just findability.
  - Principle IX: "approved package managers" -> dependencies MUST
    resolve through official registries (NuGet.org, Azure DevOps
    Artifacts) via the centralized package-management system.
  - Principle VIII: "regulatory audit records" -> conditional rule --
    *if* a system handles PII/account-critical data, any change to it
    MUST log who/what/when (CRM example: contact info, account status);
    systems with no such data are exempt.

Changed in 2.0.0:
  - Principles XII (Simplicity Over Cleverness) and XIII (Simple Over
    Perfect) merged into a single Principle XII, "Simplicity First" --
    both were flavors of the same underlying stance (prefer simple),
    just applied to different dimensions (abstraction vs. scope/polish);
    the merged principle keeps both Definition of Done clauses.
    Principles XIV/XV renumbered to XIII/XIV accordingly.

Deferred: richer observability guidance for Principle VI (Gustavo
sending input separately).

Source: AO v2 review session, 2026-08-17. Prior amendment: AO Core team
feedback session, 2026-08-11 (see git history for that Sync Impact
Report).
-->

# [PROJECT_NAME] Constitution
<!-- Replace [PROJECT_NAME] with your project name, e.g., "Security Master", "Trade Ops" -->

## Core Principles

### A. AO Guiding Principles

These eleven principles map directly to the AO's own Guiding Principles,
in that order — the common floor every TradeStation system must meet.

<!-- AO-MANDATORY: security-first -->
#### I. Secure

Security is a default, not a feature. Authn/authz MUST be enforced at
every boundary. Inputs from outside the trust boundary MUST be validated
before use. Dependencies MUST be scanned for known CVEs. Threat-model
assumptions MUST be documented in `plan.md` whenever a feature handles
untrusted input, money movement, or authentication.

**Credential management (absolute — no exceptions):** No credential of
any kind — API keys, tokens, passwords, cloud keys, private keys,
connection strings, OAuth secrets, webhook secrets, or anything else a
system treats as proof of identity — may be committed to any repository,
ever. This applies even to "dev," "read-only," "throwaway," or "rotated
anyway" credentials. Credentials live in a gitignored `.env` file, a
secrets manager, or the platform-native vault — never in source, tests,
or docs.

**Pre-merge security scanning:** Every change MUST pass a security scan
(dependency/library vulnerabilities, hard-coded secrets, IaC
misconfigurations, and container-image vulnerabilities where applicable)
before merge to `main`/`master`. The default fail bar is Critical or High
vulnerabilities with an available fix, any verified secret, and
Critical/High IaC misconfigurations. The scan runs as a required CI status
check that blocks merge — a clean local run is not a substitute. A
verified secret finding is a credential leak and triggers incident
response, not just removal of the line.

**Definition of Done**: No credential in the diff; the security-scan CI
check is green, or — if not yet wired up — a manual Wiz CLI run shows no
Critical/High issues; any new untrusted-input path has threat-model
assumptions in `plan.md`.

**Rationale**: Credential leaks are the most common root cause of
preventable cloud-security incidents, and git history makes them
effectively permanent once committed.

<!-- Customize: Add domain-specific rules (financial data, regulated PII, data residency). -->
<!-- END AO-MANDATORY: security-first -->

#### II. Composable

Composability applies at two levels: within the application, and across
systems.

**Application-level composability**: Components MUST support loose
coupling with high cohesion, depending on interfaces/abstractions at
module boundaries rather than concrete implementations. A component MUST
be replaceable or extensible without modifying its consumers.

**Integration Patterns** (system-to-system): Prefer existing, approved
APIs over building new bespoke connections. All system-to-system
integrations MUST use one of the approved patterns below; deviations
require Architecture Office approval prior to implementation.

**Request-Response** (synchronous):
- Use **REST** when consumers are external, partners, customers, or
  otherwise not controlled by your organization — also acceptable for
  internal integrations where high performance is not a defined
  requirement.
- Use **gRPC** for internal synchronous integrations where high
  performance is a defined requirement.

**Publish-Subscribe** (asynchronous):
- Use when the originating system does not need an immediate response, or
  when multiple systems may need to react to an event.
- The messaging system MUST support topic-based pub/sub, at-least-once
  delivery, and multiple subscribers per queue.

**Prohibited anti-patterns** (no exceptions without Architecture Office
approval):
<!-- AO-MANDATORY: integration-anti-patterns -->
- Database-to-database connectivity (replication, linked servers)
- Direct database connections from other systems (table or stored
  procedure integration)
- Non-standard or proprietary protocols
- Legacy technologies (SOAP)
- Shared file systems, FTP, or other file-based integrations
<!-- END AO-MANDATORY: integration-anti-patterns -->

> If this project participates in TradeStation's City Plan enterprise
> architecture (cross-box integration through a target box's Domain API),
> see the City-Plan capability for the additional boundary rules — not
> part of this baseline.

**Definition of Done**: A component's public interface is documented and
consumed only through that interface; every external integration either
uses an approved pattern above or has recorded Architecture Office
approval for the deviation.

**Rationale**: Standardized patterns and well-bounded interfaces both
reduce the cost of changing one part of the system without breaking
another.

#### III. Available

Every system MUST meet a well-defined set of performance, consistency, and
uptime criteria appropriate to what it serves. Availability targets (SLAs/
SLOs) MUST be stated explicitly — "as available as possible" is not a
target. Capacity and scaling assumptions MUST be documented in `plan.md`.

**Definition of Done**: SLA/SLO targets are stated numerically in
`plan.md`, and capacity/scaling assumptions are documented before ship.

**Rationale**: Undefined availability expectations make it impossible to
tell whether a system is meeting its obligations.

<!-- Customize: Add specific SLA/SLO targets, e.g. "99.9% uptime, p95 < 200ms." -->

#### IV. Resilient

Systems MUST be resilient to anticipated failures that could affect
availability — dependency outages, network partitions, resource
exhaustion — and MUST implement a disaster-recovery strategy appropriate
to the system's criticality. Retries MUST use backoff and MUST NOT amplify
load during an incident. Failure modes and their mitigations MUST be
documented alongside the External Interactions Register (Principle XI).

**Application-level resilience**: Code MUST handle errors and unexpected
input gracefully — a service MUST NOT crash or hang on malformed input,
an unexpected null, or a downstream response outside its documented
contract. Exceptions MUST be caught at a boundary appropriate to recover
or degrade (a documented error response, a cached or default fallback)
rather than propagate an unhandled fault to the caller. Failing to
anticipate an error condition in code is a defect, not an edge case.

**Definition of Done**: At least one test exercises each documented
failure path end-to-end, and any retry/backoff or DR procedure the
system depends on has been exercised at least once outside of a real
incident.

**Rationale**: Failures are inevitable — an untested recovery strategy
turns a routine outage into an extended incident.

#### V. Manageable

Administrative and operational controls MUST be simple and safe to use
without subject-matter expertise. Every operational control MUST have a
runbook published to Confluence and kept in sync with the system —
discoverable by an on-call engineer without a repo search or tribal
knowledge.

**Definition of Done**: A current runbook exists on Confluence for every
operational control, locatable and executable by an on-call engineer
with no tribal knowledge, without escalating.

**Rationale**: A system only a small number of specialists can operate
safely is a single point of failure in its own right.

#### VI. Monitored

Every module that crosses a process or trust boundary MUST emit the
following four signals at its public interfaces:

- **Latency** — time to service a request, measured separately for
  success and failure so a fast error doesn't mask a slow success.
- **Traffic** — demand expressed in domain terms: requests per second,
  messages consumed/produced per second, or data throughput.
- **Errors** — the rate of failing requests, including **explicit**
  (5xx, exceptions), **implicit** (200 with incorrect content), and
  **policy** (slower than its SLO) failures.
- **Saturation** — utilization of constrained resources (memory, CPU,
  I/O, connection pools, queue depth) as a leading indicator of
  degradation.

Logging MUST be structured (key-value or JSON, never freeform strings),
and tracing context MUST propagate across service boundaries. No service
ships without dashboards and alerts covering all four signals.

**Definition of Done**: Every public interface ships with dashboards and
alerts covering all four signals before merge, and its logs are
structured and traceable across service boundaries.

**Rationale**: You cannot fix what you cannot see — tail latencies, error
spikes, and saturation events are invisible without instrumentation from
day one.

<!-- Customize: Specify the metrics backend, log schema, and alert routing. -->

#### VII. Deployable

Every system MUST have a simple, repeatable deployment method with
post-deployment verification. Deployments MUST be automated end-to-end
and reversible — a rollback path that has been exercised before the
system is production-ready.

**Definition of Done**: Deployment is scripted end-to-end, post-deployment
verification runs automatically, and the rollback path has been exercised
at least once before production.

**Rationale**: Manual or unverified deployment is a leading cause of
production incidents and makes "when did this change" unanswerable during
an investigation.

#### VIII. Compliant

All applications and systems MUST comply with industry regulations and
requirements applicable to their domain. **If** the system handles PII or
other account-critical data (e.g., balances, ownership, identity/
authentication details — in a CRM, contact info or account status), any
change to that data MUST produce an audit-log entry recording **who**
made the change, **what** changed, and **when** — enough for a regulator,
auditor, or investigator to reconstruct the change after the fact without
guessing. Systems that hold no such data are not subject to this specific
audit-log requirement.

<!-- AO-MANDATORY: data-protection -->
**Data protection**: Data MUST be protected at rest (strong encryption,
secure key management, salted password hashing) and in transit (HTTPS,
strong TLS). Data classification requirements MUST be followed, and
logging/error-handling practices MUST prevent sensitive data exposure.
<!-- END AO-MANDATORY: data-protection -->

**Definition of Done**: Data classification is documented, encryption at
rest and in transit is verified, and — if the system handles PII or
account-critical data — every change to it produces an audit-log entry
naming who changed it, what changed, and when.

**Rationale**: An undocumented change to sensitive data leaves no way to
answer "who changed this and when" during an incident or regulatory
inquiry — a scoped audit trail turns that into a lookup, not a guess.

<!-- Customize: Add domain-specific compliance regimes (financial services, data residency). -->

#### IX. Reproducible

Any released version, including all its artifacts, MUST be recreatable
from source control. Reusable components and APIs MUST use semantic
versioning (MAJOR.MINOR.PATCH); breaking changes require a MAJOR bump.
Dependencies MUST resolve through official registries (e.g., NuGet.org,
Azure DevOps Artifacts) via the org's centralized package-management
system, never an ad-hoc source.

**Definition of Done**: The release rebuilds from a tagged commit alone,
every public API carries a version, any breaking change bumped MAJOR,
and every dependency resolves through an official, centrally-managed
registry.

**Rationale**: Clear versioning and reproducible builds enable safe
component reuse and answer "what exactly is running in production" with
certainty.

#### X. Testable

Every class MUST be unit-testable with test doubles for its dependencies:
collaborators arrive via constructor injection (or equivalent), with
narrow, well-defined public APIs. Systems MUST support automated testing
at every level — unit, integration, subsystem, system — in CI/CD
pipelines.

**Definition of Done**: Every new class is unit-testable with test doubles
alone, and unit and integration tests run automatically in CI.

**Rationale**: A class or system that resists testing hides regressions
until production — designing for testability from the start is far
cheaper than retrofitting it.

<!-- Customize: Document project-specific DI conventions and test-double patterns. -->

#### XI. Documented

Documentation MUST stay in sync with the code it describes — update
relevant docs in the same PR. Keep docs **minimal**: document the *why*,
not the *what* (the code is the what), optimized for a new engineer's
onboarding — a short README, a brief architecture sketch, and the bare
minimum to run and debug locally.

Every project MUST maintain an **External Interactions Register**
(`docs/external-interactions.md` or equivalent) listing every outside
touchpoint — APIs, queues, databases, filesystems, third-party SDKs —
each entry naming its contract, failure mode, and timeout/retry policy.
Adding or modifying a touchpoint MUST update the register in the same PR
and be flagged for additional integration tests in `tasks.md`.

**Definition of Done**: Docs changed in the same PR as the code they
describe, and the External Interactions Register reflects every
touchpoint added, removed, or changed.

**Rationale**: Stale docs mislead worse than no docs at all; the register
gives reviewers and on-call the one place where most production surprises
live.

### B. Engineering Practice Principles

The four principles below are craft guidance, not named AO pillars —
still expected, but a team may deviate with justification recorded in the
plan's Complexity Tracking table.

#### XII. Simplicity First

Prefer the straightforward solution over the elegant one, and ship a
simple thing that works over a perfect thing that doesn't. Do NOT
anticipate future requirements — solve the problem at hand. No
speculative abstractions, no premature generalization, no features
beyond the current epic. Complexity MUST be justified in the plan's
Complexity Tracking table. YAGNI applies to all layers. Do not chase
edge cases the spec did not call out, micro-optimize before profiling,
or generalize for a hypothetical second user. This principle does NOT
lower the bar on this constitution's non-negotiables — it rejects
gold-plating and speculative complexity, not the gates that keep the
system safe.

**Definition of Done**: No abstraction in the diff has a single
implementation or caller without a recorded justification in the
Complexity Tracking table, and every acceptance scenario in `spec.md`
is met with no unrequested case solved along the way.

**Rationale**: Simple code ships faster, breaks less, and is understood
by the next engineer who reads it — and most "perfect" work is wasted
on dimensions the user never sees; iteration on real feedback beats
imagined refinement.

<!-- Customize: Adjust the abstraction stance for platform libraries if needed; add exceptions where "perfect" matters first try (settlement, filings, safety-critical paths). -->

#### XIII. Lean Footprint

Minimize external dependencies. Every dependency MUST justify its
inclusion in the PR description and pass CVE scanning — if the standard
library or a few lines of code suffice, do not add a package. No dead
code, unused exports, or redundant abstractions. Keep the binary size
small. This principle governs dependency *count and necessity*;
Reproducible (Principle IX) governs how the dependencies that remain are
*versioned*.

**Definition of Done**: Every new dependency is justified in the PR
description and passes CVE scanning, and no dead code or unused exports
remain in the diff.

**Rationale**: Each dependency is a liability — version conflicts,
security patches, license risk, build cost — and a lean codebase has
fewer failure modes.

<!-- Customize: Set a hard dependency-count cap if desired, e.g. "Max 5 per service." -->

#### XIV. Maintainability

Code MUST be understandable by a new engineer with no prior context.
Favor explicit over implicit. Name things clearly. At the end of each
implementation phase, review for duplicate code and consolidate — three
similar lines are acceptable, three similar blocks are not.

All code MUST adhere to SOLID principles: **S**ingle Responsibility,
**O**pen/Closed, **L**iskov Substitution, **I**nterface Segregation,
**D**ependency Inversion. Decouple at the **class level** (Composable,
Principle II, covers module/component-level decoupling) — not by
splitting code into new libraries or packages; do NOT create new
utility/helper/"shared" modules just to satisfy decoupling. If a class is
hard to test, fix the class: shrink its surface, inject its collaborators,
separate side effects from pure logic. Reach for a new package only when
there is a **second genuine consumer** or a **real deployment boundary**
— never as a preemptive move. In a multi-repo workspace, premature
extraction trades in-process coupling for cross-repo version-skew
coupling.

For C# projects, code MUST follow Microsoft C# Coding Conventions.

**Definition of Done**: A new engineer can explain the change's purpose
from names and structure alone, and no new shared/utility module was
created without a second genuine consumer.

**Rationale**: The codebase must survive team turnover; most "this needs
to be a lib" intuitions are really "this class is doing too much" — fix
that instead.

<!-- Customize: Add naming/style-guide references and test-double idioms per language. -->
<!-- Customize: If a shared-library boundary is genuinely needed, spell out the extraction triggers explicitly. -->

## Development Standards

### Repository Structure

All repositories MUST follow a common layout — README, CONTRIBUTING
guidelines, a scripts folder for automation, a docs folder for technical
specs, and clear source-code organization — for consistency across teams.

### Git Workflow

All repositories MUST follow these non-negotiable requirements:
- `main`/`master` is always production-ready — no direct commits.
- All changes via pull requests with required review and passing CI
  before merge.
- Squash commits on merge to maintain a linear history.
- Releases marked with semantic version tags (`vMAJOR.MINOR.PATCH`) — no
  release branches.
- Hotfixes branch from the production tag, not from `main`/`master`.

<!-- Customize: Add your org's approved hosting requirement and branching-strategy doc link. -->

### Authentication and Authorization

Strong authentication MUST be implemented — password policies, account
lockout, secure credential storage, and MFA where appropriate.
Authorization MUST follow least privilege.

### Error Handling and Logging

Applications MUST show generic user-facing error messages while logging
details for support. Security events, privilege changes, and
sensitive-data access MUST be logged, stored securely, and retained per
policy.

<!-- AO-MANDATORY: quality-gates -->
## Quality Gates

- All PRs MUST pass automated tests before merge.
- **Test coverage MUST be ≥90% line coverage** across unit and
  integration tests combined; integration tests MUST exercise every entry
  in the External Interactions Register (Principle XI).
- Every public interface MUST emit all four observability signals defined
  in Principle VI (Monitored) and ship with a dashboard and alerts before
  merge.
- Logs MUST be structured; secrets and PII MUST NOT appear in any log,
  metric, trace, or error message.
- A security scan (Principle I) MUST run on every change and pass before
  merge — a PR MUST NOT be approved while the required check is failing.
- Cloud deployments MUST enforce automated guardrails for continuous
  security compliance; non-compliant resources MUST be auto-remediated
  or flagged immediately.
- The External Interactions Register MUST be updated in the same PR
  whenever an external touchpoint is added, removed, or changed.
- New dependencies MUST be justified in the PR description AND pass CVE
  scanning.
- End-of-phase duplicate-code review MUST be performed before moving to
  the next phase.
- Binary size MUST NOT grow without justification.
- Code reviews MUST verify compliance with this constitution's principles.

<!-- Customize: Add gates above the floor — extra coverage, performance benchmarks, accessibility audits. -->
<!-- END AO-MANDATORY: quality-gates -->

## Development Workflow

- Feature branches MUST follow the naming convention `###-feature-name`
  (e.g., `001-canonical-schema-foundation`).
- Each user story MUST be deliverable as an independent MVP increment.
- Implementation follows the phased approach: Setup → Foundation → User
  Stories (by priority) → Polish.
- Perform a deduplication pass before marking the feature complete.
- Commit after each task or logical group; do not batch unrelated
  changes.

<!-- Customize: Add CI/CD pipeline references or env-specific workflow rules. -->

## Governance

This constitution is the project's highest-authority document; all
practices, reviews, and architectural decisions MUST comply with it.

**Amendment procedure**: Amendments require (1) a written proposal
documenting the change and rationale, (2) review by the PM and technical
lead, and (3) an updated constitution version with a Sync Impact Report.

**Versioning policy**: The constitution follows semantic versioning.
MAJOR for principle removals or redefinitions, MINOR for new principles or
materially expanded guidance, PATCH for clarifications and wording fixes.

**Compliance review**: Every PR review MUST include a constitution
compliance check. Violations MUST be resolved before merge or explicitly
justified in the plan's Complexity Tracking table.

**Version**: 2.0.0 | **Ratified**: [RATIFICATION_DATE] | **Last Amended**: [LAST_AMENDED_DATE]
<!-- Replace dates when ratifying for your project -->
