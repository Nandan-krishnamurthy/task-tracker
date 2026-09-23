import { beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '../../src/core/types';
import type { Store } from '../../src/store/store';
import { createStore } from '../../src/store/store';
import { restoreFocus, snapshotForKey, taskFocusKey } from '../../src/ui/focus';
import { attachTaskActions, renderTaskEditor, renderTaskItem } from '../../src/ui/taskItem';
import { DATE_EARLY, DATE_MID, T0, emptyishTitles, makeTask } from '../support/fixtures';
import { mountPageSkeleton, regionOf } from '../support/page';

/**
 * T-406 verification — the inline edit form.
 *
 * Traceability: FR-002, FR-003, FR-005.
 * Acceptance criteria: AC-002.3, AC-002.4, AC-002.5, AC-003.4, AC-003.5,
 * AC-005.1, AC-005.2, AC-005.3, AC-005.6, AC-005.7.
 *
 * Rendering is re-run from state after each dispatch, which is what
 * `ui/app.ts` will do at T-408. Doing it here too means the edit form is
 * exercised the way it actually runs — an edit that is rejected has to
 * survive a re-render with the message still attached.
 */

let root: HTMLElement;
let store: Store;
let container: HTMLElement;

/** Rebuild the list from state, exactly as T-407 will. */
function render(): void {
  container.querySelector('ul')?.remove();

  const state = store.getState();
  const list = document.createElement('ul');

  for (const task of state.tasks) {
    list.append(
      task.id === state.editingId
        ? renderTaskEditor(task, state.editError)
        : renderTaskItem(task),
    );
  }

  container.append(list);
}

function mount(tasks: readonly Task[], persist: () => boolean = () => true): void {
  // A fresh document every time: the delegation attaches to the list region,
  // so reusing a container would leave the previous store still listening on
  // it and every click would be dispatched twice.
  root = mountPageSkeleton();
  store = createStore({ newId: () => 'generated', now: () => T0, persist });
  store.dispatch({ type: 'LOAD', tasks: [...tasks], storageOk: true });

  container = regionOf(root, 'list');
  attachTaskActions(container, store);
  store.subscribe(render);
  render();
}

const rowFor = (id: string): HTMLElement =>
  container.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!;
const editForm = (id: string): HTMLFormElement => rowFor(id).querySelector('form')!;
const titleField = (id: string): HTMLInputElement =>
  rowFor(id).querySelector<HTMLInputElement>('input[type="text"]')!;
const dueField = (id: string): HTMLInputElement =>
  rowFor(id).querySelector<HTMLInputElement>('input[type="date"]')!;
const priorityField = (id: string): HTMLSelectElement =>
  rowFor(id).querySelector<HTMLSelectElement>('select')!;
const errorFor = (id: string): HTMLElement =>
  rowFor(id).querySelector<HTMLElement>('.form-error')!;

const beginEdit = (id: string): void => {
  rowFor(id).querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
};
const save = (id: string): void => {
  editForm(id).requestSubmit();
};
const cancel = (id: string): void => {
  rowFor(id).querySelector<HTMLButtonElement>('[data-action="cancel-edit"]')!.click();
};

const TASK = makeTask({
  id: 'e1',
  title: 'Buy milk',
  dueDate: DATE_MID,
  priority: 'medium',
});

beforeEach(() => mount([TASK]));

// ──────────────────────────── the form's shape ────────────────────────────

describe('edit form structure (AC-005.2, architecture §9.1)', () => {
  beforeEach(() => beginEdit('e1'));

  it('replaces the display row with a form', () => {
    expect(editForm('e1')).not.toBeNull();
    expect(rowFor('e1').className).toContain('task--editing');
  });

  it('offers all three editable attributes, not a subset', () => {
    expect(titleField('e1')).not.toBeNull();
    expect(dueField('e1')).not.toBeNull();
    expect(priorityField('e1')).not.toBeNull();
  });

  it('pre-fills every field with the task’s current values', () => {
    expect(titleField('e1').value).toBe('Buy milk');
    expect(dueField('e1').value).toBe(DATE_MID);
    expect(priorityField('e1').value).toBe('medium');
  });

  it('gives every field a real label', () => {
    for (const control of [titleField('e1'), dueField('e1'), priorityField('e1')]) {
      const label = rowFor('e1').querySelector(`label[for="${control.id}"]`);
      expect(label, `no <label> for #${control.id}`).not.toBeNull();
    }
  });

  it('offers the same four priority choices as the create form (AC-003.3)', () => {
    expect([...priorityField('e1').options].map((o) => o.value)).toEqual([
      '',
      'low',
      'medium',
      'high',
    ]);
  });

  it('offers no status control — the checkbox owns that', () => {
    expect(rowFor('e1').querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('wires its message region like the create form (architecture §9.5)', () => {
    expect(titleField('e1').getAttribute('aria-describedby')).toBe(errorFor('e1').id);
    expect(errorFor('e1').getAttribute('aria-live')).toBe('assertive');
  });

  it('offers Save and Cancel, both keyboard-operable', () => {
    const save_ = rowFor('e1').querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const cancel_ = rowFor('e1').querySelector<HTMLButtonElement>('[data-action="cancel-edit"]')!;

    expect(save_.textContent).toBe('Save');
    expect(cancel_.textContent).toBe('Cancel');
    expect(cancel_.type).toBe('button');
  });

  it('gives each edit control a unique focus key', () => {
    const keys = [...rowFor('e1').querySelectorAll('[data-focus-key]')].map((el) =>
      el.getAttribute('data-focus-key'),
    );

    expect(keys).toEqual([
      'task:e1:edit-title',
      'task:e1:edit-dueDate',
      'task:e1:edit-priority',
      'task:e1:edit-save',
      'task:e1:edit-cancel',
    ]);
  });

  it('opens only one editor at a time', () => {
    mount([TASK, makeTask({ id: 'e2', title: 'Other' })]);
    beginEdit('e1');
    beginEdit('e2');

    expect(container.querySelectorAll('form')).toHaveLength(1);
    expect(rowFor('e2').querySelector('form')).not.toBeNull();
  });
});

// ────────────────────────────── saving an edit ────────────────────────────

describe('saving an edit (FR-005)', () => {
  beforeEach(() => beginEdit('e1'));

  it('updates the title and shows it in the list (AC-005.1)', () => {
    titleField('e1').value = 'Buy oat milk';
    save('e1');

    expect(store.getState().tasks[0]?.title).toBe('Buy oat milk');
    expect(rowFor('e1').querySelector('.task__title')?.textContent).toBe('Buy oat milk');
  });

  it('changes the due date (AC-002.4)', () => {
    dueField('e1').value = DATE_EARLY;
    save('e1');

    expect(store.getState().tasks[0]?.dueDate).toBe(DATE_EARLY);
  });

  it('sets a due date on a task that had none (AC-002.3)', () => {
    mount([makeTask({ id: 'none', title: 'Undated', dueDate: null })]);
    beginEdit('none');

    dueField('none').value = DATE_EARLY;
    save('none');

    expect(store.getState().tasks[0]?.dueDate).toBe(DATE_EARLY);
  });

  it('changes the priority (AC-003.4)', () => {
    priorityField('e1').value = 'high';
    save('e1');

    expect(store.getState().tasks[0]?.priority).toBe('high');
  });

  it('closes the editor and returns to the display row (AC-005.3)', () => {
    save('e1');

    expect(store.getState().editingId).toBeNull();
    expect(rowFor('e1').querySelector('form')).toBeNull();
    expect(rowFor('e1').querySelector('.task__title')).not.toBeNull();
  });

  it('does not reload the page (AC-005.3)', () => {
    // Checked on the event after it has finished propagating: the handler that
    // prevents the default is delegated to the container, so it runs after any
    // listener on the form itself.
    const event = new Event('submit', { bubbles: true, cancelable: true });
    editForm('e1').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(store.getState().editingId).toBeNull();
  });

  it('trims the title but leaves interior spacing (AC-001.4)', () => {
    titleField('e1').value = '  Call  the   dentist  ';
    save('e1');

    expect(store.getState().tasks[0]?.title).toBe('Call  the   dentist');
  });
});

// ──────────────────────────── clearing values ─────────────────────────────

describe('clearing an optional attribute', () => {
  it('clears the due date (AC-002.5)', () => {
    beginEdit('e1');
    dueField('e1').value = '';
    save('e1');

    expect(store.getState().tasks[0]?.dueDate).toBeNull();
    expect(rowFor('e1').textContent).toContain('No due date');
  });

  it('clears the priority (AC-003.5)', () => {
    beginEdit('e1');
    priorityField('e1').value = '';
    save('e1');

    expect(store.getState().tasks[0]?.priority).toBeNull();
    expect(rowFor('e1').textContent).toContain('No priority');
  });

  it('clears both at once and leaves the task valid', () => {
    beginEdit('e1');
    dueField('e1').value = '';
    priorityField('e1').value = '';
    save('e1');

    expect(store.getState().tasks[0]).toMatchObject({
      title: 'Buy milk',
      dueDate: null,
      priority: null,
    });
  });
});

// ─────────────────────────── rejecting an edit ────────────────────────────

describe('an empty title is rejected (AC-005.6)', () => {
  it.each(emptyishTitles)('rejects %j and keeps the previous title', (value) => {
    beginEdit('e1');
    titleField('e1').value = value;
    save('e1');

    expect(store.getState().tasks[0]?.title).toBe('Buy milk');
  });

  it('shows a visible message', () => {
    beginEdit('e1');
    titleField('e1').value = '';
    save('e1');

    expect(errorFor('e1').textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('marks the title field invalid', () => {
    beginEdit('e1');
    titleField('e1').value = '';
    save('e1');

    expect(titleField('e1').getAttribute('aria-invalid')).toBe('true');
  });

  it('leaves the form open on the offending value, not discarded', () => {
    beginEdit('e1');
    titleField('e1').value = '   ';
    save('e1');

    expect(store.getState().editingId).toBe('e1');
    expect(editForm('e1')).not.toBeNull();
  });

  it('does not discard the due date or priority the user changed', () => {
    beginEdit('e1');
    dueField('e1').value = DATE_EARLY;
    priorityField('e1').value = 'high';
    titleField('e1').value = '';
    save('e1');

    // The rejected edit re-renders from the unchanged task, so the fields show
    // the stored values again — but nothing has been written, which is what
    // AC-005.6 requires, and the task is still there to edit.
    expect(store.getState().tasks[0]).toMatchObject({
      title: 'Buy milk',
      dueDate: DATE_MID,
      priority: 'medium',
    });
  });

  it('clears the message once a valid title is saved', () => {
    beginEdit('e1');
    titleField('e1').value = '';
    save('e1');
    expect(errorFor('e1').textContent?.trim().length ?? 0).toBeGreaterThan(0);

    titleField('e1').value = 'Buy oat milk';
    save('e1');

    expect(store.getState().tasks[0]?.title).toBe('Buy oat milk');
    expect(store.getState().editError).toBeNull();
  });

  it('keeps the create form’s message separate (types.ts, AppState)', () => {
    beginEdit('e1');
    titleField('e1').value = '';
    save('e1');

    expect(store.getState().editError).not.toBeNull();
    expect(store.getState().formError).toBeNull();
  });
});

// ────────────────────────────── cancelling ────────────────────────────────

describe('cancelling an edit (architecture §2.3)', () => {
  it('discards the in-progress values', () => {
    beginEdit('e1');
    titleField('e1').value = 'Something else';
    dueField('e1').value = DATE_EARLY;
    cancel('e1');

    expect(store.getState().tasks[0]).toMatchObject({
      title: 'Buy milk',
      dueDate: DATE_MID,
      priority: 'medium',
    });
  });

  it('closes the editor', () => {
    beginEdit('e1');
    cancel('e1');

    expect(store.getState().editingId).toBeNull();
    expect(rowFor('e1').querySelector('form')).toBeNull();
  });

  it('clears a validation message left from a rejected save', () => {
    beginEdit('e1');
    titleField('e1').value = '';
    save('e1');
    cancel('e1');

    expect(store.getState().editError).toBeNull();
  });

  it('persists nothing — a cancelled edit never reaches storage', () => {
    const writes: number[] = [];
    mount([TASK], () => {
      writes.push(1);
      return true;
    });

    beginEdit('e1');
    titleField('e1').value = 'Half-typed';
    cancel('e1');

    expect(writes).toHaveLength(0);
  });
});

// ───────────────────────── a completed task edits ─────────────────────────

describe('a completed task is editable on the same terms (AC-005.7)', () => {
  beforeEach(() => {
    mount([makeTask({ id: 'done', title: 'All done', completed: true, priority: 'low' })]);
  });

  it('offers an Edit button', () => {
    expect(rowFor('done').querySelector('[data-action="edit"]')).not.toBeNull();
  });

  it('opens the same form', () => {
    beginEdit('done');

    expect(titleField('done')).not.toBeNull();
    expect(dueField('done')).not.toBeNull();
    expect(priorityField('done')).not.toBeNull();
  });

  it('stays completed after saving', () => {
    beginEdit('done');
    titleField('done').value = 'All done, renamed';
    save('done');

    expect(store.getState().tasks[0]).toMatchObject({
      title: 'All done, renamed',
      completed: true,
    });
    expect(rowFor('done').className).toContain('task--completed');
  });
});

// ───────────────────────────── focus movement ─────────────────────────────

describe('focus moves as architecture §9.4 requires', () => {
  it('has a title field for focus to move into when an edit begins', () => {
    beginEdit('e1');

    const moved = restoreFocus(container, snapshotForKey(taskFocusKey('e1', 'edit-title')));

    expect(moved).toBe(titleField('e1'));
    expect(document.activeElement).toBe(titleField('e1'));
  });

  it('has an Edit button for focus to return to when an edit is saved', () => {
    beginEdit('e1');
    save('e1');

    const moved = restoreFocus(container, snapshotForKey(taskFocusKey('e1', 'edit')));

    expect(moved).toBe(rowFor('e1').querySelector('[data-action="edit"]'));
  });

  it('has an Edit button for focus to return to when an edit is cancelled', () => {
    beginEdit('e1');
    cancel('e1');

    const moved = restoreFocus(container, snapshotForKey(taskFocusKey('e1', 'edit')));

    expect(moved).toBe(rowFor('e1').querySelector('[data-action="edit"]'));
  });

  it('keeps the edit form present after a rejected save, so focus has somewhere to stay', () => {
    beginEdit('e1');
    titleField('e1').value = '';
    save('e1');

    const moved = restoreFocus(container, snapshotForKey(taskFocusKey('e1', 'edit-title')));

    expect(moved).toBe(titleField('e1'));
    expect(document.activeElement).not.toBe(document.body);
  });
});
