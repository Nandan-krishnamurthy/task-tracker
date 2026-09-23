/**
 * Composition root (plan T-409).
 *
 * The startup sequence of architecture §1.1:
 *
 *     storage.load()  ->  dispatch(LOAD)  ->  mount ui/app
 *
 * Storage is read EXACTLY ONCE, here, and never again (ADR-0001). Nothing
 * downstream re-reads it: the store is the single source of truth for the
 * session, and `ui/` only ever sees state. That is what makes the read path a
 * single reviewable line rather than something that could happen on any event.
 *
 * There is no re-read on focus, on visibility change, or on a `storage`
 * event. The first two would be re-reading; the last would be NG-07, multi-tab
 * consistency, which is explicitly out of scope.
 *
 * This is also the whole of the "no setup" promise: the app loads what is
 * there and is immediately usable. There is no import step, no unlock, no
 * restore prompt, and no account (AC-001.7, AC-008.3, NG-01).
 */

import './styles.css';

import { load } from './persistence/storage';
import { createStore } from './store/store';
import { mountApp } from './ui/app';
import type { AppHandle } from './ui/app';

/**
 * Start the application in the given page skeleton.
 *
 * Exported so the startup sequence itself can be exercised, rather than only
 * the modules it wires together.
 */
export function start(root: HTMLElement): AppHandle {
  const store = createStore();

  /*
   * `load` is total: a missing payload, a corrupt one, and storage being
   * unreachable all return an empty list rather than throwing (architecture
   * §8). So there is no try/catch here and no error path to get wrong —
   * AC-008.5 and AC-008.6 both land on the same usable empty list, and
   * `storageOk` carries the difference for anything that needs it.
   */
  const { tasks, storageOk } = load();

  store.dispatch({ type: 'LOAD', tasks, storageOk });

  return mountApp(store, root);
}

/*
 * Auto-start when this module is loaded by the real page.
 *
 * Guarded on the mount point existing so that importing this module in a test
 * that has not installed the skeleton is inert rather than a thrown error at
 * import time.
 */
const root = document.getElementById('app');

if (root !== null) {
  start(root);
}
