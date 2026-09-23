/**
 * Task operations (plan T-105).
 *
 * Pure. No DOM, no storage (ADR-0001). No sorting — `core/sort.ts` owns order,
 * and these functions preserve insertion order so that the ADR-0007 comparator
 * has a meaningful `createdAt` to fall back on.
 *
 * Every function returns new values and mutates nothing it is given.
 */

import type { Priority, Task } from './types';

/**
 * The fields a user supplies when creating a task.
 *
 * `title` is expected to be ALREADY VALIDATED and trimmed by
 * `core/validation.ts`. Validation is not repeated here: architecture §3.2
 * puts it inside the reducer, where it cannot be bypassed, and duplicating it
 * would create a second place for the rule to drift.
 */
export interface NewTaskInput {
  title: string;
  dueDate: string | null;
  priority: Priority | null;
}

/**
 * The non-deterministic parts of a new task, supplied by the caller.
 *
 * `crypto.randomUUID()` and `Date.now()` are side effects, and ADR-0001 makes
 * `core/` pure. Injecting both keeps `createTask` a total function of its
 * inputs — which is what lets the whole of T-105 be tested without a browser,
 * a clock, or a mock. The store (T-302) supplies the real values.
 */
export interface TaskIdentity {
  id: string;
  createdAt: number;
}

/**
 * The fields an edit may change.
 *
 * All three, never a subset (AC-005.2). Notably absent: `completed`, which the
 * checkbox owns via `toggleComplete`, and `id`/`createdAt`, which are internal
 * and permanent.
 */
export interface TaskEdit {
  title: string;
  dueDate: string | null;
  priority: Priority | null;
}

/**
 * Build a new task.
 *
 * Always created ACTIVE (AC-001.2) — a task cannot be born completed.
 *
 * A task created with only a title is valid: `dueDate` and `priority` are
 * simply null, which is a first-class state and never an error (AC-001.5,
 * AC-002.2, AC-002.7, AC-003.2).
 */
export function createTask(input: NewTaskInput, identity: TaskIdentity): Task {
  return {
    id: identity.id,
    title: input.title,
    dueDate: input.dueDate,
    priority: input.priority,
    completed: false,
    createdAt: identity.createdAt,
  };
}

/**
 * Append a task to the list.
 *
 * Appends rather than inserting in sorted position: state holds insertion
 * order and display order is derived at render (ADR-0007). AC-010.3 — a new
 * task appearing in its correct sorted position — is satisfied by
 * `selectVisibleTasks`, not here.
 *
 * Nothing is deduplicated. Two tasks with identical titles are two distinct
 * tasks, because titles are not keys (AC-001.6).
 */
export function addTask(tasks: readonly Task[], task: Task): Task[] {
  return [...tasks, task];
}

/**
 * Apply an edit to the task with the given id.
 *
 * Changes title, due date, and priority only. `completed` is preserved, so
 * editing a completed task leaves it completed (AC-005.7); `id` and
 * `createdAt` are preserved, so a task's identity and its sort tie-break
 * survive any number of edits (AC-010.7).
 *
 * Clearing a due date or priority is an ordinary edit — pass null (AC-002.5,
 * AC-003.5). A cleared due date sends the task to the end of the list on the
 * next render, per FR-010.
 *
 * An unknown id changes nothing. Tasks other than the target are returned by
 * reference, untouched.
 */
export function updateTask(tasks: readonly Task[], id: string, edit: TaskEdit): Task[] {
  return tasks.map((task) =>
    task.id === id
      ? { ...task, title: edit.title, dueDate: edit.dueDate, priority: edit.priority }
      : task,
  );
}

/**
 * Flip the completed status of the task with the given id.
 *
 * Works in both directions — completing an active task and reopening a
 * completed one are the same operation (AC-004.1, AC-004.3).
 *
 * Title, due date, and priority are carried across unchanged (AC-004.4), as
 * are `id` and `createdAt`, so a toggled task holds its position in the
 * ordering.
 *
 * An unknown id changes nothing.
 */
export function toggleComplete(tasks: readonly Task[], id: string): Task[] {
  return tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task));
}

/**
 * Remove the task with the given id.
 *
 * Removes from the single list, so the task is absent from BOTH views
 * afterwards (AC-006.2) — there is only one list, and the views are derived
 * from it. Completed tasks delete on exactly the same terms as active ones
 * (AC-006.5).
 *
 * Every other task is left untouched in content, status, and relative order
 * (AC-006.4). An unknown id changes nothing.
 *
 * There is no confirmation step and no undo. J3 says the change applies
 * "immediately" and the PRD specifies neither — see OQ-04.
 */
export function deleteTask(tasks: readonly Task[], id: string): Task[] {
  return tasks.filter((task) => task.id !== id);
}
