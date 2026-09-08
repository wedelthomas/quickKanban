import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * BH-533, FR-544: elapsed-time.ts's derivation is pure — no I/O, no clock
 * read internally — exercised with no external dependency.
 *
 * Proved structurally: a bare `new Date()` (the system clock) or any I/O
 * call would be a regression no permutation test could catch, since a test
 * supplies its own `now` regardless of what the function does internally.
 */
describe('elapsed-time.ts stays pure', () => {
  const source = readFileSync('src/domain/elapsed-time.ts', 'utf8');

  it('never reads the system clock directly', () => {
    expect(source).not.toMatch(/new Date\(\s*\)/);
  });

  it('performs no I/O', () => {
    expect(source).not.toMatch(/\bfetch\(|\brequire\(['"]fs|from ['"]node:fs|\bMath\.random\(/);
  });
});
