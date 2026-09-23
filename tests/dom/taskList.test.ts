import { beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '../../src/core/types';
import type { Store } from '../../src/store/store';
import { createStore } from '../../src/store/store';
import { createTaskList } from '../../src/ui/taskList';
import type { TaskListHandle } from '../../src/ui/taskList';
import { DATE_EARLY, DATE_LATE, DATE_MID, DATE_PAST, T0, makeTask } from '../support/fixtures';
import { mountPageSkeleton, regionOf } from '../support/page';

/**
 * T-407 verification — the list region.
 *
 * Traceability: FR-007, FR-010.
 * Acceptance criteria: AC-006.2, AC-006.6, AC-007.5, AC-007.7, AC-010.3,
 * AC-010.4, AC-010.5.
 *
 * The ordering rules themselves are proven exhaustively against the pure
 * comparator in `tests/unit/sort.test.ts`. What is tested here is that the
 * rendered DOM actually reflects them — that the list is built from the
 * selector and not from insertion order.
 */

let root: HTMLElement;
let store: Store;
let list: TaskListHandle;

function mount(tasks: readonly Task[] = []): void {
  root = mountPageSkeleton();
  store = createStore({
    newId: () => `new-${store.getState().tasks.length + 1}`,
    now: () => T0 + store.getState().tasks.length,
    persist: () => true,
  });
  store.dispatch({ type: 'LOAD', tasks: [...tasks], storageOk: true });

  list = createTaskList(store);
  store.subscribe(() => list.update(store.getState()));
  list.update(store.getState());

  regionOf(root, 'list').append(list.element);
}

/** The titles currently rendered, in document order. */
const titles = (): string[] =>
  [...list.element.querySelectorAll('.task__title')].map((el) => el.textContent ?? '');

/** The task ids currently rendered, in document order. */
const ids = (): string[] =>
  [...list.element.querySelectorAll('li[data-task-id]')].map(
    (el) => el.getAttribute('data-task-id') ?? '',
  );

const emptyState = (): HTMLElement | null => list.element.querySelector('.empty-state');

beforeEach(() => mount());

// ─────────────────────────────── structure ────────────────────────────────

describe('list structure (architecture §9.1)', () => {
  it('renders a <ul> of <li>, so position and length are announced', () => {
    mount([makeTask({ id: 'a', title: 'One' }), makeTask({ id: 'b', title: 'Two' })]);

    const ul = list.element.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul?.querySelectorAll(':scope > li')).toHaveLength(2);
  });

  it('names the list for the view it is showing', () => {
    mount([makeTask({ id: 'a', title: 'One' })]);
    expect(list.element.querySelector('ul')?.getAttribute('aria-label')).toBe('Active tasks');

    store.dispatch({ type: 'TOGGLE_COMPLETE', id: 'a' });
    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });

    expect(list.element.querySelector('ul')?.getAttribute('aria-label')).toBe('Completed tasks');
  });

  it('paginates nothing — every task in the view is rendered (A-02)', () => {
    mount(Array.from({ length: 120 }, (_u, i) => makeTask({ id: `t${i}`, title: `Task ${i}` })));

    expect(ids()).toHaveLength(120);
  });
});

// ───────────────────────────── the empty state ────────────────────────────

