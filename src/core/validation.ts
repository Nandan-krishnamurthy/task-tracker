/**
 * Title validation (plan T-102).
 *
 * Pure. No DOM, no storage, no imports from sibling layers (ADR-0001).
 *
 * ONE function serves BOTH the create path and the edit path. That is not an
 * economy — it is what makes AC-005.6 hold by construction. FR-009 is worded
 * against creation only, but a task that reached an empty title through the
 * edit form would violate FR-001's "required title" just as surely. With a
 * single route there is no second route to forget.
 */

/** The message shown when a title is empty or whitespace-only (AC-009.2). */
export const EMPTY_TITLE_MESSAGE = 'Enter a title for the task.';

/**
 * The outcome of validating a title.
 *
 * A discriminated union rather than a nullable string, so a caller cannot read
 * `value` without first checking `ok` — the compiler enforces that a rejected
 * title is never written to a task.
 */
export type TitleValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/**
 * Validate a title, returning the value to store on success.
 *
 * Trims leading and trailing whitespace and rejects what remains if it is
 * empty. On success, `value` is the TRIMMED string — that is what gets stored.
 *
 * Trimming does not conflict with AC-001.4, which requires the title be stored
 * and displayed "exactly as entered, with no truncation or alteration of its
 * visible content": leading and trailing whitespace has no visible content.
 * Interior spacing is left completely untouched, so "Call  the   dentist"
 * survives verbatim.
 *
 * Whitespace-only input is rejected (AC-009.4, resolving OQ-06). `String.trim`
 * treats every Unicode whitespace character as whitespace, so a title of
 * non-breaking spaces is rejected too — it would otherwise render as a blank
 * row the user cannot identify.
 *
 * Nothing else is validated. There is no maximum length, no character
 * restriction, and no date or priority rule here: architecture §6.2 records
 * that each would be product behavior the PRD does not specify.
 */
export function validateTitle(raw: string): TitleValidation {
  const value = raw.trim();

  if (value.length === 0) {
    return { ok: false, message: EMPTY_TITLE_MESSAGE };
  }

  return { ok: true, value };
}
