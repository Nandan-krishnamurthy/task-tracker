import { describe, expect, it } from 'vitest';

import { filterByStatus, selectVisibleTasks } from '../../src/core/filter';
import { FILTERS } from '../../src/core/types';
import type { Filter, Task } from '../../src/core/types';
import { DATE_EARLY, DATE_LATE, DATE_MID, T0, makeTask, mixedStatuses } from '../support/fixtures';

/**
 * T-104 verification.
 *
 * Traceability: FR-007.
 * Acceptance criteria: AC-007.1, AC-007.2, AC-007.3, AC-007.7, AC-010.5.
 */

const idsOf = (tasks: readonly Task[]): string[] => tasks.map((t) => t.id);

describe('filterByStatus — the two views (AC-007.1, AC-007.2)', () => {
  it('shows active tasks without completed ones mixed in', () => {
    const active = filterByStatus(mixedStatuses, 'active');

    expect(idsOf(active)).toEqual(['active-1', 'active-2']);
    expect(active.every((t) => !t.completed)).toBe(true);
  });

  it('shows completed tasks', () => {
    const completed = filterByStatus(mixedStatuses, 'completed');

    expect(idsOf(completed)).toEqual(['done-1', 'done-2']);
    expect(completed.every((t) => t.completed)).toBe(true);
  });

  it('returns an empty active view when everything is done', () => {
    const allDone = [
      makeTask({ id: 'a', completed: true }),
      makeTask({ id: 'b', completed: true }),
    ];

    expect(filterByStatus(allDone, 'active')).toEqual([]);
    expect(idsOf(filterByStatus(allDone, 'completed'))).toEqual(['a', 'b']);
  });

  it('returns an empty completed view when nothing is done', () => {
    const allActive = [
      makeTask({ id: 'a', completed: false }),
      makeTask({ id: 'b', completed: false }),
    ];

    expect(filterByStatus(allActive, 'completed')).toEqual([]);
    expect(idsOf(filterByStatus(allActive, 'active'))).toEqual(['a', 'b']);
  });
});

describe('filterByStatus — exhaustive and exclusive classification (AC-007.3)', () => {
  it('places every task in exactly one of the two views', () => {
    const active = filterByStatus(mixedStatuses, 'active');
    const completed = filterByStatus(mixedStatuses, 'completed');

    const activeIds = new Set(idsOf(active));
    const completedIds = new Set(idsOf(completed));

    // Nothing in both...
    for (const id of activeIds) expect(completedIds.has(id)).toBe(false);
    // ...and nothing in neither.
    expect(activeIds.size + completedIds.size).toBe(mixedStatuses.length);
  });

  it('classifies by status alone, ignoring every other attribute', () => {
    const tasks = [
      makeTask({ id: 'dated-done', dueDate: DATE_EARLY, priority: 'high', completed: true }),
      makeTask({ id: 'undated-active', dueDate: null, priority: null, completed: false }),
    ];

    expect(idsOf(filterByStatus(tasks, 'active'))).toEqual(['undated-active']);
    expect(idsOf(filterByStatus(tasks, 'completed'))).toEqual(['dated-done']);
  });

  it('covers both views with no third option (OQ-05)', () => {
    // FR-007 names two views. There is no combined "all" filter to test,
    // because the type system does not admit one.
    expect([...FILTERS]).toEqual(['active', 'completed']);
  });

  it('rejects an "all" filter at compile time', () => {
    // @ts-expect-error OQ-05 was resolved against a combined view.
    const invalid: Filter = 'all';
    expect(invalid).toBe('all');
  });
});

