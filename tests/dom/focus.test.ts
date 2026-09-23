import { beforeEach, describe, expect, it } from 'vitest';

import {
  FOCUS_KEY_ATTR,
  NO_FOCUS,
  TITLE_FOCUS_KEY,
  captureFocus,
  findByFocusKey,
  focusKeyOf,
  restoreFocus,
  snapshotForKey,
  taskFocusKey,
} from '../../src/ui/focus';
import { mountPageSkeleton, regionOf } from '../support/page';

/**
 * T-402 verification — focus capture and restore.
 *
 * Traceability: ADR-0002 (principal risk), architecture §4.3, §9.4.
 * Acceptance criteria: AC-A11Y.3, and AC-A11Y.4 by extension.
 *
 * The Definition of Done is "all five situations from architecture §9.4
 * covered by a test", so the suite is organised by those five rows rather
 * than by function.
 *
 * The DOM here is built by hand rather than by `ui/taskList.ts`, which does
 * not exist yet — T-402 is scheduled before it deliberately. That is not a
 * shortcut: `focus.ts` depends only on the `data-focus-key` and `data-task-id`
 * conventions of architecture §4.3, never on the row's markup, and building
 * the fixture here proves it.
 */

// ──────────────────────────── fixture builders ────────────────────────────

/** A control carrying a focus key, of the given tag. */
function control(tag: 'button' | 'input', key: string, type = 'text'): HTMLElement {
  const element = document.createElement(tag);
  element.setAttribute(FOCUS_KEY_ATTR, key);

  if (element instanceof HTMLInputElement) element.type = type;
  if (element instanceof HTMLButtonElement) element.type = 'button';

  return element;
}

/** The create form's title input, mounted in the form region. */
function mountTitleInput(root: HTMLElement): HTMLInputElement {
  const input = control('input', TITLE_FOCUS_KEY) as HTMLInputElement;
  regionOf(root, 'form').append(input);
  return input;
}

/**
 * Build a list of rows, each with the three per-task controls a display row
 * carries. Returns the `<ul>`, so a test can rebuild it the way `ui/app.ts`
 * will.
 */
function renderRows(root: HTMLElement, ids: readonly string[]): HTMLUListElement {
  const region = regionOf(root, 'list');
  region.querySelector('ul')?.remove();

  const list = document.createElement('ul');

  for (const id of ids) {
    const row = document.createElement('li');
    row.setAttribute('data-task-id', id);

    row.append(
      control('input', taskFocusKey(id, 'toggle'), 'checkbox'),
      control('button', taskFocusKey(id, 'edit')),
      control('button', taskFocusKey(id, 'delete')),
    );

    list.append(row);
  }

  region.append(list);
  return list;
}

let root: HTMLElement;

beforeEach(() => {
  root = mountPageSkeleton();
});

// ───────────────────────────── the primitives ─────────────────────────────

describe('focus keys', () => {
  it('composes a per-task key from id and control', () => {
    expect(taskFocusKey('abc', 'delete')).toBe('task:abc:delete');
  });

  it('reads a key back off an element', () => {
    mountTitleInput(root);
    expect(focusKeyOf(findByFocusKey(root, TITLE_FOCUS_KEY))).toBe(TITLE_FOCUS_KEY);
  });

  it('returns null for an element with no key, and for null', () => {
    expect(focusKeyOf(document.createElement('div'))).toBeNull();
    expect(focusKeyOf(null)).toBeNull();
  });

  it('finds nothing for a key that is not present', () => {
    expect(findByFocusKey(root, 'task:missing:delete')).toBeNull();
  });

  it('survives a task id containing selector metacharacters', () => {
    // Ids are opaque. A quote in one must not break out of the selector.
    const region = regionOf(root, 'list');
    const odd = 'we"ird\\id';
    const button = control('button', taskFocusKey(odd, 'delete'));
    region.append(button);

    expect(findByFocusKey(root, taskFocusKey(odd, 'delete'))).toBe(button);
  });
});

// ─────────────────────── §9.4 row 1 — any re-render ───────────────────────

