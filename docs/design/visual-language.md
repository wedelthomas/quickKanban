# Visual Language

**References**, both observed 2026-08-26 and both liked by the user:

1. **Internal AI Portal** (internal URL), Skills & Plugins
   page — palette, component treatment, header navigation.
2. **ABS Team Reports** dashboard (`localhost:8080`), Compare All view —
   density, left sidebar, statistic strip, table treatment.

Neither screenshot could be preserved: macOS deletes the screenshot temporary
file as soon as its capture window closes, so this document records the
observed design decisions rather than the images.

**Status**: Design input for `plan.md`. The feature specification stays
technology-agnostic; this is where the visual decisions live.

---

## Overall character

Dark-first, calm, information-dense. Content sits centred in a column of about
1200px on a near-black canvas. Panels are quiet — a slightly lighter surface
with a hairline border rather than shadows. Colour is used sparingly and
therefore carries meaning: one saturated indigo for anything actionable, one
coral for anything destructive, everything else in greys.

## Palette

| Role | Value | Use |
|---|---|---|
| Canvas | `#0B0E14` | Page background |
| Surface | `#161B26` | Panels, cards, inputs |
| Surface raised | `#1B2130` | Input fills, hover states |
| Border | `#252B3A` | Hairline panel and input borders |
| Text primary | `#E6E9EF` | Titles, card titles, body |
| Text muted | `#8B93A7` | Metadata, helper text, inactive nav |
| Accent | `#3B5BFD` | Primary buttons, active nav underline, focus rings, links |
| Accent gradient | `#4B4EF0` → `#7B3FE4` | Hero banner only |
| Destructive | `#E04B4B` | Sign-out, delete, overdue |

Colour carries meaning, so it stays rationed: an interface where six things are
blue teaches the user that blue means nothing.

## Structure

- **Header bar** — wordmark on the left, horizontal navigation of icon + label
  pairs in the centre, controls on the right. The active nav item is brighter
  and carries a 2px accent underline.
- **Theme control** — a tri-state segmented control (light / system / dark) in
  the header.
- **Page heading** — large bold title (~34px) with a muted one-line
  description beneath, and a secondary action button aligned right.
- **Panels** — 10px corner radius, hairline border, generous internal padding.
- **Inputs** — dark filled, hairline border, 8px radius, leading icon for
  search. Labels sit above the control in muted text.
- **Badges** — small outlined pills in muted text for classification.
- **Metadata rows** — tiny icon plus muted text, set well below body size.

## Applying it to the Kanban board

| Portal element | Board equivalent |
|---|---|
| Header nav | Board · Archive · Summary · Settings, icon + label, accent underline on active |
| Page heading + Refresh button | Board title with the sync status pill alongside (Slice 2) |
| Panel | A column: header with column name and card count, cards stacked beneath |
| List item card | A work card: title in primary text, metadata row beneath |
| Outlined badge | Tags, and the Jira issue key on Jira-sourced cards (Slice 2) |
| Accent | Focus ring, active drop target, primary button |
| Destructive coral | Overdue due dates, delete confirmation |

**Priority** reads as a small coloured dot or a left edge on the card, not a
word — it must survive being scanned rather than read.

**Source** (local vs Jira-sourced, BR-05/FR-011) reads as the presence or
absence of an issue-key badge, which is legible at a glance without adding a
second colour dimension competing with priority.

**Focus** (FR-023) uses the accent ring. Because the board is keyboard-driven,
the focus ring is a primary interface element here, not an accessibility
afterthought — it must be clearly visible against the card surface.

## Density

The reference is generous with whitespace because it lists a handful of items.
The board must show around 50 cards at once (NFR-14, SC-006), so vertical
rhythm tightens: card padding roughly halves, and the metadata row sits on a
single line. The palette, border treatment and radius carry the family
resemblance; the spacing scale does not.

---

## What the reports dashboard adds

The second reference is denser and more data-forward, and contributes four
things the portal does not.

**Left sidebar navigation.** A fixed rail carrying the product name and a
subtitle, then grouped navigation under tiny uppercase section labels. Each
entry pairs an initial-chip with a count badge, and the active entry is marked
by a lighter fill rather than an underline.

