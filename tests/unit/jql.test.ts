import { describe, expect, it } from 'vitest';
import { DEFAULT_JQL, validateJql } from '../../src/domain/jql.js';

describe('the default query', () => {
  it("selects the current user's issues", () => {
    expect(DEFAULT_JQL).toContain('assignee = currentUser()');
  });

  it('excludes finished work', () => {
    // statusCategory rather than a status name: status names vary per
    // workflow, the category does not.
    expect(DEFAULT_JQL).toContain('statusCategory != Done');
  });
});

describe('validateJql', () => {
  it('accepts an ordinary query', () => {
    expect(validateJql('assignee = currentUser()').ok).toBe(true);
  });

  it('rejects an empty query', () => {
    expect(validateJql('').ok).toBe(false);
  });

  it('rejects a whitespace-only query', () => {
    expect(validateJql('   ').ok).toBe(false);
  });

  it('rejects an absurdly long query rather than sending it', () => {
    expect(validateJql('a'.repeat(5000)).ok).toBe(false);
  });

  it('does not attempt to parse JQL', () => {
    // Jira validates JQL. Reimplementing that here would be a second, worse
    // parser that rejects queries Jira would have accepted.
    expect(validateJql('this is not valid JQL at all !!!').ok).toBe(true);
  });
});
