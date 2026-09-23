import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

import { DATE_EARLY, DATE_LATE, DATE_MID, DATE_PAST } from '../support/fixtures';
import {
  SELECTORS,
  beginEdit,
  createTask,
  deleteTask,
  readStorage,
  row,
  saveEdit,
  showActive,
  showCompleted,
  titles,
  toggle,
} from './support';

/**
 * T-602 — journey J4: reload, and a genuine browser restart.
 *
 * Acceptance criteria: AC-006.3, AC-008.1, AC-008.2, AC-008.3, AC-010.7.
 *
 * This is the suite that justifies Playwright's presence at all (ADR-0008
 * alternative B): jsdom cannot restart a browser, so AC-008.2 — "the browser
 * is fully closed and reopened" — is unverifiable at any other tier.
 *
 * A restart is modelled by closing the context and opening a new one from the
 * storage state the first one left behind. That is what a restart IS from the
 * page's point of view: the same origin data on disk, a new process, and
 * nothing whatsoever carried over in memory. A second page in the same context
 * would not do — it shares the running browser's state and would pass even if
 * nothing had been persisted.
 */

/** The list the suite builds: every combination worth carrying across. */
async function buildVariedList(page: Page): Promise<void> {
  await page.goto('/');

  await createTask(page, { title: 'Overdue thing', dueDate: DATE_PAST, priority: 'high' });
  await createTask(page, { title: 'Due soon', dueDate: DATE_EARLY, priority: 'low' });
  await createTask(page, { title: 'Due later', dueDate: DATE_LATE });
  await createTask(page, { title: 'No date at all', priority: 'medium' });
  await createTask(page, { title: 'Will be completed', dueDate: DATE_MID });
  await createTask(page, { title: 'Will be deleted' });

  await toggle(page, 'Will be completed');
  await deleteTask(page, 'Will be deleted');
}

const EXPECTED_ACTIVE = ['Overdue thing', 'Due soon', 'Due later', 'No date at all'];

/**
 * Close the context and open a fresh one holding the same stored data.
 *
 * Returns a page in the new context, already loaded.
 */
async function restartBrowser(browser: Browser, page: Page): Promise<Page> {
  const context = page.context();
  const state = await context.storageState();
  await context.close();

  const reopened = await browser.newContext({ storageState: state });
  const next = await reopened.newPage();
  await next.goto('/');

  return next;
}

