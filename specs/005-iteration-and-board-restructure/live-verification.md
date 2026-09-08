# Live Verification — Slice 5

Run against `yourcompany.atlassian.net` on 2026-08-27, after the automated suites
were green.

This project has learned twice that a green suite is not the same as a working
system — slice 3's live check found an unrequested Jira write that every
automated test had missed. Slice 5 adds a brand-new outbound API surface and a
new field read, so the same discipline applies.

---

## 1. The iteration reads from the real board

```
GET /api/iteration
{
  "ordinalName": "Anchor Team 2026 S18",
  "startsOn": "2026-08-24",
  "endsOn": "2026-09-07",
  "provenance": "read",
  "workingDaysRemaining": 8
}
```

Matches what board 4200 reports. Displayed as **S18**.

## 2. The team filter genuinely discriminates

Board 4200 returned both active sprints, as it always does:

```
Anchor Team 2026 S18 | 2026-08-24 -> 2026-09-07
Signal 2026 S18              | 2026-08-24 -> 2026-09-07
```

Setting `iterationTeamName` to `Signal` switched the reported iteration to
`Signal 2026 S18`; restoring it switched back. **This is the check a fixture
cannot make**, because the fixture's two sprints are ones I wrote — here the
board really does serve two teams, and picking the wrong one would have been
invisible in every automated test.

## 3. Every degraded path, against the real adapter

| Condition | Result |
|---|---|
| Board reachable | `read`, Anchor Team 2026 S18 |
| Board id 999999 (does not exist) | `cached`, last read shown |
| Bad board **and** cache cleared | `estimated`, **no name**, 2026-08-24 → 2026-09-07 |
| Throughout all of the above | `GET /api/board` answered 200 in 7ms |

The estimated case carrying no ordinal is the important one: the number resets
at the fiscal year, so a computed one would be wrong every January, and an
absent name is the honest output.

## 4. A genuinely blocked Jira issue imports as blocked

The user's own twelve issues carry no blocked flag, so this was verified
against a real blocked issue elsewhere in the instance by pointing the query at
it briefly and restoring afterwards.

```
WT-8383 | blocked: true | divergesFromJira: false
jira_links.blocked_in_jira = true
```

That exercises the whole chain on real data: a **multi-checkbox** field
carrying `['Blocked']` — not a boolean, which is what the first implementation
would have assumed — through the adapter's parse, the three-way reconcile, the
database, and out to the board payload.

Restored afterwards: query back to `assignee = currentUser() AND statusCategory
!= Done`, board back to its 12 cards.

## 5. The board layout, measured rather than eyeballed

The settings dialog was rendering **two** columns while the stylesheet said
three. Two causes, both invisible to every test and to reading the CSS:

- `.dialog--wide` already existed at 760px, worn by three other dialogs. The
  later rule won.
- The backdrop used `display: grid; place-items: center`, under which the
  column track sizes to its content, so `width: min(1180px, 100%)` resolved its
  percentage against the shrunken track and collapsed.

Measured after the fix: **1180px wide, three 374px columns, zero overflow.**

---

## What live verification found that the suite did not

Nothing wrong with the implementation, which is itself worth recording — but
four things were only ever *confirmed* here rather than in a test:

1. That board 4200 really does return two active sprints, so the team filter is
   load-bearing rather than defensive.
2. That the blocked field really is a multi-checkbox array on a real issue.
3. That the degraded paths behave the same against the real adapter as against
   the fake.
4. That the dialog's rendered width is what the stylesheet claims. It was not.

Separately, and not to the implementation's credit: running the browser suite
**destroyed the developer's real board** partway through this slice, because
`tests/e2e/reset.ts` truncated `POSTGRES_DB`. Twelve Jira cards returned on the
next sync; one local card did not, and is not recoverable. That is now guarded
three ways and recorded in the README.
