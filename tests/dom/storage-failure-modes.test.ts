import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SCHEMA_VERSION } from '../../src/persistence/schema';
import { STORAGE_KEY } from '../../src/persistence/storage';
import type { StorageLike } from '../../src/persistence/storage';
import type { Task } from '../../src/core/types';
import { DATE_EARLY, DATE_LATE, T0, makeTask } from '../support/fixtures';
import { mountPageSkeleton } from '../support/page';

/**
 * T-501 verification — the three storage failure modes, end to end.
 *
 * Traceability: NFR-SUP-001, ADR-0006, architecture §8.
 * Acceptance criteria: AC-008.6, AC-SUP.1, AC-SUP.2, AC-SUP.3.
 *
 * The three modes are already covered in isolation — `tests/unit/schema.test.ts`
 * proves the decoder is total, `tests/dom/storage.test.ts` proves the wrappers
 * never throw. What is proven HERE is the thing neither of those can: that the
 * ASSEMBLED APPLICATION survives each mode and stays usable afterwards.
 * NFR-SUP-001 is a promise about the app, not about a function.
 *
 * The fake is injected by replacing `window.localStorage`, which jsdom defines
 * as a configurable own accessor. That is deliberately not a spy on
 * `Storage.prototype`: it drives `getBrowserStorage()` itself, so the guard
 * that mode 2 depends on — the property READ being inside the try, not just
 * the calls after it — is actually exercised.
 */

// ───────────────────────────── the injectable fake ─────────────────────────

/** A storage that can be made to fail on demand. */
class FakeStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  public throwOnGet = false;
  public throwOnSet = false;
  public writes: string[] = [];

  constructor(seeded?: string) {
    if (seeded !== undefined) this.data.set(STORAGE_KEY, seeded);
  }

  getItem(key: string): string | null {
    if (this.throwOnGet) throw new DOMException('blocked', 'SecurityError');
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw new DOMException('quota exceeded', 'QuotaExceededError');
    this.writes.push(value);
    this.data.set(key, value);
  }

  /** Read without tripping the failure flags, so a test can check the truth. */
  peek(): string | null {
    return this.data.get(STORAGE_KEY) ?? null;
  }
}

const ORIGINAL_STORAGE = Object.getOwnPropertyDescriptor(window, 'localStorage')!;

/** Put `value` behind `window.localStorage` for the rest of the test. */
function installStorage(value: unknown): void {
  Object.defineProperty(window, 'localStorage', { configurable: true, value });
}

/** Make the property READ itself throw — private mode with site data blocked. */
function installThrowingAccessor(): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get(): never {
      throw new DOMException('access denied', 'SecurityError');
    },
  });
}

/** A well-formed stored payload. */
function envelope(tasks: readonly Task[]): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, tasks });
}

// ─────────────────────────── driving the whole app ─────────────────────────

/** Boot `src/main.ts` against whatever storage is currently installed. */
async function startApp(): Promise<HTMLElement> {
  const root = mountPageSkeleton();
  vi.resetModules();
  await import('../../src/main');
  return root;
}

const titlesIn = (root: HTMLElement): string[] =>
  [...root.querySelectorAll('.task__title')].map((el) => el.textContent ?? '');

function createTask(root: HTMLElement, title: string, dueDate?: string): void {
  root.querySelector<HTMLInputElement>('#create-title')!.value = title;
  if (dueDate !== undefined) {
    root.querySelector<HTMLInputElement>('#create-due')!.value = dueDate;
  }
  root.querySelector<HTMLFormElement>('form.task-form')!.requestSubmit();
}

const rowFor = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`li[data-task-id="${id}"]`)!;

/**
 * Uncaught exceptions during event dispatch surface as an `error` event on
 * `window` rather than propagating to the caller, so "no crash" has to be
 * observed rather than inferred from the absence of a thrown error.
 */
let crashes: string[] = [];

function onWindowError(event: Event): void {
  crashes.push((event as ErrorEvent).message ?? 'unknown error');
}

beforeEach(() => {
  crashes = [];
  window.addEventListener('error', onWindowError);
});