test.describe('J4 — return to the app later', () => {
  test('a reload reproduces the list identically (AC-008.1)', async ({ page }) => {
    await buildVariedList(page);
    const before = await titles(page);

    await page.reload();

    expect(await titles(page)).toEqual(before);
    expect(await titles(page)).toEqual(EXPECTED_ACTIVE);
  });

  test('a reload preserves every attribute, not just titles (AC-008.1)', async ({ page }) => {
    await buildVariedList(page);
    await page.reload();

    await expect(row(page, 'Overdue thing')).toContainText(DATE_PAST);
    await expect(row(page, 'Overdue thing')).toContainText('High');
    await expect(row(page, 'Due soon')).toContainText(DATE_EARLY);
    await expect(row(page, 'Due soon')).toContainText('Low');
    await expect(row(page, 'Due later')).toContainText('No priority');
    await expect(row(page, 'No date at all')).toContainText('No due date');
    await expect(row(page, 'No date at all')).toContainText('Medium');
  });

  test('a due date set at creation is shown again after reload (AC-002.6)', async ({ page }) => {
    await page.goto('/');
    await createTask(page, { title: 'Dated at creation', dueDate: DATE_MID });

    await page.reload();

    // The same calendar day, character for character. A due date that round
    // trips through a `Date` would come back shifted for any user not on UTC,
    // which is the failure ADR-0005 exists to prevent.
    await expect(row(page, 'Dated at creation')).toContainText(DATE_MID);
  });

  test('a due date set by editing is shown again after reload (AC-002.6)', async ({ page }) => {
    await page.goto('/');
    await createTask(page, { title: 'Undated at first' });

    await beginEdit(page, 'Undated at first');
    await page.fill(`${SELECTORS.editingRow} input[type="date"]`, DATE_LATE);
    await saveEdit(page);

    await page.reload();

    await expect(row(page, 'Undated at first')).toContainText(DATE_LATE);
  });

  test('a cleared due date stays cleared after reload (AC-002.6)', async ({ page }) => {
    await page.goto('/');
    await createTask(page, { title: 'Will lose its date', dueDate: DATE_MID });

    await beginEdit(page, 'Will lose its date');
    await page.fill(`${SELECTORS.editingRow} input[type="date"]`, '');
    await saveEdit(page);

    await page.reload();

    await expect(row(page, 'Will lose its date')).toContainText('No due date');
    expect(await readStorage(page)).toContain('"dueDate":null');
  });

  test('a reload preserves completed status (AC-004.6, AC-008.1)', async ({ page }) => {
    await buildVariedList(page);
    await page.reload();

    await showCompleted(page);
    expect(await titles(page)).toEqual(['Will be completed']);
    await expect(row(page, 'Will be completed').locator('input[type="checkbox"]')).toBeChecked();
  });

  test('tasks load automatically, with no user action (AC-008.3)', async ({ page }) => {
    await buildVariedList(page);
    await page.reload();

    // No import, unlock, or restore step: the list is present in the first
    // rendered frame, before anything is clicked.
    expect(await titles(page)).toEqual(EXPECTED_ACTIVE);
    await expect(page.locator(SELECTORS.row)).toHaveCount(4);

    // And nothing on the page asks for one.
    const text = ((await page.textContent('#app')) ?? '').toLowerCase();
    expect(text).not.toContain('import');
    expect(text).not.toContain('restore');
    expect(text).not.toContain('unlock');
  });

  test('a deleted task does not reappear after a reload (AC-006.3)', async ({ page }) => {
    await buildVariedList(page);
    await page.reload();

    expect(await titles(page)).not.toContain('Will be deleted');
    await showCompleted(page);
    expect(await titles(page)).not.toContain('Will be deleted');
  });

  test('the ordering is reproduced exactly after a reload (AC-010.7)', async ({ page }) => {
    await buildVariedList(page);

    // Reload repeatedly: an order that depended on engine sort stability
    // rather than the four-key comparator would drift across renders.
    for (let i = 0; i < 4; i += 1) {
      await page.reload();
      expect(await titles(page)).toEqual(EXPECTED_ACTIVE);
    }
  });

  // ──────────────────── the restart, which jsdom cannot do ────────────────

  test('tasks survive a full browser restart (AC-008.2)', async ({ browser, page }) => {
    await buildVariedList(page);
    const before = await titles(page);

    const reopened = await restartBrowser(browser, page);

    expect(await titles(reopened)).toEqual(before);
    await reopened.context().close();
  });

  test('a restart preserves every attribute and status (AC-008.2)', async ({ browser, page }) => {
    await buildVariedList(page);

    const reopened = await restartBrowser(browser, page);

    await expect(row(reopened, 'Overdue thing')).toContainText(DATE_PAST);
    await expect(row(reopened, 'Overdue thing')).toContainText('High');
    await expect(row(reopened, 'No date at all')).toContainText('No due date');

    await showCompleted(reopened);
    expect(await titles(reopened)).toEqual(['Will be completed']);

    await reopened.context().close();
  });

  test('the ordering survives a restart (AC-010.7)', async ({ browser, page }) => {
    await buildVariedList(page);

    const reopened = await restartBrowser(browser, page);

    expect(await titles(reopened)).toEqual(EXPECTED_ACTIVE);
    await reopened.context().close();
  });

  test('a deleted task does not return after a restart (AC-006.3)', async ({ browser, page }) => {
    await buildVariedList(page);

    const reopened = await restartBrowser(browser, page);

    expect(await titles(reopened)).not.toContain('Will be deleted');
    await showCompleted(reopened);
    expect(await titles(reopened)).not.toContain('Will be deleted');
    await reopened.context().close();
  });

  test('an edit made before the restart is the one that comes back (AC-005.5)', async ({
    browser,
    page,
  }) => {
    await buildVariedList(page);
    await beginEdit(page, 'Due later');
    await page.fill(`${SELECTORS.editingRow} input[type="text"]`, 'Due later, renamed');
    await page.selectOption(`${SELECTORS.editingRow} select`, 'high');
    await saveEdit(page);

    const reopened = await restartBrowser(browser, page);

    await expect(row(reopened, 'Due later, renamed')).toContainText('High');
    expect(await titles(reopened)).not.toContain('Due later');
    await reopened.context().close();
  });

  test('a restart with nothing stored opens to the empty list (AC-008.5)', async ({
    browser,
    page,
  }) => {
    await page.goto('/');
    const reopened = await restartBrowser(browser, page);

    await expect(reopened.locator(SELECTORS.emptyState)).toBeVisible();
    await expect(reopened.locator(SELECTORS.row)).toHaveCount(0);
    await reopened.context().close();
  });

  test('a fresh profile shares nothing with the previous one (NG-02)', async ({
    browser,
    page,
  }) => {
    // The negative control for the restart tests above: a context built with
    // NO storage state must come up empty. If it did not, those tests would be
    // measuring something other than persistence.
    await buildVariedList(page);

    const unrelated = await browser.newContext();
    const unrelatedPage = await unrelated.newPage();
    await unrelatedPage.goto('/');

    await expect(unrelatedPage.locator(SELECTORS.emptyState)).toBeVisible();
    expect(await titles(unrelatedPage)).toEqual([]);
    await unrelated.close();
  });
});

