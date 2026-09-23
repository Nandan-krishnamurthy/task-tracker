import { describe, expect, it, vi } from 'vitest';

import type { TaskIdentity } from '../../src/core/tasks';
import type { AppState, Task } from '../../src/core/types';
import { EMPTY_TITLE_MESSAGE } from '../../src/core/validation';
import { ACTION_TYPES } from '../../src/store/actions';
import type { Action } from '../../src/store/actions';
import {
  createInitialState,
  createStore,
  reduce,
  selectVisible,
} from '../../src/store/store';
import {
  DATE_EARLY,
  DATE_LATE,
  DATE_MID,
  T0,
  emptyishTitles,
  makeTask,
} from '../support/fixtures';

/**
 * T-301 and T-302 verification.
 *
 * Traceability: FR-001 .. FR-007, FR-009, architecture §3.1 and §3.2.
 * Acceptance criteria: AC-009.1, AC-009.3, AC-009.5, AC-005.6, plus the state
 * half of AC-001.*, AC-002.*, AC-003.*, AC-004.*, AC-005.*, AC-006.*,
 * AC-007.*.
 *
 * Persistence is NOT exercised here. T-302 explicitly does not touch storage;
 * T-303 adds the write-through hook and is tested in the DOM tier.
 */

const IDENTITY: TaskIdentity = { id: 'generated-1', createdAt: T0 + 1_000 };

const idsOf = (tasks: readonly Task[]): string[] => tasks.map((t) => t.id);

/** Apply a sequence of actions to a starting state, with fixed identity. */
function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce((acc, action) => reduce(acc, action, IDENTITY), state);
}

/** A state carrying the given tasks. */
function withTasks(...tasks: Task[]): AppState {
  return { ...createInitialState(), tasks };
}

// ────────────────────────── T-301: the action set ─────────────────────────

describe('action set (T-301)', () => {
  it('has exactly the eight actions of architecture §3.2', () => {
    expect([...ACTION_TYPES]).toHaveLength(8);
    expect([...ACTION_TYPES].sort()).toEqual(
      [
        'BEGIN_EDIT',
        'CANCEL_EDIT',
        'CREATE_TASK',
        'DELETE_TASK',
        'LOAD',
        'SET_FILTER',
        'TOGGLE_COMPLETE',
        'UPDATE_TASK',
      ].sort(),
    );
  });

  it('keeps the runtime list and the union in exact correspondence', () => {
    // Record<Action['type'], true> forces every union member to appear, and
    // the excess-property check forbids any extra. So the two cannot drift.
    const everyMember: Record<Action['type'], true> = {
      LOAD: true,
      CREATE_TASK: true,
      TOGGLE_COMPLETE: true,
      UPDATE_TASK: true,
      DELETE_TASK: true,
      SET_FILTER: true,
      BEGIN_EDIT: true,
      CANCEL_EDIT: true,
    };

    expect(Object.keys(everyMember).sort()).toEqual([...ACTION_TYPES].sort());
  });

  it('defines no action for unscoped behavior', () => {
    // The set is closed on purpose. Each of these would be a commitment to
    // behavior the PRD does not ask for.
    const forbidden = [
      'SET_SORT', // FR-010 fixes one order; no user-selectable sorting
      'CLEAR_COMPLETED', // no bulk operation is specified
      'UNDO', // J3 applies deletion immediately; no reversal specified
      'SIGN_IN', // NG-01
      'SYNC', // NG-02
      'SHARE', // NG-03
      'ADD_TAG', // NG-04
      'SET_NOTES', // NG-05
      'SET_REMINDER', // NG-06
    ];

    for (const name of forbidden) {
      expect([...ACTION_TYPES]).not.toContain(name);
    }
  });

  it('rejects an unknown action type at compile time', () => {
    // @ts-expect-error SET_SORT is not in the closed action set.
    const invalid: Action = { type: 'SET_SORT' };
    expect(invalid.type).toBe('SET_SORT');
  });
});

// ─────────────────────────── initial state ────────────────────────────────

describe('createInitialState', () => {
  it('starts empty, on the active view, with nothing in error', () => {
    expect(createInitialState()).toEqual({
      tasks: [],
      filter: 'active',
      editingId: null,
      formError: null,
      editError: null,
      storageOk: true,
    });
  });

  it('opens on the active view (OQ-05)', () => {
    expect(createInitialState().filter).toBe('active');
  });

  it('returns a fresh object each call', () => {
    const a = createInitialState();
    a.tasks.push(makeTask({ id: 'leak' }));

    expect(createInitialState().tasks).toEqual([]);
  });
});