afterEach(() => {
  window.removeEventListener('error', onWindowError);
  Object.defineProperty(window, 'localStorage', ORIGINAL_STORAGE);
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// ═════════════════════ positive control for the fake ══════════════════════

describe('the injected fake is genuinely the storage the app reads', () => {
  /*
   * Nearly every assertion below is that the list came up EMPTY — which is
   * also what would happen if the injection silently stopped working and the
   * app read the real, empty jsdom localStorage instead. That would make this
   * whole file pass while proving nothing.
   *
   * So: a well-formed payload through the same fake must LOAD. If this fails,
   * no other result in this file means anything.
   */
  it('loads a valid payload served by the fake', async () => {
    installStorage(new FakeStorage(envelope([makeTask({ id: 'a', title: 'From the fake' })])));

    const root = await startApp();

    expect(titlesIn(root)).toEqual(['From the fake']);
  });

  it('writes through to the fake, not to the real localStorage', async () => {
    const storage = new FakeStorage();
    installStorage(storage);

    const root = await startApp();
    createTask(root, 'Written to the fake');

    expect(storage.peek()).toContain('Written to the fake');
    // The real one, restored in afterEach, must never have seen it.
    expect(ORIGINAL_STORAGE.get?.call(window).getItem(STORAGE_KEY)).toBeNull();
  });
});

// ════════════════ Mode 1 — malformed payload (architecture §8) ═════════════

describe('mode 1: a malformed payload degrades to an empty, usable list', () => {
  const malformed: ReadonlyArray<readonly [string, string]> = [
    ['invalid JSON', '{{{ not json'],
    ['a truncated payload', '{"schemaVersion":1,"tasks":[{"id":"a","tit'],
    ['an empty string', ''],
    ['a bare array instead of an envelope', '[]'],
    ['a JSON primitive', '"just a string"'],
    ['null', 'null'],
    ['an envelope with no tasks key', '{"schemaVersion":1}'],
    ['tasks that are not an array', '{"schemaVersion":1,"tasks":{}}'],
    ['an unrecognised schemaVersion', '{"schemaVersion":999,"tasks":[]}'],
    ['a missing schemaVersion', '{"tasks":[]}'],
    ['a task with no title', '{"schemaVersion":1,"tasks":[{"id":"a","completed":false}]}'],
    [
      'a task whose dueDate is not a date',
      '{"schemaVersion":1,"tasks":[{"id":"a","title":"x","dueDate":"soon","priority":null,"completed":false,"createdAt":1}]}',
    ],
    [
      'a task with a fourth priority level',
      '{"schemaVersion":1,"tasks":[{"id":"a","title":"x","dueDate":null,"priority":"urgent","completed":false,"createdAt":1}]}',
    ],
  ];

  it.each(malformed)('starts with an empty list given %s (AC-008.6, AC-SUP.1)', async (_n, raw) => {
    installStorage(new FakeStorage(raw));

    const root = await startApp();

    expect(titlesIn(root)).toEqual([]);
    expect(root.querySelector('.empty-state')).not.toBeNull();
    expect(crashes).toEqual([]);
  });

  it.each(malformed)('lets the user create a task immediately given %s (AC-SUP.3)', async (_n, raw) => {
    installStorage(new FakeStorage(raw));

    const root = await startApp();
    createTask(root, 'Starting over');

    expect(titlesIn(root)).toEqual(['Starting over']);
    expect(crashes).toEqual([]);
  });

  it('degrades ALL-OR-NOTHING when one task among many is invalid (architecture §8)', async () => {
    // Partial recovery would leave a quietly wrong list. An obviously empty
    // one is the specified behaviour: losing more data loudly beats losing
    // less data silently.
    const payload = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      tasks: [
        makeTask({ id: 'good-1', title: 'Perfectly fine' }),
        { id: 'bad', title: '', dueDate: null, priority: null, completed: false, createdAt: 1 },
        makeTask({ id: 'good-2', title: 'Also fine' }),
      ],
    });
    installStorage(new FakeStorage(payload));

    const root = await startApp();

    expect(titlesIn(root)).toEqual([]);
  });

  it('keeps storage WORKING — mode 1 is bad data, not a broken mechanism', async () => {
    const storage = new FakeStorage('{{{ not json');
    installStorage(storage);

    const root = await startApp();
    createTask(root, 'Buy milk');

    expect(storage.writes).toHaveLength(1);
    expect(storage.peek()).toContain('Buy milk');
  });

  it('overwrites the unreadable payload rather than quarantining it (ADR-0006)', async () => {
    // Alternative D — copying the corrupt payload to a backup key — was
    // rejected: it is unspecified behaviour no UI exposes.
    const storage = new FakeStorage('{{{ not json');
    installStorage(storage);

    const root = await startApp();
    createTask(root, 'Buy milk');

    expect(storage.peek()).not.toContain('not json');
    expect(storage.writes.every((w) => !w.includes('not json'))).toBe(true);
  });

  it('survives a full session after degrading', async () => {
    installStorage(new FakeStorage('{{{ not json'));

    const root = await startApp();
    createTask(root, 'Later', DATE_LATE);
    createTask(root, 'Sooner', DATE_EARLY);

    expect(titlesIn(root)).toEqual(['Sooner', 'Later']);

    const first = root.querySelector<HTMLElement>('li[data-task-id]')!;
    first.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();

    expect(titlesIn(root)).toEqual(['Later']);
    expect(crashes).toEqual([]);
  });
});

