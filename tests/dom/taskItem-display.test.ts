import { beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '../../src/core/types';
import type { Store } from '../../src/store/store';
import { createStore } from '../../src/store/store';
import { attachTaskActions, renderTaskItem } from '../../src/ui/taskItem';
import { DATE_MID, T0, awkwardTitles, makeTask } from '../support/fixtures';
import { mountPageSkeleton, regionOf, readStylesheetCode } from '../support/page';

/**
 * T-405 verification — the task row in display mode.
 *
 * Traceability: FR-003, FR-004, FR-006.
 * Acceptance criteria: AC-003.6, AC-004.1, AC-004.2, AC-004.3, AC-004.5,
 * AC-004.7, AC-006.1, AC-006.5, AC-A11Y.2.
 */

let root: HTMLElement;
let store: Store;
let list: HTMLUListElement;

/**
 * Mount the given tasks as rows inside a delegating container, the way
 * `ui/taskList.ts` will at T-407. The delegation under test is the real one
 * from `taskItem.ts`, not a stand-in.
 */
function render(tasks: readonly Task[]): void {
  store = createStore({
    newId: () => 'generated',
    now: () => T0,
    persist: () => true,
  });
  store.dispatch({ type: 'LOAD', tasks: [...tasks], storageOk: true });

  const container = regionOf(root, 'list');
  attachTaskActions(container, store);

  list = document.createElement('ul');
  list.className = 'task-list';
  for (const task of tasks) list.append(renderTaskItem(task));
  container.append(list);
}

const rowFor = (id: string): HTMLElement => list.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!;
const control = <T extends Element>(id: string, selector: string): T =>
  rowFor(id).querySelector<T>(selector)!;

beforeEach(() => {
  root = mountPageSkeleton();
});

// ────────────────────────────── what a row shows ──────────────────────────

describe('a display row shows every user-owned attribute', () => {
  const task = makeTask({
    id: 't1',
    title: 'Buy milk',
    dueDate: DATE_MID,
    priority: 'high',
  });

  beforeEach(() => render([task]));

  it('shows the title', () => {
    expect(control(task.id, '.task__title').textContent).toBe('Buy milk');
  });

  it('shows the priority without opening an edit view (AC-003.6)', () => {
    expect(rowFor(task.id).textContent).toContain('High');
  });

  it('shows the due date verbatim, never reformatted (ADR-0005)', () => {
    // Reformatting means parsing, and parsing is how a task due the 15th comes
    // to render as the 14th for a user behind UTC.
    expect(rowFor(task.id).textContent).toContain(DATE_MID);
  });

  it('offers a checkbox, an Edit button and a Delete button', () => {
    expect(control(task.id, 'input[type="checkbox"]')).not.toBeNull();
    expect(control(task.id, '[data-action="edit"]')).not.toBeNull();
    expect(control(task.id, '[data-action="delete"]')).not.toBeNull();
  });

  it('never renders the internal id or createdAt (types.ts)', () => {
    const text = rowFor(task.id).textContent ?? '';

    expect(text).not.toContain(String(T0));
    expect(text).not.toContain('t1');
  });

  it('renders no overdue badge and no confirmation prompt (NG-06, OQ-04)', () => {
    const text = (rowFor(task.id).textContent ?? '').toLowerCase();

    expect(text).not.toContain('overdue');
    expect(text).not.toContain('are you sure');
  });
});

describe('a task with no due date or priority (AC-002.7, AC-003.2)', () => {
  const bare = makeTask({ id: 'bare', title: 'Just a title', dueDate: null, priority: null });

  beforeEach(() => render([bare]));

  it('says so plainly, never as an error', () => {
    const text = rowFor(bare.id).textContent ?? '';

    expect(text).toContain('No due date');
    expect(text).toContain('No priority');
    expect(text.toLowerCase()).not.toContain('error');
    expect(text.toLowerCase()).not.toContain('invalid');
  });
});

describe('titles are rendered as text, never as markup (AC-001.4)', () => {
  it.each(awkwardTitles)('renders %j exactly as entered', (title) => {
    render([makeTask({ id: 'odd', title })]);

    expect(control('odd', '.task__title').textContent).toBe(title);
    // A title containing markup must not have become elements.
    expect(control('odd', '.task__title').querySelector('*')).toBeNull();
  });
});

// ─────────────────────────── accessible names ─────────────────────────────

describe('accessible names identify the task (AC-A11Y.2, architecture §9.2)', () => {
  const task = makeTask({ id: 'named', title: 'Buy milk' });

  beforeEach(() => render([task]));

  it('names the checkbox with the action and the title', () => {
    expect(control(task.id, 'input[type="checkbox"]').getAttribute('aria-label')).toBe(
      'Mark "Buy milk" complete',
    );
  });

  it('names the Edit button with the title', () => {
    expect(control(task.id, '[data-action="edit"]').getAttribute('aria-label')).toBe(
      'Edit "Buy milk"',
    );
  });

  it('names the Delete button with the title', () => {
    expect(control(task.id, '[data-action="delete"]').getAttribute('aria-label')).toBe(
      'Delete "Buy milk"',
    );
  });

  it('names the checkbox for reopening when the task is complete', () => {
    render([makeTask({ id: 'done', title: 'Buy milk', completed: true })]);

    expect(control('done', 'input[type="checkbox"]').getAttribute('aria-label')).toBe(
      'Mark "Buy milk" incomplete',
    );
  });

  it('keeps a real <label> on the checkbox as well (architecture §9.1)', () => {
    const checkbox = control<HTMLInputElement>(task.id, 'input[type="checkbox"]');
    const label = rowFor(task.id).querySelector(`label[for="${checkbox.id}"]`);

    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('Buy milk');
  });

  it('distinguishes two tasks that share a title only by their controls, not their names', () => {
    // AC-001.6 allows duplicate titles; AC-A11Y.2 only asks that the name name
    // the task, which for identical titles is identical text. What must stay
    // distinct is the focus key, which is derived from the id.
    render([
      makeTask({ id: 'dup-1', title: 'Buy milk' }),
      makeTask({ id: 'dup-2', title: 'Buy milk' }),
    ]);

    expect(control('dup-1', '[data-action="delete"]').getAttribute('data-focus-key')).not.toBe(
      control('dup-2', '[data-action="delete"]').getAttribute('data-focus-key'),
    );
  });
});

// ──────────────────────────── focus keys ──────────────────────────────────

describe('focus keys (architecture §4.3)', () => {
  beforeEach(() =>
    render([
      makeTask({ id: 'a', title: 'One' }),
      makeTask({ id: 'b', title: 'Two' }),
      makeTask({ id: 'c', title: 'Three', completed: true }),
    ]),
  );

  it('gives every interactive control a key', () => {
    const controls = [...list.querySelectorAll('button, input, select')];

    expect(controls.length).toBeGreaterThan(0);
    for (const element of controls) {
      expect(element.getAttribute('data-focus-key'), element.outerHTML).toBeTruthy();
    }
  });

  it('makes every key unique across the whole list', () => {
    const keys = [...list.querySelectorAll('[data-focus-key]')].map((el) =>
      el.getAttribute('data-focus-key'),
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('derives the key from the task id, so it survives a rebuild', () => {
    expect(control('b', '[data-action="delete"]').getAttribute('data-focus-key')).toBe(
      'task:b:delete',
    );
  });

  it('marks each row with its task id, for the focus fallback', () => {
    expect([...list.querySelectorAll('li')].map((li) => li.getAttribute('data-task-id'))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

// ──────────────────────────────── behaviour ───────────────────────────────

describe('the checkbox toggles in both directions (FR-004)', () => {
  it('completes an active task (AC-004.1)', () => {
    render([makeTask({ id: 'a', title: 'Buy milk', completed: false })]);

    control<HTMLInputElement>('a', 'input[type="checkbox"]').click();

    expect(store.getState().tasks[0]?.completed).toBe(true);
  });

  it('reopens a completed task (AC-004.3)', () => {
    render([makeTask({ id: 'a', title: 'Buy milk', completed: true })]);

    control<HTMLInputElement>('a', 'input[type="checkbox"]').click();

    expect(store.getState().tasks[0]?.completed).toBe(false);
  });

  it('leaves title, due date and priority untouched (AC-004.4)', () => {
    const task = makeTask({ id: 'a', title: 'Buy milk', dueDate: DATE_MID, priority: 'low' });
    render([task]);

    control<HTMLInputElement>('a', 'input[type="checkbox"]').click();

    expect(store.getState().tasks[0]).toMatchObject({
      title: 'Buy milk',
      dueDate: DATE_MID,
      priority: 'low',
    });
  });

  it('toggles only the task whose checkbox was used', () => {
    render([makeTask({ id: 'a', title: 'One' }), makeTask({ id: 'b', title: 'Two' })]);

    control<HTMLInputElement>('b', 'input[type="checkbox"]').click();

    expect(store.getState().tasks[0]?.completed).toBe(false);
    expect(store.getState().tasks[1]?.completed).toBe(true);
  });

  it('is reflected without a page reload (AC-004.5)', () => {
    render([makeTask({ id: 'a', title: 'Buy milk' })]);
    let renders = 0;
    store.subscribe(() => {
      renders += 1;
    });

    control<HTMLInputElement>('a', 'input[type="checkbox"]').click();

    expect(renders).toBe(1);
  });
});

describe('Delete removes the task (FR-006)', () => {
  it('removes it immediately, with no confirmation (AC-006.1, OQ-04)', () => {
    render([makeTask({ id: 'a', title: 'One' }), makeTask({ id: 'b', title: 'Two' })]);

    control<HTMLButtonElement>('a', '[data-action="delete"]').click();

    expect(store.getState().tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('deletes a completed task on the same terms (AC-006.5)', () => {
    render([makeTask({ id: 'done', title: 'One', completed: true })]);

    control<HTMLButtonElement>('done', '[data-action="delete"]').click();

    expect(store.getState().tasks).toEqual([]);
  });

  it('leaves every other task untouched (AC-006.4)', () => {
    render([
      makeTask({ id: 'a', title: 'One' }),
      makeTask({ id: 'b', title: 'Two', completed: true }),
      makeTask({ id: 'c', title: 'Three', dueDate: DATE_MID }),
    ]);

    control<HTMLButtonElement>('b', '[data-action="delete"]').click();

    expect(store.getState().tasks.map((t) => t.id)).toEqual(['a', 'c']);
    expect(store.getState().tasks[1]?.dueDate).toBe(DATE_MID);
  });
});

describe('Edit opens the inline form (FR-005)', () => {
  it('dispatches BEGIN_EDIT for that task', () => {
    render([makeTask({ id: 'a', title: 'One' }), makeTask({ id: 'b', title: 'Two' })]);

    control<HTMLButtonElement>('b', '[data-action="edit"]').click();

    expect(store.getState().editingId).toBe('b');
  });

  it('changes no task data (architecture §2.3)', () => {
    render([makeTask({ id: 'a', title: 'One' })]);
    const before = store.getState().tasks;

    control<HTMLButtonElement>('a', '[data-action="edit"]').click();

    expect(store.getState().tasks).toBe(before);
  });
});

describe('clicks that mean nothing are ignored', () => {
  beforeEach(() => render([makeTask({ id: 'a', title: 'Buy milk' })]));

  it('ignores a click on the row itself', () => {
    const before = store.getState();
    rowFor('a').click();

    expect(store.getState()).toBe(before);
  });

  it('ignores a click on the due-date text', () => {
    const before = store.getState();
    control<HTMLElement>('a', '.task__due').click();

    expect(store.getState()).toBe(before);
  });
});

// ───────────────────────── completed appearance ───────────────────────────

describe('a completed task is distinguishable by more than colour (AC-004.7)', () => {
  beforeEach(() =>
    render([
      makeTask({ id: 'open', title: 'Still open', completed: false }),
      makeTask({ id: 'done', title: 'All done', completed: true }),
    ]),
  );

  it('states the status in words', () => {
    expect(rowFor('done').textContent).toContain('Completed');
    expect(rowFor('open').textContent).not.toContain('Completed');
  });

  it('checks the checkbox, which is a shape and not a colour', () => {
    expect(control<HTMLInputElement>('done', 'input[type="checkbox"]').checked).toBe(true);
    expect(control<HTMLInputElement>('open', 'input[type="checkbox"]').checked).toBe(false);
  });

  it('marks the row with a class the stylesheet strikes through', () => {
    expect(rowFor('done').className).toContain('task--completed');
    expect(readStylesheetCode()).toMatch(
      /\.task--completed[^{]*\{[^}]*text-decoration:\s*line-through/,
    );
  });
});
