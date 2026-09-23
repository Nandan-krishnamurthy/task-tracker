/**
 * Shared test fixtures and builders (plan T-003).
 *
 * Importable from all three tiers of ADR-0008: unit (node), dom (jsdom), and
 * e2e (Playwright).
 *
 * This module contains NO assertions. It produces data only.
 *
 * Types come from `src/core/types.ts`, the single canonical definition. The
 * provisional local declaration that stood here during P0 — written because
 * T-003 depends on T-101, which had not yet been implemented — was removed at
 * T-101, so there is no longer a second copy of the shape that could drift.
 */

import type { Priority, Task } from '../../src/core/types';

export type { Priority, Task };

// ───────────────────────────────── dates ──────────────────────────────────

/**
 * Fixed calendar dates. Deliberately literal rather than computed from the
 * clock: the ADR-0007 comparator does no date arithmetic and compares these
 * lexicographically, so tests must not depend on when they run.
 *
 * "Past" and "future" are relative to the PRD's date of 2026-09-11 and matter
 * only for the AC-010.6 reading (overdue tasks are not special-cased).
 */
export const DATE_PAST = '2020-01-15';
export const DATE_EARLY = '2026-03-01';
export const DATE_MID = '2026-06-15';
export const DATE_LATE = '2026-12-31';

/** Base timestamp for `createdAt`. Arbitrary but fixed. */
export const T0 = 1_700_000_000_000;

// ──────────────────────────────── builder ─────────────────────────────────

const DEFAULTS: Omit<Task, 'id'> = {
  title: 'Untitled task',
  dueDate: null,
  priority: null,
  completed: false,
  createdAt: T0,
};

let idCounter = 0;

/**
 * Reset the auto-generated id sequence. Call from `beforeEach` when a test
 * depends on generated ids being predictable.
 */
export function resetTaskIdCounter(): void {
  idCounter = 0;
}

/**
 * Build a task. Every field has a default, so `makeTask()` alone is valid and
 * `makeTask({ dueDate: DATE_MID })` varies exactly one thing.
 *
 * Returns a fresh object each call and never mutates `overrides`.
 */
export function makeTask(overrides: Partial<Task> = {}): Task {
  idCounter += 1;
  return { ...DEFAULTS, id: `task-${idCounter}`, ...overrides };
}

/**
 * Build `count` tasks with staggered `createdAt` and a rotating spread of
 * due dates, priorities, and statuses.
 *
 * Used by the T-606 performance check, which seeds 500 tasks. That figure is
 * a test parameter fixed by ADR-0008, NOT a product limit — no cap is enforced
 * in the application (A-02).
 */
export function makeManyTasks(count: number): Task[] {
  const dueDates: (string | null)[] = [DATE_EARLY, DATE_MID, DATE_LATE, null];
  const priorities: (Priority | null)[] = ['low', 'medium', 'high', null];

  return Array.from({ length: count }, (_unused, i) =>
    makeTask({
      title: `Task ${i + 1}`,
      dueDate: dueDates[i % dueDates.length] ?? null,
      priority: priorities[i % priorities.length] ?? null,
      completed: i % 5 === 0,
      createdAt: T0 + i,
    }),
  );
}

// ─────────────────────────── ordering scenarios ───────────────────────────

/**
 * Which key of the ADR-0007 four-key comparator a scenario is built to
 * exercise:
 *
 *   1. has due date  — dated tasks before undated ones        (AC-010.2)
 *   2. dueDate       — ascending lexicographic = chronological (AC-010.1)
 *   3. createdAt     — ascending; resolves OQ-01 and OQ-02
 *   4. id            — ascending; final determinism guard      (AC-010.7)
 */
export type ComparatorKey = 1 | 2 | 3 | 4;

export interface OrderingScenario {
  readonly name: string;
  /** The comparator key this scenario is designed to force a decision on. */
  readonly key: ComparatorKey;
  /** Input tasks, deliberately NOT in expected order. */
  readonly tasks: readonly Task[];
  /** Ids in the order the comparator must produce. Data, not an assertion. */
  readonly expectedIdOrder: readonly string[];
}

