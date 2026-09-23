import { expect, test } from '@playwright/test';

import { makeManyTasks, makeTask, mixedList } from '../support/fixtures';

/**
 * T-003, tier 3 of three: confirms the fixture module is importable and usable
 * from Playwright, and that the E2E pipeline itself works — production build,
 * static preview server, real browser.
 *
 * This is a tier smoke test. No application behavior is verified here; the app
 * has no UI until T-401. The journey suites arrive at T-601.
 */

test.describe('e2e tier configuration', () => {
  test('serves the built artifact from the preview server', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Task Tracker');
    await expect(page.locator('#app')).toBeAttached();
  });

  test('fixtures are importable and serialisable into the real browser', async ({ page }) => {
    await page.goto('/');

    // Proves the fixture data survives the node -> browser boundary, which is
    // how T-604 will seed corrupt payloads and T-606 will seed 500 tasks.
    const titles = await page.evaluate(
      (tasks) => tasks.map((task) => task.title),
      [...mixedList],
    );

    expect(titles).toEqual(mixedList.map((task) => task.title));
  });

  test('fixture payloads round-trip through the genuine localStorage API', async ({ page }) => {
    await page.goto('/');

    const payload = JSON.stringify({ schemaVersion: 1, tasks: [...mixedList] });

    const readBack = await page.evaluate((raw) => {
      // Test-side use of the real storage API. The T-203 invariant restricts
      // localStorage to src/persistence/storage.ts within `src/` only; test
      // code seeding the browser is how tiers 2 and 3 exercise it.
      window.localStorage.setItem('task-tracker.v1', raw);
      return window.localStorage.getItem('task-tracker.v1');
    }, payload);

    expect(readBack).toBe(payload);
    expect(JSON.parse(readBack ?? '{}')).toEqual({
      schemaVersion: 1,
      tasks: mixedList,
    });
  });

  test('the bulk builder produces the 500-task set T-606 needs', async ({ page }) => {
    await page.goto('/');

    const count = await page.evaluate(
      (tasks) => tasks.length,
      makeManyTasks(500),
    );

    expect(count).toBe(500);
  });

  test('a single built task survives the boundary intact', async ({ page }) => {
    await page.goto('/');

    const task = makeTask({ id: 'e2e-1', title: 'Café — naïve façade 📌' });
    const roundTripped = await page.evaluate((t) => t, task);

    expect(roundTripped).toEqual(task);
  });
});
