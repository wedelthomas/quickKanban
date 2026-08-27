# SDD feedback — specify — 005-iteration-and-board-restructure: live-Jira probing and inherited conventions carried the step

**Phase:** specify
**Branch:** 005-iteration-and-board-restructure
**Agent:** claude-opus-5[1m]
**When:** 2026-08-27T04:03:02Z

## What worked

- Probing the live Jira instance before designing. It surfaced the real custom
  field ids, the fiscal-year sprint-ordinal reset, the per-team iteration date
  drift, and the existence of the blocked field — none of which a fixture or a
  green test suite would have shown.
- Unbroken BRD → spec traceability: every FR traces to a BR in `docs/brd-2.md`,
  every behavior pathway cites its FRs, and every pathway pins to a test.
- Questions carrying rendered previews. Seeing mockups and report layouts side
  by side made the choices concrete instead of abstract.
- Reusing the conventions already established by slices 1–4 rather than
  inventing new ones.

## What was friction

- The spec's numbering conventions had to be reverse-engineered by reading the
  four prior specs. Nothing documents that slice N uses FR-N00, SC-N0x, BH-Nxx
  and TEST-Nxx — it is discoverable only by `grep`. A line in the template or
  the constitution would remove the archaeology for the next author.
- Otherwise the step ran about as smoothly as it should.

## What was wrong

Nothing identified.

## Phase-specific

**Was any user story hard to keep technology-agnostic?** No — the stories
stayed clean. The vocabulary they use (iteration, reference board, active
sprint, blocked) is the business's own language at TradeStation, so using it
reads as domain terminology rather than as implementation leaking in.

## Telemetry

- phase: specify
- branch: 005-iteration-and-board-restructure
- agent_model: claude-opus-5[1m]
- timestamp: 2026-08-27T04:03:02Z
- user_stories_count: 6
- priority_split: P1=2, P2=2, P3=2
- needs_clarification_count: 0
