/**
 * View selection (plan T-104).
 *
 * Pure. No DOM, no storage (ADR-0001).
 *
 * Realises FR-007 — "User can view active (not-done) tasks separately from
 * completed tasks" — and, via `selectVisibleTasks`, the requirement that each
 * view obey the FR-010 ordering (AC-007.7, AC-010.5).
 */

import { sortTasks } from './sort';
import type { Filter, Task } from './types';

/**
 * The tasks belonging to one view.
 *
 * Every task is classified into exactly one of the two views by its status, at
 * every moment (AC-007.3) — the two predicates are complements, so nothing can
 * appear in both or in neither.
 *
 * There is no combined "all" view. OQ-05 was resolved in favour of the literal
 * reading of FR-007, which names two views and no third (architecture §5.3).
 */
export function filterByStatus(tasks: readonly Task[], filter: Filter): Task[] {
  return tasks.filter((task) => (filter === 'active' ? !task.completed : task.completed));
}

/**
 * The tasks to render for a view, in display order.
 *
 * Filter first, then sort (architecture §5.1). The result is the same either
 * way; this order simply sorts fewer items.
 *
 * The result is DERIVED and never written back into state or storage. That is
 * what makes AC-010.3 (a new task lands in its correct sorted position) and
 * AC-010.4 (the list re-sorts when a due date is edited) fall out for free:
 * there is no cached order that can drift, because the order is recomputed
 * from the data on every render.
 */
export function selectVisibleTasks(tasks: readonly Task[], filter: Filter): Task[] {
  return sortTasks(filterByStatus(tasks, filter));
}
