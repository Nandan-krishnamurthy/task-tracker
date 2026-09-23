/**
 * One task row (plan T-405 display mode, T-406 inline edit mode).
 *
 * A row is a pure function of a task: give it the same task and it produces
 * the same `<li>`. It reads no state, holds no state, and registers no event
 * listeners — `ui/taskList.ts` delegates events from the container, so a row
 * that is thrown away on the next rebuild cannot leak a handler with it.
 * Controls carry `data-action` for that delegation to read.
 *
 * Native elements per architecture §9.1: a real checkbox with a real `<label>`
 * (Space toggles it for free, which is J2's "e.g., via a checkbox"), and real
 * `<button>`s for Edit and Delete (Enter and Space both activate them).
 *
 * The priority `<select>` and the labelled-field wrapper are imported from
 * `taskForm.ts` rather than rebuilt here. Architecture §9.1 relies on the
 * priority control being "structurally incapable of a fourth level" (C-04,
 * AC-003.3); that only holds if there is one builder, not two that can drift.
 */

import type { Priority, Task } from '../core/types';
import type { Store } from '../store/store';
import { FOCUS_KEY_ATTR, TASK_ID_ATTR, taskFocusKey } from './focus';
import { PRIORITY_LABELS, createField, createPrioritySelect, readPriority } from './taskForm';

/** The `data-action` values `ui/taskList.ts` delegates on. */
export const ACTIONS = {
  toggle: 'toggle',
  edit: 'edit',
  delete: 'delete',
  cancelEdit: 'cancel-edit',
} as const;

/**
 * Accessible names that identify the task, not just the verb.
 *
 * AC-A11Y.2: "delete" alone is ambiguous across twenty rows, so every
 * per-task control's name carries the title. Architecture §9.2 fixes these
 * exact phrasings and puts them on `aria-label`, because the visible button
 * text stays the short scannable word.
 */
