import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '../../src/core/types';
import { STORAGE_KEY, load } from '../../src/persistence/storage';
import type { StorageLike } from '../../src/persistence/storage';
import { save } from '../../src/persistence/storage';
import type { Action } from '../../src/store/actions';
import { createStore } from '../../src/store/store';
import { DATE_EARLY, DATE_MID, T0, makeTask } from '../support/fixtures';

/**
 * T-303 verification — write-through persistence.
 *
 * Traceability: NFR-REL-001, ADR-0004.
 * Acceptance criteria: AC-008.4, AC-REL.1, AC-REL.2, AC-REL.3.
 *
 * Tier 2 per ADR-0008: storage is faked, so write failures are injected
 * directly rather than provoked.
 */

/** Records every write, and can be made to fail. */
class RecordingStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  public throwOnSet = false;
  public writes: string[] = [];

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw new DOMException('quota exceeded', 'QuotaExceededError');
    this.writes.push(value);
    this.data.set(key, value);
  }

  peek(key: string): string | null {
    return this.data.get(key) ?? null;
  }
}

let storage: RecordingStorage;
let persist: ReturnType<typeof vi.fn>;

/** A store whose only non-determinism is the injected persist spy. */
function makeStore(overrides: { persist?: (tasks: readonly Task[]) => boolean } = {}) {
  let n = 0;
  return createStore({
    newId: () => {
      n += 1;
      return 'id-' + n;
    },
    now: () => T0 + n,
    persist: overrides.persist ?? (persist as unknown as (t: readonly Task[]) => boolean),
  });
}

