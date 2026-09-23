import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '../../src/core/types';
import type { Store } from '../../src/store/store';
import { createStore } from '../../src/store/store';
import { mountApp } from '../../src/ui/app';
import { DATE_EARLY, DATE_LATE, DATE_MID, T0, awkwardTitles, makeTask } from '../support/fixtures';
import { mountPageSkeleton, readStylesheetCode } from '../support/page';

/**
 * T-502 verification — the systematic accessibility sweep.
 *
 * Traceability: NFR-A11Y-001, architecture §9.
 * Acceptance criteria: AC-A11Y.1, AC-A11Y.2, AC-A11Y.3, AC-A11Y.5.
 *
 * The individual UI tasks each checked their own controls. This suite checks
 * the ASSEMBLED interface against architecture §9 as a whole, which is where
 * the gaps actually live: a control group nobody owns end-to-end, a focus
 * situation that works in two modules and falls between them, an accessible
 * name that is fine in isolation and duplicated across twenty rows.
 *
 * Two deliberate structures here:
 *
 *   - The five control groups NFR-A11Y-001 names are enumerated as DATA, so
 *     the sweep cannot quietly cover four of them.
 *   - The architecture §9.4 focus table is reproduced as one suite, one test
 *     per row, which is what T-502 asks for.
 */

/** The five control groups NFR-A11Y-001 names, as data. */
const CONTROL_GROUPS = [
  { name: 'add task', selector: 'form.task-form button[type="submit"]' },
  { name: 'complete checkbox', selector: 'li[data-task-id] input[type="checkbox"]' },
  { name: 'edit', selector: 'li[data-task-id] [data-action="edit"]' },
  { name: 'delete', selector: 'li[data-task-id] [data-action="delete"]' },
  { name: 'filter controls', selector: '.filter-bar button' },
] as const;

let root: HTMLElement;
let store: Store;

const POPULATED: readonly Task[] = [
  makeTask({ id: 'a', title: 'Pay rent', dueDate: DATE_EARLY, priority: 'high', createdAt: T0 }),
  makeTask({ id: 'b', title: 'Buy milk', dueDate: DATE_MID, priority: null, createdAt: T0 + 1 }),
  makeTask({ id: 'c', title: 'Renew passport', dueDate: DATE_LATE, priority: 'low', createdAt: T0 + 2 }),
  makeTask({ id: 'd', title: 'Call dentist', dueDate: null, completed: true, createdAt: T0 + 3 }),
];

function mount(tasks: readonly Task[] = POPULATED): void {
  root = mountPageSkeleton();
  store = createStore({
    newId: () => `new-${store.getState().tasks.length + 1}`,
    now: () => T0 + 500 + store.getState().tasks.length,
    persist: () => true,
  });
  store.dispatch({ type: 'LOAD', tasks: [...tasks], storageOk: true });
  mountApp(store, root);
}

const q = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
const rowFor = (id: string): HTMLElement => q<HTMLElement>(`li[data-task-id="${id}"]`);
const focusKey = (): string | null =>
  document.activeElement?.getAttribute('data-focus-key') ?? null;

/**
 * The accessible name of an element, computed the way the spec's precedence
 * actually works for the markup this app produces: `aria-label` wins, then an
 * associated `<label>`, then the element's own text.
 *
 * Hand-written because ADR-0002 keeps the runtime dependency count at zero and
 * this project's markup uses exactly three of the naming routes. It is NOT a
 * general accname implementation and does not pretend to be.
 */
function accessibleName(element: Element): string {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel !== null && ariaLabel.trim() !== '') return ariaLabel.trim();

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    if (text !== '') return text;
  }

  if (element.id !== '') {
    const label = root.querySelector(`label[for="${element.id}"]`);
    const text = label?.textContent?.trim() ?? '';
    if (text !== '') return text;
  }

  return element.textContent?.trim() ?? '';
}

/** Tab order: every focusable control, in document order. */
function tabbables(): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]',
    ),
  ].filter((el) => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1');
}

beforeEach(() => mount());

// ══════════════ AC-A11Y.1 — every control keyboard-operable ═══════════════