describe('any re-render restores the same logical control (§9.4, AC-A11Y.3)', () => {
  it('restores focus to an element the rebuild preserved', () => {
    renderRows(root, ['a', 'b', 'c']);
    findByFocusKey(root, taskFocusKey('b', 'toggle'))?.focus();

    const snapshot = captureFocus(root);
    expect(snapshot.key).toBe('task:b:toggle');

    renderRows(root, ['a', 'b', 'c']);
    // The old element is gone — this is a real rebuild, not a no-op.
    expect(document.activeElement).toBe(document.body);

    restoreFocus(root, snapshot);

    expect(focusKeyOf(document.activeElement)).toBe('task:b:toggle');
  });

  it('restores through a rebuild that reorders the rows', () => {
    // AC-010.4: editing a due date re-sorts the list. The row moves; the key
    // does not, which is the whole point of keying on identity rather than
    // position.
    renderRows(root, ['a', 'b', 'c']);
    findByFocusKey(root, taskFocusKey('c', 'edit'))?.focus();

    const snapshot = captureFocus(root);
    renderRows(root, ['c', 'a', 'b']);
    restoreFocus(root, snapshot);

    expect(focusKeyOf(document.activeElement)).toBe('task:c:edit');
  });

  it('preserves the text cursor in a text input', () => {
    const input = mountTitleInput(root);
    input.value = 'Buy milk';
    input.focus();
    input.setSelectionRange(3, 5);

    const snapshot = captureFocus(root);
    expect(snapshot.selectionStart).toBe(3);
    expect(snapshot.selectionEnd).toBe(5);

    // Rebuild the input the way a re-render would.
    input.remove();
    const rebuilt = mountTitleInput(root);
    rebuilt.value = 'Buy milk';

    restoreFocus(root, snapshot);

    expect(document.activeElement).toBe(rebuilt);
    expect(rebuilt.selectionStart).toBe(3);
    expect(rebuilt.selectionEnd).toBe(5);
  });

  it('records no cursor for a control that has none', () => {
    // Reading selectionStart on <input type="date"> throws in real browsers.
    // The capture must not.
    const region = regionOf(root, 'form');
    const date = control('input', 'form:dueDate', 'date') as HTMLInputElement;
    region.append(date);
    date.focus();

    const snapshot = captureFocus(root);

    expect(snapshot.key).toBe('form:dueDate');
    expect(snapshot.selectionStart).toBeNull();
    expect(snapshot.selectionEnd).toBeNull();
  });
});

// ───────────────── §9.4 row 2 — task deleted while focused ────────────────

describe('a deleted task hands focus on (§9.4, AC-A11Y.3, AC-A11Y.4)', () => {
  it('moves focus to the next task’s Delete button', () => {
    renderRows(root, ['a', 'b', 'c']);
    findByFocusKey(root, taskFocusKey('b', 'delete'))?.focus();

    const snapshot = captureFocus(root);
    expect(snapshot.rowIndex).toBe(1);

    renderRows(root, ['a', 'c']);
    restoreFocus(root, snapshot);

    // 'c' now occupies the position 'b' held.
    expect(focusKeyOf(document.activeElement)).toBe('task:c:delete');
  });

  it('moves focus to the last row when the deleted task was last', () => {
    renderRows(root, ['a', 'b', 'c']);
    findByFocusKey(root, taskFocusKey('c', 'delete'))?.focus();

    const snapshot = captureFocus(root);
    renderRows(root, ['a', 'b']);
    restoreFocus(root, snapshot);

    expect(focusKeyOf(document.activeElement)).toBe('task:b:delete');
  });

  it('prefers the same control on the row that takes the place', () => {
    // A task toggled out of the current view is the row §9.4 does not name.
    // Falling to the neighbour's Delete button would be a surprising place to
    // leave focus mid-way through checking tasks off.
    renderRows(root, ['a', 'b', 'c']);
    findByFocusKey(root, taskFocusKey('b', 'toggle'))?.focus();

    const snapshot = captureFocus(root);
    renderRows(root, ['a', 'c']);
    restoreFocus(root, snapshot);

    expect(focusKeyOf(document.activeElement)).toBe('task:c:toggle');
  });

  it('falls back to Delete when the same control is absent on the new row', () => {
    renderRows(root, ['a', 'b']);
    findByFocusKey(root, taskFocusKey('b', 'toggle'))?.focus();
    const snapshot = captureFocus(root);

    // 'c' is rendered in edit mode, so it has no toggle.
    const region = regionOf(root, 'list');
    region.querySelector('ul')?.remove();
    const list = document.createElement('ul');
    const row = document.createElement('li');
    row.setAttribute('data-task-id', 'c');
    row.append(control('button', taskFocusKey('c', 'delete')));
    list.append(row);
    region.append(list);

    restoreFocus(root, snapshot);

    expect(focusKeyOf(document.activeElement)).toBe('task:c:delete');
  });

  it('falls back to the title input when the last task is deleted', () => {
    const title = mountTitleInput(root);
    renderRows(root, ['only']);
    findByFocusKey(root, taskFocusKey('only', 'delete'))?.focus();

    const snapshot = captureFocus(root);
    renderRows(root, []);
    restoreFocus(root, snapshot);

    expect(document.activeElement).toBe(title);
  });
});

