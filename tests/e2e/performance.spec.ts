import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { makeManyTasks } from '../support/fixtures';
import { SELECTORS, seedTasks } from './support';

/**
 * T-606 — perceived latency at 500 tasks.
 *
 * Acceptance criteria: AC-PERF.1, AC-PERF.2, AC-PERF.3.
 *
 * AC-PERF.3 requires the list size at which the bound is validated to be
 * STATED by the test. It is 500, fixed in ADR-0008 §10.4 — well beyond a
 * realistic personal list, and a concrete number in place of A-02's unbounded
 * assumption.
 *
 * 500 IS A TEST PARAMETER, NOT A PRODUCT LIMIT. No cap is enforced anywhere in
 * the application, and none should be inferred from this file.
 *
 * MEASUREMENT METHOD. Each operation is performed several times and the MEDIAN
 * is compared against the budget. A single sample is not a measurement of the
 * application: these suites run four browsers in parallel, and a sample that
 * happens to land while three other Chromium instances are starting measures
 * the machine, not the app. The median of a handful of runs is stable under
 * that noise while still failing outright if the operation is genuinely slow.
 * The spread is asserted separately, so a pathological worst case cannot hide
 * behind a healthy median.
 *
 * Timing is taken inside the page with `performance.now()` around the event
 * plus its synchronous re-render, because a round trip through the test
 * harness would measure Playwright's IPC instead.
 */

/** The stated list size (ADR-0008 §10.4). */
const LIST_SIZE = 500;

/** The bound from NFR-PERF-001. */
const BUDGET_MS = 100;

/** Samples per operation. Odd, so the median is an actual observation. */
const SAMPLES = 5;

// Serial within this file, so its own tests never contend with each other.
test.describe.configure({ mode: 'serial' });

/**
 * Click `selector` and return how long it took for the DOM to be ready to
 * paint.
 *
 * The store dispatches, persists and re-renders synchronously (ADR-0004), so
 * the DOM is already updated when the handler returns; the animation frame is
 * awaited so the measurement includes the browser reaching the point where it
 * could paint.
 */
async function timeClick(page: Page, selector: string): Promise<number> {
  return page.evaluate(async (sel) => {
    const element = document.querySelector(sel) as HTMLElement | null;
    if (element === null) throw new Error(`nothing matched ${sel}`);

    const start = performance.now();
    element.click();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    return performance.now() - start;
  }, selector);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
}

const report = (name: string, samples: readonly number[]): string =>
  `${name}: median ${median(samples).toFixed(1)}ms of [${samples
    .map((s) => s.toFixed(1))
    .join(', ')}]ms`;

