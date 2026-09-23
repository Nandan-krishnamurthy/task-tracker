import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '../../src/core/types';
import { SCHEMA_VERSION } from '../../src/persistence/schema';
import { STORAGE_KEY } from '../../src/persistence/storage';
import { DATE_EARLY, DATE_LATE, T0, makeTask } from '../support/fixtures';
import { mountPageSkeleton } from '../support/page';

/**
 * T-409 verification — the composition root.
 *
 * Traceability: FR-008, ADR-0001.
 * Acceptance criteria: AC-008.3, AC-008.5, AC-008.6.
 *
 * `src/main.ts` auto-starts on import, which is the behaviour the shipped
 * `<script type="module">` relies on. These tests therefore seed storage,
 * install the page skeleton, and then import the module fresh — exercising the
 * real startup path rather than a re-implementation of it.
 */

/** Write a well-formed payload under the real key. */
function seedStorage(tasks: readonly Task[]): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ schemaVersion: SCHEMA_VERSION, tasks }),
  );
}

/** Import `src/main.ts` fresh, so its auto-start runs against current state. */
async function startApp(): Promise<HTMLElement> {
  const root = mountPageSkeleton();
  vi.resetModules();
  await import('../../src/main');
  return root;
}

const titlesIn = (root: HTMLElement): string[] =>
  [...root.querySelectorAll('.task__title')].map((el) => el.textContent ?? '');

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// ──────────────────────────────── startup ─────────────────────────────────

describe('startup loads stored tasks (AC-008.3)', () => {
  it('shows them with no user action at all', async () => {
    seedStorage([
      makeTask({ id: 'a', title: 'Pay rent', dueDate: DATE_EARLY, createdAt: T0 }),
      makeTask({ id: 'b', title: 'Renew passport', dueDate: DATE_LATE, createdAt: T0 + 1 }),
    ]);

    const root = await startApp();

    // No import step, no unlock, no restore prompt — the list is simply there.
    expect(titlesIn(root)).toEqual(['Pay rent', 'Renew passport']);
  });

  it('restores every attribute, not just the titles (AC-008.1)', async () => {
    seedStorage([
      makeTask({ id: 'a', title: 'Pay rent', dueDate: DATE_EARLY, priority: 'high' }),
    ]);

    const root = await startApp();
    const row = root.querySelector('li[data-task-id="a"]');

    expect(row?.textContent).toContain('Pay rent');
    expect(row?.textContent).toContain(DATE_EARLY);
    expect(row?.textContent).toContain('High');
  });

  it('restores completed tasks into the completed view (AC-008.1)', async () => {
    seedStorage([makeTask({ id: 'done', title: 'Already done', completed: true })]);

    const root = await startApp();

    // Opens on Active, where a completed task does not belong.
    expect(titlesIn(root)).toEqual([]);

    root.querySelector<HTMLButtonElement>('[data-focus-key="filter:completed"]')!.click();
    expect(titlesIn(root)).toEqual(['Already done']);
  });

  it('applies the FR-010 ordering to what it loaded (AC-010.7)', async () => {
    seedStorage([
      makeTask({ id: 'late', title: 'Later', dueDate: DATE_LATE, createdAt: T0 }),
      makeTask({ id: 'early', title: 'Sooner', dueDate: DATE_EARLY, createdAt: T0 + 1 }),
      makeTask({ id: 'none', title: 'Someday', dueDate: null, createdAt: T0 + 2 }),
    ]);

    const root = await startApp();

    expect(titlesIn(root)).toEqual(['Sooner', 'Later', 'Someday']);
  });

  it('requires no sign-in or setup step (AC-001.7, NG-01)', async () => {
    const root = await startApp();
    const text = (root.textContent ?? '').toLowerCase();

    expect(text).not.toContain('sign in');
    expect(text).not.toContain('log in');
    expect(root.querySelector('input[type="password"]')).toBeNull();
  });
});

describe('startup with nothing stored (AC-008.5)', () => {
  it('opens to an empty list without error', async () => {
    const root = await startApp();

    expect(titlesIn(root)).toEqual([]);
    expect(root.querySelector('.empty-state')).not.toBeNull();
  });

  it('is immediately usable — a task can be created straight away (AC-SUP.3)', async () => {
    const root = await startApp();

    root.querySelector<HTMLInputElement>('#create-title')!.value = 'First ever task';
    root.querySelector<HTMLFormElement>('form.task-form')!.requestSubmit();

    expect(titlesIn(root)).toEqual(['First ever task']);
  });

  it('writes what it creates through to storage (AC-008.4)', async () => {
    const root = await startApp();

    root.querySelector<HTMLInputElement>('#create-title')!.value = 'Buy milk';
    root.querySelector<HTMLFormElement>('form.task-form')!.requestSubmit();

    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(stored).toContain('Buy milk');
  });
});

