/**
 * The store (plan T-302).
 *
 * One state object, one pure reducer, a dispatch, and a subscription list.
 * No state library: architecture §3.1 puts the whole thing at roughly forty
 * lines, and the pattern is the one Redux popularised, minus Redux.
 *
 * The reducer is where validation lives. Architecture §3.2 is explicit that
 * CREATE_TASK and UPDATE_TASK validate here rather than in the UI, so the rule
 * cannot be bypassed by dispatching directly — that is what makes AC-009.1 and
 * AC-005.6 structural rather than a courtesy the form happens to extend.
 */

import { selectVisibleTasks } from '../core/filter';
import { addTask, createTask, deleteTask, toggleComplete, updateTask } from '../core/tasks';
import type { TaskIdentity } from '../core/tasks';
import type { AppState, Task } from '../core/types';
import { validateTitle } from '../core/validation';
import { save } from '../persistence/storage';
import type { Action } from './actions';

/**
 * The state an app starts from, before anything is loaded.
 *
 * Opens on the ACTIVE view: OQ-05 was resolved that way because DO-1 and DO-2
 * centre on capturing and seeing open work (architecture §5.3).
 *
 * `storageOk` starts true and is corrected by LOAD. Starting false would make
 * a healthy first visit briefly look like a failure.
 */
export function createInitialState(): AppState {
  return {
    tasks: [],
    filter: 'active',
    editingId: null,
    formError: null,
    editError: null,
    storageOk: true,
  };
}

/**
 * Apply one action. PURE — a total function of (state, action, identity).
 *
 * `identity` supplies the id and timestamp for a task created by this action.
 * crypto.randomUUID() and Date.now() are side effects, and ADR-0001 keeps
 * decision logic free of them; the store calls both and passes the result in,
 * so this function can be tested exhaustively without a clock or a mock. Every
 * action other than CREATE_TASK ignores it.
 *
 * Never sorts. Ordering is derived at render (ADR-0007), so `tasks` stays in
 * insertion order here and the comparator's createdAt tie-break keeps meaning.
 */
export function reduce(state: AppState, action: Action, identity: TaskIdentity): AppState {
  switch (action.type) {
    case 'LOAD': {
      // Startup only. Adopts what storage returned, including the flag saying
      // whether storage is usable at all (architecture §8, modes 2 and 3).
      return { ...state, tasks: action.tasks, storageOk: action.storageOk };
    }

    case 'CREATE_TASK': {
      const validation = validateTitle(action.title);

      if (!validation.ok) {
        // AC-009.1: no task is created. The form's due date and priority are
        // held by the form itself, so nothing the user entered is lost
        // (AC-009.3) — state simply carries the message.
        return { ...state, formError: validation.message };
      }

      const task = createTask(
        { title: validation.value, dueDate: action.dueDate, priority: action.priority },
        identity,
      );

      // AC-009.5: a successful submit clears the message.
      return { ...state, tasks: addTask(state.tasks, task), formError: null };
    }

    case 'TOGGLE_COMPLETE': {
      return { ...state, tasks: toggleComplete(state.tasks, action.id) };
    }

    case 'UPDATE_TASK': {
      const validation = validateTitle(action.title);

      if (!validation.ok) {
        // AC-005.6: the edit is rejected and the task keeps its previous
        // title. `editingId` is left alone so the form stays open on the
        // offending value rather than discarding the user's work.
        return { ...state, editError: validation.message };
      }

      return {
        ...state,
        tasks: updateTask(state.tasks, action.id, {
          title: validation.value,
          dueDate: action.dueDate,
          priority: action.priority,
        }),
        editingId: null,
        editError: null,
      };
    }

    case 'DELETE_TASK': {
      // Applies immediately: no confirmation step, no undo (OQ-04, J3 step 3).
      // If the deleted task was the one being edited, the edit closes with it;
      // leaving editingId pointing at a task that no longer exists would
      // strand the UI in edit mode over nothing.
      const wasEditing = state.editingId === action.id;

      return {
        ...state,
        tasks: deleteTask(state.tasks, action.id),
        editingId: wasEditing ? null : state.editingId,
        editError: wasEditing ? null : state.editError,
      };
    }

    case 'SET_FILTER': {
      // Switching views never touches task data (FR-007).
      return { ...state, filter: action.filter };
    }

    case 'BEGIN_EDIT': {
      // Clears any stale message from a previous edit, so opening a form never
      // shows an error about a different task.
      return { ...state, editingId: action.id, editError: null };
    }

    case 'CANCEL_EDIT': {
      return { ...state, editingId: null, editError: null };
    }
  }
}

