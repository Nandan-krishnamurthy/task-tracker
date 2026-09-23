/**
 * The task list (plan T-407).
 *
 * Renders the `<ul>` for the current view from `selectVisible`, and the empty
 * state when that view has no tasks.
 *
 * The visible order is DERIVED on every render and never stored (ADR-0007,
 * architecture §5.1). That is what makes AC-010.3 and AC-010.4 fall out for
 * free rather than needing code of their own: a new task appears in its sorted
 * position, and editing a due date re-sorts the list, because there is no
 * cached order that could disagree with the data.
 *
 * FULL REBUILD of the `<ul>` on every state change (architecture §4.3). The
 * list is small and the work is O(n) DOM creation, well inside NFR-PERF-001.
 * What the rebuild costs is keyboard focus, which is why `ui/app.ts` brackets
 * every call to `update` with `ui/focus.ts`.
 *
 * Nothing is paginated or virtualized: no requirement asks for it, and A-02
 * records that no task-count limit is enforced.
 */

import { selectVisible } from '../store/store';
import type { Store } from '../store/store';
import type { AppState, Filter } from '../core/types';
import { attachTaskActions, renderTaskEditor, renderTaskItem } from './taskItem';

/**
 * What an empty view says (AC-007.5).
 *
 * Per view, because "nothing here" means two different things: an empty Active
 * list is an invitation, and an empty Completed list is simply a fact. Neither
 * is an error, and neither may render as one.
 */
const EMPTY_STATE: Readonly<Record<Filter, string>> = {
  active: 'No active tasks. Add one above to get started.',
  completed: 'No completed tasks yet.',
};

/** The list's accessible name, so the two views are distinguishable. */
const LIST_LABEL: Readonly<Record<Filter, string>> = {
  active: 'Active tasks',
  completed: 'Completed tasks',
};

export interface TaskListHandle {
  /** The stable container to mount. Only its contents are rebuilt. */
  readonly element: HTMLElement;
  /** Rebuild the list for the given state. */
  update(state: AppState): void;
  /** Remove the delegated listeners. */
  destroy(): void;
}

/**
 * Create the list region's contents and wire it to the store.
 *
 * The container is created ONCE and outlives every rebuild. The delegated
 * action listeners live on it, so the rows inside can be discarded freely —
 * which is what keeps repeated rebuilds from accumulating handlers.
 */
export function createTaskList(store: Store): TaskListHandle {
  const element = document.createElement('div');
  element.className = 'task-list-region';

  const detach = attachTaskActions(element, store);

  return {
    element,

    update(state: AppState): void {
      element.replaceChildren();

      const visible = selectVisible(state);

      if (visible.length === 0) {
        // AC-006.6: deleting the last task leaves an empty list, not an error.
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = EMPTY_STATE[state.filter];
        element.append(empty);
        return;
      }

      const list = document.createElement('ul');
      list.className = 'task-list';
      list.setAttribute('aria-label', LIST_LABEL[state.filter]);

      for (const task of visible) {
        list.append(
          task.id === state.editingId
            ? renderTaskEditor(task, state.editError)
            : renderTaskItem(task),
        );
      }

      element.append(list);
    },

    destroy(): void {
      detach();
      element.replaceChildren();
    },
  };
}