// ─────────────────────────── degraded storage ─────────────────────────────

describe('startup with corrupt storage (AC-008.6, NFR-SUP-001)', () => {
  const corruptPayloads: ReadonlyArray<readonly [string, string]> = [
    ['not JSON at all', '{{{not json'],
    ['an empty string', ''],
    ['a JSON array instead of an envelope', '[]'],
    ['an envelope with no tasks', '{"schemaVersion":1}'],
    ['tasks that are not an array', '{"schemaVersion":1,"tasks":"nope"}'],
    ['an unknown schema version', '{"schemaVersion":999,"tasks":[]}'],
    ['a task missing its title', '{"schemaVersion":1,"tasks":[{"id":"a"}]}'],
    ['null', 'null'],
  ];

  it.each(corruptPayloads)('degrades to a usable empty list given %s', async (_name, payload) => {
    window.localStorage.setItem(STORAGE_KEY, payload);

    const root = await startApp();

    expect(titlesIn(root)).toEqual([]);
    expect(root.querySelector('.empty-state')).not.toBeNull();
  });

  it('stays usable afterwards — the user can still create a task (AC-SUP.3)', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{{{not json');

    const root = await startApp();
    root.querySelector<HTMLInputElement>('#create-title')!.value = 'Starting over';
    root.querySelector<HTMLFormElement>('form.task-form')!.requestSubmit();

    expect(titlesIn(root)).toEqual(['Starting over']);
  });

  it('shows no crash, stack trace, or error text to the user (AC-SUP.1)', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{{{not json');

    const root = await startApp();
    const text = (root.textContent ?? '').toLowerCase();

    expect(text).not.toContain('error');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('exception');
  });
});

describe('startup when storage cannot be reached (AC-SUP.2)', () => {
  it('opens to a usable empty list', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    const root = await startApp();

    expect(titlesIn(root)).toEqual([]);
    expect(root.querySelector('.empty-state')).not.toBeNull();
  });

  it('keeps the session fully usable in memory', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    const root = await startApp();

    root.querySelector<HTMLInputElement>('#create-title')!.value = 'Works anyway';
    root.querySelector<HTMLFormElement>('form.task-form')!.requestSubmit();

    // The write fails silently; the in-memory state is still correct and the
    // interface still works (architecture §8, failure modes 2 and 3).
    expect(titlesIn(root)).toEqual(['Works anyway']);
  });
});

// ──────────────────────── storage is read exactly once ────────────────────

describe('storage is read once and never again (ADR-0001)', () => {
  it('reads the key a single time during startup and none thereafter', async () => {
    seedStorage([makeTask({ id: 'a', title: 'Buy milk' })]);

    const root = mountPageSkeleton();
    const reads: string[] = [];
    const realGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      reads.push(key);
      return realGetItem.call(this, key);
    });

    vi.resetModules();
    await import('../../src/main');

    expect(reads.filter((key) => key === STORAGE_KEY)).toHaveLength(1);

    // Now exercise every kind of interaction. None may read storage again.
    root.querySelector<HTMLInputElement>('#create-title')!.value = 'Another';
    root.querySelector<HTMLFormElement>('form.task-form')!.requestSubmit();
    root.querySelector<HTMLInputElement>('li input[type="checkbox"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-focus-key="filter:completed"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-focus-key="filter:active"]')!.click();
    root.querySelector<HTMLButtonElement>('li [data-action="edit"]')!.click();
    root.querySelector<HTMLButtonElement>('li [data-action="cancel-edit"]')!.click();
    root.querySelector<HTMLButtonElement>('li [data-action="delete"]')!.click();

    expect(reads.filter((key) => key === STORAGE_KEY)).toHaveLength(1);
  });

  it('does not write the tasks it just loaded back to storage', async () => {
    // LOAD is excluded from write-through: the tasks came FROM storage, and on
    // a degraded load writing them back would overwrite the stored payload
    // before the user has done anything.
    seedStorage([makeTask({ id: 'a', title: 'Buy milk' })]);

    const writes: string[] = [];
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      writes.push(key);
      realSetItem.call(this, key, value);
    });

    await startApp();

    expect(writes).toEqual([]);
  });
});
