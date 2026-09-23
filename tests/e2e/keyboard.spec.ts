import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { SELECTORS, focusedKey, focusedTag, tabTo, titles } from './support';

/**
 * T-603 — all four journeys completed with the keyboard ALONE.
 *
 * Acceptance criteria: AC-A11Y.1, AC-A11Y.4.
 *
 * Why this tier: real focus order and real native control behaviour. jsdom
 * implements neither sequential focus navigation nor implicit form submission,
 * so "completable keyboard-only, end to end" cannot be decided there.
 *
 * THE RULE FOR THIS FILE: no `click()`, no `fill()`, no `selectOption()`, no
 * `focus()`, no `press` on a locator. Every interaction goes through
 * `page.keyboard`, so focus can only move the way the tab order actually
 * moves it. A guard at the bottom of this file asserts the rule holds, because
 * a single stray `click()` would silently turn this suite into a pointer test
 * that happens to use some keys.
 */

/** Type into whatever currently has focus. */
async function type(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
}

/** Tab to a control and activate it with Enter. */
async function tabAndPressEnter(page: Page, key: string): Promise<void> {
  await tabTo(page, key);
  await page.keyboard.press('Enter');
}

/**
 * Fill the native date input by typing its segments.
 *
 * Chromium's `<input type="date">` is three spin fields; typing the digits in
 * the locale's order fills them. This is the real keyboard path a user takes,
 * which is exactly why it belongs in this tier and not in jsdom.
 */
/**
 * Type digits into the focused date input and return the ISO value produced.
 *
 * Chromium's `<input type="date">` is three spin fields whose ORDER follows
 * the browser's UI language, not `navigator.language` — so the same digits
 * mean 3 January on one machine and 1 March on another, and a test that
 * asserted a particular mapping would pass or fail by accident of where it
 * ran.
 *
 * So this asserts only what is actually the app's business: that the control
 * is operable by keyboard and yields a well-formed ISO date, which is the
 * shape ADR-0005 stores and the comparator sorts lexicographically. Callers
 * that need a specific date use the value that comes back.
 *
 * Because the order is unknown, callers must pass digit pairs that are VALID
 * UNDER EITHER READING — both the first and second pair no greater than 12 —
 * or one interpretation produces an impossible month and the segments roll.
 */