// ──────────────────────────────── LOAD ────────────────────────────────────

describe('LOAD', () => {
  it('adopts the tasks storage returned (AC-008.3)', () => {
    const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b' })];

    const next = run(createInitialState(), { type: 'LOAD', tasks, storageOk: true });

    expect(next.tasks).toEqual(tasks);
    expect(next.storageOk).toBe(true);
  });

  it('records storage as unusable when the load said so (AC-SUP.2)', () => {
    const next = run(createInitialState(), { type: 'LOAD', tasks: [], storageOk: false });

    expect(next.tasks).toEqual([]);
    expect(next.storageOk).toBe(false);
  });

  it('accepts an empty list without error (AC-008.5)', () => {
    const next = run(createInitialState(), { type: 'LOAD', tasks: [], storageOk: true });

    expect(next.tasks).toEqual([]);
  });

  it('does not disturb the current view or edit state', () => {
    const start: AppState = { ...createInitialState(), filter: 'completed', editingId: 'x' };

    const next = run(start, { type: 'LOAD', tasks: [], storageOk: true });

    expect(next.filter).toBe('completed');
    expect(next.editingId).toBe('x');
  });
});

// ───────────────────────────── CREATE_TASK ────────────────────────────────

describe('CREATE_TASK — success', () => {
  const create = (title: string, dueDate: string | null = null): Action => ({
    type: 'CREATE_TASK',
    title,
    dueDate,
    priority: null,
  });

  it('adds a task carrying the submitted title (AC-001.1)', () => {
    const next = run(createInitialState(), create('Buy milk'));

    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]?.title).toBe('Buy milk');
  });

  it('creates it active, never completed (AC-001.2)', () => {
    const next = run(createInitialState(), create('Buy milk'));

    expect(next.tasks[0]?.completed).toBe(false);
  });

  it('uses the identity the store supplied', () => {
    const next = run(createInitialState(), create('Buy milk'));

    expect(next.tasks[0]?.id).toBe(IDENTITY.id);
    expect(next.tasks[0]?.createdAt).toBe(IDENTITY.createdAt);
  });

  it('carries the due date and priority through (AC-002.1, AC-003.1)', () => {
    const next = run(createInitialState(), {
      type: 'CREATE_TASK',
      title: 'Dated',
      dueDate: DATE_MID,
      priority: 'high',
    });

    expect(next.tasks[0]).toMatchObject({ dueDate: DATE_MID, priority: 'high' });
  });

  it('accepts a title-only task (AC-001.5, AC-002.2, AC-003.2)', () => {
    const next = run(createInitialState(), create('Title only'));

    expect(next.tasks[0]).toMatchObject({ dueDate: null, priority: null });
  });

  it('stores the trimmed title but preserves interior spacing (AC-001.4)', () => {
    const next = run(createInitialState(), create('  Call  the   dentist  '));

    expect(next.tasks[0]?.title).toBe('Call  the   dentist');
  });

  it('appends, leaving existing tasks untouched', () => {
    const start = withTasks(makeTask({ id: 'existing' }));

    const next = run(start, create('New'));

    expect(idsOf(next.tasks)).toEqual(['existing', IDENTITY.id]);
    expect(next.tasks[0]).toBe(start.tasks[0]);
  });

  it('does not sort — insertion order is preserved (ADR-0007)', () => {
    // Display order is derived at render. If the reducer sorted, the
    // comparator's createdAt tie-break would lose its meaning.
    const start = withTasks(makeTask({ id: 'later', dueDate: DATE_LATE, createdAt: T0 }));

    const next = run(start, create('Earlier', DATE_EARLY));

    expect(idsOf(next.tasks)).toEqual(['later', IDENTITY.id]);
  });

  it('clears a previous validation message on success (AC-009.5)', () => {
    const afterFailure = run(createInitialState(), create(''));
    expect(afterFailure.formError).toBe(EMPTY_TITLE_MESSAGE);

    const afterSuccess = run(afterFailure, create('Now valid'));

    expect(afterSuccess.formError).toBeNull();
    expect(afterSuccess.tasks).toHaveLength(1);
  });

  it('lets two tasks with identical titles coexist (AC-001.6)', () => {
    let state = reduce(createInitialState(), create('Buy milk'), { id: 'one', createdAt: T0 });
    state = reduce(state, create('Buy milk'), { id: 'two', createdAt: T0 + 1 });

    expect(state.tasks).toHaveLength(2);
    expect(idsOf(state.tasks)).toEqual(['one', 'two']);
  });
});

