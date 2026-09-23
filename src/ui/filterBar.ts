/**
 * The Active / Completed toggle (plan T-404).
 *
 * Realises FR-007's "view active tasks separately from completed tasks" as two
 * `<button>` elements in a labelled group, each carrying `aria-pressed` to say
 * which view is current (architecture §9.3).
 *
 * NOT an ARIA `tablist`, though the tabs pattern is arguably the more precise
 * semantic. Tabs require roving `tabindex` and arrow-key handling — mechanism
 * we would hand-write and could get subtly wrong. Toggle buttons are reachable
 * by Tab alone, need no key handling at all, and fully satisfy AC-007.6. The
 * rationale is recorded in architecture §9.3 and is the simpler-correct-option
 * principle, not an oversight.
 *
 * There is no third "All" button. OQ-05 was resolved in favour of the literal
 * reading of FR-007, which names two views (architecture §5.3).
 */

import { FILTERS } from '../core/types';
import type { AppState, Filter } from '../core/types';
import type { Store } from '../store/store';
import { FOCUS_KEY_ATTR } from './focus';

/** Visible button text for each view. */
const FILTER_LABELS: Readonly<Record<Filter, string>> = {
  active: 'Active',
  completed: 'Completed',
};

export interface FilterBarHandle {
  /** The element to mount. */
  readonly element: HTMLElement;
  /** Re-render the pressed state. Called on every render. */
  update(state: AppState): void;
}

/**
 * Create the filter bar and wire it to the store.
 *
 * Built once and updated in place (architecture §4.3): only `aria-pressed` and
 * the styling that follows it change, so there is nothing here that a rebuild
 * would need to reconstruct — and not rebuilding it means the button the user
 * just pressed is still the element holding focus afterwards.
 */
export function createFilterBar(store: Store): FilterBarHandle {
  const element = document.createElement('div');
  element.className = 'filter-bar';

  /*
   * A group rather than a bare pair of buttons: without it, a screen-reader
   * user tabbing in hears "Active, button" with nothing to say what it
   * selects between. The name is on the group so the buttons keep their own
   * short, scannable labels (AC-007.6).
   */
  const group = document.createElement('div');
  group.className = 'filter-bar__group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Filter tasks by status');

  const buttons = FILTERS.map((filter) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-button';
    button.textContent = FILTER_LABELS[filter];
    button.dataset['filter'] = filter;
    button.setAttribute(FOCUS_KEY_ATTR, `filter:${filter}`);

    button.addEventListener('click', () => {
      store.dispatch({ type: 'SET_FILTER', filter });
    });

    group.append(button);
    return { filter, button };
  });

  element.append(group);

  return {
    element,

    update(state: AppState): void {
      for (const { filter, button } of buttons) {
        // Written on every render rather than toggled, so the DOM is a
        // function of state and cannot drift out of step with it.
        button.setAttribute('aria-pressed', String(state.filter === filter));
      }
    },
  };
}
