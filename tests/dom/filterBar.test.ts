import { beforeEach, describe, expect, it } from 'vitest';

import type { Store } from '../../src/store/store';
import { createStore } from '../../src/store/store';
import { createFilterBar } from '../../src/ui/filterBar';
import { T0 } from '../support/fixtures';
import { mountPageSkeleton, regionOf } from '../support/page';

/**
 * T-404 verification — the filter bar.
 *
 * Traceability: FR-007.
 * Acceptance criteria: AC-007.1, AC-007.2, AC-007.6.
 */

let root: HTMLElement;
let store: Store;
let bar: HTMLElement;

beforeEach(() => {
  root = mountPageSkeleton();
  store = createStore({ newId: () => 'id', now: () => T0, persist: () => true });

  const handle = createFilterBar(store);
  store.subscribe(() => handle.update(store.getState()));
  handle.update(store.getState());

  regionOf(root, 'filter').append(handle.element);
  bar = handle.element;
});

const buttons = (): HTMLButtonElement[] => [...bar.querySelectorAll('button')];
const buttonFor = (filter: string): HTMLButtonElement =>
  bar.querySelector<HTMLButtonElement>(`[data-filter="${filter}"]`)!;
const pressed = (): string[] =>
  buttons()
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.dataset['filter'] ?? '');

describe('filter bar structure (architecture §9.3)', () => {
  it('offers exactly two views, Active and Completed', () => {
    expect(buttons().map((b) => b.textContent)).toEqual(['Active', 'Completed']);
  });

  it('offers no combined "All" view (OQ-05, architecture §5.3)', () => {
    expect(buttons()).toHaveLength(2);
    expect(bar.textContent?.toLowerCase()).not.toContain('all');
  });

  it('places the buttons in a group with an accessible name (AC-007.6)', () => {
    const group = bar.querySelector('[role="group"]');

    expect(group).not.toBeNull();
    expect(group?.getAttribute('aria-label')?.trim().length ?? 0).toBeGreaterThan(0);
    expect(group?.querySelectorAll('button')).toHaveLength(2);
  });

  it('uses real buttons, so Enter and Space both activate them (AC-007.6)', () => {
    for (const button of buttons()) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
    }
  });

  it('is reachable by Tab alone — no roving tabindex (architecture §9.3)', () => {
    // A negative tabindex on either button would take it out of the tab order,
    // which is exactly the failure mode the tablist pattern was rejected to
    // avoid having to hand-write correctly.
    for (const button of buttons()) {
      expect(button.hasAttribute('tabindex')).toBe(false);
      expect(button.hasAttribute('disabled')).toBe(false);
    }
  });

  it('gives each button a focus key (architecture §4.3)', () => {
    expect(buttons().map((b) => b.getAttribute('data-focus-key'))).toEqual([
      'filter:active',
      'filter:completed',
    ]);
  });
});

describe('filter bar behaviour (FR-007)', () => {
  it('opens on the Active view (architecture §5.3)', () => {
    expect(store.getState().filter).toBe('active');
    expect(pressed()).toEqual(['active']);
  });

  it('switches to the completed view when Completed is clicked (AC-007.2)', () => {
    buttonFor('completed').click();

    expect(store.getState().filter).toBe('completed');
  });

  it('switches back to the active view (AC-007.1)', () => {
    buttonFor('completed').click();
    buttonFor('active').click();

    expect(store.getState().filter).toBe('active');
  });

  it('tracks the current view with aria-pressed, one at a time', () => {
    expect(buttonFor('active').getAttribute('aria-pressed')).toBe('true');
    expect(buttonFor('completed').getAttribute('aria-pressed')).toBe('false');

    buttonFor('completed').click();

    expect(buttonFor('active').getAttribute('aria-pressed')).toBe('false');
    expect(buttonFor('completed').getAttribute('aria-pressed')).toBe('true');
    expect(pressed()).toEqual(['completed']);
  });

  it('reflects a filter change that did not come from these buttons', () => {
    // The buttons render state; they do not own it. A SET_FILTER dispatched
    // from anywhere must be reflected here.
    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });

    expect(pressed()).toEqual(['completed']);
  });

  it('stays pressed when the same view is clicked twice', () => {
    buttonFor('active').click();
    buttonFor('active').click();

    expect(store.getState().filter).toBe('active');
    expect(pressed()).toEqual(['active']);
  });

  it('never touches task data (FR-007)', () => {
    store.dispatch({ type: 'CREATE_TASK', title: 'Buy milk', dueDate: null, priority: null });
    const before = store.getState().tasks;

    buttonFor('completed').click();
    buttonFor('active').click();

    expect(store.getState().tasks).toBe(before);
  });

  it('keeps the clicked button focused — it is never rebuilt', () => {
    const button = buttonFor('completed');
    button.focus();
    button.click();

    expect(document.activeElement).toBe(button);
    expect(button.isConnected).toBe(true);
  });
});