test.describe(`perceived latency at ${LIST_SIZE} tasks (AC-PERF.3 states the size)`, () => {
  test.beforeEach(async ({ page }) => {
    await seedTasks(page, makeManyTasks(LIST_SIZE));
  });

  test(`the seeded list really holds ${LIST_SIZE} tasks`, async ({ page }) => {
    // The measurements below are meaningless if the list is small, so the size
    // is asserted before anything is timed. The builder completes every fifth
    // task, so 400 are active and the app opens on the active view.
    expect(await page.locator(SELECTORS.row).count()).toBe(400);

    await page.click(SELECTORS.filterCompleted);
    expect(await page.locator(SELECTORS.row).count()).toBe(100);
  });

  test(`create reflects in under ${BUDGET_MS}ms (AC-PERF.1)`, async ({ page }) => {
    const samples: number[] = [];

    for (let i = 0; i < SAMPLES; i += 1) {
      await page.fill(SELECTORS.title, `A brand new task ${i}`);
      samples.push(await timeClick(page, SELECTORS.submit));
    }

    expect(await page.locator(SELECTORS.row).count()).toBe(400 + SAMPLES);
    expect(median(samples), report('create', samples)).toBeLessThan(BUDGET_MS);
  });

  test(`complete reflects in under ${BUDGET_MS}ms (AC-PERF.1)`, async ({ page }) => {
    const samples: number[] = [];

    for (let i = 0; i < SAMPLES; i += 1) {
      // Completing removes the row from this view, so the next iteration acts
      // on a different task — no re-toggling of the same one.
      samples.push(await timeClick(page, `${SELECTORS.row}:first-child input[type="checkbox"]`));
    }

    expect(await page.locator(SELECTORS.row).count()).toBe(400 - SAMPLES);
    expect(median(samples), report('complete', samples)).toBeLessThan(BUDGET_MS);
  });

  test(`reopen reflects in under ${BUDGET_MS}ms (AC-PERF.1)`, async ({ page }) => {
    await page.click(SELECTORS.filterCompleted);
    const samples: number[] = [];

    for (let i = 0; i < SAMPLES; i += 1) {
      samples.push(await timeClick(page, `${SELECTORS.row}:first-child input[type="checkbox"]`));
    }

    expect(await page.locator(SELECTORS.row).count()).toBe(100 - SAMPLES);
    expect(median(samples), report('reopen', samples)).toBeLessThan(BUDGET_MS);
  });

  test(`delete reflects in under ${BUDGET_MS}ms (AC-PERF.1)`, async ({ page }) => {
    const samples: number[] = [];

    for (let i = 0; i < SAMPLES; i += 1) {
      samples.push(await timeClick(page, `${SELECTORS.row}:first-child [data-action="delete"]`));
    }

    expect(await page.locator(SELECTORS.row).count()).toBe(400 - SAMPLES);
    expect(median(samples), report('delete', samples)).toBeLessThan(BUDGET_MS);
  });

  test(`edit reflects in under ${BUDGET_MS}ms (AC-PERF.1)`, async ({ page }) => {
    const opens: number[] = [];
    const saves: number[] = [];

    for (let i = 0; i < SAMPLES; i += 1) {
      // Opening the editor is itself a full rebuild of the list.
      opens.push(await timeClick(page, `${SELECTORS.row}:first-child [data-action="edit"]`));

      await page.fill(`${SELECTORS.editingRow} input[type="text"]`, `An edited title ${i}`);
      saves.push(await timeClick(page, `${SELECTORS.editingRow} button[type="submit"]`));
    }

    await expect(page.locator(SELECTORS.row).first()).toContainText('An edited title');
    expect(median(opens), report('open editor', opens)).toBeLessThan(BUDGET_MS);
    expect(median(saves), report('save edit', saves)).toBeLessThan(BUDGET_MS);
  });

  test(`switching views reflects in under ${BUDGET_MS}ms`, async ({ page }) => {
    const samples: number[] = [];

    for (let i = 0; i < SAMPLES; i += 1) {
      samples.push(
        await timeClick(page, i % 2 === 0 ? SELECTORS.filterCompleted : SELECTORS.filterActive),
      );
    }

    expect(median(samples), report('switch view', samples)).toBeLessThan(BUDGET_MS);
  });

  test('no operation depends on a network round trip (AC-PERF.2)', async ({ page, baseURL }) => {
    const origin = baseURL ?? 'http://localhost:4173';
    const offOrigin: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(origin)) offOrigin.push(r.url());
    });

    await page.fill(SELECTORS.title, 'Another task');
    await page.click(SELECTORS.submit);
    await page.click(`${SELECTORS.row}:first-child input[type="checkbox"]`);

    expect(offOrigin).toEqual([]);
  });

  test('latency does not degrade across a run of operations', async ({ page }) => {
    /*
     * One fast operation could be luck. Twenty in a row, each rebuilding a
     * 400-row list, is the shape of actual use — and would expose a listener
     * leak or an accumulating structure that made each render slower than the
     * last, which a single sample cannot see.
     */
    const samples: number[] = [];

    for (let i = 0; i < 20; i += 1) {
      samples.push(await timeClick(page, `${SELECTORS.row}:first-child [data-action="delete"]`));
    }

    expect(await page.locator(SELECTORS.row).count()).toBe(380);

    const firstHalf = median(samples.slice(0, 10));
    const secondHalf = median(samples.slice(10));

    expect(median(samples), report('sustained delete', samples)).toBeLessThan(BUDGET_MS);
    // The second half must not be dramatically worse than the first.
    expect(
      secondHalf,
      `first half median ${firstHalf.toFixed(1)}ms, second half ${secondHalf.toFixed(1)}ms`,
    ).toBeLessThan(Math.max(firstHalf * 3, BUDGET_MS));
  });

  test('no single operation is pathologically slow', async ({ page }) => {
    /*
     * The median is the headline measure, so this guards the other end: a
     * worst case an order of magnitude past the budget would be a real defect
     * hiding behind a healthy median. The ceiling is deliberately loose —
     * it is looking for something broken, not for scheduler noise.
     */
    const samples: number[] = [];

    for (let i = 0; i < SAMPLES; i += 1) {
      samples.push(await timeClick(page, `${SELECTORS.row}:first-child [data-action="delete"]`));
    }

    expect(Math.max(...samples), report('worst-case delete', samples)).toBeLessThan(BUDGET_MS * 5);
  });

  test('the initial load of the whole list is not pathological', async ({ page }) => {
    // Not an acceptance criterion — NFR-PERF-001 bounds the four operations,
    // not startup — but a first paint that took seconds at this size would
    // make the app feel broken regardless of what the criteria say.
    const start = Date.now();
    await page.reload();
    await expect(page.locator(SELECTORS.row).first()).toBeVisible();
    const elapsed = Date.now() - start;

    expect(elapsed, `loading ${LIST_SIZE} tasks took ${elapsed}ms`).toBeLessThan(5000);
  });
});
