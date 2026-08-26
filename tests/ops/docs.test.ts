import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * TEST-026 (BH-026). FR-038 exists because of risk R-7: someone troubleshooting
 * reaches for `docker volume rm` and takes the only copy of their ad-hoc cards
 * with it. A README that does not name the volume does not prevent that.
 */
describe('operating documentation', () => {
  const readme = (): string => readFileSync('README.md', 'utf8');

  it('explains how to start the system', () => {
    expect(readme()).toMatch(/docker compose up/i);
  });

  it('explains how to stop the system', () => {
    expect(readme()).toMatch(/docker compose down/i);
  });

  it('explains how to reset the system', () => {
    expect(readme()).toMatch(/docker volume rm/i);
  });

  it('names the volume whose deletion loses every ad-hoc card', () => {
    expect(readme()).toMatch(/kanban_data/);
  });

  it('warns that the reset is destructive rather than only describing it', () => {
    expect(readme()).toMatch(/lose|lost|deletes every|irrecoverab|nowhere else/i);
  });
});