export function toggleLabel(task: Task): string {
  return task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`;
}

export function editLabel(task: Task): string {
  return `Edit "${task.title}"`;
}

export function deleteLabel(task: Task): string {
  return `Delete "${task.title}"`;
}

/**
 * How a due date reads in the list.
 *
 * The stored `YYYY-MM-DD` is shown verbatim. Formatting it into a friendlier
 * form would mean parsing it into a `Date`, and ADR-0005 exists precisely
 * because that is how a task due March 3 comes to render as March 2 for a user
 * behind UTC. An unambiguous ISO date is worth more than a prettier one that
 * is occasionally wrong.
 *
 * Absence reads as "No due date" — plain information, never an error
 * (AC-002.7).
 */
export function dueDateText(dueDate: string | null): string {
  return dueDate === null ? 'No due date' : `Due ${dueDate}`;
}

/**
 * How a priority reads in the list.
 *
 * AC-003.6 requires the priority be visible without opening an edit view, and
 * architecture §9.6 requires it be carried by text rather than colour alone —
 * so it is a word, and any colour added later is decoration on top of it.
 */
export function priorityText(priority: Priority | null): string {
  return priority === null ? 'No priority' : `Priority: ${PRIORITY_LABELS[priority]}`;
}

/** An `<li>` shell carrying the task's identity, shared by both modes. */
function createRow(task: Task, modifier: string): HTMLLIElement {
  const row = document.createElement('li');
  row.className = `task ${modifier}`;
  row.setAttribute(TASK_ID_ATTR, task.id);
  return row;
}

function createMeta(className: string, text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = `task__meta ${className}`;
  span.textContent = text;
  return span;
}

function createActionButton(
  task: Task,
  action: string,
  control: string,
  text: string,
  accessibleName: string,
  className: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.dataset['action'] = action;
  button.setAttribute('aria-label', accessibleName);
  button.setAttribute(FOCUS_KEY_ATTR, taskFocusKey(task.id, control));
  return button;
}

/**
 * Render a task in display mode (T-405).
 *
 * Shows every attribute the user owns — title, status, due date, priority —
 * and nothing they do not. `id` and `createdAt` are internal (types.ts) and
 * never appear. There is no overdue badge and no overdue grouping: the PRD
 * defines no overdue behavior and NG-06 rules out the reminders that would
 * motivate one.
 *
 * Delete has no confirmation step. J3 says the change applies "immediately";
 * OQ-04 was resolved against inventing a dialog the PRD does not specify.
 */
export function renderTaskItem(task: Task): HTMLLIElement {
  const row = createRow(task, task.completed ? 'task--completed' : 'task--active');

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'task__toggle';
  toggle.id = `toggle-${task.id}`;
  toggle.checked = task.completed;
  toggle.dataset['action'] = ACTIONS.toggle;
  toggle.setAttribute('aria-label', toggleLabel(task));
  toggle.setAttribute(FOCUS_KEY_ATTR, taskFocusKey(task.id, 'toggle'));

  /*
   * A real <label for>, so the title itself is a click target and the pair is
   * associated natively (architecture §9.1). The checkbox's aria-label wins as
   * the accessible NAME, which is what AC-A11Y.2 needs — the label carries the
   * visible text, the aria-label carries the action plus the target.
   *
   * textContent, never innerHTML: AC-001.4 stores the title exactly as
   * entered, and a title containing markup must render as the characters the
   * user typed.
   */
  const title = document.createElement('label');
  title.className = 'task__title';
  title.htmlFor = toggle.id;
  title.textContent = task.title;

  row.append(
    toggle,
    title,
    createMeta('task__due', dueDateText(task.dueDate)),
    // The level is carried as a modifier class so the stylesheet can give a
    // high-priority task more visual weight (DO-2, "tell at a glance"). The
    // word is always present regardless, so the styling is emphasis on top of
    // the text and never the signal itself (architecture §9.6).
    createMeta(`task__priority task__priority--${task.priority ?? 'none'}`, priorityText(task.priority)),
  );

  if (task.completed) {
    /*
     * AC-004.7 / architecture §9.6: completion must be distinguishable by more
     * than colour. The stylesheet strikes the title through, and this word
     * states it outright — so the status survives a greyscale display, a
     * custom stylesheet, and a screen reader alike.
     */
    const status = document.createElement('span');
    status.className = 'task__status';
    status.textContent = 'Completed';
    row.append(status);
  }

  row.append(
    createActionButton(task, ACTIONS.edit, 'edit', 'Edit', editLabel(task), 'task__edit'),
    createActionButton(
      task,
      ACTIONS.delete,
      'delete',
      'Delete',
      deleteLabel(task),
      'task__delete button--danger',
    ),
  );

  return row;
}

/**
 * Render a task in inline edit mode (T-406).
 *
 * The row is replaced by a `<form>` over the three editable attributes —
 * title, due date, priority (AC-005.2). Status is deliberately absent: the
 * checkbox owns it, and editing a completed task must leave it completed
 * (AC-005.7), which is guaranteed by there being no control here that could
 * change it.
 *
 * Nothing is written until Save. Architecture §2.3 keeps the in-progress edit
 * out of application state, so a cancelled edit leaves no trace and a
 * half-finished one is never persisted.
 */
export function renderTaskEditor(task: Task, editError: string | null): HTMLLIElement {
  const row = createRow(task, 'task--editing');

  const form = document.createElement('form');
  form.className = 'task-edit';
  // Same reasoning as the create form: the reducer is the only validator
  // (§6.1), so the shared rule cannot be bypassed or contradicted here.
  form.noValidate = true;

  const errorId = `edit-error-${task.id}`;

  const title = document.createElement('input');
  title.type = 'text';
  title.id = `edit-title-${task.id}`;
  title.value = task.title;
  title.autocomplete = 'off';
  title.setAttribute('aria-describedby', errorId);
  title.setAttribute(FOCUS_KEY_ATTR, taskFocusKey(task.id, 'edit-title'));

  const due = document.createElement('input');
  due.type = 'date';
  due.id = `edit-due-${task.id}`;
  // An empty date input is exactly how "no due date" is expressed, so
  // clearing the field and saving clears the date (AC-002.5).
  due.value = task.dueDate ?? '';
  due.setAttribute(FOCUS_KEY_ATTR, taskFocusKey(task.id, 'edit-dueDate'));

  const priority = createPrioritySelect(
    `edit-priority-${task.id}`,
    taskFocusKey(task.id, 'edit-priority'),
  );
  // Selecting "None" clears the priority (AC-003.5).
  priority.value = task.priority ?? '';

  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  save.setAttribute('aria-label', `Save changes to "${task.title}"`);
  save.setAttribute(FOCUS_KEY_ATTR, taskFocusKey(task.id, 'edit-save'));

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.dataset['action'] = ACTIONS.cancelEdit;
  cancel.setAttribute('aria-label', `Cancel editing "${task.title}"`);
  cancel.setAttribute(FOCUS_KEY_ATTR, taskFocusKey(task.id, 'edit-cancel'));

  // Wired exactly like the create form's message (architecture §9.5): its own
  // live region, its own describedby. Kept separate so a rejected edit cannot
  // blank the create form's message, or the reverse (types.ts, AppState).
  const error = document.createElement('p');
  error.className = 'form-error';
  error.id = errorId;
  error.setAttribute('aria-live', 'assertive');
  error.textContent = editError ?? '';

  if (editError !== null) title.setAttribute('aria-invalid', 'true');

  form.append(
    createField('Title', title, true),
    createField('Due date', due),
    createField('Priority', priority),
    save,
    cancel,
    error,
  );

  row.append(form);
  return row;
}

/**
 * Wire one container to the actions its rows declare (T-405, T-406).
 *
 * DELEGATED: three listeners on a container that outlives every rebuild,
 * rather than a handful per row. Rows are discarded wholesale on each render
 * (architecture §4.3), and a listener bound to a discarded row is exactly the
 * orphan T-408 forbids — so no row ever holds one.
 *
 * It also means this is the single place a control's meaning is defined. A
 * button that carries `data-action="delete"` deletes, wherever it is rendered.
 *
 * Returns a detach function, so a caller that unmounts leaves nothing behind.
 */
export function attachTaskActions(container: HTMLElement, store: Store): () => void {
  /** The task a delegated event belongs to, or null if it belongs to none. */
  function taskIdOf(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest(`li[${TASK_ID_ATTR}]`)?.getAttribute(TASK_ID_ATTR) ?? null;
  }

  function onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const trigger = target.closest<HTMLElement>('[data-action]');
    if (trigger === null || !container.contains(trigger)) return;

    const id = taskIdOf(trigger);
    if (id === null) return;

    switch (trigger.dataset['action']) {
      case ACTIONS.edit:
        store.dispatch({ type: 'BEGIN_EDIT', id });
        break;
      case ACTIONS.delete:
        // Immediately, with no confirmation and no undo (J3 step 3, OQ-04).
        store.dispatch({ type: 'DELETE_TASK', id });
        break;
      case ACTIONS.cancelEdit:
        store.dispatch({ type: 'CANCEL_EDIT' });
        break;
      default:
        // 'toggle' arrives here too, because clicking a checkbox is a click.
        // It is handled on `change` instead, which is also what fires when the
        // user presses Space — the keyboard path AC-A11Y.1 requires.
        break;
    }
  }

  function onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`[data-action="${ACTIONS.toggle}"]`) !== target) return;

    const id = taskIdOf(target);
    if (id === null) return;

    // One action, both directions (FR-004, AC-004.1, AC-004.3).
    store.dispatch({ type: 'TOGGLE_COMPLETE', id });
  }

  function onSubmit(event: Event): void {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !container.contains(form)) return;

    event.preventDefault();

    const id = taskIdOf(form);
    if (id === null) return;

    const title = form.querySelector<HTMLInputElement>('input[type="text"]');
    const due = form.querySelector<HTMLInputElement>('input[type="date"]');
    const priority = form.querySelector<HTMLSelectElement>('select');

    if (title === null || due === null || priority === null) return;

    store.dispatch({
      type: 'UPDATE_TASK',
      id,
      title: title.value,
      dueDate: due.value === '' ? null : due.value,
      priority: readPriority(priority),
    });
  }

  container.addEventListener('click', onClick);
  container.addEventListener('change', onChange);
  container.addEventListener('submit', onSubmit);

  return () => {
    container.removeEventListener('click', onClick);
    container.removeEventListener('change', onChange);
    container.removeEventListener('submit', onSubmit);
  };
}
