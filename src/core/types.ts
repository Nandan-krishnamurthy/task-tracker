/**
 * Domain types (plan T-101).
 *
 * Pure declarations. This module imports nothing and has no side effects —
 * ADR-0001 places `core/` at the centre of the dependency graph, importing
 * from no other layer.
 *
 * The shapes here are transcribed from architecture §2.1 (Task) and §2.3
 * (AppState). The attribute list is CLOSED by constraint C-03:
 *
 *   "In-scope task attributes are limited to title, due date, priority, and
 *    complete/incomplete status (confirmed); notes/description are explicitly
 *    excluded."
 *
 * Adding a field here — `notes`, `tags`, `project`, `completedAt`, `order` —
 * is a PRD change, not an engineering one. NG-04 and NG-05 forbid the two most
 * tempting candidates outright.
 */

/**
 * The fixed three-level priority scale.
 *
 * Declared as a runtime tuple first so that the type and the list of
 * selectable values cannot drift apart. C-04 and the PRD decision "Priority
 * levels" fix this at exactly Low / Medium / High; AC-003.3 requires that no
 * fourth level is ever offered. Deriving `Priority` from this tuple means a
 * fourth level cannot be added to one without the other.
 */
export const PRIORITIES = ['low', 'medium', 'high'] as const;

/** Exactly one of Low, Medium, or High. Never a fourth value (C-04). */
export type Priority = (typeof PRIORITIES)[number];

/**
 * The two task views (FR-007).
 *
 * There is deliberately no third "all" value: OQ-05 was resolved in favour of
 * the literal reading of FR-007, which requires the two sets be viewable
 * separately and names no combined view (architecture §5.3).
 */
export const FILTERS = ['active', 'completed'] as const;

/** Which of the two views is currently shown. */
export type Filter = (typeof FILTERS)[number];

/**
 * A single task. Six fields, no more (architecture §2.1).
 *
 * `id` and `createdAt` are internal: they are never rendered, never editable,
 * and never filterable. §2 of `01-requirements.md` permits them — "internal
 * identifiers or timestamps needed to satisfy a requirement are an
 * implementation concern" — and each earns its place:
 *
 *   - `id` addresses a task for edit, toggle, and delete. Titles cannot serve,
 *     because AC-001.6 requires two tasks with identical titles to coexist.
 *   - `createdAt` is the ADR-0007 comparator's third key, which is what makes
 *     ordering reproducible across reloads (AC-010.7).
 */
export interface Task {
  /** Opaque unique identifier. Internal; never shown to the user. */
  id: string;

  /**
   * Non-empty after trimming (FR-001, FR-009).
   *
   * Stored exactly as the user entered it apart from leading and trailing
   * whitespace, which has no visible content — see AC-001.4 and
   * `core/validation.ts`.
   */
  title: string;

  /**
   * ISO 8601 calendar date `YYYY-MM-DD`, or null when the task has no due
   * date (AC-002.2).
   *
   * A string, never a `Date` — ADR-0005. A `Date` is an instant; a due date is
   * a calendar day, and converting between the two is how a task due March 3
   * comes to render as March 2 for a user behind UTC. The string form also
   * compares lexicographically in chronological order, which is what lets the
   * ADR-0007 comparator work without parsing anything.
   */
  dueDate: string | null;

  /** One of the three levels, or null when unset (AC-003.2). */
  priority: Priority | null;

  /** `false` = active (not done), `true` = completed. */
  completed: boolean;

  /** Epoch milliseconds. Internal; exists solely as a sort tie-break. */
  createdAt: number;
}

/**
 * Everything the running application holds (architecture §2.3).
 *
 * Only `tasks` is persisted. The rest describes what the user is currently
 * doing rather than what they have recorded, and restoring it on reload would
 * resurrect a half-finished edit or a stale error message — which J4 never
 * asks for and AC-008.1 does not sanction.
 *
 * Note that `tasks` is held in INSERTION order, not sorted order. Ordering is
 * derived at render time (ADR-0007), so there is no cached order that can
 * drift out of step with the data.
 */
export interface AppState {
  /** All tasks, in insertion order. The only persisted slice. */
  tasks: Task[];

  /** Which view is shown. Opens on 'active' (architecture §5.3). */
  filter: Filter;

  /** Id of the task currently being edited, or null when none is. */
  editingId: string | null;

  /** Validation message for the create form, or null (FR-009). */
  formError: string | null;

  /**
   * Validation message for the inline edit form, or null.
   *
   * Kept separate from `formError` so that a rejected edit cannot blank the
   * create form's message, or vice versa — the two forms can be wrong at the
   * same time and about different things (AC-009.2, AC-005.6).
   */
  editError: string | null;

  /**
   * False when storage could not be read or written (architecture §8, modes 2
   * and 3). The app remains fully usable in memory for the session; nothing is
   * surfaced to the user, which is the open item recorded in §8.1.
   */
  storageOk: boolean;
}