describe('empty states (AC-007.5)', () => {
  it('shows an invitation when there are no active tasks', () => {
    expect(emptyState()).not.toBeNull();
    expect(emptyState()?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('shows a different message for an empty completed view', () => {
    const active = emptyState()?.textContent;
    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });

    expect(emptyState()?.textContent).not.toBe(active);
    expect(emptyState()?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('never renders the empty state as an error', () => {
    for (const filter of ['active', 'completed'] as const) {
      store.dispatch({ type: 'SET_FILTER', filter });
      const text = (emptyState()?.textContent ?? '').toLowerCase();

      expect(text).not.toContain('error');
      expect(text).not.toContain('failed');
    }
  });

  it('shows the empty state for a view whose tasks are all in the other one', () => {
    mount([makeTask({ id: 'a', title: 'One', completed: true })]);

    // Active view: the only task is completed, so this view is empty.
    expect(emptyState()).not.toBeNull();
    expect(list.element.querySelector('ul')).toBeNull();
  });

  it('renders no <ul> when the view is empty', () => {
    expect(list.element.querySelector('ul')).toBeNull();
  });

  it('leaves an empty list without error when the last task is deleted (AC-006.6)', () => {
    mount([makeTask({ id: 'only', title: 'The only one' })]);
    expect(ids()).toEqual(['only']);

    store.dispatch({ type: 'DELETE_TASK', id: 'only' });

    expect(ids()).toEqual([]);
    expect(emptyState()).not.toBeNull();
  });
});

// ──────────────────────────────── ordering ────────────────────────────────

describe('the rendered order obeys FR-010', () => {
  it('shows dated tasks soonest first (AC-010.1)', () => {
    mount([
      makeTask({ id: 'c', title: 'Late', dueDate: DATE_LATE, createdAt: T0 }),
      makeTask({ id: 'a', title: 'Early', dueDate: DATE_EARLY, createdAt: T0 + 1 }),
      makeTask({ id: 'b', title: 'Mid', dueDate: DATE_MID, createdAt: T0 + 2 }),
    ]);

    expect(titles()).toEqual(['Early', 'Mid', 'Late']);
  });

  it('puts undated tasks after every dated one (AC-010.2)', () => {
    mount([
      makeTask({ id: 'u', title: 'Undated', dueDate: null, createdAt: T0 }),
      makeTask({ id: 'd', title: 'Dated', dueDate: DATE_LATE, createdAt: T0 + 1 }),
    ]);

    expect(titles()).toEqual(['Dated', 'Undated']);
  });

  it('does not special-case an overdue task (AC-010.6)', () => {
    mount([
      makeTask({ id: 'f', title: 'Future', dueDate: DATE_LATE, createdAt: T0 }),
      makeTask({ id: 'o', title: 'Overdue', dueDate: DATE_PAST, createdAt: T0 + 1 }),
    ]);

    expect(titles()).toEqual(['Overdue', 'Future']);
    expect(list.element.textContent?.toLowerCase()).not.toContain('overdue task');
  });

  it('ignores priority when ordering (AC-003.7)', () => {
    mount([
      makeTask({ id: 'lo', title: 'Low first', dueDate: DATE_MID, priority: 'low', createdAt: T0 }),
      makeTask({
        id: 'hi',
        title: 'High second',
        dueDate: DATE_MID,
        priority: 'high',
        createdAt: T0 + 1,
      }),
    ]);

    expect(titles()).toEqual(['Low first', 'High second']);
  });

  it('inserts a new task in its sorted position, not at the end (AC-010.3)', () => {
    mount([
      makeTask({ id: 'a', title: 'Early', dueDate: DATE_EARLY, createdAt: T0 }),
      makeTask({ id: 'c', title: 'Late', dueDate: DATE_LATE, createdAt: T0 + 1 }),
    ]);

    store.dispatch({
      type: 'CREATE_TASK',
      title: 'Middle',
      dueDate: DATE_MID,
      priority: null,
    });

    expect(titles()).toEqual(['Early', 'Middle', 'Late']);
  });

  it('appends a new undated task after the dated ones (AC-010.2, AC-010.3)', () => {
    mount([makeTask({ id: 'a', title: 'Dated', dueDate: DATE_LATE, createdAt: T0 })]);

    store.dispatch({ type: 'CREATE_TASK', title: 'Undated', dueDate: null, priority: null });

    expect(titles()).toEqual(['Dated', 'Undated']);
  });

  it('re-sorts immediately when a due date is edited (AC-010.4)', () => {
    mount([
      makeTask({ id: 'a', title: 'First', dueDate: DATE_EARLY, createdAt: T0 }),
      makeTask({ id: 'b', title: 'Second', dueDate: DATE_MID, createdAt: T0 + 1 }),
    ]);
    expect(titles()).toEqual(['First', 'Second']);

    store.dispatch({
      type: 'UPDATE_TASK',
      id: 'b',
      title: 'Second',
      dueDate: DATE_PAST,
      priority: null,
    });

    expect(titles()).toEqual(['Second', 'First']);
  });

  it('sends a task to the end when its due date is cleared (AC-002.5)', () => {
    mount([
      makeTask({ id: 'a', title: 'First', dueDate: DATE_EARLY, createdAt: T0 }),
      makeTask({ id: 'b', title: 'Second', dueDate: DATE_MID, createdAt: T0 + 1 }),
    ]);

    store.dispatch({ type: 'UPDATE_TASK', id: 'a', title: 'First', dueDate: null, priority: null });

    expect(titles()).toEqual(['Second', 'First']);
  });

  it('applies the same ordering inside the completed view (AC-010.5, AC-007.7)', () => {
    mount([
      makeTask({ id: 'c', title: 'Late', dueDate: DATE_LATE, completed: true, createdAt: T0 }),
      makeTask({ id: 'a', title: 'Early', dueDate: DATE_EARLY, completed: true, createdAt: T0 + 1 }),
      makeTask({ id: 'u', title: 'Undated', dueDate: null, completed: true, createdAt: T0 + 2 }),
    ]);

    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });

    expect(titles()).toEqual(['Early', 'Late', 'Undated']);
  });

  it('caches no order — the same state always renders the same list (AC-010.7)', () => {
    mount([
      makeTask({ id: 'a', title: 'Early', dueDate: DATE_EARLY, createdAt: T0 }),
      makeTask({ id: 'b', title: 'Mid', dueDate: DATE_MID, createdAt: T0 + 1 }),
    ]);
    const first = titles();

    list.update(store.getState());
    list.update(store.getState());

    expect(titles()).toEqual(first);
  });
});

// ──────────────────────────────── filtering ───────────────────────────────

describe('the two views (FR-007)', () => {
  beforeEach(() =>
    mount([
      makeTask({ id: 'a1', title: 'Active one', completed: false, createdAt: T0 }),
      makeTask({ id: 'd1', title: 'Done one', completed: true, createdAt: T0 + 1 }),
      makeTask({ id: 'a2', title: 'Active two', completed: false, createdAt: T0 + 2 }),
    ]),
  );

  it('shows only active tasks in the active view (AC-007.1)', () => {
    expect(titles()).toEqual(['Active one', 'Active two']);
  });

  it('shows only completed tasks in the completed view (AC-007.2)', () => {
    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });

    expect(titles()).toEqual(['Done one']);
  });

  it('moves a task between views the moment it is toggled (AC-007.4)', () => {
    store.dispatch({ type: 'TOGGLE_COMPLETE', id: 'a1' });

    expect(titles()).toEqual(['Active two']);

    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
    expect(titles()).toEqual(['Active one', 'Done one']);
  });

  it('classifies every task into exactly one view (AC-007.3)', () => {
    const active = titles();
    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
    const completed = titles();

    expect([...active, ...completed].sort()).toEqual(['Active one', 'Active two', 'Done one']);
    expect(active.filter((t) => completed.includes(t))).toEqual([]);
  });

  it('removes a deleted task from BOTH views (AC-006.2)', () => {
    store.dispatch({ type: 'DELETE_TASK', id: 'd1' });

    expect(titles()).toEqual(['Active one', 'Active two']);

    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
    expect(titles()).toEqual([]);
    expect(emptyState()).not.toBeNull();
  });

  it('leaves other tasks untouched by a delete (AC-006.4)', () => {
    store.dispatch({ type: 'DELETE_TASK', id: 'a1' });

    expect(titles()).toEqual(['Active two']);
  });
});