// ───────────────────── write-through, not deferred ────────────────────────

test.describe('persistence is immediate, never deferred to unload (AC-REL.3)', () => {
  test('a created task is in storage before anything else happens', async ({ page }) => {
    await page.goto('/');
    await createTask(page, { title: 'Written at once' });

    // No unload, no navigation, no idle wait — read storage right now.
    expect(await readStorage(page)).toContain('Written at once');
  });

  test('every kind of mutation is written through immediately (AC-008.4)', async ({ page }) => {
    await page.goto('/');
    await createTask(page, { title: 'Original', dueDate: DATE_MID });
    expect(await readStorage(page)).toContain('Original');

    await beginEdit(page, 'Original');
    await page.fill(`${SELECTORS.editingRow} input[type="text"]`, 'Edited');
    await saveEdit(page);
    expect(await readStorage(page)).toContain('Edited');

    await toggle(page, 'Edited');
    expect(await readStorage(page)).toContain('"completed":true');

    await showCompleted(page);
    await deleteTask(page, 'Edited');
    expect(await readStorage(page)).not.toContain('Edited');
  });

  test('an abrupt context close loses nothing already saved (AC-REL.1)', async ({
    browser,
    page,
  }) => {
    await page.goto('/');
    await createTask(page, { title: 'Saved before the crash', dueDate: DATE_EARLY });

    // Closing the context without any unload handshake is the closest
    // approximation of a crash the harness can produce. AC-REL.3 is why this
    // works: nothing is deferred to a beforeunload handler that a crash would
    // skip.
    const reopened = await restartBrowser(browser, page);

    expect(await titles(reopened)).toEqual(['Saved before the crash']);
    await reopened.context().close();
  });

  test('switching views writes nothing — it is not a mutation (FR-007)', async ({ page }) => {
    await page.goto('/');
    await createTask(page, { title: 'Buy milk' });
    const afterCreate = await readStorage(page);

    await showCompleted(page);
    await showActive(page);

    expect(await readStorage(page)).toBe(afterCreate);
  });

  test('a rejected create writes nothing (AC-009.1)', async ({ page }) => {
    await page.goto('/');
    await createTask(page, { title: 'Buy milk' });
    const afterCreate = await readStorage(page);

    await page.fill(SELECTORS.title, '   ');
    await page.click(SELECTORS.submit);

    expect(await readStorage(page)).toBe(afterCreate);
  });

  test('a cancelled edit writes nothing (architecture §2.3)', async ({ page }) => {
    await page.goto('/');
    await createTask(page, { title: 'Buy milk' });
    const afterCreate = await readStorage(page);

    await beginEdit(page, 'Buy milk');
    await page.fill(`${SELECTORS.editingRow} input[type="text"]`, 'Half-typed');
    await page.locator(`${SELECTORS.editingRow} [data-action="cancel-edit"]`).click();

    expect(await readStorage(page)).toBe(afterCreate);
  });

  test('stores exactly the six fields of the domain model (C-03)', async ({ page }) => {
    await page.goto('/');
    await createTask(page, { title: 'Buy milk', dueDate: DATE_MID, priority: 'high' });

    const stored = JSON.parse((await readStorage(page)) ?? '{}') as {
      schemaVersion: number;
      tasks: Record<string, unknown>[];
    };

    expect(stored.schemaVersion).toBe(1);
    expect(Object.keys(stored.tasks[0] ?? {}).sort()).toEqual([
      'completed',
      'createdAt',
      'dueDate',
      'id',
      'priority',
      'title',
    ]);
  });
});
