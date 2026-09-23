import { expect, test } from '@playwright/test';

import { DATE_EARLY, DATE_LATE, DATE_MID } from '../support/fixtures';
import {
  SELECTORS,
  beginEdit,
  createTask,
  createTaskWithEnter,
  deleteTask,
  documentSurvived,
  markDocument,
  row,
  saveEdit,
  showActive,
  showCompleted,
  titles,
  toggle,
} from './support';

/**
 * T-601 — journeys J1, J2 and J3 in a real browser.
 *
 * Acceptance criteria: AC-001.1, AC-001.3, AC-004.2, AC-005.3, AC-006.1,
 * AC-006.2.
 *
 * Why this tier (ADR-0008 §10.3): the real event and render pipeline. jsdom
 * dispatches events but implements no navigation, so "without a full page
 * reload" is not a claim it can settle. Here it is settled two ways — a
 * marker on the live document, and a count of real frame navigations.
 */

/** Navigations observed after the initial load, per test. */
const navigations = new WeakMap<object, string[]>();

test.beforeEach(async ({ page }) => {
  const seen: string[] = [];
  navigations.set(page, seen);

  await page.goto('/');
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) seen.push(frame.url());
  });

  await markDocument(page);
});

function navigationsFor(page: object): string[] {
  return navigations.get(page) ?? [];
}

// ───────────────────────────── J1 — capture ───────────────────────────────

test.describe('J1 — capture a new task', () => {
  test('adds a task with exactly the title entered (AC-001.1)', async ({ page }) => {
    await createTask(page, { title: 'Buy milk' });

    await expect(page.locator(SELECTORS.taskTitle)).toHaveText(['Buy milk']);
  });

  test('carries the due date and priority entered (AC-002.1, AC-003.1)', async ({ page }) => {
    await createTask(page, { title: 'Pay rent', dueDate: DATE_MID, priority: 'high' });

    await expect(row(page, 'Pay rent')).toContainText(DATE_MID);
    await expect(row(page, 'Pay rent')).toContainText('High');
  });

  test('creates successfully with a title alone (AC-001.5)', async ({ page }) => {
    await createTask(page, { title: 'Just a title' });

    await expect(row(page, 'Just a title')).toContainText('No due date');
    await expect(row(page, 'Just a title')).toContainText('No priority');
  });

  test('appears WITHOUT a full page reload (AC-001.3)', async ({ page }) => {
    await createTask(page, { title: 'Buy milk' });

    await expect(page.locator(SELECTORS.taskTitle)).toHaveText(['Buy milk']);
    // The document that was marked before the action is still the live one.
    expect(await documentSurvived(page)).toBe(true);
    expect(navigationsFor(page)).toEqual([]);
  });

  test('submits with Enter, with no pointer involved (AC-A11Y.4)', async ({ page }) => {
    await createTaskWithEnter(page, { title: 'Typed and entered' });

    await expect(page.locator(SELECTORS.taskTitle)).toHaveText(['Typed and entered']);
    expect(await documentSurvived(page)).toBe(true);
  });

  test('lands a new task in its sorted position, not at the end (AC-010.3)', async ({ page }) => {
    await createTask(page, { title: 'Later', dueDate: DATE_LATE });
    await createTask(page, { title: 'Undated' });
    await createTask(page, { title: 'Sooner', dueDate: DATE_EARLY });

    expect(await titles(page)).toEqual(['Sooner', 'Later', 'Undated']);
  });

  test('clears the form after a successful create, ready for the next', async ({ page }) => {
    await createTask(page, { title: 'Buy milk', dueDate: DATE_MID, priority: 'low' });

    await expect(page.locator(SELECTORS.title)).toHaveValue('');
    await expect(page.locator(SELECTORS.due)).toHaveValue('');
    await expect(page.locator(SELECTORS.priority)).toHaveValue('');
    await expect(page.locator(SELECTORS.title)).toBeFocused();
  });

  test('rejects an empty title with a visible message (AC-009.1, AC-009.2)', async ({ page }) => {
    await page.click(SELECTORS.submit);

    await expect(page.locator(SELECTORS.createError)).toBeVisible();
    await expect(page.locator(SELECTORS.createError)).not.toBeEmpty();
    await expect(page.locator(SELECTORS.row)).toHaveCount(0);
    expect(await documentSurvived(page)).toBe(true);
  });

  test('keeps the date and priority after a rejected submit (AC-009.3)', async ({ page }) => {
    await page.fill(SELECTORS.due, DATE_MID);
    await page.selectOption(SELECTORS.priority, 'medium');
    await page.fill(SELECTORS.title, '   ');
    await page.click(SELECTORS.submit);

    await expect(page.locator(SELECTORS.due)).toHaveValue(DATE_MID);
    await expect(page.locator(SELECTORS.priority)).toHaveValue('medium');
  });

  test('clears the message on the next valid submit (AC-009.5)', async ({ page }) => {
    await page.click(SELECTORS.submit);
    await expect(page.locator(SELECTORS.createError)).not.toBeEmpty();

    await createTask(page, { title: 'Buy milk' });

    await expect(page.locator(SELECTORS.createError)).toBeEmpty();
  });

  test('lets two tasks share a title (AC-001.6)', async ({ page }) => {
    await createTask(page, { title: 'Buy milk' });
    await createTask(page, { title: 'Buy milk' });

    await expect(page.locator(SELECTORS.row)).toHaveCount(2);
  });
});