describe('CREATE_TASK — rejection (AC-009.1, AC-009.4)', () => {
  it.each(emptyishTitles)('creates nothing for the empty-ish title %j', (title) => {
    const next = run(createInitialState(), {
      type: 'CREATE_TASK',
      title,
      dueDate: null,
      priority: null,
    });

    expect(next.tasks).toEqual([]);
  });

  it('sets formError with the validation message', () => {
    const next = run(createInitialState(), {
      type: 'CREATE_TASK',
      title: '   ',
      dueDate: null,
      priority: null,
    });

    expect(next.formError).toBe(EMPTY_TITLE_MESSAGE);
  });

  it('cannot be bypassed by dispatching directly (architecture §3.2)', () => {
    // Validation lives in the reducer, not the form. There is no path into
    // state that skips it — which is what makes AC-009.1 structural.
    const store = createStore({ newId: () => 'x', now: () => T0 });

    store.dispatch({ type: 'CREATE_TASK', title: '', dueDate: null, priority: null });

    expect(store.getState().tasks).toEqual([]);
    expect(store.getState().formError).toBe(EMPTY_TITLE_MESSAGE);
  });

  it('leaves existing tasks completely untouched', () => {
    const start = withTasks(makeTask({ id: 'existing', title: 'Keep me' }));

    const next = run(start, { type: 'CREATE_TASK', title: '', dueDate: null, priority: null });

    expect(next.tasks).toBe(start.tasks);
  });

  it('does not touch editError (AC-005.6 stays independent)', () => {
    const start: AppState = { ...createInitialState(), editError: 'an edit problem' };

    const next = run(start, { type: 'CREATE_TASK', title: '', dueDate: null, priority: null });

    expect(next.editError).toBe('an edit problem');
  });

  it('does not discard the view or edit state (AC-009.3 at state level)', () => {
    // The form holds its own field values, so a rejected submit costs the user
    // nothing. Nothing in state is cleared as a side effect of rejection.
    const start: AppState = { ...createInitialState(), filter: 'completed', editingId: 'e' };

    const next = run(start, { type: 'CREATE_TASK', title: ' ', dueDate: null, priority: null });

    expect(next.filter).toBe('completed');
    expect(next.editingId).toBe('e');
  });
});

// ───────────────────────────── TOGGLE_COMPLETE ────────────────────────────

describe('TOGGLE_COMPLETE', () => {
  const start = withTasks(
    makeTask({ id: 'a', title: 'A', dueDate: DATE_MID, priority: 'high', completed: false }),
  );

  it('marks an active task complete (AC-004.1)', () => {
    expect(run(start, { type: 'TOGGLE_COMPLETE', id: 'a' }).tasks[0]?.completed).toBe(true);
  });

  it('reopens a completed task (AC-004.3)', () => {
    const done = run(start, { type: 'TOGGLE_COMPLETE', id: 'a' });

    expect(run(done, { type: 'TOGGLE_COMPLETE', id: 'a' }).tasks[0]?.completed).toBe(false);
  });

  it('leaves title, due date, and priority unchanged (AC-004.4)', () => {
    const next = run(start, { type: 'TOGGLE_COMPLETE', id: 'a' });

    expect(next.tasks[0]).toMatchObject({ title: 'A', dueDate: DATE_MID, priority: 'high' });
  });

  it('moves the task between the two views (AC-007.4)', () => {
    expect(idsOf(selectVisible(start))).toEqual(['a']);

    const done = run(start, { type: 'TOGGLE_COMPLETE', id: 'a' });

    expect(selectVisible(done)).toEqual([]);
    expect(idsOf(selectVisible({ ...done, filter: 'completed' }))).toEqual(['a']);
  });

  it('changes nothing for an unknown id', () => {
    expect(run(start, { type: 'TOGGLE_COMPLETE', id: 'nope' }).tasks).toEqual(start.tasks);
  });

  it('does not touch view or error state', () => {
    const next = run(start, { type: 'TOGGLE_COMPLETE', id: 'a' });

    expect(next.filter).toBe(start.filter);
    expect(next.formError).toBeNull();
    expect(next.editError).toBeNull();
  });
});