/** Key 2 — plain ascending by due date. */
export const datedAscending: OrderingScenario = {
  name: 'dated tasks sort soonest first',
  key: 2,
  tasks: [
    makeTask({ id: 'c', dueDate: DATE_LATE, createdAt: T0 }),
    makeTask({ id: 'a', dueDate: DATE_EARLY, createdAt: T0 + 1 }),
    makeTask({ id: 'b', dueDate: DATE_MID, createdAt: T0 + 2 }),
  ],
  expectedIdOrder: ['a', 'b', 'c'],
};

/** Key 1 — every undated task after every dated one. */
export const undatedSortLast: OrderingScenario = {
  name: 'undated tasks sort after all dated tasks',
  key: 1,
  tasks: [
    makeTask({ id: 'no-date-1', dueDate: null, createdAt: T0 }),
    makeTask({ id: 'dated-late', dueDate: DATE_LATE, createdAt: T0 + 1 }),
    makeTask({ id: 'no-date-2', dueDate: null, createdAt: T0 + 2 }),
    makeTask({ id: 'dated-early', dueDate: DATE_EARLY, createdAt: T0 + 3 }),
  ],
  expectedIdOrder: ['dated-early', 'dated-late', 'no-date-1', 'no-date-2'],
};

/** Key 3 — shared due date falls through to creation order (OQ-01). */
export const sharedDueDate: OrderingScenario = {
  name: 'tasks sharing a due date fall through to createdAt',
  key: 3,
  tasks: [
    makeTask({ id: 'newer', dueDate: DATE_MID, createdAt: T0 + 500 }),
    makeTask({ id: 'older', dueDate: DATE_MID, createdAt: T0 + 100 }),
    makeTask({ id: 'middle', dueDate: DATE_MID, createdAt: T0 + 300 }),
  ],
  expectedIdOrder: ['older', 'middle', 'newer'],
};

/** Key 3 — undated tasks ordered among themselves by creation (OQ-02). */
export const undatedAmongThemselves: OrderingScenario = {
  name: 'undated tasks order among themselves by createdAt',
  key: 3,
  tasks: [
    makeTask({ id: 'third', dueDate: null, createdAt: T0 + 300 }),
    makeTask({ id: 'first', dueDate: null, createdAt: T0 + 100 }),
    makeTask({ id: 'second', dueDate: null, createdAt: T0 + 200 }),
  ],
  expectedIdOrder: ['first', 'second', 'third'],
};

/** Key 4 — same due date AND same millisecond; only id can decide. */
export const identicalCreatedAtDated: OrderingScenario = {
  name: 'identical dueDate and createdAt fall through to id',
  key: 4,
  tasks: [
    makeTask({ id: 'id-c', dueDate: DATE_MID, createdAt: T0 }),
    makeTask({ id: 'id-a', dueDate: DATE_MID, createdAt: T0 }),
    makeTask({ id: 'id-b', dueDate: DATE_MID, createdAt: T0 }),
  ],
  expectedIdOrder: ['id-a', 'id-b', 'id-c'],
};

/** Key 4 — the undated equivalent. */
export const identicalCreatedAtUndated: OrderingScenario = {
  name: 'undated tasks with identical createdAt fall through to id',
  key: 4,
  tasks: [
    makeTask({ id: 'u-z', dueDate: null, createdAt: T0 }),
    makeTask({ id: 'u-m', dueDate: null, createdAt: T0 }),
    makeTask({ id: 'u-a', dueDate: null, createdAt: T0 }),
  ],
  expectedIdOrder: ['u-a', 'u-m', 'u-z'],
};