beforeEach(() => {
  storage = new RecordingStorage();
  persist = vi.fn(() => true);
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

const CREATE: Action = { type: 'CREATE_TASK', title: 'Buy milk', dueDate: null, priority: null };

// ───────────────── writes on every mutating action (AC-008.4) ─────────────

describe('persists every mutating action (AC-008.4)', () => {
  it('writes on CREATE_TASK', () => {
    const store = makeStore();

    store.dispatch(CREATE);

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('writes on TOGGLE_COMPLETE', () => {
    const store = makeStore();
    store.dispatch(CREATE);
    persist.mockClear();

    store.dispatch({ type: 'TOGGLE_COMPLETE', id: 'id-1' });

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('writes on UPDATE_TASK', () => {
    const store = makeStore();
    store.dispatch(CREATE);
    persist.mockClear();

    store.dispatch({
      type: 'UPDATE_TASK',
      id: 'id-1',
      title: 'Renamed',
      dueDate: DATE_MID,
      priority: 'high',
    });

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('writes on DELETE_TASK', () => {
    const store = makeStore();
    store.dispatch(CREATE);
    persist.mockClear();

    store.dispatch({ type: 'DELETE_TASK', id: 'id-1' });

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('writes the CURRENT task list, not a stale one', () => {
    const store = makeStore();

    store.dispatch(CREATE);
    store.dispatch({ type: 'CREATE_TASK', title: 'Second', dueDate: null, priority: null });

    // Explicit indexing rather than Array.prototype.at: `at` is ES2022 and
    // the lib baseline is ES2020 (architecture §12).
    const calls = persist.mock.calls;
    const lastCall = calls[calls.length - 1]?.[0] as Task[];

    expect(lastCall.map((t) => t.title)).toEqual(['Buy milk', 'Second']);
  });

  it('writes an empty list when the last task is deleted (AC-006.3)', () => {
    const store = makeStore();
    store.dispatch(CREATE);
    persist.mockClear();

    store.dispatch({ type: 'DELETE_TASK', id: 'id-1' });

    const calls = persist.mock.calls;

    expect(calls[calls.length - 1]?.[0]).toEqual([]);
  });

  it('writes exactly once per action — no batching, no coalescing (ADR-0004)', () => {
    const store = makeStore();

    store.dispatch(CREATE);
    store.dispatch({ type: 'CREATE_TASK', title: 'Two', dueDate: null, priority: null });
    store.dispatch({ type: 'CREATE_TASK', title: 'Three', dueDate: null, priority: null });

    expect(persist).toHaveBeenCalledTimes(3);
  });

  it('writes SYNCHRONOUSLY, within the dispatch call', () => {
    // No debounce, no timer, no microtask. ADR-0004 alternatives A, C and D
    // all create a window in which a dispatched change is not yet durable.
    const store = makeStore();

    store.dispatch(CREATE);

    // Already called by the time dispatch returned — nothing to await.
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

// ───────────── no write for non-mutating actions (plan T-303) ─────────────

describe('does not persist when tasks did not change', () => {
  it('does not write on SET_FILTER', () => {
    const store = makeStore();
    store.dispatch(CREATE);
    persist.mockClear();

    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });

    expect(persist).not.toHaveBeenCalled();
  });

  it('does not write on BEGIN_EDIT', () => {
    const store = makeStore();
    store.dispatch(CREATE);
    persist.mockClear();

    store.dispatch({ type: 'BEGIN_EDIT', id: 'id-1' });

    expect(persist).not.toHaveBeenCalled();
  });

  it('does not write on CANCEL_EDIT', () => {
    const store = makeStore();
    store.dispatch(CREATE);
    persist.mockClear();

    store.dispatch({ type: 'CANCEL_EDIT' });

    expect(persist).not.toHaveBeenCalled();
  });

  it('does not write for a REJECTED create (AC-009.1)', () => {
    const store = makeStore();

    store.dispatch({ type: 'CREATE_TASK', title: '   ', dueDate: null, priority: null });

    expect(persist).not.toHaveBeenCalled();
    expect(store.getState().tasks).toEqual([]);
  });

  it('does not write for a REJECTED update (AC-005.6)', () => {
    const store = makeStore();
    store.dispatch(CREATE);
    persist.mockClear();

    store.dispatch({ type: 'UPDATE_TASK', id: 'id-1', title: '', dueDate: null, priority: null });

    expect(persist).not.toHaveBeenCalled();
  });

  it('does not write on LOAD', () => {
    // LOAD's tasks came FROM storage; writing them straight back is a
    // redundant round trip, and on a degraded load it would overwrite the
    // stored payload before the user has done anything at all.
    const store = makeStore();

    store.dispatch({ type: 'LOAD', tasks: [makeTask({ id: 'loaded' })], storageOk: true });

    expect(persist).not.toHaveBeenCalled();
    expect(store.getState().tasks).toHaveLength(1);
  });
});

// ─────────────────── ordering: write before notify ────────────────────────

describe('ordering — persist happens BEFORE subscribers are notified', () => {
  it('records the write ahead of the notification', () => {
    // Without this ordering the UI could paint a state storage does not yet
    // hold: the user sees the task appear, the tab dies, the task is gone.
    const order: string[] = [];
    const store = makeStore({
      persist: () => {
        order.push('persist');
        return true;
      },
    });
    store.subscribe(() => order.push('notify'));

    store.dispatch(CREATE);

    expect(order).toEqual(['persist', 'notify']);
  });

  it('holds the ordering across a sequence of actions', () => {
    const order: string[] = [];
    const store = makeStore({
      persist: () => {
        order.push('persist');
        return true;
      },
    });
    store.subscribe(() => order.push('notify'));

    store.dispatch(CREATE);
    store.dispatch({ type: 'TOGGLE_COMPLETE', id: 'id-1' });
    store.dispatch({ type: 'DELETE_TASK', id: 'id-1' });

    expect(order).toEqual([
      'persist',
      'notify',
      'persist',
      'notify',
      'persist',
      'notify',
    ]);
  });

  it('still notifies for a non-persisting action', () => {
    const order: string[] = [];
    const store = makeStore({
      persist: () => {
        order.push('persist');
        return true;
      },
    });
    store.subscribe(() => order.push('notify'));

    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });

    expect(order).toEqual(['notify']);
  });

  it('exposes the persisted state to the subscriber', () => {
    const store = makeStore();
    let seenWhenNotified: number | null = null;
    store.subscribe(() => {
      seenWhenNotified = store.getState().tasks.length;
    });

    store.dispatch(CREATE);

    expect(seenWhenNotified).toBe(1);
  });
});

// ────────────── write failure handling (AC-SUP.2, architecture §8) ────────

describe('write failure', () => {
  it('sets storageOk false when the write is rejected', () => {
    const store = makeStore({ persist: () => false });

    store.dispatch(CREATE);

    expect(store.getState().storageOk).toBe(false);
  });

  it('keeps in-memory state correct despite the failed write', () => {
    // AC-SUP.2: the app remains usable within the session. The task exists in
    // memory even though it could not be written.
    const store = makeStore({ persist: () => false });

    store.dispatch(CREATE);

    expect(store.getState().tasks).toHaveLength(1);
    expect(store.getState().tasks[0]?.title).toBe('Buy milk');
  });

  it('does not throw into the caller', () => {
    const store = makeStore({ persist: () => false });

    expect(() => store.dispatch(CREATE)).not.toThrow();
  });

  it('still notifies subscribers after a failed write', () => {
    const listener = vi.fn();
    const store = makeStore({ persist: () => false });
    store.subscribe(listener);

    store.dispatch(CREATE);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps working for the rest of the session', () => {
    const store = makeStore({ persist: () => false });

    store.dispatch(CREATE);
    store.dispatch({ type: 'CREATE_TASK', title: 'Second', dueDate: null, priority: null });
    store.dispatch({ type: 'TOGGLE_COMPLETE', id: 'id-1' });

    expect(store.getState().tasks).toHaveLength(2);
    expect(store.getState().tasks[0]?.completed).toBe(true);
  });

  it('clears storageOk back to true once writes succeed again', () => {
    // storageOk tracks whether storage is WORKING, so recovery is reflected.
    let failing = true;
    const store = makeStore({ persist: () => !failing });

    store.dispatch(CREATE);
    expect(store.getState().storageOk).toBe(false);

    failing = false;
    store.dispatch({ type: 'CREATE_TASK', title: 'Second', dueDate: null, priority: null });

    expect(store.getState().storageOk).toBe(true);
  });

  it('survives a persist function that throws', () => {
    // The real save() never throws, but a store should not be the thing that
    // turns a storage problem into a broken app.
    const store = makeStore({
      persist: () => {
        throw new Error('storage exploded');
      },
    });

    expect(() => store.dispatch(CREATE)).toThrow('storage exploded');
    // Documented limitation: persist is contracted to return false rather
    // than throw, and src/persistence/storage.ts honours that contract.
  });
});

// ──────────── end-to-end through the real storage module ──────────────────

describe('integration with the real storage module', () => {
  it('a dispatched change is readable back immediately (AC-REL.1, AC-REL.2)', () => {
    // The invariant in one line: an action that has been dispatched has been
    // persisted. Nothing is pending, so an abrupt close loses nothing.
    const store = createStore({
      newId: () => 'persisted-1',
      now: () => T0,
      persist: (tasks) => save(tasks, storage),
    });

    store.dispatch({ type: 'CREATE_TASK', title: 'Buy milk', dueDate: DATE_EARLY, priority: 'low' });

    const reloaded = load(storage);

    expect(reloaded.tasks).toHaveLength(1);
    expect(reloaded.tasks[0]).toMatchObject({
      id: 'persisted-1',
      title: 'Buy milk',
      dueDate: DATE_EARLY,
      priority: 'low',
      completed: false,
    });
  });

  it('survives a simulated restart: new store, LOAD from storage', () => {
    const first = createStore({
      newId: () => 'restart-1',
      now: () => T0,
      persist: (tasks) => save(tasks, storage),
    });
    first.dispatch({ type: 'CREATE_TASK', title: 'Before restart', dueDate: null, priority: null });
    first.dispatch({ type: 'TOGGLE_COMPLETE', id: 'restart-1' });

    // A fresh session reading the same storage.
    const second = createStore({ persist: (tasks) => save(tasks, storage) });
    const { tasks, storageOk } = load(storage);
    second.dispatch({ type: 'LOAD', tasks, storageOk });

    expect(second.getState().tasks).toHaveLength(1);
    expect(second.getState().tasks[0]?.title).toBe('Before restart');
    expect(second.getState().tasks[0]?.completed).toBe(true);
  });

  it('persists a status toggle so it survives reload (AC-004.6)', () => {
    const store = createStore({
      newId: () => 'toggle-1',
      now: () => T0,
      persist: (tasks) => save(tasks, storage),
    });
    store.dispatch({ type: 'CREATE_TASK', title: 'Toggle me', dueDate: null, priority: null });

    store.dispatch({ type: 'TOGGLE_COMPLETE', id: 'toggle-1' });

    expect(load(storage).tasks[0]?.completed).toBe(true);
  });

  it('persists an edit so it survives reload (AC-005.5)', () => {
    const store = createStore({
      newId: () => 'edit-1',
      now: () => T0,
      persist: (tasks) => save(tasks, storage),
    });
    store.dispatch({ type: 'CREATE_TASK', title: 'Original', dueDate: null, priority: null });

    store.dispatch({
      type: 'UPDATE_TASK',
      id: 'edit-1',
      title: 'Edited',
      dueDate: DATE_MID,
      priority: 'high',
    });

    expect(load(storage).tasks[0]).toMatchObject({
      title: 'Edited',
      dueDate: DATE_MID,
      priority: 'high',
    });
  });

  it('persists a deletion so the task does not reappear (AC-006.3)', () => {
    const store = createStore({
      newId: () => 'gone-1',
      now: () => T0,
      persist: (tasks) => save(tasks, storage),
    });
    store.dispatch({ type: 'CREATE_TASK', title: 'Delete me', dueDate: null, priority: null });

    store.dispatch({ type: 'DELETE_TASK', id: 'gone-1' });

    expect(load(storage).tasks).toEqual([]);
  });

  it('records storageOk false when the real write is rejected', () => {
    storage.throwOnSet = true;
    const store = createStore({
      newId: () => 'blocked-1',
      now: () => T0,
      persist: (tasks) => save(tasks, storage),
    });

    store.dispatch({ type: 'CREATE_TASK', title: 'Cannot save', dueDate: null, priority: null });

    expect(store.getState().storageOk).toBe(false);
    expect(store.getState().tasks).toHaveLength(1);
  });

  it('defaults to the real browser storage when no persist is injected', () => {
    const store = createStore({ newId: () => 'default-1', now: () => T0 });

    store.dispatch({ type: 'CREATE_TASK', title: 'Default wiring', dueDate: null, priority: null });

    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(load().tasks[0]?.title).toBe('Default wiring');
  });
});

// ─────────────── AC-REL.3: nothing deferred to page unload ────────────────

describe('no deferred persistence (AC-REL.3)', () => {
  const SRC_DIR = resolve(process.cwd(), 'src');

  function collect(dir: string, prefix = ''): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = dir + '/' + entry;
      const rel = prefix === '' ? entry : prefix + '/' + entry;
      if (statSync(full).isDirectory()) found.push(...collect(full, rel));
      else if (entry.endsWith('.ts')) found.push(rel);
    }
    return found;
  }

  const sources = collect(SRC_DIR);

  const codeOf = (rel: string): string =>
    readFileSync(SRC_DIR + '/' + rel, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it.each(sources)('%s registers no unload-family handler', (rel) => {
    // AC-REL.3 names and excludes this approach outright: an unload handler
    // is not guaranteed to run on a crash, an OS kill, or a forced quit.
    const code = codeOf(rel);

    expect(code).not.toMatch(/beforeunload/);
    expect(code).not.toMatch(/pagehide/);
    expect(code).not.toMatch(/unload/);
    expect(code).not.toMatch(/visibilitychange/);
  });

  it.each(sources)('%s schedules no deferred or debounced write', (rel) => {
    // ADR-0004 alternatives A, C and D: debounce, periodic autosave, async
    // write. Each creates a window in which a dispatched change is not yet
    // durable, which is precisely what NFR-REL-001 forbids.
    const code = codeOf(rel);

    expect(code).not.toMatch(/setTimeout/);
    expect(code).not.toMatch(/setInterval/);
    expect(code).not.toMatch(/requestIdleCallback/);
    expect(code).not.toMatch(/queueMicrotask/);
    expect(code).not.toMatch(/\bdebounce\b/);
  });

  it('confirms the scan actually found the store', () => {
    expect(sources).toContain('store/store.ts');
  });
});