// ──────────────────────── J2 — complete and reopen ────────────────────────

test.describe('J2 — complete or reopen a task', () => {
  test.beforeEach(async ({ page }) => {
    await createTask(page, { title: 'Buy milk', dueDate: DATE_MID, priority: 'high' });
    await createTask(page, { title: 'Pay rent', dueDate: DATE_EARLY });
    await markDocument(page);
  });

  test('moves a completed task out of active and into completed (AC-004.2)', async ({ page }) => {
    await toggle(page, 'Buy milk');

    expect(await titles(page)).toEqual(['Pay rent']);

    await showCompleted(page);
    expect(await titles(page)).toEqual(['Buy milk']);
  });

  test('reopening restores it to the active view (AC-004.3, J2 step 4)', async ({ page }) => {
    await toggle(page, 'Buy milk');
    await showCompleted(page);
    await toggle(page, 'Buy milk');

    expect(await titles(page)).toEqual([]);

    await showActive(page);
    expect(await titles(page)).toEqual(['Pay rent', 'Buy milk']);
  });

  test('preserves title, due date and priority across a toggle (AC-004.4)', async ({ page }) => {
    await toggle(page, 'Buy milk');
    await showCompleted(page);

    await expect(row(page, 'Buy milk')).toContainText(DATE_MID);
    await expect(row(page, 'Buy milk')).toContainText('High');
  });

  test('reflects the change without a page reload (AC-004.5, AC-007.4)', async ({ page }) => {
    await toggle(page, 'Buy milk');

    await expect(page.locator(SELECTORS.taskTitle)).toHaveText(['Pay rent']);
    expect(await documentSurvived(page)).toBe(true);
    expect(navigationsFor(page)).toEqual([]);
  });

  test('marks a completed task as done by more than colour (AC-004.7)', async ({ page }) => {
    await toggle(page, 'Buy milk');
    await showCompleted(page);

    // The word, the strike-through, and the checked box — three signals.
    await expect(row(page, 'Buy milk')).toContainText('Completed');
    await expect(row(page, 'Buy milk').locator('input[type="checkbox"]')).toBeChecked();
    expect(
      await row(page, 'Buy milk')
        .locator(SELECTORS.taskTitle)
        .evaluate((el) => getComputedStyle(el).textDecorationLine),
    ).toContain('line-through');
  });

  test('classifies every task into exactly one view (AC-007.3)', async ({ page }) => {
    await toggle(page, 'Buy milk');

    const active = await titles(page);
    await showCompleted(page);
    const completed = await titles(page);

    expect([...active, ...completed].sort()).toEqual(['Buy milk', 'Pay rent']);
    expect(active.filter((t) => completed.includes(t))).toEqual([]);
  });

  test('keeps the FR-010 ordering inside the completed view (AC-010.5)', async ({ page }) => {
    await toggle(page, 'Buy milk');
    await toggle(page, 'Pay rent');
    await showCompleted(page);

    // Pay rent is due earlier, so it sorts first in this view too.
    expect(await titles(page)).toEqual(['Pay rent', 'Buy milk']);
  });
});