**A statistic strip.** A horizontal band of figures above the main content —
large numeral, tiny uppercase caption beneath, thin vertical rules between
cells. Numbers carry semantic colour: green for gain, coral for loss. For the
board this becomes counts per column, cards overdue, and cards moved this week.

**Magnitude built into the number.** Table figures sit above a short coloured
underline whose length encodes the value relative to its column, so the shape
of the data is readable without a separate chart. This belongs in Slice 4's
summary, not on the board.

**Per-entity accent colours.** Each person carries a consistent colour across
their chip and their bars. The board's equivalent is tags, which is the only
dimension with enough cardinality to justify colour identity.

## Reconciling the two references

They disagree about navigation, and the disagreement matters.

The portal uses a top bar; the dashboard uses a 250px left sidebar. **A
sidebar costs the board horizontal space it cannot spare**: six columns at a
readable ~280px need roughly 1680px, which already exceeds a 1440px display.
Surrendering 250px of that to navigation makes the board scroll horizontally
before a single card is added.

Original resolution: **top navigation on the board view**, taking the portal's
header treatment, and the dashboard's sidebar pattern for the Archive and
Summary views in Slice 4, where vertical lists benefit from it and horizontal
space is not contested. The statistic strip sits directly beneath the board
header, where it costs vertical space only.

### Revised again, 2026-08-27 — the rail becomes the app's navigation

The top bar is gone. The left rail now carries what it carried in the ABS Team
Reports reference: a brand block at the top (rounded chip, mark, product name,
a one-line subtitle), then tiny uppercase section labels over rows that hold a
count on the right, with the active row marked by a left accent bar.

Taken from the reference deliberately:

- **Brand block, not a header.** The wordmark and its subtitle sit in the rail's
  top-left, the way the dashboard does it, so the content area opens straight
  onto its own title.
- **Uppercase section labels** at 10px, letter-spaced — `VIEWS`, `FILTER`.
- **Rows with counts.** Board carries the card count; Conflicts appears only
  when there is one to decide, and carries its count in the warning colour.
- **The left accent bar is always present**, transparent when inactive, so
  switching rows never shifts their text sideways.

The mark is inline SVG — three columns with the middle one taller — rather than
an image file, so it inherits the theme's colours and costs no request.

Views moved into the rail and left the toolbar, rather than being offered in
both. The toolbar now holds actions only: sync status, Settings, New card.

### Revised 2026-08-27 — a collapsible left rail on the board

The board view now does carry a left rail, holding the filter controls, at the
user's request. The objection above still stands and is answered rather than
overruled:

- **It collapses.** Shut, it is 40px; open, 210px rather than the reference
  dashboard's 250px. The board reclaims the width the moment it is closed, so
  the horizontal-scroll failure only applies while the user is actively
  filtering — which is when they have chosen to trade board width for controls.
- **The collapsed state is remembered**, so a user who works with it shut never
  pays the cost. Only the state, not the filter: which cards are hidden must
  not survive a reload (FR-310), while how wide a panel is may.
- **`/` opens it and focuses the text field**, so the shortcut works whether the
  rail is open or shut rather than silently doing nothing to an unmounted input.
- **A dot on the toggle shows a filter is active while collapsed.** Without it,
  a shut rail could hide cards with no visible cause — precisely the ambiguity
  SC-309 exists to prevent.

Top navigation is unchanged: the header still carries the wordmark and the view
links. The rail is a filter panel, not a second navigation.

### Column accents, 2026-08-27

One hue per column — a rule across the top, the column title, and a tinted
count: Backlog grey, In Progress amber, Blocked red, Test blue, PO Review teal,
Done green.

Applied from each column's own `data-column-key`, so adding a colour needs no
markup change, and the count's tint is mixed from the accent rather than
hand-picked, so the six cannot drift apart.

**Cards stay neutral.** Six columns of coloured cards read as a swatch, and the
card face already spends its colour budget on priority and on the conflict
badge — the two things that have to stand out against everything around them.

## Theme decision

**Dark only.** Decided 2026-08-26.

Both references are dark, and the board runs on the user's own machine all
day. The portal's light/system/dark control is deliberately not adopted: a
light palette roughly doubles the palette work and means every visual check
happens twice, on every slice, for a theme the sole user has not asked for.

Should that change, the palette above is the single place to revisit.