// ───────────────────────────── UPDATE_TASK ────────────────────────────────

describe('UPDATE_TASK — success', () => {
  const start: AppState = {
    ...withTasks(
      makeTask({
        id: 'a',
        title: 'Original',
        dueDate: DATE_MID,
        priority: 'medium',
        completed: false,
        createdAt: T0 + 5,
      }),
    ),
    editingId: 'a',
  };

  const update = (over: Partial<Omit<Action & { type: 'UPDATE_TASK' }, 'type'>> = {}): Action => ({
    type: 'UPDATE_TASK',
    id: 'a',
    title: 'Original',
    dueDate: DATE_MID,
    priority: 'medium',
    ...over,
  });

  it('changes the title (AC-005.1)', () => {
    expect(run(start, update({ title: 'Renamed' })).tasks[0]?.title).toBe('Renamed');
  });

  it('changes all three attributes together (AC-005.2)', () => {
    const next = run(start, update({ title: 'All', dueDate: DATE_LATE, priority: 'low' }));

    expect(next.tasks[0]).toMatchObject({
      title: 'All',
      dueDate: DATE_LATE,
      priority: 'low',
    });
  });

  it('clears a due date (AC-002.5)', () => {
    expect(run(start, update({ dueDate: null })).tasks[0]?.dueDate).toBeNull();
  });

  it('clears a priority (AC-003.5)', () => {
    expect(run(start, update({ priority: null })).tasks[0]?.priority).toBeNull();
  });

  it('keeps a completed task completed (AC-005.7)', () => {
    const done: AppState = withTasks(
      makeTask({ id: 'a', title: 'Done', completed: true, dueDate: null, priority: null }),
    );

    const next = run(done, update({ title: 'Renamed', dueDate: null, priority: null }));

    expect(next.tasks[0]?.completed).toBe(true);
  });

  it('preserves id and createdAt', () => {
    const next = run(start, update({ title: 'Renamed' }));

    expect(next.tasks[0]?.id).toBe('a');
    expect(next.tasks[0]?.createdAt).toBe(T0 + 5);
  });

  it('closes the edit form', () => {
    expect(run(start, update({ title: 'Renamed' })).editingId).toBeNull();
  });

  it('clears any edit validation message', () => {
    const withError: AppState = { ...start, editError: EMPTY_TITLE_MESSAGE };

    expect(run(withError, update({ title: 'Renamed' })).editError).toBeNull();
  });

  it('re-sorts the derived view when the due date changes (AC-005.4, AC-010.4)', () => {
    const two: AppState = withTasks(
      makeTask({ id: 'a', dueDate: DATE_EARLY, createdAt: T0 + 1 }),
      makeTask({ id: 'b', dueDate: DATE_MID, createdAt: T0 + 2 }),
    );
    expect(idsOf(selectVisible(two))).toEqual(['a', 'b']);

    const next = run(two, {
      type: 'UPDATE_TASK',
      id: 'a',
      title: 'A',
      dueDate: DATE_LATE,
      priority: null,
    });

    expect(idsOf(selectVisible(next))).toEqual(['b', 'a']);
  });

  it('changes nothing for an unknown id', () => {
    const next = run(start, update({ id: 'nope', title: 'Renamed' }));

    expect(next.tasks[0]?.title).toBe('Original');
  });
});