describe('AC-A11Y.1: every named control is reachable and operable by keyboard', () => {
  it.each(CONTROL_GROUPS)('the $name control exists in the interface', ({ selector }) => {
    expect(root.querySelector(selector)).not.toBeNull();
  });

  it.each(CONTROL_GROUPS)('the $name control is in the natural tab order', ({ selector }) => {
    const element = q<HTMLElement>(selector);

    // No negative tabindex, no disabled, no roving-tabindex scheme to get
    // wrong (architecture §9.3).
    expect(element.getAttribute('tabindex')).toBeNull();
    expect(element.hasAttribute('disabled')).toBe(false);
    expect(tabbables()).toContain(element);
  });

  it.each(CONTROL_GROUPS)('the $name control is a natively operable element', ({ selector }) => {
    // A <div role="button"> would need hand-written Enter/Space handling.
    // Native elements get it from the platform, which is the whole of §9.1.
    const element = q<HTMLElement>(selector);
    expect(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']).toContain(element.tagName);
  });

  it('uses no custom widget roles that would need key handling of their own', () => {
    for (const element of root.querySelectorAll('[role]')) {
      // `group` is the only role in the app, on the filter bar (§9.3).
      expect(element.getAttribute('role')).toBe('group');
    }
  });

  it('registers no key handler that could shadow native key behaviour', () => {
    /*
     * Native elements already handle Enter and Space, and architecture §9.3
     * rejected the tablist pattern precisely to avoid hand-writing key
     * handling that can be got subtly wrong. So there should be none — and
     * that is a property of the SOURCE, not of any rendered DOM, so it is
     * checked by reading the files, the way T-203 checks storage isolation.
     */
    const uiDir = resolve(process.cwd(), 'src/ui');
    const files = readdirSync(uiDir).filter((name) => name.endsWith('.ts'));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const code = readFileSync(`${uiDir}/${file}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      expect(code, `${file} registers a key handler`).not.toMatch(
        /addEventListener\s*\(\s*['"]key(down|up|press)['"]/,
      );
      expect(code, `${file} sets an inline key handler`).not.toMatch(/onkey(down|up|press)/);
    }
  });

  it('operates the complete checkbox without a pointer', () => {
    // click() is what both a mouse press and a Space keypress dispatch on a
    // native checkbox, so this is the keyboard path as much as the pointer one.
    const checkbox = rowFor('a').querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.focus();
    checkbox.click();

    expect(store.getState().tasks.find((t) => t.id === 'a')?.completed).toBe(true);
  });

  it('operates Edit, Save and Cancel without a pointer', () => {
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    expect(store.getState().editingId).toBe('b');

    rowFor('b').querySelector<HTMLButtonElement>('[data-action="cancel-edit"]')!.click();
    expect(store.getState().editingId).toBeNull();
  });

  it('operates the create form by submission alone, needing no button press', () => {
    // A real <form> with a real submit button: Enter in a text field submits
    // it natively, which is what makes J1 keyboard-completable.
    q<HTMLInputElement>('#create-title').value = 'Typed and entered';
    q<HTMLFormElement>('form.task-form').requestSubmit();

    expect(store.getState().tasks.map((t) => t.title)).toContain('Typed and entered');
  });

  it('reaches every control on the page through the tab order, with none stranded', () => {
    const keyed = [...root.querySelectorAll<HTMLElement>('[data-focus-key]')];
    const reachable = tabbables();

    for (const element of keyed) {
      expect(reachable, `${element.getAttribute('data-focus-key')} is not tabbable`).toContain(
        element,
      );
    }
  });

  it('puts the tab order in the visual order: form, then filter, then list', () => {
    const keys = tabbables()
      .map((el) => el.getAttribute('data-focus-key') ?? '')
      .filter((k) => k !== '');

    const firstFilter = keys.findIndex((k) => k.startsWith('filter:'));
    const firstTask = keys.findIndex((k) => k.startsWith('task:'));
    const lastForm = keys.map((k) => k.startsWith('form:')).lastIndexOf(true);

    expect(lastForm).toBeLessThan(firstFilter);
    expect(firstFilter).toBeLessThan(firstTask);
  });
});

// ═══════ AC-A11Y.2 — accessible names identify action AND target ══════════

describe('AC-A11Y.2: accessible names identify both the action and the task', () => {
  const perTaskControls = [
    { control: 'input[type="checkbox"]', verb: 'Mark' },
    { control: '[data-action="edit"]', verb: 'Edit' },
    { control: '[data-action="delete"]', verb: 'Delete' },
  ] as const;

  it.each(perTaskControls)('every $control names its action and its task', ({ control, verb }) => {
    const rows = [...root.querySelectorAll('li[data-task-id]')];
    expect(rows.length).toBeGreaterThan(1);

    for (const row of rows) {
      const id = row.getAttribute('data-task-id')!;
      const title = store.getState().tasks.find((t) => t.id === id)!.title;
      const name = accessibleName(row.querySelector(control)!);

      expect(name).toContain(verb);
      expect(name, `${control} on "${title}" does not name its task`).toContain(title);
    }
  });

  it('gives every per-task control a non-empty accessible name', () => {
    for (const element of root.querySelectorAll('li[data-task-id] button, li[data-task-id] input')) {
      expect(accessibleName(element).length, element.outerHTML).toBeGreaterThan(0);
    }
  });

  it('makes "Delete" unambiguous across a populated list', () => {
    // The literal wording of AC-A11Y.2: "delete" alone is ambiguous among many
    // tasks, so the names must differ from one another.
    const names = [...root.querySelectorAll('li [data-action="delete"]')].map(accessibleName);

    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain('Delete');
  });

  it('names the checkbox for the direction it will actually move the task', () => {
    expect(accessibleName(rowFor('a').querySelector('input[type="checkbox"]')!)).toBe(
      'Mark "Pay rent" complete',
    );

    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
    expect(accessibleName(rowFor('d').querySelector('input[type="checkbox"]')!)).toBe(
      'Mark "Call dentist" incomplete',
    );
  });

  it('names the edit form’s Save and Cancel with their task too', () => {
    store.dispatch({ type: 'BEGIN_EDIT', id: 'b' });

    expect(accessibleName(rowFor('b').querySelector('button[type="submit"]')!)).toContain(
      'Buy milk',
    );
    expect(accessibleName(rowFor('b').querySelector('[data-action="cancel-edit"]')!)).toContain(
      'Buy milk',
    );
  });

  it.each(awkwardTitles)('carries an awkward title %j into the accessible name intact', (title) => {
    mount([makeTask({ id: 'odd', title })]);

    expect(accessibleName(rowFor('odd').querySelector('[data-action="delete"]')!)).toBe(
      `Delete "${title}"`,
    );
  });

  it('names every form field with a real label, not a placeholder', () => {
    for (const field of root.querySelectorAll<HTMLElement>('input, select')) {
      if (field.closest('li[data-task-id]') !== null && field.getAttribute('type') === 'checkbox') {
        continue; // named by aria-label, checked above
      }
      expect(accessibleName(field).length, field.outerHTML).toBeGreaterThan(0);
      expect(field.hasAttribute('placeholder')).toBe(false);
    }
  });

  it('names the filter group, so the two buttons are not bare verbs', () => {
    const group = q('[role="group"]');

    expect(accessibleName(group).length).toBeGreaterThan(0);
    expect([...group.querySelectorAll('button')].map(accessibleName)).toEqual([
      'Active',
      'Completed',
    ]);
  });

  it('names the list for the view it shows', () => {
    expect(accessibleName(q('ul.task-list'))).toBe('Active tasks');

    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
    expect(accessibleName(q('ul.task-list'))).toBe('Completed tasks');
  });
});

// ════════ AC-A11Y.3 — the complete architecture §9.4 focus table ══════════

describe('AC-A11Y.3: the architecture §9.4 focus table, every row', () => {
  it('row 1 — any re-render restores focus to the same logical control', () => {
    const edit = rowFor('c').querySelector<HTMLButtonElement>('[data-action="edit"]')!;
    edit.focus();

    // A rebuild caused by something else entirely.
    store.dispatch({ type: 'TOGGLE_COMPLETE', id: 'a' });

    expect(focusKey()).toBe('task:c:edit');
    expect(root.contains(document.activeElement)).toBe(true);
  });

  it('row 2 — a task deleted while focused hands focus to the next task', () => {
    const del = rowFor('b').querySelector<HTMLButtonElement>('[data-action="delete"]')!;
    del.focus();
    del.click();

    expect(focusKey()).toBe('task:c:delete');
  });

  it('row 2 — deleting the last task falls back to the title input', () => {
    mount([makeTask({ id: 'only', title: 'The only one' })]);
    const del = rowFor('only').querySelector<HTMLButtonElement>('[data-action="delete"]')!;
    del.focus();
    del.click();

    expect(document.activeElement).toBe(q('#create-title'));
  });

  it('row 3 — beginning an edit moves focus into the edit title field', () => {
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();

    expect(focusKey()).toBe('task:b:edit-title');
  });

  it('row 4 — saving an edit returns focus to that task’s Edit button', () => {
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    rowFor('b').querySelector<HTMLFormElement>('form')!.requestSubmit();

    expect(focusKey()).toBe('task:b:edit');
  });

  it('row 4 — cancelling an edit returns focus to that task’s Edit button', () => {
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    rowFor('b').querySelector<HTMLButtonElement>('[data-action="cancel-edit"]')!.click();

    expect(focusKey()).toBe('task:b:edit');
  });

  it('row 5 — creating a task returns focus to the title input', () => {
    q<HTMLInputElement>('#create-title').value = 'Next one';
    q<HTMLInputElement>('#create-title').focus();
    q<HTMLFormElement>('form.task-form').requestSubmit();

    expect(document.activeElement).toBe(q('#create-title'));
  });

  it('the invariant — focus is never left on <body> after ANY action', () => {
    type Step = readonly [string, () => void];

    const steps: readonly Step[] = [
      ['toggle a task', () => rowFor('a').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()],
      ['delete a task', () => rowFor('b').querySelector<HTMLButtonElement>('[data-action="delete"]')!.click()],
      ['begin an edit', () => rowFor('c').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click()],
      ['save an edit', () => rowFor('c').querySelector<HTMLFormElement>('form')!.requestSubmit()],
      ['switch view', () => q<HTMLButtonElement>('[data-focus-key="filter:completed"]').click()],
      ['switch back', () => q<HTMLButtonElement>('[data-focus-key="filter:active"]').click()],
      ['reject a create', () => q<HTMLFormElement>('form.task-form').requestSubmit()],
      ['delete the last one', () => rowFor('c').querySelector<HTMLButtonElement>('[data-action="delete"]')!.click()],
    ];

    for (const [name, step] of steps) {
      step();

      expect(document.activeElement, `focus lost to <body> after: ${name}`).not.toBe(document.body);
      expect(document.activeElement, `focus lost entirely after: ${name}`).not.toBeNull();
      expect(root.contains(document.activeElement), `focus detached after: ${name}`).toBe(true);
    }
  });

  it('keeps a visible focus indicator on every interactive element', () => {
    // The ring itself is a stylesheet property (jsdom computes no layout), so
    // what is checkable here is that a rule exists for each element kind and
    // that nothing anywhere removes an outline.
    const css = readStylesheetCode();

    for (const selector of ['button:focus', 'input:focus', 'select:focus']) {
      expect(css).toContain(selector);
    }
    expect(css).toMatch(/outline:\s*\d+px solid/);
    expect(css).not.toMatch(/outline\s*:\s*(none|0)\b/);
  });

  it('adds no positive tabindex, which would reorder the sequence unpredictably', () => {
    for (const element of root.querySelectorAll('[tabindex]')) {
      expect(Number(element.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
  });
});

// ══════ AC-A11Y.5 — validation messages perceivable, never colour-only ════

describe('AC-A11Y.5: validation messages are perceivable to assistive technology', () => {
  it('announces the create message in a live region', () => {
    q<HTMLFormElement>('form.task-form').requestSubmit();
    const message = q('#create-error');

    expect(message.getAttribute('aria-live')).toBe('assertive');
    expect(message.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('associates the create message with the title field', () => {
    q<HTMLFormElement>('form.task-form').requestSubmit();

    expect(q('#create-title').getAttribute('aria-describedby')).toBe('create-error');
    expect(q('#create-title').getAttribute('aria-invalid')).toBe('true');
  });

  it('keeps the live region present while silent, so the text is announced', () => {
    const message = q('#create-error');

    expect(message.isConnected).toBe(true);
    expect(message.hasAttribute('hidden')).toBe(false);
    expect(message.textContent).toBe('');
  });

  it('announces the edit message the same way', () => {
    store.dispatch({ type: 'BEGIN_EDIT', id: 'b' });
    store.dispatch({ type: 'UPDATE_TASK', id: 'b', title: '  ', dueDate: null, priority: null });

    const message = rowFor('b').querySelector('.form-error')!;
    expect(message.getAttribute('aria-live')).toBe('assertive');
    expect(message.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(rowFor('b').querySelector('input[type="text"]')?.getAttribute('aria-describedby')).toBe(
      message.id,
    );
  });

  it('carries the message as TEXT, not colour or position alone', () => {
    q<HTMLFormElement>('form.task-form').requestSubmit();

    // Remove every stylesheet-borne signal and the message must still read.
    const text = q('#create-error').textContent ?? '';
    expect(text).toMatch(/[a-z]/i);
    expect(text.trim().length).toBeGreaterThan(5);
  });

  it('conveys completion by text and shape, not colour alone (AC-004.7)', () => {
    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });

    const row = rowFor('d');
    expect(row.textContent).toContain('Completed');
    expect(row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  });

  it('conveys priority as a word, not a colour (AC-003.6, architecture §9.6)', () => {
    expect(rowFor('a').textContent).toContain('High');
    expect(rowFor('c').textContent).toContain('Low');
    expect(rowFor('b').textContent).toContain('No priority');
  });
});

// ════════════════════ document structure and landmarks ═══════════════════

describe('document structure (architecture §9.1)', () => {
  it('has one h1 and a heading for each region', () => {
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelectorAll('h2')).toHaveLength(3);
  });

  it('uses a list for the tasks, so length and position are announced', () => {
    expect(q('ul.task-list').tagName).toBe('UL');
    expect(q('ul.task-list').querySelectorAll(':scope > li').length).toBe(3);
  });

  it('keeps every id unique across the assembled page', () => {
    store.dispatch({ type: 'BEGIN_EDIT', id: 'b' });
    const ids = [...root.querySelectorAll('[id]')].map((el) => el.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every aria-describedby and aria-labelledby at an element that exists', () => {
    store.dispatch({ type: 'BEGIN_EDIT', id: 'b' });

    for (const attribute of ['aria-describedby', 'aria-labelledby']) {
      for (const element of root.querySelectorAll(`[${attribute}]`)) {
        for (const id of element.getAttribute(attribute)!.split(/\s+/)) {
          expect(document.getElementById(id), `${attribute}="${id}" dangles`).not.toBeNull();
        }
      }
    }
  });

  it('points every label’s `for` at an element that exists', () => {
    store.dispatch({ type: 'BEGIN_EDIT', id: 'b' });

    // getElementById rather than a selector: task ids are opaque and jsdom
    // implements no CSS.escape, which is the same gap `ui/focus.ts` works
    // around with its own escaper.
    for (const label of root.querySelectorAll('label[for]')) {
      const target = document.getElementById(label.getAttribute('for')!);
      expect(target, `label for="${label.getAttribute('for')}" dangles`).not.toBeNull();
    }
  });

  it('uses no ARIA where a native element already carries the semantics', () => {
    // §9.1's rule. aria-label and aria-live are naming and announcement, not
    // re-implemented semantics; a role or aria-checked on a native control
    // would be.
    expect(root.querySelector('[aria-checked]')).toBeNull();
    expect(root.querySelector('[role="button"]')).toBeNull();
    expect(root.querySelector('[role="checkbox"]')).toBeNull();
    expect(root.querySelector('[role="list"]')).toBeNull();
    expect(root.querySelector('[role="listitem"]')).toBeNull();
  });
});