/** Key 2 — AC-010.6: overdue tasks are not special-cased. */
export const pastAndFuture: OrderingScenario = {
  name: 'past due dates sort ahead of future ones, with no special casing',
  key: 2,
  tasks: [
    makeTask({ id: 'future', dueDate: DATE_LATE, createdAt: T0 }),
    makeTask({ id: 'overdue', dueDate: DATE_PAST, createdAt: T0 + 1 }),
    makeTask({ id: 'soon', dueDate: DATE_EARLY, createdAt: T0 + 2 }),
  ],
  expectedIdOrder: ['overdue', 'soon', 'future'],
};

/**
 * Key 3 — AC-003.7: priority is display metadata and must not affect order.
 * Same due date throughout, so only createdAt may decide; the high-priority
 * task is deliberately created last and must therefore sort last.
 */
export const priorityDoesNotAffectOrder: OrderingScenario = {
  name: 'priority does not influence ordering',
  key: 3,
  tasks: [
    makeTask({ id: 'p-low', dueDate: DATE_MID, priority: 'low', createdAt: T0 + 100 }),
    makeTask({ id: 'p-none', dueDate: DATE_MID, priority: null, createdAt: T0 + 200 }),
    makeTask({ id: 'p-high', dueDate: DATE_MID, priority: 'high', createdAt: T0 + 300 }),
  ],
  expectedIdOrder: ['p-low', 'p-none', 'p-high'],
};

/** Every ordering scenario, for suites that iterate the whole set. */
export const orderingScenarios: readonly OrderingScenario[] = [
  datedAscending,
  undatedSortLast,
  sharedDueDate,
  undatedAmongThemselves,
  identicalCreatedAtDated,
  identicalCreatedAtUndated,
  pastAndFuture,
  priorityDoesNotAffectOrder,
];

// ──────────────────────────── attribute coverage ──────────────────────────

/** One task per priority level, plus the no-priority case (FR-003, C-04). */
export const everyPriority: readonly Task[] = [
  makeTask({ id: 'pri-low', title: 'Low priority', priority: 'low' }),
  makeTask({ id: 'pri-medium', title: 'Medium priority', priority: 'medium' }),
  makeTask({ id: 'pri-high', title: 'High priority', priority: 'high' }),
  makeTask({ id: 'pri-none', title: 'No priority', priority: null }),
];

/** Both statuses, for filter and view tests (FR-007). */
export const mixedStatuses: readonly Task[] = [
  makeTask({ id: 'active-1', title: 'Active one', completed: false, createdAt: T0 + 1 }),
  makeTask({ id: 'done-1', title: 'Completed one', completed: true, createdAt: T0 + 2 }),
  makeTask({ id: 'active-2', title: 'Active two', completed: false, createdAt: T0 + 3 }),
  makeTask({ id: 'done-2', title: 'Completed two', completed: true, createdAt: T0 + 4 }),
];

/** A realistic small list spanning dated/undated, both statuses, all priorities. */
export const mixedList: readonly Task[] = [
  makeTask({ id: 'mix-1', title: 'Pay rent', dueDate: DATE_EARLY, priority: 'high', createdAt: T0 + 1 }),
  makeTask({ id: 'mix-2', title: 'Buy milk', dueDate: null, priority: 'low', createdAt: T0 + 2 }),
  makeTask({ id: 'mix-3', title: 'Call dentist', dueDate: DATE_MID, priority: null, completed: true, createdAt: T0 + 3 }),
  makeTask({ id: 'mix-4', title: 'Renew passport', dueDate: DATE_LATE, priority: 'medium', createdAt: T0 + 4 }),
];

/** Titles that must survive storage and rendering unaltered (AC-001.4). */
export const awkwardTitles: readonly string[] = [
  'Buy milk',
  'Call  the   dentist',
  'Review PR #42 <script>alert(1)</script>',
  'Café — naïve façade',
  '📌 Pin this',
  'a'.repeat(500),
];

/** Strings that must be rejected as empty titles (AC-009.1, AC-009.4). */
export const emptyishTitles: readonly string[] = ['', ' ', '   ', '\t', '\n', ' \t\n '];
