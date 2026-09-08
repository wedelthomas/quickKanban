import { z } from 'zod';
import { normalizeTags } from './tags.js';

/**
 * One set of schemas, used by the route boundary and the web form both, so the
 * two cannot drift into disagreeing about what a valid card is.
 */

const PRIORITIES = ['high', 'medium', 'low'] as const;

/** Calendar date, no time component — FR-007. */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be a calendar date, as YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Due date is not a real date');

/**
 * Trimmed before the emptiness check, so "   " fails for the same reason ""
 * does rather than sneaking through as three characters (FR-004).
 */
const title = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, 'A card must have a title that is not only whitespace.'));

export const createCardSchema = z.object({
  title,
  description: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  priority: z.enum(PRIORITIES).default('medium'),
  dueDate: calendarDate.nullish().transform((value) => value ?? null),
  tags: z.array(z.string()).default([]).transform(normalizeTags),
});

/** Every field optional, but each validated identically to creation. */
export const updateCardSchema = z
  .object({
    title: title.optional(),
    description: z
      .string()
      .nullish()
      .transform((value) => value ?? null)
      .optional(),
    priority: z.enum(PRIORITIES).optional(),
    dueDate: calendarDate
      .nullish()
      .transform((value) => value ?? null)
      .optional(),
    tags: z.array(z.string()).transform(normalizeTags).optional(),
    // Settable on any card, local or Jira-sourced (FR-412). Unlike `title`,
    // this is not a field Jira owns — the board keeps its own opinion and never
    // writes it back (FR-417).
    blocked: z.boolean().optional(),
    // Settable on any card, local or Jira-sourced (FR-516). Null and 0 are
    // both valid and distinct — null means unpointed, 0 a deliberate
    // estimate (FR-519). Never written back to Jira (FR-517).
    points: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'An update must change at least one field.',
  );

export const moveCardSchema = z.object({
  // Deliberately NOT a literal range. This was `.max(6)` until slice 5, which
  // was correct only while the columns happened to be ids 1..6 — retiring
  // Blocked and adding Iteration Items as id 7 made every move into the new
  // column fail validation, with a message about the number 6 that told the
  // user nothing. Which columns exist is a fact about the database, so it is
  // checked there (COLUMN_RETIRED / COLUMN_NOT_FOUND) rather than guessed here.
  toColumnId: z.number().int().positive(),
  /** 1-based within the destination column, matching contracts/api.md. */
  toIndex: z.number().int().min(1),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type MoveCardInput = z.infer<typeof moveCardSchema>;