// ──────────── §9.4 rows 3–5 — directed moves, via snapshotForKey ──────────

describe('directed focus moves (§9.4 rows 3, 4 and 5)', () => {
  it('moves into the edit form’s title field when an edit begins', () => {
    const region = regionOf(root, 'list');
    const list = document.createElement('ul');
    const row = document.createElement('li');
    row.setAttribute('data-task-id', 'a');
    row.append(control('input', taskFocusKey('a', 'edit-title')));
    list.append(row);
    region.append(list);

    restoreFocus(root, snapshotForKey(taskFocusKey('a', 'edit-title')));

    expect(focusKeyOf(document.activeElement)).toBe('task:a:edit-title');
  });

  it('returns to the Edit button when an edit is saved or cancelled', () => {
    renderRows(root, ['a', 'b']);

    restoreFocus(root, snapshotForKey(taskFocusKey('b', 'edit')));

    expect(focusKeyOf(document.activeElement)).toBe('task:b:edit');
  });

  it('returns to the title input when a task has been created', () => {
    const title = mountTitleInput(root);
    renderRows(root, ['a']);

    restoreFocus(root, snapshotForKey(TITLE_FOCUS_KEY));

    expect(document.activeElement).toBe(title);
  });

  it('falls back when a directed target no longer exists', () => {
    // The task being edited was deleted: `task:<id>:edit` is gone, and there
    // is no row index to fall back through, so the title input takes it.
    const title = mountTitleInput(root);
    renderRows(root, []);

    restoreFocus(root, snapshotForKey(taskFocusKey('vanished', 'edit')));

    expect(document.activeElement).toBe(title);
  });
});

// ───────────────────── the invariant: never on <body> ─────────────────────

describe('focus is never left on <body> (§9.4)', () => {
  it('captures nothing when focus was on the body', () => {
    renderRows(root, ['a']);
    document.body.focus();

    expect(captureFocus(root)).toEqual(NO_FOCUS);
  });

  it('still lands somewhere when the snapshot is empty', () => {
    const title = mountTitleInput(root);
    renderRows(root, ['a']);

    restoreFocus(root, NO_FOCUS);

    expect(document.activeElement).toBe(title);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('lands on some keyed control even with no title input present', () => {
    renderRows(root, ['a']);

    restoreFocus(root, NO_FOCUS);

    expect(document.activeElement).not.toBe(document.body);
    expect(focusKeyOf(document.activeElement)).not.toBeNull();
  });

  it('reports no target when the page holds nothing focusable at all', () => {
    // The degenerate case: there is genuinely nowhere to go. It must return
    // null rather than throw, so a render can never crash on focus handling.
    expect(restoreFocus(root, NO_FOCUS)).toBeNull();
  });

  const situations: ReadonlyArray<readonly [string, readonly string[], readonly string[], string]> =
    [
      ['a row is removed', ['a', 'b', 'c'], ['a', 'c'], 'task:b:delete'],
      ['every row is removed', ['a'], [], 'task:a:delete'],
      ['rows are reordered', ['a', 'b', 'c'], ['c', 'b', 'a'], 'task:a:edit'],
      ['nothing changes', ['a', 'b'], ['a', 'b'], 'task:a:toggle'],
      ['rows are added', ['a'], ['a', 'b', 'c'], 'task:a:toggle'],
    ];

  it.each(situations)('after %s, focus is on a real control', (_name, before, after, key) => {
    mountTitleInput(root);
    renderRows(root, before);
    findByFocusKey(root, key)?.focus();

    const snapshot = captureFocus(root);
    renderRows(root, after);
    restoreFocus(root, snapshot);

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBeNull();
    expect(focusKeyOf(document.activeElement)).not.toBeNull();
    // And it is attached to the live document, not a detached orphan.
    expect(root.contains(document.activeElement)).toBe(true);
  });
});
