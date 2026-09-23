import { beforeEach, describe, expect, it } from 'vitest';

import type { Store } from '../../src/store/store';
import { createStore } from '../../src/store/store';
import { createTaskForm } from '../../src/ui/taskForm';
import { DATE_MID, T0 } from '../support/fixtures';
import { mountPageSkeleton, regionOf } from '../support/page';

/**
 * T-403 verification — the create form.
 *
 * Traceability: FR-001, FR-002, FR-003, FR-009.
 * Acceptance criteria: AC-001.1, AC-001.3, AC-001.7, AC-002.1, AC-002.2,
 * AC-003.1, AC-003.2, AC-003.3, AC-009.2, AC-009.3, AC-009.5, AC-009.6.
 *
 * Tier 2 per ADR-0008: real store, real DOM, storage faked to a no-op so the
 * form is measured and not the persistence beneath it (T-303 covers that).
 */

let root: HTMLElement;
let store: Store;
let form: HTMLFormElement;

/** The store's subscription is what `ui/app.ts` will install at T-408. */
function mountForm(): void {
  root = mountPageSkeleton();
  store = createStore({
    newId: () => `id-${store.getState().tasks.length + 1}`,
    now: () => T0,
    persist: () => true,
  });

  const handle = createTaskForm(store);
  store.subscribe(() => handle.update(store.getState()));
  handle.update(store.getState());

  regionOf(root, 'form').append(handle.element);
  form = handle.element;
}

const title = (): HTMLInputElement => form.querySelector<HTMLInputElement>('#create-title')!;
const due = (): HTMLInputElement => form.querySelector<HTMLInputElement>('#create-due')!;
const priority = (): HTMLSelectElement => form.querySelector<HTMLSelectElement>('#create-priority')!;
const message = (): HTMLElement => form.querySelector<HTMLElement>('#create-error')!;

/** Submit the form the way Enter or the Add button does. */
function submit(): void {
  form.requestSubmit();
}

beforeEach(mountForm);

// ──────────────────────────── structure and ARIA ──────────────────────────

