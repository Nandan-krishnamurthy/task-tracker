import { describe, expect, it } from 'vitest';

import {
  addTask,
  createTask,
  deleteTask,
  toggleComplete,
  updateTask,
} from '../../src/core/tasks';
import type { Task } from '../../src/core/types';
import { DATE_EARLY, DATE_LATE, DATE_MID, T0, makeTask } from '../support/fixtures';

/**
 * T-105 verification.
 *
 * Traceability: FR-001 .. FR-006.
 * Acceptance criteria: AC-001.5, AC-001.6, AC-002.3, AC-002.4, AC-002.5,
 * AC-003.4, AC-003.5, AC-004.1, AC-004.3, AC-004.4, AC-005.1, AC-005.2,
 * AC-005.7, AC-006.4.
 */

const idsOf = (tasks: readonly Task[]): string[] => tasks.map((t) => t.id);

const identity = { id: 'new-1', createdAt: T0 + 500 };

// ──────────────────────────────── createTask ──────────────────────────────

describe('createTask', () => {
  it('creates a task with the supplied title, due date, and priority', () => {
    const task = createTask(
      { title: 'Buy milk', dueDate: DATE_MID, priority: 'high' },
      identity,
    );

    expect(task).toEqual({
      id: 'new-1',
      title: 'Buy milk',
      dueDate: DATE_MID,
      priority: 'high',
      completed: false,
      createdAt: T0 + 500,
    });
  });

  it('creates the task ACTIVE, never completed (AC-001.2)', () => {
    const task = createTask({ title: 'Anything', dueDate: null, priority: null }, identity);

    expect(task.completed).toBe(false);
  });

  it('accepts a title-only task as valid, with both optionals absent (AC-001.5)', () => {
    const task = createTask({ title: 'Title only', dueDate: null, priority: null }, identity);

    expect(task.dueDate).toBeNull();
    expect(task.priority).toBeNull();
    expect(task.title).toBe('Title only');
  });

  it('accepts a due date without a priority (AC-002.1, AC-003.2)', () => {
    const task = createTask({ title: 'Dated', dueDate: DATE_EARLY, priority: null }, identity);

    expect(task.dueDate).toBe(DATE_EARLY);
    expect(task.priority).toBeNull();
  });

  it('accepts a priority without a due date (AC-002.2, AC-003.1)', () => {
    const task = createTask({ title: 'Urgent', dueDate: null, priority: 'low' }, identity);

    expect(task.dueDate).toBeNull();
    expect(task.priority).toBe('low');
  });

  it('uses the injected identity rather than generating one', () => {
    // ADR-0001 keeps core/ pure: crypto.randomUUID() and Date.now() are side
    // effects, so the store supplies both. That is what makes this function
    // testable without a clock or a mock.
    const a = createTask({ title: 'A', dueDate: null, priority: null }, { id: 'x', createdAt: 1 });
    const b = createTask({ title: 'B', dueDate: null, priority: null }, { id: 'y', createdAt: 2 });

    expect(a.id).toBe('x');
    expect(a.createdAt).toBe(1);
    expect(b.id).toBe('y');
    expect(b.createdAt).toBe(2);
  });

  it('stores the title verbatim, performing no validation of its own', () => {
    // Validation lives in the reducer (architecture §3.2) using the single
    // shared rule. Repeating it here would create a second place to drift.
    const task = createTask(
      { title: 'Call  the   dentist', dueDate: null, priority: null },
      identity,
    );

    expect(task.title).toBe('Call  the   dentist');
  });

  it('returns a fresh object each call', () => {
    const a = createTask({ title: 'A', dueDate: null, priority: null }, identity);
    const b = createTask({ title: 'A', dueDate: null, priority: null }, identity);

    expect(a).not.toBe(b);
  });
});

// ───────────────────────────────── addTask ────────────────────────────────

