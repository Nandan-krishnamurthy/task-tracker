/**
 * The create form (plan T-403).
 *
 * Renders FR-001's title, FR-002's due date, and FR-003's priority as a real
 * `<form>` over native controls, and dispatches CREATE_TASK on submit.
 *
 * Native elements throughout, per architecture §9.1. A `<form>` with a real
 * submit button gives Enter-to-submit for nothing, which is half of AC-A11Y.4;
 * `<label for>` gives every field a programmatic name without a line of ARIA;
 * `<input type="date">` emits `YYYY-MM-DD` directly, which is the exact shape
 * ADR-0005 stores. The only ARIA here is on the validation message, where
 * there is no native equivalent.
 *
 * This module VALIDATES NOTHING. The reducer owns the rule (architecture
 * §3.2, §6.1), so the form submits whatever the user typed and reads the
 * outcome back off state. That is what keeps AC-009.1 structural rather than a
 * courtesy this file happens to extend.
 */

import { PRIORITIES } from '../core/types';
import type { AppState, Priority } from '../core/types';
import type { Store } from '../store/store';
import { FOCUS_KEY_ATTR, TITLE_FOCUS_KEY } from './focus';

/**
 * Human-readable names for the three levels, and for their absence.
 *
 * Keyed off `PRIORITIES` so the map cannot describe a level the domain does
 * not have. C-04 and AC-003.3 fix the set at three; `''` is the "None" choice
 * a `<select>` needs to represent null, not a fourth level.
 */
export const PRIORITY_LABELS: Readonly<Record<Priority | '', string>> = {
  '': 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Ids used by the create form's label and description wiring. */
const TITLE_ID = 'create-title';
const DUE_ID = 'create-due';
const PRIORITY_ID = 'create-priority';
const ERROR_ID = 'create-error';

/**
 * Build the priority `<select>`.
 *
 * Exported because the inline edit form (T-406) offers the same four choices,
 * and architecture §9.1 rests on the control being "structurally incapable of
 * a fourth level". One builder, derived from `PRIORITIES`, is what makes that
 * true: a fourth option cannot appear in one form and not the other, because
 * there is only one place it could be added, and adding it there would mean
 * adding it to the domain type first.
 */
export function createPrioritySelect(id: string, focusKey: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.id = id;
  select.setAttribute(FOCUS_KEY_ATTR, focusKey);

  for (const value of ['', ...PRIORITIES] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = PRIORITY_LABELS[value];
    select.append(option);
  }

  return select;
}

/**
 * Read a `<select>`'s value as a priority.
 *
 * The empty option means "no priority", which is a first-class state and never
 * an error (AC-003.2). The cast is safe because the only values the element
 * can hold are the ones `createPrioritySelect` put there.
 */
export function readPriority(select: HTMLSelectElement): Priority | null {
  return select.value === '' ? null : (select.value as Priority);
}

/**
 * A labelled field wrapper, so every control has a real `<label>`.
 *
 * Exported for the same reason `createPrioritySelect` is: the inline edit form
 * (T-406) presents the same three fields, and architecture §9.1 puts a real
 * `<label>` on each of them. Defining the pattern once means a field cannot
 * come to have a label in one form and a bare placeholder in the other.
 */
export function createField(labelText: string, control: HTMLElement, grow = false): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = grow ? 'field field--grow' : 'field';

  const label = document.createElement('label');
  label.htmlFor = control.id;
  label.textContent = labelText;

  wrapper.append(label, control);
  return wrapper;
}

export interface TaskFormHandle {
  /** The `<form>` element, for the caller to mount. */
  readonly element: HTMLFormElement;
  /** Re-render the parts that depend on state. Called on every render. */
  update(state: AppState): void;
}

/**
 * Create the form and wire it to the store.
 *
 * Built ONCE and updated in place (architecture §4.3) — only the `<ul>` is
 * rebuilt on a state change. That is not just a performance choice: rebuilding
 * this form would discard whatever the user had typed into it.
 */
export function createTaskForm(store: Store): TaskFormHandle {
  const form = document.createElement('form');
  form.className = 'task-form';
  // The reducer is the only validator (§6.1). Native constraint validation
  // would put a second, differently-worded rule in front of it.
  form.noValidate = true;

  const title = document.createElement('input');
  title.type = 'text';
  title.id = TITLE_ID;
  title.name = 'title';
  title.autocomplete = 'off';
  title.setAttribute(FOCUS_KEY_ATTR, TITLE_FOCUS_KEY);
  // Architecture §9.5: the message is associated with the field permanently,
  // not attached at the moment it appears. An association added at the same
  // instant as the text it points to is announced unreliably.
  title.setAttribute('aria-describedby', ERROR_ID);

  const due = document.createElement('input');
  due.type = 'date';
  due.id = DUE_ID;
  due.name = 'dueDate';
  due.setAttribute(FOCUS_KEY_ATTR, 'form:dueDate');

  const priority = createPrioritySelect(PRIORITY_ID, 'form:priority');
  priority.name = 'priority';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Add task';
  submit.setAttribute(FOCUS_KEY_ATTR, 'form:submit');

  /*
   * The validation message (AC-009.2, AC-009.6, AC-A11Y.5).
   *
   * `aria-live="assertive"` because a rejected submit is exactly the moment
   * the user needs interrupting — they are about to type the next task.
   * Always in the document and empty when silent, so the live region exists
   * before the text arrives.
   */
  const error = document.createElement('p');
  error.className = 'form-error';
  error.id = ERROR_ID;
  error.setAttribute('aria-live', 'assertive');

  form.append(
    createField('Title', title, true),
    createField('Due date', due),
    createField('Priority', priority),
    submit,
    error,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    store.dispatch({
      type: 'CREATE_TASK',
      title: title.value,
      // An empty date input yields '', which is not a date (AC-002.2).
      dueDate: due.value === '' ? null : due.value,
      priority: readPriority(priority),
    });

    /*
     * Dispatch is synchronous, so state already reflects the outcome.
     *
     * Fields are cleared ONLY on success. AC-009.3 requires that a rejected
     * submit not force re-entry from scratch: the due date and priority the
     * user already chose stay exactly where they were, and the title stays
     * too, so they can correct it rather than retype it.
     */
    if (store.getState().formError === null) {
      title.value = '';
      due.value = '';
      priority.value = '';
      // Architecture §9.4, last row: ready for the next task, which is the
      // rhythm DO-1 describes.
      title.focus();
    }
  });

  return {
    element: form,

    update(state: AppState): void {
      const message = state.formError;

      error.textContent = message ?? '';
      error.classList.toggle('form-error--shown', message !== null);

      if (message === null) {
        title.removeAttribute('aria-invalid');
      } else {
        title.setAttribute('aria-invalid', 'true');
      }
    },
  };
}