// ═════════════ Mode 2 — storage unavailable (architecture §8) ══════════════

describe('mode 2: unreachable storage leaves the app usable in memory', () => {
  const unavailable: ReadonlyArray<readonly [string, () => void]> = [
    [
      'getItem throws',
      () => {
        const storage = new FakeStorage(envelope([makeTask({ id: 'a', title: 'Unreachable' })]));
        storage.throwOnGet = true;
        installStorage(storage);
      },
    ],
    ['reading window.localStorage itself throws', installThrowingAccessor],
    ['localStorage is undefined', () => installStorage(undefined)],
    ['localStorage is null', () => installStorage(null)],
    ['localStorage is not an object', () => installStorage('nope')],
    ['localStorage is missing getItem', () => installStorage({ setItem: () => undefined })],
    ['localStorage is missing setItem', () => installStorage({ getItem: () => null })],
  ];

  it.each(unavailable)('starts to an empty, usable list when %s (AC-SUP.2)', async (_n, install) => {
    install();

    const root = await startApp();

    expect(titlesIn(root)).toEqual([]);
    expect(root.querySelector('.empty-state')).not.toBeNull();
    expect(crashes).toEqual([]);
  });

  it.each(unavailable)('lets the user create a task when %s (AC-SUP.3)', async (_n, install) => {
    install();

    const root = await startApp();
    createTask(root, 'Works anyway');

    expect(titlesIn(root)).toEqual(['Works anyway']);
    expect(crashes).toEqual([]);
  });

  it('runs an entire session in memory with storage unreachable', async () => {
    installThrowingAccessor();

    const root = await startApp();

    // Create
    createTask(root, 'Later', DATE_LATE);
    createTask(root, 'Sooner', DATE_EARLY);
    expect(titlesIn(root)).toEqual(['Sooner', 'Later']);

    const idOf = (index: number): string =>
      [...root.querySelectorAll('li[data-task-id]')][index]!.getAttribute('data-task-id')!;

    // Edit
    const sooner = idOf(0);
    rowFor(root, sooner).querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    rowFor(root, sooner).querySelector<HTMLInputElement>('input[type="text"]')!.value = 'Renamed';
    rowFor(root, sooner).querySelector<HTMLFormElement>('form')!.requestSubmit();
    expect(titlesIn(root)).toEqual(['Renamed', 'Later']);

    // Toggle, and find it in the other view
    rowFor(root, sooner).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    expect(titlesIn(root)).toEqual(['Later']);
    root.querySelector<HTMLButtonElement>('[data-focus-key="filter:completed"]')!.click();
    expect(titlesIn(root)).toEqual(['Renamed']);
    root.querySelector<HTMLButtonElement>('[data-focus-key="filter:active"]')!.click();

    // Delete
    const later = idOf(0);
    rowFor(root, later).querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
    expect(titlesIn(root)).toEqual([]);

    expect(crashes).toEqual([]);
  });

  it('still validates — a degraded session is not a permissive one', async () => {
    installThrowingAccessor();

    const root = await startApp();
    createTask(root, '   ');

    expect(titlesIn(root)).toEqual([]);
    expect(root.querySelector('#create-error')?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});

// ══════════ Mode 3 — write rejected mid-session (architecture §8) ══════════

describe('mode 3: a write rejected mid-session leaves the UI correct', () => {
  /** Start healthy with two stored tasks, then break writes. */
  async function startThenBreakWrites(): Promise<{ root: HTMLElement; storage: FakeStorage }> {
    const storage = new FakeStorage(
      envelope([
        makeTask({ id: 'a', title: 'Sooner', dueDate: DATE_EARLY, createdAt: T0 }),
        makeTask({ id: 'b', title: 'Later', dueDate: DATE_LATE, createdAt: T0 + 1 }),
      ]),
    );
    installStorage(storage);

    const root = await startApp();
    expect(titlesIn(root)).toEqual(['Sooner', 'Later']);

    storage.throwOnSet = true;
    return { root, storage };
  }

  it('keeps creating tasks in the UI when the write is rejected (AC-SUP.2)', async () => {
    const { root } = await startThenBreakWrites();

    createTask(root, 'Created offline');

    expect(titlesIn(root)).toContain('Created offline');
    expect(crashes).toEqual([]);
  });

  it('keeps toggling, editing and deleting working', async () => {
    const { root } = await startThenBreakWrites();

    rowFor(root, 'a').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    expect(titlesIn(root)).toEqual(['Later']);

    rowFor(root, 'b').querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
    rowFor(root, 'b').querySelector<HTMLInputElement>('input[type="text"]')!.value = 'Renamed';
    rowFor(root, 'b').querySelector<HTMLFormElement>('form')!.requestSubmit();
    expect(titlesIn(root)).toEqual(['Renamed']);

    rowFor(root, 'b').querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
    expect(titlesIn(root)).toEqual([]);

    expect(crashes).toEqual([]);
  });

  it('throws nothing into the caller — the click handler completes normally', async () => {
    const { root } = await startThenBreakWrites();

    expect(() => {
      rowFor(root, 'a').querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();
    }).not.toThrow();
  });

  it('leaves the previously written payload untouched by the failed write', async () => {
    const { root, storage } = await startThenBreakWrites();
    const before = storage.peek();

    createTask(root, 'Never persisted');

    expect(storage.peek()).toBe(before);
    expect(storage.peek()).not.toContain('Never persisted');
  });

  it('records no partial write', async () => {
    const { root, storage } = await startThenBreakWrites();
    const writesBefore = storage.writes.length;

    createTask(root, 'One');
    createTask(root, 'Two');
    rowFor(root, 'a').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();

    expect(storage.writes).toHaveLength(writesBefore);
  });

  it('resumes persisting when storage recovers', async () => {
    // storageOk tracks whether storage is WORKING, so a later successful write
    // clears the flag an earlier failure set (store.ts).
    const { root, storage } = await startThenBreakWrites();

    createTask(root, 'Lost');
    expect(storage.peek()).not.toContain('Lost');

    storage.throwOnSet = false;
    createTask(root, 'Saved');

    expect(storage.peek()).toContain('Saved');
    // The whole list is rewritten on each save, so the earlier task that
    // failed to persist is carried along by the next successful write.
    expect(storage.peek()).toContain('Lost');
  });

  it('survives a storage that fails on every single write for the whole session', async () => {
    const storage = new FakeStorage();
    storage.throwOnSet = true;
    installStorage(storage);

    const root = await startApp();
    for (let i = 0; i < 10; i += 1) createTask(root, `Task ${i}`);

    expect(titlesIn(root)).toHaveLength(10);
    expect(storage.writes).toEqual([]);
    expect(crashes).toEqual([]);
  });
});

// ═══════════ architecture §8.1 — the default is silence, on purpose ════════

describe('no user-facing warning is surfaced in any failure mode (architecture §8.1)', () => {
  /*
   * Architecture §8.1 records both warnings as OPEN and defaulted to silence,
   * because the PRD specifies no such message and adding one would be
   * inventing UI. This suite pins that default: if a warning is ever added, it
   * should be because a product decision was taken, and this test should fail
   * and be deliberately updated — not slip in unnoticed.
   */
  const scenarios: ReadonlyArray<readonly [string, () => void]> = [
    ['corrupt data', () => installStorage(new FakeStorage('{{{ not json'))],
    ['storage unavailable', installThrowingAccessor],
    [
      'writes rejected',
      () => {
        const storage = new FakeStorage();
        storage.throwOnSet = true;
        installStorage(storage);
      },
    ],
  ];

  it.each(scenarios)('shows no warning or error text when %s', async (_name, install) => {
    install();

    const root = await startApp();
    createTask(root, 'A task');
    const text = (root.textContent ?? '').toLowerCase();

    expect(text).not.toContain('error');
    expect(text).not.toContain('warning');
    expect(text).not.toContain('could not');
    expect(text).not.toContain('unable to');
    expect(text).not.toContain('not saved');
    expect(text).not.toContain('failed');
  });

  it('shows the ordinary empty state after corrupt data, identical to a first visit', async () => {
    installStorage(new FakeStorage('{{{ not json'));
    const corrupted = (await startApp()).querySelector('.empty-state')?.textContent;

    Object.defineProperty(window, 'localStorage', ORIGINAL_STORAGE);
    installStorage(new FakeStorage());
    const firstVisit = (await startApp()).querySelector('.empty-state')?.textContent;

    expect(corrupted).toBe(firstVisit);
  });
});
