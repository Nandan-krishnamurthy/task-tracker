import type { Locator, Page } from '@playwright/test';

import type { Priority, Task } from '../support/fixtures';

/**
 * Shared helpers for the tier-3 suites (T-601 .. T-606).
 *
 * Not a spec file — Playwright collects only `*.spec.ts`, so this is imported,
 * never run. It holds the selectors and the journey actions so that six suites
 * describe *what* they verify rather than repeating *how* to drive the page.
 *
 * Everything here drives the app the way a user does: real clicks, real key
 * presses, real form submission. Nothing reaches into application state — the
 * store is not exported to the page and these suites deliberately do not want
 * it. The only privileged access is seeding `localStorage`, which is how a
 * returning user's browser is set up before the app loads (J4, T-604, T-606).
 */

/** The single storage key (ADR-0003). Duplicated deliberately — see below. */
export const STORAGE_KEY = 'task-tracker.v1';

/** The stored envelope version (ADR-0003). */
export const SCHEMA_VERSION = 1;

/*
 * STORAGE_KEY and SCHEMA_VERSION are literals here rather than imports from
 * `src/persistence/`. These suites verify the SHIPPED ARTIFACT from outside:
 * importing the constant the app uses would make a test that seeds the wrong
 * key pass anyway, because both sides would move together. Written out, a
 * change to either is caught here as a failure — which is the point.
 */

export const SELECTORS = {
  title: '#create-title',
  due: '#create-due',
  priority: '#create-priority',
  submit: 'form.task-form button[type="submit"]',
  createError: '#create-error',
  filterActive: '[data-focus-key="filter:active"]',
  filterCompleted: '[data-focus-key="filter:completed"]',
  taskTitle: '.task__title',
  row: 'li[data-task-id]',
  emptyState: '.empty-state',
  editingRow: 'li.task--editing',
} as const;

/** What a test asks to be created. */
export interface NewTask {
  title: string;
  dueDate?: string;
  priority?: Priority;
}

/** The titles currently rendered, in display order. */
export async function titles(page: Page): Promise<string[]> {
  return page.$$eval(SELECTORS.taskTitle, (els) => els.map((el) => el.textContent ?? ''));
}

/** The row showing `title`. */
export function row(page: Page, title: string): Locator {
  return page.locator(SELECTORS.row).filter({ hasText: title });
}

/**
 * Put tasks into storage as a returning user's browser would hold them, then
 * load the app so it reads them at startup.
 *
 * `page.goto` first because `localStorage` is per-origin and there is no
 * origin until a document has loaded.
 */
export async function seedTasks(page: Page, tasks: readonly Task[]): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([key, payload]) => {
      window.localStorage.setItem(key as string, payload as string);
    },
    [STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, tasks })] as const,
  );
  await page.reload();
}

/** Put a raw string into storage — malformed payloads for T-604. */
export async function seedRaw(page: Page, raw: string): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([key, payload]) => {
      window.localStorage.setItem(key as string, payload as string);
    },
    [STORAGE_KEY, raw] as const,
  );
  await page.reload();
}

/** The raw stored payload, or null. */
export async function readStorage(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
}

/** Fill the create form and submit it with the Add button. */
export async function createTask(page: Page, task: NewTask): Promise<void> {
  await page.fill(SELECTORS.title, task.title);
  if (task.dueDate !== undefined) await page.fill(SELECTORS.due, task.dueDate);
  if (task.priority !== undefined) await page.selectOption(SELECTORS.priority, task.priority);
  await page.click(SELECTORS.submit);
}

/** Fill the create form and submit it with Enter, as J1 step 2 allows. */
export async function createTaskWithEnter(page: Page, task: NewTask): Promise<void> {
  await page.fill(SELECTORS.title, task.title);
  if (task.dueDate !== undefined) await page.fill(SELECTORS.due, task.dueDate);
  if (task.priority !== undefined) await page.selectOption(SELECTORS.priority, task.priority);
  await page.focus(SELECTORS.title);
  await page.keyboard.press('Enter');
}

export async function toggle(page: Page, title: string): Promise<void> {
  await row(page, title).locator('input[type="checkbox"]').click();
}

export async function beginEdit(page: Page, title: string): Promise<void> {
  await row(page, title).locator('[data-action="edit"]').click();
}

export async function saveEdit(page: Page): Promise<void> {
  await page.locator(`${SELECTORS.editingRow} button[type="submit"]`).click();
}

export async function cancelEdit(page: Page): Promise<void> {
  await page.locator(`${SELECTORS.editingRow} [data-action="cancel-edit"]`).click();
}

export async function deleteTask(page: Page, title: string): Promise<void> {
  await row(page, title).locator('[data-action="delete"]').click();
}

export async function showCompleted(page: Page): Promise<void> {
  await page.click(SELECTORS.filterCompleted);
}

export async function showActive(page: Page): Promise<void> {
  await page.click(SELECTORS.filterActive);
}

/**
 * Mark the live document, so a later check can tell whether it is still the
 * same one.
 *
 * This is how "without a full page reload" (AC-001.3, AC-005.3) is actually
 * decided: a reload replaces the document and takes the marker with it. An
 * assertion that the list merely *looks* right cannot distinguish a live
 * update from a reload that happened to render the same thing.
 */
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>)['__taskTrackerAlive'] = true;
  });
}

/** True while the document marked by `markDocument` is still the live one. */
export async function documentSurvived(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>)['__taskTrackerAlive'] === true,
  );
}

/** The accessible name of a locator, as the browser computes it. */
export async function accessibleName(locator: Locator): Promise<string> {
  return locator.evaluate((el) => {
    const label = el.getAttribute('aria-label');
    if (label !== null && label.trim() !== '') return label.trim();
    return el.textContent?.trim() ?? '';
  });
}

/** The `data-focus-key` of whatever currently has focus, or null. */
export async function focusedKey(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-focus-key') ?? null);
}

/** The tag name of whatever currently has focus. */
export async function focusedTag(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.tagName ?? 'NONE');
}

/**
 * Press Tab until the element carrying `key` has focus.
 *
 * Returns the number of presses, or throws after `limit`. Used by T-603 to
 * prove a control is reachable by keyboard ALONE — no `.focus()` call, which
 * would bypass the very tab order under test.
 */
export async function tabTo(page: Page, key: string, limit = 60): Promise<number> {
  for (let presses = 1; presses <= limit; presses += 1) {
    await page.keyboard.press('Tab');
    if ((await focusedKey(page)) === key) return presses;
  }

  throw new Error(`"${key}" was not reachable within ${limit} Tab presses`);
}