describe('UPDATE_TASK — rejection (AC-005.6)', () => {
  const start: AppState = {
    ...withTasks(makeTask({ id: 'a', title: 'Original', dueDate: DATE_MID, priority: 'high' })),
    editingId: 'a',
  };

  it.each(emptyishTitles)('rejects the empty-ish title %j', (title) => {
    const next = run(start, {
      type: 'UPDATE_TASK',
      id: 'a',
      title,
      dueDate: DATE_MID,
      priority: 'high',
    });

    expect(next.tasks[0]?.title).toBe('Original');
  });

  it('sets editError and leaves the previous title intact', () => {
    const next = run(start, {
      type: 'UPDATE_TASK',
      id: 'a',
      title: '   ',
      dueDate: DATE_MID,
      priority: 'high',
    });

    expect(next.editError).toBe(EMPTY_TITLE_MESSAGE);
    expect(next.tasks[0]?.title).toBe('Original');
  });

  it('keeps the edit form OPEN so the user does not lose their work', () => {
    const next = run(start, {
      type: 'UPDATE_TASK',
      id: 'a',
      title: '',
      dueDate: DATE_MID,
      priority: 'high',
    });

    expect(next.editingId).toBe('a');
  });

  it('discards no other attribute of the task', () => {
    const next = run(start, {
      type: 'UPDATE_TASK',
      id: 'a',
      title: '',
      dueDate: null,
      priority: null,
    });

    // The whole edit is rejected, not partly applied.
    expect(next.tasks[0]).toMatchObject({ dueDate: DATE_MID, priority: 'high' });
  });

  it('leaves the task array untouched by reference', () => {
    const next = run(start, {
      type: 'UPDATE_TASK',
      id: 'a',
      title: ' ',
      dueDate: null,
      priority: null,
    });

    expect(next.tasks).toBe(start.tasks);
  });

  it('does not touch formError', () => {
    const withForm: AppState = { ...start, formError: 'a create problem' };

    const next = run(withForm, {
      type: 'UPDATE_TASK',
      id: 'a',
      title: '',
      dueDate: null,
      priority: null,
    });

    expect(next.formError).toBe('a create problem');
  });

  it('shares one validation rule with creation (architecture §6.1)', () => {
    const createRejected = run(createInitialState(), {
      type: 'CREATE_TASK',
      title: '  ',
      dueDate: null,
      priority: null,
    });
    const updateRejected = run(start, {
      type: 'UPDATE_TASK',
      id: 'a',
      title: '  ',
      dueDate: null,
      priority: null,
    });

    expect(createRejected.formError).toBe(updateRejected.editError);
  });
});

// ───────────────────────────── DELETE_TASK ────────────────────────────────

describe('DELETE_TASK', () => {
  const start = withTasks(
    makeTask({ id: 'a', createdAt: T0 + 1 }),
    makeTask({ id: 'b', createdAt: T0 + 2 }),
    makeTask({ id: 'c', completed: true, createdAt: T0 + 3 }),
  );

  it('removes the task', () => {
    expect(idsOf(run(start, { type: 'DELETE_TASK', id: 'b' }).tasks)).toEqual(['a', 'c']);
  });

  it('removes it from both views (AC-006.2)', () => {
    const next = run(start, { type: 'DELETE_TASK', id: 'c' });

    expect(idsOf(selectVisible(next))).not.toContain('c');
    expect(idsOf(selectVisible({ ...next, filter: 'completed' }))).not.toContain('c');
  });

  it('deletes a completed task on the same terms (AC-006.5)', () => {
    expect(idsOf(run(start, { type: 'DELETE_TASK', id: 'c' }).tasks)).toEqual(['a', 'b']);
  });

  it('leaves other tasks unaffected in content and order (AC-006.4)', () => {
    const next = run(start, { type: 'DELETE_TASK', id: 'b' });

    expect(next.tasks[0]).toBe(start.tasks[0]);
    expect(next.tasks[1]).toBe(start.tasks[2]);
  });

  it('empties the list when the last task goes (AC-006.6)', () => {
    const single = withTasks(makeTask({ id: 'only' }));

    expect(run(single, { type: 'DELETE_TASK', id: 'only' }).tasks).toEqual([]);
  });

  it('applies immediately, with no confirmation state (OQ-04)', () => {
    // No pending-delete flag, no two-phase commit — one action, gone.
    const next = run(start, { type: 'DELETE_TASK', id: 'a' });

    expect(idsOf(next.tasks)).not.toContain('a');
    expect(Object.keys(next).sort()).toEqual(Object.keys(start).sort());
  });

  it('closes the edit form when the edited task is deleted', () => {
    // Otherwise editingId would point at a task that no longer exists and the
    // UI would be stranded in edit mode over nothing.
    const editing: AppState = { ...start, editingId: 'b', editError: EMPTY_TITLE_MESSAGE };

    const next = run(editing, { type: 'DELETE_TASK', id: 'b' });

    expect(next.editingId).toBeNull();
    expect(next.editError).toBeNull();
  });

  it('leaves an unrelated edit in progress alone', () => {
    const editing: AppState = { ...start, editingId: 'a' };

    expect(run(editing, { type: 'DELETE_TASK', id: 'b' }).editingId).toBe('a');
  });

  it('changes nothing for an unknown id', () => {
    expect(run(start, { type: 'DELETE_TASK', id: 'nope' }).tasks).toEqual(start.tasks);
  });
});

