# SDD feedback — plan — 005-iteration-and-board-restructure: reading the schema caught a constraint the spec could not see

**Phase:** plan
**Branch:** 005-iteration-and-board-restructure
**Agent:** claude-opus-5[1m]
**When:** 2026-08-27T04:27:53Z

## What worked

- Reading the existing schema before designing. `card_events` carries foreign
  keys into every column a card has ever occupied, which makes deleting the
  Blocked column impossible without breaking the append-only history the
  product's reporting rests on. Nothing in the spec hinted at it; only opening
  `004_card_events.sql` surfaced it. Same pattern that made probing live Jira
  pay off during specify.
- The Architecture Review table. Twenty-two rows forced consideration of
  dimensions the spec never raised — the asymmetry of rolling back an image
  without rolling back moved data, reusing the existing sync lock so resolution
  cannot overlap a poll, and persisting provenance rather than only logging it.

## What was friction

Nothing reported.

## What was wrong

Nothing reported.

## Phase-specific

**Any tech-stack decision you already regret?** No — the decisions hold. Each
of the three consequential ones follows from a constraint rather than a
preference: retiring the column follows from the foreign keys, the separate
iteration port follows from its failures being silent by design where every
existing port failure must be loud, and counting carry-over at the boundary
follows from the requirement that nothing delay board load.

## Telemetry

- phase: plan
- branch: 005-iteration-and-board-restructure
- agent_model: claude-opus-5[1m]
- timestamp: 2026-08-27T04:27:53Z
- complexity_tracking_entries: 3
- test_strategy_present: true
- dependency_manifest_present: false
- manifest_codebases: 0
- manifest_boundaries: 0
- manifest_stale_contracts: 0
- manifest_freshness_checked: false