describe('addTask', () => {
  it('appends to the end, preserving insertion order', () => {
    // ADR-0007: state holds insertion order; display order is derived at
    // render. Inserting in sorted position here would corrupt the createdAt
    // tie-break the comparator depends on.
    const existing = [makeTask({ id: 'a' }), makeTask({ id: 'b' })];
    const added = addTask(existing, makeTask({ id: 'c' }));

    expect(idsOf(added)).toEqual(['a', 'b', 'c']);
  });

  it('lets two tasks with identical titles coexist (AC-001.6)', () => {
    const first = createTask(
      { title: 'Buy milk', dueDate: null, priority: null },
      { id: 'one', createdAt: T0 },
    );
    const second = createTask(
      { title: 'Buy milk', dueDate: null, priority: null },
      { id: 'two', createdAt: T0 + 1 },
    );

    const list = addTask(addTask([], first), second);

    // Titles are not keys — nothing is deduplicated or overwritten.
    expect(list).toHaveLength(2);
    expect(idsOf(list)).toEqual(['one', 'two']);
    expect(list.every((t) => t.title === 'Buy milk')).toBe(true);
  });

  it('adds to an empty list', () => {
    expect(idsOf(addTask([], makeTask({ id: 'first' })))).toEqual(['first']);
  });

  it('does not mutate its input', () => {
    const existing = [makeTask({ id: 'a' })];
    const before = structuredClone(existing);

    addTask(existing, makeTask({ id: 'b' }));

    expect(existing).toEqual(before);
    expect(existing).toHaveLength(1);
  });

  it('returns a new array', () => {
    const existing = [makeTask({ id: 'a' })];

    expect(addTask(existing, makeTask({ id: 'b' }))).not.toBe(existing);
  });
});

// ──────────────────────────────── updateTask ──────────────────────────────

describe('updateTask', () => {
  const base = [
    makeTask({
      id: 'target',
      title: 'Original',
      dueDate: DATE_MID,
      priority: 'medium',
      completed: false,
      createdAt: T0 + 10,
    }),
    makeTask({ id: 'other', title: 'Untouched', dueDate: DATE_EARLY, createdAt: T0 + 20 }),
  ];

  const edit = (overrides: Partial<{ title: string; dueDate: string | null; priority: Task['priority'] }> = {}) => ({
    title: 'Original',
    dueDate: DATE_MID as string | null,
    priority: 'medium' as Task['priority'],
    ...overrides,
  });

  it('changes the title (AC-005.1)', () => {
    const updated = updateTask(base, 'target', edit({ title: 'Renamed' }));

    expect(updated[0]?.title).toBe('Renamed');
  });

  it('changes title, due date, and priority together (AC-005.2)', () => {
    const updated = updateTask(base, 'target', {
      title: 'All three',
      dueDate: DATE_LATE,
      priority: 'low',
    });

    expect(updated[0]).toMatchObject({
      title: 'All three',
      dueDate: DATE_LATE,
      priority: 'low',
    });
  });

  it('sets a due date on a task that had none (AC-002.3)', () => {
    const undated = [makeTask({ id: 'u', title: 'U', dueDate: null, priority: null })];
    const updated = updateTask(undated, 'u', { title: 'U', dueDate: DATE_EARLY, priority: null });

    expect(updated[0]?.dueDate).toBe(DATE_EARLY);
  });

  it('replaces an existing due date (AC-002.4)', () => {
    const updated = updateTask(base, 'target', edit({ dueDate: DATE_LATE }));

    expect(updated[0]?.dueDate).toBe(DATE_LATE);
  });

  it('clears a due date back to null (AC-002.5)', () => {
    const updated = updateTask(base, 'target', edit({ dueDate: null }));

    expect(updated[0]?.dueDate).toBeNull();
  });

  it('sets and changes priority (AC-003.4)', () => {
    const set = updateTask(base, 'target', edit({ priority: 'high' }));
    expect(set[0]?.priority).toBe('high');

    const changed = updateTask(set, 'target', edit({ priority: 'low' }));
    expect(changed[0]?.priority).toBe('low');
  });

  it('clears a priority back to null (AC-003.5)', () => {
    const updated = updateTask(base, 'target', edit({ priority: null }));

    expect(updated[0]?.priority).toBeNull();
  });

  it('preserves completed status when editing a COMPLETED task (AC-005.7)', () => {
    // J3 step 1: "an existing task, active or completed". Editing a done task
    // must not quietly reopen it.
    const done = [
      makeTask({ id: 'd', title: 'Done thing', completed: true, dueDate: null, priority: null }),
    ];
    const updated = updateTask(done, 'd', { title: 'Renamed', dueDate: null, priority: null });

    expect(updated[0]?.completed).toBe(true);
    expect(updated[0]?.title).toBe('Renamed');
  });

  it('preserves completed status when editing an active task', () => {
    const updated = updateTask(base, 'target', edit({ title: 'Renamed' }));

    expect(updated[0]?.completed).toBe(false);
  });

  it('preserves id and createdAt across any number of edits', () => {
    // createdAt is the ADR-0007 tie-break; an edit that reset it would make
    // ordering shift for an unrelated reason.
    let list = base;
    for (const title of ['One', 'Two', 'Three']) {
      list = updateTask(list, 'target', edit({ title }));
    }

    expect(list[0]?.id).toBe('target');
    expect(list[0]?.createdAt).toBe(T0 + 10);
  });

  it('leaves other tasks untouched, by reference', () => {
    const updated = updateTask(base, 'target', edit({ title: 'Renamed' }));

    expect(updated[1]).toBe(base[1]);
  });

  it('changes nothing when the id is unknown', () => {
    const updated = updateTask(base, 'does-not-exist', edit({ title: 'Nope' }));

    expect(updated).toEqual(base);
  });

  it('changes nothing on an empty list', () => {
    expect(updateTask([], 'anything', edit())).toEqual([]);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(base);

    updateTask(base, 'target', edit({ title: 'Renamed', dueDate: null, priority: 'high' }));

    expect(base).toEqual(before);
  });

  it('preserves list order', () => {
    const updated = updateTask(base, 'target', edit({ title: 'Renamed' }));

    expect(idsOf(updated)).toEqual(idsOf(base));
  });
});