// ────────────────────────────── SET_FILTER ────────────────────────────────

describe('SET_FILTER', () => {
  const start = withTasks(
    makeTask({ id: 'active-1', completed: false, createdAt: T0 + 1 }),
    makeTask({ id: 'done-1', completed: true, createdAt: T0 + 2 }),
  );

  it('switches to the completed view (AC-007.2)', () => {
    expect(run(start, { type: 'SET_FILTER', filter: 'completed' }).filter).toBe('completed');
  });

  it('switches back to the active view (AC-007.1)', () => {
    const completed = run(start, { type: 'SET_FILTER', filter: 'completed' });

    expect(run(completed, { type: 'SET_FILTER', filter: 'active' }).filter).toBe('active');
  });

  it('selects only that view in the derived list (AC-007.1, AC-007.3)', () => {
    expect(idsOf(selectVisible(start))).toEqual(['active-1']);

    const completed = run(start, { type: 'SET_FILTER', filter: 'completed' });

    expect(idsOf(selectVisible(completed))).toEqual(['done-1']);
  });

  it('does NOT touch tasks', () => {
    const next = run(start, { type: 'SET_FILTER', filter: 'completed' });

    expect(next.tasks).toBe(start.tasks);
  });

  it('does not touch edit or error state', () => {
    const busy: AppState = { ...start, editingId: 'active-1', formError: 'x', editError: 'y' };

    const next = run(busy, { type: 'SET_FILTER', filter: 'completed' });

    expect(next.editingId).toBe('active-1');
    expect(next.formError).toBe('x');
    expect(next.editError).toBe('y');
  });

  it('setting the same filter twice is a no-op in effect', () => {
    const once = run(start, { type: 'SET_FILTER', filter: 'active' });

    expect(once.filter).toBe('active');
    expect(once.tasks).toBe(start.tasks);
  });
});

// ──────────────────────── BEGIN_EDIT / CANCEL_EDIT ────────────────────────

describe('BEGIN_EDIT and CANCEL_EDIT', () => {
  const start = withTasks(makeTask({ id: 'a', title: 'A' }), makeTask({ id: 'b', title: 'B' }));

  it('BEGIN_EDIT records which task is being edited', () => {
    expect(run(start, { type: 'BEGIN_EDIT', id: 'a' }).editingId).toBe('a');
  });

  it('BEGIN_EDIT changes no task data', () => {
    const next = run(start, { type: 'BEGIN_EDIT', id: 'a' });

    expect(next.tasks).toBe(start.tasks);
  });

  it('BEGIN_EDIT clears a stale message from a previous edit', () => {
    const stale: AppState = { ...start, editingId: 'b', editError: EMPTY_TITLE_MESSAGE };

    const next = run(stale, { type: 'BEGIN_EDIT', id: 'a' });

    expect(next.editingId).toBe('a');
    expect(next.editError).toBeNull();
  });

  it('BEGIN_EDIT on a different task replaces the previous one', () => {
    const editingA = run(start, { type: 'BEGIN_EDIT', id: 'a' });

    expect(run(editingA, { type: 'BEGIN_EDIT', id: 'b' }).editingId).toBe('b');
  });

  it('CANCEL_EDIT closes the form', () => {
    const editing = run(start, { type: 'BEGIN_EDIT', id: 'a' });

    expect(run(editing, { type: 'CANCEL_EDIT' }).editingId).toBeNull();
  });

  it('CANCEL_EDIT discards the in-progress edit without touching the task', () => {
    const editing: AppState = { ...start, editingId: 'a', editError: EMPTY_TITLE_MESSAGE };

    const next = run(editing, { type: 'CANCEL_EDIT' });

    expect(next.tasks).toBe(start.tasks);
    expect(next.editError).toBeNull();
  });

  it('CANCEL_EDIT when nothing is being edited is harmless', () => {
    expect(run(start, { type: 'CANCEL_EDIT' }).editingId).toBeNull();
  });

  it('neither touches formError', () => {
    const withForm: AppState = { ...start, formError: 'a create problem' };

    expect(run(withForm, { type: 'BEGIN_EDIT', id: 'a' }).formError).toBe('a create problem');
    expect(run(withForm, { type: 'CANCEL_EDIT' }).formError).toBe('a create problem');
  });
});

