/**
 * Render composition (plan T-408).
 *
 * Subscribes to the store and, on each change, runs the cycle architecture
 * §4.2 and §4.3 specify:
 *
 *     capture focus  ->  update form and filter bar in place
 *                    ->  rebuild the list
 *                    ->  restore focus
 *
 * The form and filter bar are created ONCE. Only the `<ul>` is rebuilt, and
 * the rebuild is bracketed by `ui/focus.ts` because it is the rebuild that
 * destroys the user's place in the interface.
 *
 * This module reads NO storage (ADR-0001: `src/main.ts` does that, once) and
 * mutates no state. It turns state into DOM and DOM events into dispatches,
 * and holds nothing of its own except the previous state — which it keeps only
 * to tell which of the architecture §9.4 focus moves a transition calls for.
 */

import type { AppState } from '../core/types';
import type { Store } from '../store/store';
import { captureFocus, restoreFocus, snapshotForKey, taskFocusKey } from './focus';
import type { FocusSnapshot } from './focus';
import { createFilterBar } from './filterBar';
import { createTaskForm } from './taskForm';
import { createTaskList } from './taskList';

/** Where each module mounts, by the `data-region` hook in `index.html`. */
function regionOf(root: ParentNode, name: string): HTMLElement {
  const region = root.querySelector<HTMLElement>(`[data-region="${name}"]`);

  if (region === null) {
    // Loud at composition time rather than a silently half-rendered page.
    throw new Error(`Page skeleton has no [data-region="${name}"] container`);
  }

  return region;
}

/**
 * The focus move a transition calls for, or null to restore what was focused.
 *
 * Derived from the state transition rather than signalled by the control that
 * caused it. A control that has to announce its own focus consequence is a
 * control that can forget to: deriving it means BEGIN_EDIT moves focus into
 * the edit form no matter who dispatched it.
 *
 * Covers rows 3 and 4 of architecture §9.4. Row 5 — focus returning to the
 * title input after a create — belongs to `ui/taskForm.ts`, which owns the
 * fields it clears at the same moment. Rows 1 and 2 need no direction at all:
 * they are what capture-and-restore does by default.
 */
function directedFocus(previous: AppState, next: AppState): FocusSnapshot | null {
  if (previous.editingId === null && next.editingId !== null) {
    // An edit began: move into the form's title field.
    return snapshotForKey(taskFocusKey(next.editingId, 'edit-title'));
  }

  if (previous.editingId !== null && next.editingId === null) {
    // An edit was saved or cancelled: return to that task's Edit button. If
    // the task is gone — deleted while being edited — the key will not be
    // found and `restoreFocus` falls through to its defined fallback.
    return snapshotForKey(taskFocusKey(previous.editingId, 'edit'));
  }

  return null;
}

export interface AppHandle {
  /** Detach from the store and remove everything this mounted. */
  unmount(): void;
}

/**
 * Mount the interface into the page skeleton and keep it in step with state.
 *
 * `root` is the `#app` element of `index.html`; its three `data-region`
 * containers are where the modules go.
 */
export function mountApp(store: Store, root: HTMLElement): AppHandle {
  const form = createTaskForm(store);
  const filterBar = createFilterBar(store);
  const taskList = createTaskList(store);

  regionOf(root, 'form').append(form.element);
  regionOf(root, 'filter').append(filterBar.element);
  regionOf(root, 'list').append(taskList.element);

  let previous = store.getState();

  /**
   * One render.
   *
   * `initial` skips the focus cycle entirely: on the first paint nothing has
   * been focused yet, and restoring a null snapshot would pull focus into the
   * title input before the user has asked for it — which is a page that steals
   * the caret on load, not an accessibility feature.
   */
  function render(state: AppState, directed: FocusSnapshot | null, initial: boolean): void {
    const snapshot = initial ? null : (directed ?? captureFocus(root));

    form.update(state);
    filterBar.update(state);
    taskList.update(state);

    if (snapshot !== null) restoreFocus(root, snapshot);
  }

  render(previous, null, true);

  const unsubscribe = store.subscribe(() => {
    const next = store.getState();
    render(next, directedFocus(previous, next), false);
    previous = next;
  });

  return {
    unmount(): void {
      unsubscribe();
      taskList.destroy();
      form.element.remove();
      filterBar.element.remove();
      taskList.element.remove();
    },
  };
}