// ────────────────────────────── toggleComplete ────────────────────────────

describe('toggleComplete', () => {
  const base = [
    makeTask({
      id: 'target',
      title: 'Buy milk',
      dueDate: DATE_MID,
      priority: 'high',
      completed: false,
      createdAt: T0 + 10,
    }),
    makeTask({ id: 'other', completed: true, createdAt: T0 + 20 }),
  ];

  it('marks an active task complete (AC-004.1)', () => {
    expect(toggleComplete(base, 'target')[0]?.completed).toBe(true);
  });

  it('reopens a completed task (AC-004.3)', () => {
    const completed = toggleComplete(base, 'target');

    expect(toggleComplete(completed, 'target')[0]?.completed).toBe(false);
  });

  it('round-trips back to the original state', () => {
    const there = toggleComplete(base, 'target');
    const andBack = toggleComplete(there, 'target');

    expect(andBack).toEqual(base);
  });

  it('leaves title, due date, and priority unchanged in both directions (AC-004.4)', () => {
    const completed = toggleComplete(base, 'target');
    expect(completed[0]).toMatchObject({
      title: 'Buy milk',
      dueDate: DATE_MID,
      priority: 'high',
    });

    const reopened = toggleComplete(completed, 'target');
    expect(reopened[0]).toMatchObject({
      title: 'Buy milk',
      dueDate: DATE_MID,
      priority: 'high',
    });
  });

  it('leaves id and createdAt unchanged, so ordering is unaffected', () => {
    const toggled = toggleComplete(base, 'target');

    expect(toggled[0]?.id).toBe('target');
    expect(toggled[0]?.createdAt).toBe(T0 + 10);
  });

  it('leaves other tasks untouched, by reference', () => {
    const toggled = toggleComplete(base, 'target');

    expect(toggled[1]).toBe(base[1]);
  });

  it('changes nothing when the id is unknown', () => {
    expect(toggleComplete(base, 'does-not-exist')).toEqual(base);
  });

  it('changes nothing on an empty list', () => {
    expect(toggleComplete([], 'anything')).toEqual([]);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(base);

    toggleComplete(base, 'target');

    expect(base).toEqual(before);
  });

  it('preserves list order', () => {
    expect(idsOf(toggleComplete(base, 'target'))).toEqual(idsOf(base));
  });
});