// ───────────────────────────── reducer purity ─────────────────────────────

describe('reduce — purity (T-302 DoD)', () => {
  const everyAction: Action[] = [
    { type: 'LOAD', tasks: [makeTask({ id: 'loaded' })], storageOk: true },
    { type: 'CREATE_TASK', title: 'New', dueDate: DATE_MID, priority: 'low' },
    { type: 'CREATE_TASK', title: '', dueDate: null, priority: null },
    { type: 'TOGGLE_COMPLETE', id: 'a' },
    { type: 'UPDATE_TASK', id: 'a', title: 'Renamed', dueDate: null, priority: 'high' },
    { type: 'UPDATE_TASK', id: 'a', title: '', dueDate: null, priority: null },
    { type: 'DELETE_TASK', id: 'a' },
    { type: 'SET_FILTER', filter: 'completed' },
    { type: 'BEGIN_EDIT', id: 'a' },
    { type: 'CANCEL_EDIT' },
  ];

  it.each(everyAction.map((a, i) => [i, a.type, a] as const))(
    'action #%i (%s) does not mutate the state it is given',
    (_i, _type, action) => {
      const state: AppState = {
        ...withTasks(makeTask({ id: 'a', title: 'A', dueDate: DATE_MID, priority: 'medium' })),
        editingId: 'a',
      };
      const before = structuredClone(state);

      reduce(state, action, IDENTITY);

      expect(state).toEqual(before);
    },
  );

  it.each(everyAction.map((a, i) => [i, a.type, a] as const))(
    'action #%i (%s) is deterministic for a fixed identity',
    (_i, _type, action) => {
      const state = withTasks(makeTask({ id: 'a', title: 'A' }));

      expect(reduce(state, action, IDENTITY)).toEqual(reduce(state, action, IDENTITY));
    },
  );

  it('always returns a state with the same six fields', () => {
    const state = withTasks(makeTask({ id: 'a' }));

    for (const action of everyAction) {
      expect(Object.keys(reduce(state, action, IDENTITY)).sort()).toEqual(
        ['editError', 'editingId', 'filter', 'formError', 'storageOk', 'tasks'].sort(),
      );
    }
  });

  it('never returns the same state object it was given', () => {
    const state = withTasks(makeTask({ id: 'a' }));

    for (const action of everyAction) {
      expect(reduce(state, action, IDENTITY)).not.toBe(state);
    }
  });
});

// ───────────────────────────── store mechanics ────────────────────────────

