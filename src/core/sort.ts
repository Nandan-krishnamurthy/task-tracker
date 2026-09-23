/**
 * Task ordering (plan T-103).
 *
 * Pure. No DOM, no storage (ADR-0001). No date parsing anywhere (ADR-0005).
 *
 * Implements the four-key comparator of ADR-0007, which realises FR-010:
 *
 *   "Tasks are sorted by due date ascending by default (soonest first), with
 *    tasks lacking a due date sorted last."
 *
 * FR-010 fixes only the primary key. Keys 3 and 4 exist because a comparator
 * that returns 0 for ties hands ordering to the engine's sort implementation,
 * which need not agree between a freshly decoded array and one that has been
 * edited in session — producing a list that visibly reshuffles on reload for
 * no reason the user can see. AC-010.7 forbids exactly that.
 */

import type { Task } from './types';

/**
 * Order two tasks. Negative when `a` sorts first, positive when `b` does.
 *
 * Keys, applied in order:
 *
 *   1. Has a due date — dated tasks before undated ones        (AC-010.2)
 *   2. dueDate        — ascending lexicographic                (AC-010.1)
 *   3. createdAt      — ascending, older first          (OQ-01, OQ-02)
 *   4. id             — ascending lexicographic                (AC-010.7)
 *
 * Key 2 compares `YYYY-MM-DD` strings directly. ISO calendar dates sort
 * lexicographically in the same order they sort chronologically, so no parsing
 * is needed and no timezone can be applied by accident (ADR-0005). This is
 * also why past due dates need no special case: an overdue task simply sorts
 * ahead of nearer-future ones (AC-010.6). The PRD defines no overdue behavior,
 * and NG-06 rules out the reminders that would motivate one.
 *
 * Priority is deliberately absent. The approved decision "Default task list
 * order" names due date only, so priority is display metadata (AC-003.7).
 *
 * Key 4 will essentially never decide anything in practice — it exists because
 * two tasks created in the same millisecond are possible, and without it the
 * comparator could still return 0.
 */
export function compareTasks(a: Task, b: Task): number {
  // Key 1 — dated before undated.
  const aHasDate = a.dueDate !== null;
  const bHasDate = b.dueDate !== null;
  if (aHasDate !== bHasDate) {
    return aHasDate ? -1 : 1;
  }

  // Key 2 — ascending by calendar date. Both are dated or both are undated by
  // this point, so comparing is only meaningful in the dated case.
  if (a.dueDate !== null && b.dueDate !== null && a.dueDate !== b.dueDate) {
    return a.dueDate < b.dueDate ? -1 : 1;
  }

  // Key 3 — older task first. Resolves OQ-01 (shared due date) and OQ-02
  // (ordering within the undated group) identically: fall through to creation
  // order, which is stable, intuitive, and unchanged by any later edit.
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }

  // Key 4 — final determinism guard.
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }

  return 0;
}

/**
 * Return a sorted copy of `tasks`.
 *
 * Never mutates the input. State holds tasks in insertion order and ordering
 * is derived at render time (ADR-0007), so sorting in place would corrupt the
 * very thing key 3 depends on.
 */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(compareTasks);
}
