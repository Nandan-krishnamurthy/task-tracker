/**
 * Browser storage access (plan T-202).
 *
 * THE ONLY MODULE IN src/ THAT MAY TOUCH localStorage.
 *
 * That restriction is what turns the NFR-SUP-001 no-crash guarantee into a
 * single reviewable claim — "every entry point of this file is wrapped" —
 * rather than an audit of the whole codebase on every change. T-203 enforces
 * it automatically.
 *
 * Mechanism per ADR-0003: window.localStorage, one key, a versioned JSON
 * envelope, the whole array rewritten on each save. Its SYNCHRONOUS API is
 * the enabling property for ADR-0004 write-through, which is why IndexedDB
 * was rejected.
 */

import type { Task } from '../core/types';
import { decode, encode } from './schema';

/**
 * The single storage key (ADR-0003).
 *
 * The `.v1` suffix pairs with the envelope's schemaVersion. C-06 confirms
 * there is no prior format to migrate from.
 */
export const STORAGE_KEY = 'task-tracker.v1';

/**
 * The slice of the Storage API this module uses.
 *
 * Narrowed to two methods so tests can supply a fake without standing up a
 * whole Storage implementation, and so it is obvious at a glance that nothing
 * here clears, enumerates, or watches storage.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Outcome of reading stored tasks at startup. */
export interface LoadResult {
  /** The stored tasks, or an empty list on a first visit or any failure. */
  tasks: Task[];
  /**
   * Whether storage is USABLE — not whether data was found.
   *
   * False only for architecture §8 failure modes 2 and 3: storage is
   * unavailable or unreadable. A corrupt payload (mode 1) leaves this TRUE,
   * because storage itself works perfectly well and the next save will
   * succeed; it was the data that was bad, not the mechanism.
   */
  storageOk: boolean;
}

/**
 * The browser's localStorage, or null when it cannot be reached.
 *
 * Merely ACCESSING window.localStorage throws in some configurations — a
 * private window with site data blocked, or an embedding context that denies
 * storage — so the property read itself is inside the try, not just the calls
 * that follow.
 *
 * Resolved lazily on each call rather than captured at module load, so
 * importing this module has no side effect and is safe in a non-browser test
 * environment.
 */
export function getBrowserStorage(): StorageLike | null {
  try {
    const storage: unknown = globalThis.localStorage;

    if (
      typeof storage !== 'object' ||
      storage === null ||
      typeof (storage as StorageLike).getItem !== 'function' ||
      typeof (storage as StorageLike).setItem !== 'function'
    ) {
      return null;
    }

    return storage as StorageLike;
  } catch {
    return null;
  }
}

/**
 * Read stored tasks. Called ONCE, at startup (ADR-0001).
 *
 * Requires no user action — no import, unlock, or restore step (AC-008.3).
 * That is what DO-1's zero-setup promise rests on, and it is why the File
 * System Access API was rejected in ADR-0003: it needs a permission gesture.
 *
 * Never throws. The three failure modes of architecture §8 all land on a
 * usable, empty list:
 *
 *   1. Malformed payload        -> [] with storageOk true  (AC-008.6, AC-SUP.1)
 *   2. Storage unavailable      -> [] with storageOk false (AC-SUP.2)
 *   3. Read itself throws       -> [] with storageOk false (AC-SUP.2)
 *
 * In every case the user can create tasks immediately afterwards (AC-SUP.3).
 */
export function load(storage: StorageLike | null = getBrowserStorage()): LoadResult {
  if (storage === null) {
    return { tasks: [], storageOk: false };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { tasks: [], storageOk: false };
  }

  // decode is total: no payload, however hostile, can throw from here.
  return { tasks: decode(raw), storageOk: true };
}

/**
 * Write tasks. Returns whether the write succeeded.
 *
 * Called synchronously by the store on every mutating action, before
 * subscribers are notified (ADR-0004). There is deliberately no debounce, no
 * queue, and no unload handler: AC-REL.3 rules out deferring persistence,
 * because an unload handler is not guaranteed to run on a crash.
 *
 * A failure — quota exceeded, storage blocked mid-session — returns false and
 * never throws into the caller. The store records storageOk false; in-memory
 * state stays correct and the session remains fully usable (AC-SUP.2).
 *
 * No backup or quarantine key is written. ADR-0006 alternative D was rejected:
 * the PRD's risk table already accepts that local-only persistence has no
 * recovery path, and a half-recovery mechanism no UI exposes is scope the
 * product has not asked for.
 */
export function save(
  tasks: readonly Task[],
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  if (storage === null) {
    return false;
  }

  try {
    storage.setItem(STORAGE_KEY, encode(tasks));
    return true;
  } catch {
    return false;
  }
}
