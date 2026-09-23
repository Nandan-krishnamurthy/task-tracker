import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '../../src/core/types';
import type { Store } from '../../src/store/store';
import { createStore } from '../../src/store/store';
import { mountApp } from '../../src/ui/app';
import type { AppHandle } from '../../src/ui/app';
import { DATE_EARLY, DATE_LATE, DATE_MID, T0, makeTask } from '../support/fixtures';
import { mountPageSkeleton } from '../support/page';

/**
 * T-408 verification — render composition.
 *
 * Traceability: architecture §4.2, §4.3, §9.4.
 *
 * This is the first point at which the whole interface exists, so the suite
 * also walks the parts of journeys J1–J3 that only appear once the pieces are
 * wired together — a created task landing in its sorted position, focus
 * surviving a toggle, an edit round trip.
 */

let root: HTMLElement;
let store: Store;
let app: AppHandle;

function mount(tasks: readonly Task[] = []): void {
  root = mountPageSkeleton();
  store = createStore({
    newId: () => `new-${store.getState().tasks.length + 1}`,
    now: () => T0 + 1000 + store.getState().tasks.length,
    persist: () => true,
  });
  store.dispatch({ type: 'LOAD', tasks: [...tasks], storageOk: true });

  app = mountApp(store, root);
}

const q = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
const titleInput = (): HTMLInputElement => q<HTMLInputElement>('#create-title');
const createForm = (): HTMLFormElement => q<HTMLFormElement>('form.task-form');
const rowFor = (id: string): HTMLElement => q<HTMLElement>(`li[data-task-id="${id}"]`);
const titles = (): string[] =>
  [...root.querySelectorAll('.task__title')].map((el) => el.textContent ?? '');
const focusKey = (): string | null => document.activeElement?.getAttribute('data-focus-key') ?? null;

beforeEach(() => mount());

// ──────────────────────────────── composition ─────────────────────────────

