import { describe, expect, it } from 'vitest';
import { reconcileBlocked } from '../../src/domain/blocked-divergence.js';

/**
 * TEST-412 (BH-412), TEST-414 (BH-414).
 *
 * Who wins when the board and Jira disagree about a card being stuck.
 *
 * Deliberately NOT the conflict model. A status conflict freezes the card and
 * demands a decision, because either side's change may be a deliberate act
 * whose loss is unrecoverable. Blocked is different: the local value simply
 * wins, always, and the disagreement is shown rather than adjudicated. Nothing
 * is lost by being wrong here — the user changes the flag and moves on.
 */
describe('reconciling the board’s blocked flag with Jira’s', () => {
  it('adopts Jira’s state on first sight, when the board has no opinion', () => {
    const result = reconcileBlocked({
      local: false,
      lastSeenInJira: null,
      nowInJira: true,
    });
    expect(result.blocked).toBe(true);
    expect(result.diverges).toBe(false);
  });

  it('adopts Jira’s clearing on first sight too', () => {
    const result = reconcileBlocked({
      local: false,
      lastSeenInJira: null,
      nowInJira: false,
    });
    expect(result.blocked).toBe(false);
    expect(result.diverges).toBe(false);
  });

  it('keeps a locally cleared flag when Jira still says blocked', () => {
    // The user has looked and decided. A sync that silently re-blocked the card
    // would be overruling that decision every five minutes.
    const result = reconcileBlocked({
      local: false,
      lastSeenInJira: true,
      nowInJira: true,
    });
    expect(result.blocked).toBe(false);
    expect(result.diverges).toBe(true);
  });

  it('keeps a locally set flag when Jira says nothing is wrong', () => {
    const result = reconcileBlocked({
      local: true,
      lastSeenInJira: false,
      nowInJira: false,
    });
    expect(result.blocked).toBe(true);
    expect(result.diverges).toBe(true);
  });

  it('stops reporting a divergence once Jira agrees', () => {
    // FR-420. The marker must not outlive the disagreement it describes.
    const result = reconcileBlocked({
      local: true,
      lastSeenInJira: false,
      nowInJira: true,
    });
    expect(result.blocked).toBe(true);
    expect(result.diverges).toBe(false);
  });

  it('stops reporting a divergence when Jira clears and the board agrees', () => {
    const result = reconcileBlocked({
      local: false,
      lastSeenInJira: true,
      nowInJira: false,
    });
    expect(result.blocked).toBe(false);
    expect(result.diverges).toBe(false);
  });

  it('adopts a change Jira makes while the board has no opinion of its own', () => {
    // Board never touched it; Jira flipped. Nothing to defend, so follow.
    const result = reconcileBlocked({
      local: true,
      lastSeenInJira: true,
      nowInJira: false,
    });
    expect(result.blocked).toBe(false);
    expect(result.diverges).toBe(false);
  });

  it('always records what Jira currently says, whoever wins', () => {
    // Without this the next sync cannot tell a local override from a fresh
    // Jira change, which is the whole basis of the comparison.
    expect(
      reconcileBlocked({ local: false, lastSeenInJira: true, nowInJira: true })
        .lastSeenInJira,
    ).toBe(true);
    expect(
      reconcileBlocked({ local: true, lastSeenInJira: false, nowInJira: false })
        .lastSeenInJira,
    ).toBe(false);
  });
});