/** A listener invoked after each dispatch. */
export type Listener = () => void;

/** Unsubscribes the listener it came from. Calling it twice is harmless. */
export type Unsubscribe = () => void;

export interface Store {
  /** The current state. Treat as immutable. */
  getState(): AppState;
  /** Apply an action, then notify subscribers. */
  dispatch(action: Action): void;
  /** Register a listener. Returns its unsubscribe function. */
  subscribe(listener: Listener): Unsubscribe;
}

/**
 * The non-deterministic inputs the store needs.
 *
 * Injectable so tests can make dispatch fully deterministic. Defaults are the
 * real browser sources.
 */
export interface StoreDeps {
  /** A fresh unique task id. */
  newId(): string;
  /** Current time, epoch milliseconds. */
  now(): number;
  /** Durably write the task list. Returns whether the write succeeded. */
  persist(tasks: readonly Task[]): boolean;
}

/**
 * Generate a task id.
 *
 * crypto.randomUUID() where available. It requires a SECURE CONTEXT, so it is
 * absent when the app is served over plain http from anything other than
 * localhost — hence the fallback, which needs only to be unique within one
 * browser's task list, not globally unguessable. No task id is ever a secret:
 * nothing leaves the device (NFR-SEC-001) and there is no account (NG-01).
 */
function defaultNewId(): string {
  const webCrypto = globalThis.crypto;

  if (webCrypto !== undefined && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  const stamp = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 10);

  return 'task-' + stamp + '-' + noise;
}

/**
 * Create a store.
 *
 * `identity` is computed on every dispatch rather than only for CREATE_TASK.
 * That costs one id and one timestamp per action and keeps `reduce` a plain
 * total function with no conditional plumbing; actions are user-paced, so the
 * cost is immeasurable against the 100 ms budget of NFR-PERF-001.
 */
export function createStore(deps: Partial<StoreDeps> = {}): Store {
  const newId = deps.newId ?? defaultNewId;
  const now = deps.now ?? Date.now;
  const persist = deps.persist ?? save;

  let state = createInitialState();
  const listeners = new Set<Listener>();

  return {
    getState(): AppState {
      return state;
    },

    /**
     * Apply an action, persist if it changed the tasks, then notify.
     *
     * WRITE-THROUGH, SYNCHRONOUS, IMMEDIATE (plan T-303, ADR-0004). There is
     * no debounce, no queue, no idle callback, and — decisively — no
     * beforeunload handler. AC-REL.3 rules that last one out by name, because
     * an unload handler is not guaranteed to run on a crash, an OS kill, or a
     * forced quit. The invariant is one line: an action that has been
     * dispatched has been persisted.
     *
     * The write happens BEFORE subscribers are notified, so the UI can never
     * paint a state that storage does not already hold. Without that ordering
     * a user could watch their task appear, lose the tab, and find it gone.
     */
    dispatch(action: Action): void {
      const previous = state;
      let next = reduce(previous, action, { id: newId(), createdAt: now() });

      // A changed task list means a new array: every core operation returns
      // one. A rejected create or update keeps the previous array by
      // reference, so nothing is written for it — which is what AC-009.1 and
      // AC-005.6 require. Neither is anything written for SET_FILTER,
      // BEGIN_EDIT, or CANCEL_EDIT, which never touch tasks at all.
      //
      // LOAD is excluded deliberately: its tasks came FROM storage, so writing
      // them straight back is a redundant round trip, and on a degraded load
      // it would overwrite the stored payload before the user has acted.
      if (action.type !== 'LOAD' && next.tasks !== previous.tasks) {
        const saved = persist(next.tasks);

        // storageOk tracks whether storage is WORKING, so a successful write
        // clears a flag an earlier failure set, and a failed write raises it.
        // A failure never throws: in-memory state stays correct and the
        // session remains fully usable (AC-SUP.2).
        if (saved !== next.storageOk) {
          next = { ...next, storageOk: saved };
        }
      }

      state = next;

      // Copied before iterating: a listener that unsubscribes (or subscribes)
      // during notification must not disturb this pass.
      for (const listener of [...listeners]) {
        listener();
      }
    },

    subscribe(listener: Listener): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The tasks to render, in display order.
 *
 * A thin pass-through to the core selector, offered here so the UI has one
 * obvious place to ask. The result is derived on every call and never cached
 * (ADR-0007), which is what makes AC-010.3 and AC-010.4 fall out for free.
 */
export function selectVisible(state: AppState): Task[] {
  return selectVisibleTasks(state.tasks, state.filter);
}
