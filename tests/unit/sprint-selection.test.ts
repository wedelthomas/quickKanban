import { describe, expect, it } from 'vitest';
import { selectSprint, type Sprint } from '../../src/domain/sprint-selection.js';

/**
 * TEST-417 (BH-417), TEST-418 (BH-418), TEST-430 (BH-430).
 *
 * Every case here is drawn from board 1391 as it actually is, not from a
 * hypothetical. Two teams share it and it carries two active sprints per
 * iteration with identical dates and ordinals — true throughout its 730-sprint
 * history — so "pick the active sprint" is not a well-defined instruction.
 */
const sprint = (over: Partial<Sprint> = {}): Sprint => ({
  id: 24501,
  name: 'CRM TradeBlazers 2026 S18',
  startsOn: '2026-08-24',
  endsOn: '2026-09-07',
  ...over,
});

const TEAM = 'CRM TradeBlazers';

describe('choosing the iteration from a board that serves two teams', () => {
  it('takes the configured team and ignores the other', () => {
    const mine = sprint();
    const theirs = sprint({ id: 24502, name: 'MDS 2026 S18' });

    expect(selectSprint([mine, theirs], TEAM)?.name).toBe('CRM TradeBlazers 2026 S18');
    expect(selectSprint([theirs, mine], TEAM)?.name).toBe('CRM TradeBlazers 2026 S18');
  });

  it('is deterministic when the team somehow has two active sprints', () => {
    // Lowest id wins, so the answer cannot depend on response ordering.
    const later = sprint({ id: 24999 });
    const earlier = sprint({ id: 24501 });

    expect(selectSprint([later, earlier], TEAM)?.id).toBe(24501);
    expect(selectSprint([earlier, later], TEAM)?.id).toBe(24501);
  });

  it('yields nothing when only another team is active', () => {
    expect(selectSprint([sprint({ name: 'MDS 2026 S18' })], TEAM)).toBeNull();
  });

  it('yields nothing for an undated sprint', () => {
    // Real: board 1391's future sprints are named but undated, so a sprint
    // without dates is an ordinary occurrence rather than a malformed response.
    expect(selectSprint([sprint({ startsOn: null })], TEAM)).toBeNull();
    expect(selectSprint([sprint({ endsOn: null })], TEAM)).toBeNull();
  });

  it('yields nothing when the board reports no active sprint at all', () => {
    // Also real: board 5600 has zero sprints of any state.
    expect(selectSprint([], TEAM)).toBeNull();
  });

  it('reports the ordinal as given, even when it goes backwards', () => {
    // The sprint ordinal resets at the fiscal year — the PI calendar spans
    // "Sprint 20 - 1" and "Sprints 23 - 3". Anything that counted forward from
    // the last seen ordinal would be wrong every January.
    const january = sprint({ id: 25100, name: 'CRM TradeBlazers 2027 S1' });
    expect(selectSprint([january], TEAM)?.name).toBe('CRM TradeBlazers 2027 S1');
  });

  it('matches the team name at the start of the sprint name only', () => {
    // Guards against a team whose name appears mid-string in another team's
    // sprint, which a naive `includes` would match.
    const decoy = sprint({ id: 1, name: 'MDS and CRM TradeBlazers joint 2026 S18' });
    const real = sprint({ id: 2, name: 'CRM TradeBlazers 2026 S18' });
    expect(selectSprint([decoy, real], TEAM)?.id).toBe(2);
  });

  it('ignores surrounding whitespace and case in the configured team name', () => {
    expect(selectSprint([sprint()], '  crm tradeblazers ')?.id).toBe(24501);
  });
});