// ───────────────────────────── the edit row ───────────────────────────────

describe('the row being edited', () => {
  beforeEach(() => mount([makeTask({ id: 'a', title: 'One' }), makeTask({ id: 'b', title: 'Two' })]));

  it('renders as an editor while the others stay in display mode', () => {
    store.dispatch({ type: 'BEGIN_EDIT', id: 'b' });

    expect(list.element.querySelectorAll('form')).toHaveLength(1);
    expect(list.element.querySelector('[data-task-id="b"] form')).not.toBeNull();
    expect(list.element.querySelector('[data-task-id="a"] form')).toBeNull();
  });

  it('carries the edit validation message into the row', () => {
    store.dispatch({ type: 'BEGIN_EDIT', id: 'b' });
    store.dispatch({ type: 'UPDATE_TASK', id: 'b', title: '  ', dueDate: null, priority: null });

    const message = list.element.querySelector('[data-task-id="b"] .form-error');
    expect(message?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('stays in its sorted position while being edited', () => {
    mount([
      makeTask({ id: 'a', title: 'Early', dueDate: DATE_EARLY, createdAt: T0 }),
      makeTask({ id: 'b', title: 'Late', dueDate: DATE_LATE, createdAt: T0 + 1 }),
    ]);

    store.dispatch({ type: 'BEGIN_EDIT', id: 'a' });

    expect(ids()).toEqual(['a', 'b']);
  });
});

// ─────────────────────────── rebuild discipline ───────────────────────────

describe('rebuild discipline (architecture §4.3)', () => {
  it('keeps the container itself across rebuilds', () => {
    mount([makeTask({ id: 'a', title: 'One' })]);
    const container = list.element;

    store.dispatch({ type: 'CREATE_TASK', title: 'Two', dueDate: null, priority: null });
    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });

    expect(list.element).toBe(container);
    expect(container.isConnected).toBe(true);
  });

  it('accumulates no duplicate rows across many rebuilds', () => {
    mount([makeTask({ id: 'a', title: 'One' })]);

    for (let i = 0; i < 25; i += 1) list.update(store.getState());

    expect(ids()).toEqual(['a']);
    expect(list.element.querySelectorAll('ul')).toHaveLength(1);
  });

  it('dispatches exactly once per click after many rebuilds', () => {
    // The delegated listeners live on the container, so rebuilding the rows
    // cannot multiply them. If they were attached per row, this would fire
    // once per accumulated listener.
    mount([makeTask({ id: 'a', title: 'One' }), makeTask({ id: 'b', title: 'Two' })]);

    for (let i = 0; i < 25; i += 1) list.update(store.getState());

    list.element.querySelector<HTMLButtonElement>('[data-task-id="a"] [data-action="delete"]')!.click();

    expect(store.getState().tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('stops responding after destroy()', () => {
    mount([makeTask({ id: 'a', title: 'One' })]);
    const button = list.element.querySelector<HTMLButtonElement>('[data-action="delete"]')!;

    list.destroy();
    button.click();

    expect(store.getState().tasks.map((t) => t.id)).toEqual(['a']);
    expect(list.element.children).toHaveLength(0);
  });
});