describe('selectVisibleTasks — ordering inside each view (AC-007.7, AC-010.5)', () => {
  const tasks = [
    makeTask({ id: 'a-undated', dueDate: null, completed: false, createdAt: T0 + 1 }),
    makeTask({ id: 'a-late', dueDate: DATE_LATE, completed: false, createdAt: T0 + 2 }),
    makeTask({ id: 'a-early', dueDate: DATE_EARLY, completed: false, createdAt: T0 + 3 }),
    makeTask({ id: 'c-undated', dueDate: null, completed: true, createdAt: T0 + 4 }),
    makeTask({ id: 'c-late', dueDate: DATE_LATE, completed: true, createdAt: T0 + 5 }),
    makeTask({ id: 'c-mid', dueDate: DATE_MID, completed: true, createdAt: T0 + 6 }),
  ];

  it('applies the FR-010 ordering inside the active view', () => {
    expect(idsOf(selectVisibleTasks(tasks, 'active'))).toEqual([
      'a-early',
      'a-late',
      'a-undated',
    ]);
  });

  it('applies the SAME ordering inside the completed view', () => {
    // AC-010.5: the rule applies within the active view and within the
    // completed view alike.
    expect(idsOf(selectVisibleTasks(tasks, 'completed'))).toEqual([
      'c-mid',
      'c-late',
      'c-undated',
    ]);
  });

  it('puts undated tasks last within whichever view they fall in', () => {
    for (const filter of FILTERS) {
      const visible = selectVisibleTasks(tasks, filter);
      const firstUndated = visible.findIndex((t) => t.dueDate === null);
      const lastDated = visible.map((t) => t.dueDate !== null).lastIndexOf(true);

      expect(firstUndated).toBeGreaterThan(lastDated);
    }
  });

  it('reorders when a due date changes, with no cached order to refresh', () => {
    // AC-010.4 at the selector level: order is derived from the data on every
    // call, so an edited due date takes effect immediately.
    const before = selectVisibleTasks(tasks, 'active');
    expect(idsOf(before)[0]).toBe('a-early');

    const edited = tasks.map((t) =>
      t.id === 'a-undated' ? { ...t, dueDate: '2020-01-01' } : t,
    );

    expect(idsOf(selectVisibleTasks(edited, 'active'))[0]).toBe('a-undated');
  });

  it('places a newly appended task in sorted position, not at the end', () => {
    // AC-010.3 at the selector level. The store appends; the selector sorts.
    const withNew = [
      ...tasks,
      makeTask({ id: 'brand-new', dueDate: '2020-01-01', completed: false, createdAt: T0 + 99 }),
    ];

    expect(idsOf(selectVisibleTasks(withNew, 'active'))[0]).toBe('brand-new');
  });
});

describe('selectVisibleTasks — purity and edge cases', () => {
  it('does not mutate its input', () => {
    const tasks = [
      makeTask({ id: 'z', dueDate: DATE_LATE, completed: false }),
      makeTask({ id: 'a', dueDate: DATE_EARLY, completed: true }),
    ];
    const before = structuredClone(tasks);

    selectVisibleTasks(tasks, 'active');
    selectVisibleTasks(tasks, 'completed');

    expect(tasks).toEqual(before);
    expect(idsOf(tasks)).toEqual(['z', 'a']);
  });

  it('never writes the derived order back into the input', () => {
    // ADR-0007: the result is derived and discarded. If it were cached it
    // could drift, which is the bug class the decision exists to remove.
    const tasks = [
      makeTask({ id: 'b', dueDate: DATE_LATE }),
      makeTask({ id: 'a', dueDate: DATE_EARLY }),
    ];

    selectVisibleTasks(tasks, 'active');

    expect(idsOf(tasks)).toEqual(['b', 'a']);
  });

  it('returns a new array each call', () => {
    const tasks = [makeTask({ id: 'only' })];

    expect(selectVisibleTasks(tasks, 'active')).not.toBe(
      selectVisibleTasks(tasks, 'active'),
    );
  });

  it('handles an empty list in both views (AC-007.5 data side)', () => {
    expect(selectVisibleTasks([], 'active')).toEqual([]);
    expect(selectVisibleTasks([], 'completed')).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    const tasks = [
      makeTask({ id: 'b', dueDate: DATE_MID, createdAt: T0 }),
      makeTask({ id: 'a', dueDate: DATE_MID, createdAt: T0 }),
    ];

    expect(idsOf(selectVisibleTasks(tasks, 'active'))).toEqual(
      idsOf(selectVisibleTasks(tasks, 'active')),
    );
  });
});