// ────────────────────────── J3 — edit and delete ──────────────────────────

test.describe('J3 — edit or delete a task', () => {
  test.beforeEach(async ({ page }) => {
    await createTask(page, { title: 'Buy milk', dueDate: DATE_MID, priority: 'medium' });
    await createTask(page, { title: 'Pay rent', dueDate: DATE_EARLY });
    await markDocument(page);
  });

  test('applies an edited title immediately (AC-005.1, AC-005.3)', async ({ page }) => {
    await beginEdit(page, 'Buy milk');
    await page.fill(`${SELECTORS.editingRow} input[type="text"]`, 'Buy oat milk');
    await saveEdit(page);

    await expect(page.locator(SELECTORS.taskTitle)).toHaveText(['Pay rent', 'Buy oat milk']);
    expect(await documentSurvived(page)).toBe(true);
    expect(navigationsFor(page)).toEqual([]);
  });

  test('edits all three attributes (AC-005.2)', async ({ page }) => {
    await beginEdit(page, 'Buy milk');
    await page.fill(`${SELECTORS.editingRow} input[type="text"]`, 'Buy oat milk');
    await page.fill(`${SELECTORS.editingRow} input[type="date"]`, DATE_LATE);
    await page.selectOption(`${SELECTORS.editingRow} select`, 'high');
    await saveEdit(page);

    await expect(row(page, 'Buy oat milk')).toContainText(DATE_LATE);
    await expect(row(page, 'Buy oat milk')).toContainText('High');
  });

  test('re-sorts the list when a due date is edited (AC-005.4, AC-010.4)', async ({ page }) => {
    expect(await titles(page)).toEqual(['Pay rent', 'Buy milk']);

    await beginEdit(page, 'Buy milk');
    await page.fill(`${SELECTORS.editingRow} input[type="date"]`, '2020-01-01');
    await saveEdit(page);

    expect(await titles(page)).toEqual(['Buy milk', 'Pay rent']);
  });

  test('clears a due date and sends the task last (AC-002.5)', async ({ page }) => {
    await beginEdit(page, 'Buy milk');
    await page.fill(`${SELECTORS.editingRow} input[type="date"]`, '');
    await saveEdit(page);

    expect(await titles(page)).toEqual(['Pay rent', 'Buy milk']);
    await expect(row(page, 'Buy milk')).toContainText('No due date');
  });

  test('clears a priority (AC-003.5)', async ({ page }) => {
    await beginEdit(page, 'Buy milk');
    await page.selectOption(`${SELECTORS.editingRow} select`, '');
    await saveEdit(page);

    await expect(row(page, 'Buy milk')).toContainText('No priority');
  });

  test('rejects an emptied title and keeps the previous one (AC-005.6)', async ({ page }) => {
    await beginEdit(page, 'Buy milk');
    await page.fill(`${SELECTORS.editingRow} input[type="text"]`, '   ');
    await saveEdit(page);

    await expect(page.locator(`${SELECTORS.editingRow} .form-error`)).toBeVisible();
    await expect(page.locator(`${SELECTORS.editingRow} .form-error`)).not.toBeEmpty();

    await page.locator(`${SELECTORS.editingRow} [data-action="cancel-edit"]`).click();
    await expect(row(page, 'Buy milk')).toBeVisible();
  });

  test('edits a completed task without changing its status (AC-005.7)', async ({ page }) => {
    await toggle(page, 'Buy milk');
    await showCompleted(page);

    await beginEdit(page, 'Buy milk');
    await page.fill(`${SELECTORS.editingRow} input[type="text"]`, 'Buy oat milk');
    await saveEdit(page);

    await expect(row(page, 'Buy oat milk')).toContainText('Completed');
    await expect(row(page, 'Buy oat milk').locator('input[type="checkbox"]')).toBeChecked();
  });

  test('removes a deleted task immediately, with no confirmation (AC-006.1)', async ({ page }) => {
    // OQ-04: J3 says the change applies "immediately" and the PRD names no
    // confirmation step, so a dialog appearing here would be a defect.
    let dialogAppeared = false;
    page.on('dialog', (d) => {
      dialogAppeared = true;
      void d.dismiss();
    });

    await deleteTask(page, 'Buy milk');

    expect(dialogAppeared).toBe(false);
    expect(await titles(page)).toEqual(['Pay rent']);
    expect(await documentSurvived(page)).toBe(true);
    expect(navigationsFor(page)).toEqual([]);
  });

  test('removes a deleted task from BOTH views (AC-006.2)', async ({ page }) => {
    await toggle(page, 'Buy milk');
    await showCompleted(page);
    await deleteTask(page, 'Buy milk');

    expect(await titles(page)).toEqual([]);

    await showActive(page);
    expect(await titles(page)).toEqual(['Pay rent']);
  });

  test('deletes a completed task on the same terms (AC-006.5)', async ({ page }) => {
    await toggle(page, 'Buy milk');
    await showCompleted(page);

    await deleteTask(page, 'Buy milk');

    await expect(page.locator(SELECTORS.emptyState)).toBeVisible();
  });

  test('leaves every other task untouched (AC-006.4)', async ({ page }) => {
    await deleteTask(page, 'Pay rent');

    expect(await titles(page)).toEqual(['Buy milk']);
    await expect(row(page, 'Buy milk')).toContainText(DATE_MID);
    await expect(row(page, 'Buy milk')).toContainText('Medium');
  });

  test('renders an empty list without error when the last task goes (AC-006.6)', async ({
    page,
  }) => {
    await deleteTask(page, 'Buy milk');
    await deleteTask(page, 'Pay rent');

    await expect(page.locator(SELECTORS.emptyState)).toBeVisible();
    await expect(page.locator(SELECTORS.row)).toHaveCount(0);
    expect(await documentSurvived(page)).toBe(true);
  });

  test('cancelling an edit discards the in-progress values', async ({ page }) => {
    await beginEdit(page, 'Buy milk');
    await page.fill(`${SELECTORS.editingRow} input[type="text"]`, 'Something else');
    await page.locator(`${SELECTORS.editingRow} [data-action="cancel-edit"]`).click();

    await expect(row(page, 'Buy milk')).toBeVisible();
    await expect(page.locator(SELECTORS.editingRow)).toHaveCount(0);
  });
});

// ───────────────── the whole of J1 → J2 → J3 in one document ──────────────

test('all three journeys run in a single document, with no navigation', async ({ page }) => {
  await createTask(page, { title: 'Renew passport', dueDate: DATE_LATE, priority: 'medium' });
  await createTask(page, { title: 'Pay rent', dueDate: DATE_EARLY, priority: 'high' });
  await createTask(page, { title: 'Someday project' });

  await toggle(page, 'Pay rent');
  await showCompleted(page);
  await toggle(page, 'Pay rent');
  await showActive(page);

  await beginEdit(page, 'Renew passport');
  await page.fill(`${SELECTORS.editingRow} input[type="text"]`, 'Renew passport (urgent)');
  await saveEdit(page);

  await deleteTask(page, 'Someday project');

  expect(await titles(page)).toEqual(['Pay rent', 'Renew passport (urgent)']);
  expect(await documentSurvived(page)).toBe(true);
  expect(navigationsFor(page)).toEqual([]);
});