async function typeDate(page: Page, digits: string): Promise<string> {
  await page.keyboard.type(digits);

  const value = await page.inputValue(SELECTORS.due);
  expect(value, `typing "${digits}" did not produce an ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  return value;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// ───────────────────── reachability of every control ──────────────────────

test.describe('AC-A11Y.1 — every named control is keyboard reachable', () => {
  test('reaches all four create-form controls by Tab alone', async ({ page }) => {
    // Each assertion is the tabTo() call itself: it throws if the key is not
    // reached within the limit.
    await tabTo(page, 'form:title');
    await tabTo(page, 'form:dueDate');
    await tabTo(page, 'form:priority');
    await tabTo(page, 'form:submit');
  });

  test('reaches both filter controls by Tab alone (AC-007.6)', async ({ page }) => {
    await tabTo(page, 'filter:active');
    await tabTo(page, 'filter:completed');
  });

  test('reaches every per-task control by Tab alone', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');

    const id = await page.locator(SELECTORS.row).getAttribute('data-task-id');

    await tabTo(page, `task:${id}:toggle`);
    await tabTo(page, `task:${id}:edit`);
    await tabTo(page, `task:${id}:delete`);
  });

  test('reaches every edit-form control by Tab alone', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');

    const id = await page.locator(SELECTORS.row).getAttribute('data-task-id');
    await tabAndPressEnter(page, `task:${id}:edit`);

    // Focus lands in the edit title field, so tabbing starts from there.
    expect(await focusedKey(page)).toBe(`task:${id}:edit-title`);
    await tabTo(page, `task:${id}:edit-dueDate`);
    await tabTo(page, `task:${id}:edit-priority`);
    await tabTo(page, `task:${id}:edit-save`);
    await tabTo(page, `task:${id}:edit-cancel`);
  });

  test('every stop in the tab order is a real control, with no dead stops', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');

    /*
     * Walk exactly one cycle: from the first control to the last.
     *
     * Deliberately NOT further. Tabbing past the final control moves focus to
     * the browser's own chrome, at which point `document.activeElement`
     * reports `body` — that is the platform behaving normally, not the app
     * losing focus. The invariant architecture §9.4 actually states is that
     * focus is never left on `<body>` after an ACTION, which the suite below
     * checks directly.
     */
    const controls = await page.locator('[data-focus-key]').count();
    expect(controls).toBeGreaterThan(4);

    await page.keyboard.press('Home');
    for (let i = 0; i < controls - 1; i += 1) {
      await page.keyboard.press('Tab');

      expect(await focusedTag(page), `dead stop after ${i + 1} tabs`).not.toBe('BODY');
      expect(await focusedKey(page), `unkeyed stop after ${i + 1} tabs`).not.toBeNull();
    }
  });

  test('focus is never left on <body> after an action (AC-A11Y.3)', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');
    await type(page, 'Pay rent');
    await page.keyboard.press('Enter');

    const id = await page
      .locator(SELECTORS.row)
      .filter({ hasText: 'Buy milk' })
      .getAttribute('data-task-id');

    await tabTo(page, `task:${id}:toggle`);
    await page.keyboard.press('Space');
    expect(await focusedTag(page)).not.toBe('BODY');

    await tabTo(page, 'filter:completed');
    await page.keyboard.press('Enter');
    expect(await focusedTag(page)).not.toBe('BODY');

    await tabTo(page, `task:${id}:delete`);
    await page.keyboard.press('Enter');
    expect(await focusedTag(page)).not.toBe('BODY');
  });

  test('walks the order backwards with Shift+Tab as well', async ({ page }) => {
    await tabTo(page, 'form:submit');
    await page.keyboard.press('Shift+Tab');

    expect(await focusedKey(page)).toBe('form:priority');
  });
});

// ────────────────────────── J1, keyboard only ─────────────────────────────

test.describe('AC-A11Y.4 — J1 keyboard-only', () => {
  test('captures a task with a title, date and priority using only keys', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Pay rent');

    await tabTo(page, 'form:dueDate');
    const due = await typeDate(page, '03012026');

    await tabTo(page, 'form:priority');
    // A native <select> responds to typed characters.
    await page.keyboard.type('High');
    expect(await page.inputValue(SELECTORS.priority)).toBe('high');

    // Enter from a text field submits the form natively — no button press.
    await tabTo(page, 'form:title');
    await page.keyboard.press('Enter');

    expect(await titles(page)).toEqual(['Pay rent']);
    // The date the control produced is the date the row shows, verbatim —
    // never reformatted (ADR-0005).
    await expect(page.locator(SELECTORS.row)).toContainText(due);
    await expect(page.locator(SELECTORS.row)).toContainText('High');
  });

  test('submits with Space on the Add button as well', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await tabTo(page, 'form:submit');
    await page.keyboard.press('Space');

    expect(await titles(page)).toEqual(['Buy milk']);
  });

  test('returns focus to the title field, ready for the next task', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');

    expect(await focusedKey(page)).toBe('form:title');

    // So the next task needs no navigation at all.
    await type(page, 'Pay rent');
    await page.keyboard.press('Enter');

    expect(await titles(page)).toEqual(['Buy milk', 'Pay rent']);
  });

  test('surfaces a rejected submit without losing the keyboard position', async ({ page }) => {
    await tabTo(page, 'form:title');
    await page.keyboard.press('Enter');

    await expect(page.locator(SELECTORS.createError)).toBeVisible();
    expect(await focusedTag(page)).not.toBe('BODY');
  });
});

// ────────────────────────── J2, keyboard only ─────────────────────────────

test.describe('AC-A11Y.4 — J2 keyboard-only', () => {
  test('completes and reopens a task with Space and the filter buttons', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');
    await type(page, 'Pay rent');
    await page.keyboard.press('Enter');

    const id = await page
      .locator(SELECTORS.row)
      .filter({ hasText: 'Buy milk' })
      .getAttribute('data-task-id');

    // Space is the native activation key for a checkbox.
    await tabTo(page, `task:${id}:toggle`);
    await page.keyboard.press('Space');

    expect(await titles(page)).toEqual(['Pay rent']);

    await tabAndPressEnter(page, 'filter:completed');
    expect(await titles(page)).toEqual(['Buy milk']);

    // Reopen it from the completed view.
    await tabTo(page, `task:${id}:toggle`);
    await page.keyboard.press('Space');
    expect(await titles(page)).toEqual([]);

    await tabAndPressEnter(page, 'filter:active');
    // Both are undated, so comparator key 3 decides and the older task leads
    // (OQ-02). Reopening restores position; it does not move the task to the
    // end.
    expect(await titles(page)).toEqual(['Buy milk', 'Pay rent']);
  });

  test('keeps focus somewhere usable after a toggle moves a task away', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');
    await type(page, 'Pay rent');
    await page.keyboard.press('Enter');

    const id = await page
      .locator(SELECTORS.row)
      .filter({ hasText: 'Buy milk' })
      .getAttribute('data-task-id');

    await tabTo(page, `task:${id}:toggle`);
    await page.keyboard.press('Space');

    expect(await focusedTag(page)).not.toBe('BODY');
    expect(await focusedKey(page)).not.toBeNull();
  });
});

// ────────────────────────── J3, keyboard only ─────────────────────────────

test.describe('AC-A11Y.4 — J3 keyboard-only', () => {
  test('edits a task end to end without a pointer', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');

    const id = await page.locator(SELECTORS.row).getAttribute('data-task-id');

    await tabAndPressEnter(page, `task:${id}:edit`);

    // Architecture §9.4 row 3: focus moves into the edit title field, so the
    // user can start typing immediately.
    expect(await focusedKey(page)).toBe(`task:${id}:edit-title`);

    await page.keyboard.press('Control+A');
    await type(page, 'Buy oat milk');

    await tabTo(page, `task:${id}:edit-priority`);
    await page.keyboard.type('Low');

    await tabTo(page, `task:${id}:edit-save`);
    await page.keyboard.press('Enter');

    expect(await titles(page)).toEqual(['Buy oat milk']);
    await expect(page.locator(SELECTORS.row)).toContainText('Low');

    // Architecture §9.4 row 4: focus returns to that task's Edit button.
    expect(await focusedKey(page)).toBe(`task:${id}:edit`);
  });

  test('cancels an edit with the keyboard and returns focus to Edit', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');

    const id = await page.locator(SELECTORS.row).getAttribute('data-task-id');

    await tabAndPressEnter(page, `task:${id}:edit`);
    await page.keyboard.press('Control+A');
    await type(page, 'Discarded');

    await tabTo(page, `task:${id}:edit-cancel`);
    await page.keyboard.press('Enter');

    expect(await titles(page)).toEqual(['Buy milk']);
    expect(await focusedKey(page)).toBe(`task:${id}:edit`);
  });

  test('deletes a task and hands focus to the next one (AC-A11Y.3)', async ({ page }) => {
    await tabTo(page, 'form:title');
    for (const title of ['First', 'Second', 'Third']) {
      await type(page, title);
      await page.keyboard.press('Enter');
    }

    const secondId = await page
      .locator(SELECTORS.row)
      .filter({ hasText: 'Second' })
      .getAttribute('data-task-id');
    const thirdId = await page
      .locator(SELECTORS.row)
      .filter({ hasText: 'Third' })
      .getAttribute('data-task-id');

    await tabAndPressEnter(page, `task:${secondId}:delete`);

    expect(await titles(page)).toEqual(['First', 'Third']);
    // The task that took its place, per architecture §9.4 row 2.
    expect(await focusedKey(page)).toBe(`task:${thirdId}:delete`);
  });

  test('deleting the last task returns focus to the title field', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'The only one');
    await page.keyboard.press('Enter');

    const id = await page.locator(SELECTORS.row).getAttribute('data-task-id');
    await tabAndPressEnter(page, `task:${id}:delete`);

    expect(await titles(page)).toEqual([]);
    expect(await focusedKey(page)).toBe('form:title');
  });
});

// ────────────────────────── J4, keyboard only ─────────────────────────────

test.describe('AC-A11Y.4 — J4 keyboard-only', () => {
  test('returns to a list built entirely by keyboard, after a reload', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Task A');
    await tabTo(page, 'form:dueDate');
    const dateA = await typeDate(page, '11102026');
    await tabTo(page, 'form:title');
    await page.keyboard.press('Enter');

    await type(page, 'Task B');
    await tabTo(page, 'form:dueDate');
    const dateB = await typeDate(page, '02032026');
    await tabTo(page, 'form:title');
    await page.keyboard.press('Enter');

    /*
     * The expected order is derived from the dates the control actually
     * produced rather than assumed. That makes this a stronger check than a
     * fixed expectation: whatever the two dates turned out to be, the app must
     * order them the way ISO strings compare (AC-010.1, ADR-0005).
     */
    expect(dateA).not.toBe(dateB);
    const expected = dateA < dateB ? ['Task A', 'Task B'] : ['Task B', 'Task A'];

    expect(await titles(page)).toEqual(expected);

    // J4 step 2 is reopening the app, which needs no interaction at all —
    // that is the whole of AC-008.3.
    await page.reload();

    expect(await titles(page)).toEqual(expected);
  });

  test('the reloaded list is immediately navigable by keyboard again', async ({ page }) => {
    await tabTo(page, 'form:title');
    await type(page, 'Buy milk');
    await page.keyboard.press('Enter');

    await page.reload();

    const id = await page.locator(SELECTORS.row).getAttribute('data-task-id');
    await tabTo(page, `task:${id}:toggle`);
    await page.keyboard.press('Space');

    expect(await titles(page)).toEqual([]);
  });
});

// ─────────────────── the guard: this file uses no pointer ─────────────────

/* KEYBOARD_ONLY_GUARD_BELOW */

/** Marks where the driving code ends and the self-check begins. */
const GUARD_BOUNDARY = 'KEYBOARD_ONLY_GUARD_BELOW';

test('this suite drives the app with the keyboard only', async () => {
  /*
   * The claim of T-603 is "no pointer events at any point". That is a property
   * of this FILE, and one that a careless edit could silently break — a single
   * `click()` added later would leave the suite green while no longer testing
   * what its name says.
   *
   * So the file checks itself.
   */
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');

  const whole = readFileSync(resolve(process.cwd(), 'tests/e2e/keyboard.spec.ts'), 'utf8');

  /*
   * Scan only the part of the file above this guard. The list below names the
   * forbidden calls as string literals, so scanning the whole file would
   * always match — the guard would flag itself and never anything else.
   */
  const boundary = whole.indexOf(GUARD_BOUNDARY);
  expect(boundary).toBeGreaterThan(0);

  const source = whole
    .slice(0, boundary)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  // Pointer-driven and focus-shortcutting APIs, all of which would bypass the
  // tab order this suite exists to exercise.
  for (const forbidden of [
    '.click(',
    '.dblclick(',
    '.hover(',
    '.tap(',
    '.fill(',
    '.selectOption(',
    '.check(',
    '.setChecked(',
    'page.mouse',
    'page.focus(',
    '.focus(',
  ]) {
    expect(source, `keyboard.spec.ts uses ${forbidden}`).not.toContain(forbidden);
  }

  // And it must genuinely be driving the keyboard.
  expect(source).toContain('page.keyboard.press');
  expect(source).toContain('page.keyboard.type');
});