// ──────────────────────────────── deleteTask ──────────────────────────────

describe('deleteTask', () => {
  const base = [
    makeTask({ id: 'first', title: 'First', dueDate: DATE_EARLY, createdAt: T0 + 1 }),
    makeTask({ id: 'middle', title: 'Middle', dueDate: DATE_MID, createdAt: T0 + 2 }),
    makeTask({ id: 'last', title: 'Last', dueDate: null, createdAt: T0 + 3 }),
  ];

  it('removes the target task', () => {
    const remaining = deleteTask(base, 'middle');

    expect(idsOf(remaining)).toEqual(['first', 'last']);
  });

  it('removes it from the single list, so it is absent from both views (AC-006.2)', () => {
    // There is only one list; the two views are derived from it. Removing from
    // the list is therefore all that "no longer present anywhere" requires.
    const remaining = deleteTask(base, 'middle');

    expect(remaining.some((t) => t.id === 'middle')).toBe(false);
  });

  it('deletes a COMPLETED task on the same terms (AC-006.5)', () => {
    const withDone = [
      makeTask({ id: 'done', completed: true }),
      makeTask({ id: 'active', completed: false }),
    ];

    expect(idsOf(deleteTask(withDone, 'done'))).toEqual(['active']);
  });

  it('leaves other tasks unaffected in content, status, and relative order (AC-006.4)', () => {
    const remaining = deleteTask(base, 'middle');

    expect(remaining[0]).toBe(base[0]);
    expect(remaining[1]).toBe(base[2]);
    expect(idsOf(remaining)).toEqual(['first', 'last']);
  });

  it('empties the list when the last remaining task is deleted (AC-006.6)', () => {
    const single = [makeTask({ id: 'only' })];

    expect(deleteTask(single, 'only')).toEqual([]);
  });

  it('applies immediately with no confirmation step (OQ-04)', () => {
    // J3 step 3: "The system applies the change (or removal) immediately."
    // There is no pending state, no two-phase delete, and no undo — the PRD
    // specifies none of them.
    const remaining = deleteTask(base, 'first');

    expect(remaining.some((t) => t.id === 'first')).toBe(false);
  });

  it('changes nothing when the id is unknown', () => {
    expect(deleteTask(base, 'does-not-exist')).toEqual(base);
  });

  it('changes nothing on an empty list', () => {
    expect(deleteTask([], 'anything')).toEqual([]);
  });

  it('removes only the matching task when titles are duplicated (AC-001.6)', () => {
    const duplicates = [
      makeTask({ id: 'dup-1', title: 'Buy milk' }),
      makeTask({ id: 'dup-2', title: 'Buy milk' }),
    ];

    const remaining = deleteTask(duplicates, 'dup-1');

    expect(idsOf(remaining)).toEqual(['dup-2']);
    expect(remaining[0]?.title).toBe('Buy milk');
  });

  it('does not mutate its input', () => {
    const before = structuredClone(base);

    deleteTask(base, 'middle');

    expect(base).toEqual(before);
    expect(base).toHaveLength(3);
  });

  it('returns a new array', () => {
    expect(deleteTask(base, 'middle')).not.toBe(base);
  });
});

// ──────────────────────────── cross-operation purity ──────────────────────

describe('task operations — purity across a sequence', () => {
  it('leaves the original list untouched through create, update, toggle, delete', () => {
    const original = [makeTask({ id: 'a', title: 'A' }), makeTask({ id: 'b', title: 'B' })];
    const snapshot = structuredClone(original);

    let list = addTask(original, createTask({ title: 'C', dueDate: null, priority: null }, identity));
    list = updateTask(list, 'a', { title: 'A renamed', dueDate: DATE_LATE, priority: 'high' });
    list = toggleComplete(list, 'b');
    list = deleteTask(list, 'new-1');

    expect(original).toEqual(snapshot);
    expect(idsOf(list)).toEqual(['a', 'b']);
    expect(list[0]?.title).toBe('A renamed');
    expect(list[1]?.completed).toBe(true);
  });
});
