import { describe, expect, it } from 'vitest';
import { createCardSchema } from '../../src/domain/validation.js';

/** Covers BH-003 (blank title refused) and BH-004 (priority defaulting). */
describe('createCardSchema', () => {
  it('accepts a card with only a title', () => {
    const result = createCardSchema.safeParse({ title: 'Rotate staging certificates' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty title (BH-003)', () => {
    expect(createCardSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only title (BH-003)', () => {
    expect(createCardSchema.safeParse({ title: '   \t  ' }).success).toBe(false);
  });

  it('trims surrounding whitespace from an otherwise valid title', () => {
    const result = createCardSchema.parse({ title: '  Renew certs  ' });
    expect(result.title).toBe('Renew certs');
  });

  it('defaults priority to medium when omitted (BH-004)', () => {
    expect(createCardSchema.parse({ title: 'A' }).priority).toBe('medium');
  });

  it('keeps an explicit priority', () => {
    expect(createCardSchema.parse({ title: 'A', priority: 'high' }).priority).toBe(
      'high',
    );
  });

  it('rejects a priority outside the fixed set', () => {
    expect(createCardSchema.safeParse({ title: 'A', priority: 'urgent' }).success).toBe(
      false,
    );
  });

  it('accepts a calendar due date', () => {
    expect(createCardSchema.parse({ title: 'A', dueDate: '2026-09-02' }).dueDate).toBe(
      '2026-09-02',
    );
  });

  it('rejects a due date carrying a time component', () => {
    // FR-007 makes due dates calendar dates. Accepting a timestamp here would
    // reintroduce the timezone ambiguity the decision exists to avoid.
    expect(
      createCardSchema.safeParse({ title: 'A', dueDate: '2026-09-02T10:00:00Z' }).success,
    ).toBe(false);
  });

  it('accepts an absent due date', () => {
    expect(createCardSchema.parse({ title: 'A' }).dueDate).toBeNull();
  });

  it('accepts a card with no tags', () => {
    expect(createCardSchema.parse({ title: 'A' }).tags).toEqual([]);
  });

  it('preserves a long title rather than truncating it in storage', () => {
    const long = 'x'.repeat(500);
    expect(createCardSchema.parse({ title: long }).title).toHaveLength(500);
  });
});