describe('createStore', () => {
  const deterministic = () => {
    let n = 0;
    return createStore({
      newId: () => {
        n += 1;
        return 'id-' + n;
      },
      now: () => T0 + n,
    });
  };

  it('starts from the initial state', () => {
    expect(createStore().getState()).toEqual(createInitialState());
  });

  it('applies actions through dispatch', () => {
    const store = deterministic();

    store.dispatch({ type: 'CREATE_TASK', title: 'Buy milk', dueDate: null, priority: null });

    expect(store.getState().tasks).toHaveLength(1);
    expect(store.getState().tasks[0]?.title).toBe('Buy milk');
  });

  it('supplies a fresh id and timestamp to each created task', () => {
    // The P1 note made concrete: the STORE provides the real identity values,
    // keeping core/ free of crypto and the clock.
    const store = deterministic();

    store.dispatch({ type: 'CREATE_TASK', title: 'One', dueDate: null, priority: null });
    store.dispatch({ type: 'CREATE_TASK', title: 'Two', dueDate: null, priority: null });

    const ids = idsOf(store.getState().tasks);

    expect(new Set(ids).size).toBe(2);
  });

  it('generates real unique ids with the default dependencies', () => {
    const store = createStore();

    for (const title of ['a', 'b', 'c']) {
      store.dispatch({ type: 'CREATE_TASK', title, dueDate: null, priority: null });
    }

    const tasks = store.getState().tasks;

    expect(new Set(idsOf(tasks)).size).toBe(3);
    expect(tasks.every((t) => t.id.length > 0)).toBe(true);
    expect(tasks.every((t) => Number.isFinite(t.createdAt) && t.createdAt > 0)).toBe(true);
  });

  it('notifies subscribers once per dispatch', () => {
    const store = deterministic();
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
    expect(listener).toHaveBeenCalledTimes(1);

    store.dispatch({ type: 'SET_FILTER', filter: 'active' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('notifies even when an action changed nothing', () => {
    const store = deterministic();
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: 'DELETE_TASK', id: 'does-not-exist' });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies every subscriber', () => {
    const store = deterministic();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);

    store.dispatch({ type: 'CANCEL_EDIT' });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('notifies AFTER state has been updated', () => {
    const store = deterministic();
    let seen: number | null = null;
    store.subscribe(() => {
      seen = store.getState().tasks.length;
    });

    store.dispatch({ type: 'CREATE_TASK', title: 'Buy milk', dueDate: null, priority: null });

    expect(seen).toBe(1);
  });

  it('stops notifying after unsubscribe', () => {
    const store = deterministic();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch({ type: 'CANCEL_EDIT' });
    unsubscribe();
    store.dispatch({ type: 'CANCEL_EDIT' });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tolerates unsubscribing twice', () => {
    const store = deterministic();
    const unsubscribe = store.subscribe(vi.fn());

    unsubscribe();

    expect(() => unsubscribe()).not.toThrow();
  });

  it('tolerates a listener unsubscribing during notification', () => {
    // The listener set is copied before iterating, so mutating it mid-pass
    // cannot skip or duplicate a listener.
    const store = deterministic();
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(() => unsubscribeFirst());
    store.subscribe(second);

    expect(() => store.dispatch({ type: 'CANCEL_EDIT' })).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not mutate a previously returned state object', () => {
    const store = deterministic();
    store.dispatch({ type: 'CREATE_TASK', title: 'First', dueDate: null, priority: null });
    const snapshot = store.getState();
    const cloned = structuredClone(snapshot);

    store.dispatch({ type: 'CREATE_TASK', title: 'Second', dueDate: null, priority: null });

    expect(snapshot).toEqual(cloned);
    expect(store.getState()).not.toBe(snapshot);
  });

  it('keeps separate stores independent', () => {
    const a = deterministic();
    const b = deterministic();

    a.dispatch({ type: 'CREATE_TASK', title: 'Only in A', dueDate: null, priority: null });

    expect(b.getState().tasks).toEqual([]);
  });
});

// ───────────────────────── selectVisible integration ──────────────────────

describe('selectVisible', () => {
  it('derives the current view in FR-010 order (AC-007.7, AC-010.5)', () => {
    const state = withTasks(
      makeTask({ id: 'undated', dueDate: null, createdAt: T0 + 1 }),
      makeTask({ id: 'late', dueDate: DATE_LATE, createdAt: T0 + 2 }),
      makeTask({ id: 'early', dueDate: DATE_EARLY, createdAt: T0 + 3 }),
    );

    expect(idsOf(selectVisible(state))).toEqual(['early', 'late', 'undated']);
  });

  it('places a newly created task in sorted position, not last (AC-010.3)', () => {
    const store = createStore({ newId: () => 'new', now: () => T0 + 999 });
    store.dispatch({ type: 'LOAD', tasks: [makeTask({ id: 'existing', dueDate: DATE_LATE })], storageOk: true });

    store.dispatch({ type: 'CREATE_TASK', title: 'Sooner', dueDate: DATE_EARLY, priority: null });

    expect(idsOf(selectVisible(store.getState()))).toEqual(['new', 'existing']);
  });

  it('returns an empty list for an empty view (AC-007.5 data side)', () => {
    const state: AppState = { ...withTasks(makeTask({ id: 'a' })), filter: 'completed' };

    expect(selectVisible(state)).toEqual([]);
  });

  it('never writes the derived order back into state (ADR-0007)', () => {
    const state = withTasks(
      makeTask({ id: 'b', dueDate: DATE_LATE, createdAt: T0 + 1 }),
      makeTask({ id: 'a', dueDate: DATE_EARLY, createdAt: T0 + 2 }),
    );

    selectVisible(state);

    expect(idsOf(state.tasks)).toEqual(['b', 'a']);
  });
});