describe('create form structure (architecture §9.1)', () => {
  it('is a real form with a real submit button', () => {
    // This is what makes Enter-to-submit work without a keydown handler
    // (AC-A11Y.4). The browser behaviour itself is proven at T-603 in a real
    // browser; what is checkable here is the structure it depends on.
    expect(form.tagName).toBe('FORM');
    expect(form.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it('gives every control a real label', () => {
    for (const control of [title(), due(), priority()]) {
      const label = form.querySelector(`label[for="${control.id}"]`);
      expect(label, `no <label> for #${control.id}`).not.toBeNull();
      expect(label?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('uses a native date input, which emits YYYY-MM-DD (ADR-0005)', () => {
    expect(due().type).toBe('date');
  });

  it('offers exactly four priority choices — None, Low, Medium, High (AC-003.3)', () => {
    const options = [...priority().options].map((o) => ({ value: o.value, text: o.textContent }));

    expect(options).toEqual([
      { value: '', text: 'None' },
      { value: 'low', text: 'Low' },
      { value: 'medium', text: 'Medium' },
      { value: 'high', text: 'High' },
    ]);
  });

  it('offers no fourth priority level under any name (C-04)', () => {
    expect(priority().options).toHaveLength(4);
    expect([...priority().options].map((o) => o.value)).not.toContain('urgent');
  });

  it('gives every control a focus key (architecture §4.3)', () => {
    const keys = [...form.querySelectorAll('[data-focus-key]')].map((el) =>
      el.getAttribute('data-focus-key'),
    );

    expect(keys).toEqual(['form:title', 'form:dueDate', 'form:priority', 'form:submit']);
  });

  it('wires the message region to the title field (AC-009.6, architecture §9.5)', () => {
    expect(title().getAttribute('aria-describedby')).toBe(message().id);
    expect(message().getAttribute('aria-live')).toBe('assertive');
  });

  it('keeps the live region in the document while it is silent', () => {
    // A live region added at the same moment as its text is announced
    // unreliably, so it is always present and merely empty.
    expect(message().isConnected).toBe(true);
    expect(message().textContent).toBe('');
    expect(message().hasAttribute('hidden')).toBe(false);
  });

  it('starts with no invalid state (AC-001.7 — nothing to clear on a first visit)', () => {
    expect(title().hasAttribute('aria-invalid')).toBe(false);
    expect(store.getState().tasks).toEqual([]);
  });
});

// ───────────────────────────── successful create ──────────────────────────

describe('a valid submit creates a task', () => {
  it('adds a task with exactly the title entered (AC-001.1)', () => {
    title().value = 'Buy milk';
    submit();

    expect(store.getState().tasks).toHaveLength(1);
    expect(store.getState().tasks[0]?.title).toBe('Buy milk');
  });

  it('carries the due date when one is supplied (AC-002.1)', () => {
    title().value = 'Pay rent';
    due().value = DATE_MID;
    submit();

    expect(store.getState().tasks[0]?.dueDate).toBe(DATE_MID);
  });

  it('carries the priority when one is selected (AC-003.1)', () => {
    title().value = 'Call dentist';
    priority().value = 'high';
    submit();

    expect(store.getState().tasks[0]?.priority).toBe('high');
  });

  it('creates successfully with neither date nor priority (AC-002.2, AC-003.2)', () => {
    title().value = 'Just a title';
    submit();

    expect(store.getState().tasks[0]).toMatchObject({
      dueDate: null,
      priority: null,
      completed: false,
    });
  });

  it('clears all three fields on success', () => {
    title().value = 'Buy milk';
    due().value = DATE_MID;
    priority().value = 'low';
    submit();

    expect(title().value).toBe('');
    expect(due().value).toBe('');
    expect(priority().value).toBe('');
  });

  it('returns focus to the title input (architecture §9.4, DO-1)', () => {
    title().value = 'Buy milk';
    title().focus();
    submit();

    expect(document.activeElement).toBe(title());
  });

  it('does not reload the page (AC-001.3)', () => {
    // The submit event must be prevented; otherwise the browser navigates and
    // "appears without a full page reload" fails.
    let defaultPrevented = false;
    form.addEventListener('submit', (e) => {
      defaultPrevented = e.defaultPrevented;
    });

    title().value = 'Buy milk';
    submit();

    expect(defaultPrevented).toBe(true);
  });

  it('lets two tasks share a title (AC-001.6)', () => {
    title().value = 'Buy milk';
    submit();
    title().value = 'Buy milk';
    submit();

    expect(store.getState().tasks).toHaveLength(2);
    expect(store.getState().tasks[0]?.id).not.toBe(store.getState().tasks[1]?.id);
  });
});

// ──────────────────────────── rejected submit ─────────────────────────────

describe('an empty title is rejected (FR-009)', () => {
  it('creates nothing (AC-009.1)', () => {
    submit();
    expect(store.getState().tasks).toEqual([]);
  });

  it('displays a visible message (AC-009.2)', () => {
    submit();

    // "Visible" means text a sighted user reads — not an attribute, not a
    // colour. Silent failure is a defect.
    expect(message().textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(message().hasAttribute('hidden')).toBe(false);
  });

  it.each([' ', '   ', '\t', '\n'])('rejects a whitespace-only title %j (AC-009.4)', (value) => {
    title().value = value;
    submit();

    expect(store.getState().tasks).toEqual([]);
    expect(message().textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('marks the title field invalid (AC-009.6)', () => {
    submit();
    expect(title().getAttribute('aria-invalid')).toBe('true');
  });

  it('keeps the due date and priority the user already entered (AC-009.3)', () => {
    due().value = DATE_MID;
    priority().value = 'medium';
    title().value = '   ';

    submit();

    expect(due().value).toBe(DATE_MID);
    expect(priority().value).toBe('medium');
  });

  it('keeps the offending title so it can be corrected, not retyped (AC-009.3)', () => {
    title().value = '   ';
    submit();

    expect(title().value).toBe('   ');
  });

  it('clears the message and the invalid flag on the next valid submit (AC-009.5)', () => {
    submit();
    expect(message().textContent?.trim().length ?? 0).toBeGreaterThan(0);

    title().value = 'Buy milk';
    submit();

    expect(message().textContent).toBe('');
    expect(title().hasAttribute('aria-invalid')).toBe(false);
    expect(store.getState().tasks).toHaveLength(1);
  });

  it('leaves focus in the form so the correction can be typed', () => {
    title().focus();
    submit();

    expect(document.activeElement).not.toBe(document.body);
  });
});

// ─────────────────────────── whitespace handling ──────────────────────────

describe('title whitespace (AC-001.4, AC-009.4)', () => {
  it('trims the ends, which have no visible content', () => {
    title().value = '  Buy milk  ';
    submit();

    expect(store.getState().tasks[0]?.title).toBe('Buy milk');
  });

  it('leaves interior spacing exactly as entered', () => {
    title().value = 'Call  the   dentist';
    submit();

    expect(store.getState().tasks[0]?.title).toBe('Call  the   dentist');
  });
});