describe('composition (architecture §4.2)', () => {
  it('mounts each module into its own region', () => {
    expect(q('[data-region="form"] form.task-form')).not.toBeNull();
    expect(q('[data-region="filter"] .filter-bar')).not.toBeNull();
    expect(q('[data-region="list"] .task-list-region')).not.toBeNull();
  });

  it('refuses to mount against a page with no regions', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const bare = document.getElementById('app')!;

    expect(() => mountApp(createStore({ persist: () => true }), bare)).toThrow(/data-region/);
  });

  it('reads no storage of its own (ADR-0001)', () => {
    // Storage is read once, in src/main.ts. If ui/app.ts reached for it, the
    // no-crash guarantee would no longer be confined to one reviewable file.
    const spy = vi.spyOn(Storage.prototype, 'getItem');

    mount([makeTask({ id: 'a', title: 'One' })]);
    store.dispatch({ type: 'CREATE_TASK', title: 'Two', dueDate: null, priority: null });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('renders the initial state without a dispatch', () => {
    mount([makeTask({ id: 'a', title: 'Already here' })]);

    expect(titles()).toEqual(['Already here']);
  });

  it('does not steal focus on the first paint', () => {
    mount([makeTask({ id: 'a', title: 'One' })]);

    expect(document.activeElement).toBe(document.body);
  });
});

// ──────────────────────────── one render per dispatch ─────────────────────

describe('render cadence (architecture §4.3)', () => {
  it('renders exactly once per dispatch', () => {
    // The list is the only region rebuilt, and it is built by creating one
    // <ul>. Counting those creations across a single dispatch counts renders
    // directly rather than inferring them from a side effect.
    mount();
    const created: string[] = [];
    const realCreateElement = document.createElement.bind(document);
    const spy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string, options?: ElementCreationOptions) => {
        created.push(tag);
        return realCreateElement(tag, options);
      });

    try {
      store.dispatch({ type: 'CREATE_TASK', title: 'One', dueDate: null, priority: null });
      expect(created.filter((tag) => tag === 'ul')).toHaveLength(1);

      created.length = 0;
      store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
      // The completed view is empty, so this render builds the empty state
      // instead of a <ul> — still exactly one render.
      expect(created.filter((tag) => tag === 'ul')).toHaveLength(0);
      expect(created.filter((tag) => tag === 'p')).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }

    expect(root.querySelectorAll('.task-list-region > ul')).toHaveLength(0);
  });

  it('keeps the form and filter bar across renders — they are never rebuilt', () => {
    const form = createForm();
    const bar = q('.filter-bar');

    store.dispatch({ type: 'CREATE_TASK', title: 'One', dueDate: null, priority: null });
    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
    store.dispatch({ type: 'SET_FILTER', filter: 'active' });

    expect(createForm()).toBe(form);
    expect(q('.filter-bar')).toBe(bar);
  });

  it('keeps the create form’s contents across a list rebuild', () => {
    // The user is mid-way through typing a second task while the first one is
    // being toggled. Rebuilding the form would discard what they had typed.
    mount([makeTask({ id: 'a', title: 'One' })]);
    titleInput().value = 'Half-typed';

    store.dispatch({ type: 'TOGGLE_COMPLETE', id: 'a' });

    expect(titleInput().value).toBe('Half-typed');
  });

  it('leaves no orphaned listeners after repeated rebuilds', () => {
    mount([makeTask({ id: 'a', title: 'One' }), makeTask({ id: 'b', title: 'Two' })]);

    for (let i = 0; i < 30; i += 1) {
      store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
      store.dispatch({ type: 'SET_FILTER', filter: 'active' });
    }

    rowFor('a').querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();

    // A per-row listener would have accumulated thirty deep and this would
    // have dispatched thirty deletes — visible here as an error or as both
    // tasks gone. Exactly one task is removed.
    expect(store.getState().tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('detaches cleanly on unmount', () => {
    mount([makeTask({ id: 'a', title: 'One' })]);
    app.unmount();

    store.dispatch({ type: 'CREATE_TASK', title: 'Two', dueDate: null, priority: null });

    expect(root.querySelector('.task-list-region')).toBeNull();
    expect(root.querySelector('form.task-form')).toBeNull();
  });
});

// ───────────────────────── focus across the cycle ─────────────────────────

describe('focus survives a full render cycle (§9.4, AC-A11Y.3)', () => {
  beforeEach(() =>
    mount([
      makeTask({ id: 'a', title: 'One', dueDate: DATE_EARLY, createdAt: T0 }),
      makeTask({ id: 'b', title: 'Two', dueDate: DATE_MID, createdAt: T0 + 1 }),
      makeTask({ id: 'c', title: 'Three', dueDate: DATE_LATE, createdAt: T0 + 2 }),
    ]),
  );

  it('stays on the Edit button of an untouched task after another is deleted', () => {
    rowFor('c').querySelector<HTMLButtonElement>('[data-action="edit"]')!.focus();
    expect(focusKey()).toBe('task:c:edit');

    rowFor('a').querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();

    expect(focusKey()).toBe('task:c:edit');
    expect(document.activeElement).not.toBe(document.body);
  });

  it('moves to the next task when the focused one is deleted', () => {
    const deleteB = rowFor('b').querySelector<HTMLButtonElement>('[data-action="delete"]')!;
    deleteB.focus();
    deleteB.click();

    expect(focusKey()).toBe('task:c:delete');
  });

  it('moves to the title input when the last task is deleted', () => {
    mount([makeTask({ id: 'only', title: 'The only one' })]);
    const button = rowFor('only').querySelector<HTMLButtonElement>('[data-action="delete"]')!;
    button.focus();
    button.click();

    expect(document.activeElement).toBe(titleInput());
  });

  it('never leaves focus on the body after a toggle moves a task out of view', () => {
    const toggle = rowFor('b').querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    toggle.focus();
    toggle.click();

    expect(document.activeElement).not.toBe(document.body);
    expect(focusKey()).not.toBeNull();
  });

  it('keeps the filter button focused after switching views', () => {
    const button = q<HTMLButtonElement>('[data-focus-key="filter:completed"]');
    button.focus();
    button.click();

    expect(document.activeElement).toBe(button);
  });

  it('moves into the edit title field when an edit begins (§9.4 row 3)', () => {
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();

    expect(focusKey()).toBe('task:b:edit-title');
  });

  it('returns to the Edit button when an edit is saved (§9.4 row 4)', () => {
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    rowFor('b').querySelector<HTMLFormElement>('form')!.requestSubmit();

    expect(focusKey()).toBe('task:b:edit');
  });

  it('returns to the Edit button when an edit is cancelled (§9.4 row 4)', () => {
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="cancel-edit"]')!.click();

    expect(focusKey()).toBe('task:b:edit');
  });

  it('stays in the edit form when a save is rejected', () => {
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    const field = rowFor('b').querySelector<HTMLInputElement>('input[type="text"]')!;
    field.value = '';
    rowFor('b').querySelector<HTMLFormElement>('form')!.requestSubmit();

    expect(document.activeElement).not.toBe(document.body);
    expect(rowFor('b').contains(document.activeElement)).toBe(true);
  });

  it('preserves the text cursor in the edit title field across a rebuild', () => {
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    const field = rowFor('b').querySelector<HTMLInputElement>('input[type="text"]')!;
    field.focus();
    field.setSelectionRange(1, 2);

    // Any dispatch rebuilds the list underneath the open editor.
    store.dispatch({ type: 'SET_FILTER', filter: 'active' });

    const after = rowFor('b').querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(document.activeElement).toBe(after);
    expect(after.selectionStart).toBe(1);
    expect(after.selectionEnd).toBe(2);
  });

  it('returns focus to the title input after a task is created (§9.4 row 5)', () => {
    titleInput().value = 'Another task';
    titleInput().focus();
    createForm().requestSubmit();

    expect(document.activeElement).toBe(titleInput());
  });

  it('keeps focus on the Add button reachable after a rejected create', () => {
    const submit = q<HTMLButtonElement>('[data-focus-key="form:submit"]');
    submit.focus();
    createForm().requestSubmit();

    expect(document.activeElement).toBe(submit);
  });
});

// ───────────────────── journeys, now that the parts exist ─────────────────

describe('the journeys the composed app makes walkable', () => {
  it('J1: create a task and see it in its sorted position (AC-010.3)', () => {
    mount([makeTask({ id: 'late', title: 'Later', dueDate: DATE_LATE, createdAt: T0 })]);

    titleInput().value = 'Sooner';
    q<HTMLInputElement>('#create-due').value = DATE_EARLY;
    q<HTMLSelectElement>('#create-priority').value = 'high';
    createForm().requestSubmit();

    expect(titles()).toEqual(['Sooner', 'Later']);
    expect(root.textContent).toContain('High');
  });

  it('J2: complete a task and find it in the completed view (AC-004.2)', () => {
    mount([makeTask({ id: 'a', title: 'Buy milk' })]);

    rowFor('a').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    expect(titles()).toEqual([]);

    q<HTMLButtonElement>('[data-focus-key="filter:completed"]').click();
    expect(titles()).toEqual(['Buy milk']);
    expect(rowFor('a').textContent).toContain('Completed');
  });

  it('J3: edit a task, then delete it (AC-005.1, AC-006.2)', () => {
    mount([makeTask({ id: 'a', title: 'Buy milk' })]);

    rowFor('a').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    rowFor('a').querySelector<HTMLInputElement>('input[type="text"]')!.value = 'Buy oat milk';
    rowFor('a').querySelector<HTMLFormElement>('form')!.requestSubmit();

    expect(titles()).toEqual(['Buy oat milk']);

    rowFor('a').querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();

    expect(titles()).toEqual([]);
    q<HTMLButtonElement>('[data-focus-key="filter:completed"]').click();
    expect(titles()).toEqual([]);
  });

  it('reflects a rejected create in the form without disturbing the list', () => {
    mount([makeTask({ id: 'a', title: 'Buy milk' })]);

    createForm().requestSubmit();

    expect(titles()).toEqual(['Buy milk']);
    expect(q('#create-error').textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
