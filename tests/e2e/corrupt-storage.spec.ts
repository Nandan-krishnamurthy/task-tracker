import { expect, test } from '@playwright/test';

import { makeTask, mixedList } from '../support/fixtures';
import {
  SCHEMA_VERSION,
  SELECTORS,
  STORAGE_KEY,
  createTask,
  readStorage,
  seedRaw,
  seedTasks,
  titles,
  toggle,
} from './support';

/**
 * T-604 — corrupt storage, against the genuine `localStorage` API.
 *
 * Acceptance criteria: AC-008.6, AC-SUP.1.
 *
 * T-501 drove the same failure modes through a fake in jsdom, which is where
 * the exhaustive payload matrix belongs. What only a real browser can show is
 * that the genuine storage API — with its real serialisation, its real quota
 * behaviour, and a real page load — produces the same outcome. A decoder that
 * is total against an injected string could still be defeated by something the
 * actual API does on the way in or out.
 */

const USABLE_EMPTY = 'starts with a usable, empty list';

test.describe('a malformed payload degrades to an empty list (AC-008.6, AC-SUP.1)', () => {
  const payloads: ReadonlyArray<readonly [string, string]> = [
    ['invalid JSON', '{{{ not json'],
    ['a truncated payload', '{"schemaVersion":1,"tasks":[{"id":"a","tit'],
    ['an empty string', ''],
    ['a bare array', '[]'],
    ['a JSON primitive', '"just a string"'],
    ['the literal null', 'null'],
    ['an envelope with no tasks', '{"schemaVersion":1}'],
    ['tasks that are not an array', '{"schemaVersion":1,"tasks":{}}'],
    ['an unrecognised schemaVersion', '{"schemaVersion":42,"tasks":[]}'],
    ['a missing schemaVersion', '{"tasks":[]}'],
    ['a task missing its title', '{"schemaVersion":1,"tasks":[{"id":"a","completed":false}]}'],
    [
      'a task with an impossible due date',
      '{"schemaVersion":1,"tasks":[{"id":"a","title":"x","dueDate":"2026-02-30","priority":null,"completed":false,"createdAt":1}]}',
    ],
    [
      'a task with a fourth priority level',
      '{"schemaVersion":1,"tasks":[{"id":"a","title":"x","dueDate":null,"priority":"urgent","completed":false,"createdAt":1}]}',
    ],
    [
      'a task whose completed flag is a string',
      '{"schemaVersion":1,"tasks":[{"id":"a","title":"x","dueDate":null,"priority":null,"completed":"yes","createdAt":1}]}',
    ],
  ];

  for (const [name, raw] of payloads) {
    test(`${USABLE_EMPTY} given ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      await seedRaw(page, raw);

      await expect(page.locator(SELECTORS.emptyState)).toBeVisible();
      await expect(page.locator(SELECTORS.row)).toHaveCount(0);
      expect(errors, 'the app threw while loading corrupt data').toEqual([]);
    });

    test(`a task can be created straight away given ${name}`, async ({ page }) => {
      await seedRaw(page, raw);
      await createTask(page, { title: 'Starting over' });

      // AC-SUP.3: not left in a permanently broken state.
      expect(await titles(page)).toEqual(['Starting over']);
    });
  }
});

test.describe('the app stays fully functional after degrading', () => {
  test.beforeEach(async ({ page }) => {
    await seedRaw(page, '{{{ not json');
  });

  test('a full session works: create, toggle, filter, delete', async ({ page }) => {
    await createTask(page, { title: 'First' });
    await createTask(page, { title: 'Second' });

    await toggle(page, 'First');
    expect(await titles(page)).toEqual(['Second']);

    await page.click(SELECTORS.filterCompleted);
    expect(await titles(page)).toEqual(['First']);

    await page.click(SELECTORS.filterActive);
    await page.locator(SELECTORS.row).filter({ hasText: 'Second' }).locator('[data-action="delete"]').click();
    expect(await titles(page)).toEqual([]);
  });

  test('what it writes afterwards is readable on the next load', async ({ page }) => {
    await createTask(page, { title: 'Written after corruption' });
    await page.reload();

    expect(await titles(page)).toEqual(['Written after corruption']);
  });

  test('the corrupt payload is replaced, not quarantined (ADR-0006)', async ({ page }) => {
    // Alternative D — copying the bad payload to a backup key — was rejected
    // as unspecified behaviour no UI exposes.
    await createTask(page, { title: 'Buy milk' });

    const stored = await readStorage(page);
    expect(stored).not.toContain('not json');
    expect(stored).toContain('Buy milk');

    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys).toEqual([STORAGE_KEY]);
  });

  test('shows the ordinary empty state, with no error or warning (architecture §8.1)', async ({
    page,
  }) => {
    // §8.1 records "tell the user?" as OPEN and defaulted to silence. This
    // pins that default so a message can only appear by decision.
    const text = ((await page.textContent('#app')) ?? '').toLowerCase();

    for (const word of ['error', 'warning', 'corrupt', 'failed', 'could not', 'unable']) {
      expect(text, `the page says "${word}"`).not.toContain(word);
    }
  });
});

test.describe('all-or-nothing decoding (architecture §8)', () => {
  test('one invalid task discards the whole list, not just that task', async ({ page }) => {
    /*
     * Partial recovery would leave a quietly wrong list. A user who opens to
     * an empty list knows at once that something is wrong; one who opens to
     * seventeen of their twenty tasks may never notice the three that
     * vanished.
     */
    const payload = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      tasks: [
        makeTask({ id: 'good-1', title: 'Perfectly fine' }),
        { id: 'bad', title: '', dueDate: null, priority: null, completed: false, createdAt: 1 },
        makeTask({ id: 'good-2', title: 'Also fine' }),
      ],
    });

    await seedRaw(page, payload);

    expect(await titles(page)).toEqual([]);
    await expect(page.locator(SELECTORS.emptyState)).toBeVisible();
  });
});

test.describe('the positive control', () => {
  test('a well-formed payload loads, so the tests above mean something', async ({ page }) => {
    /*
     * Every assertion above is that the list came up EMPTY — which is also
     * what happens if the seeding silently failed and the app read nothing at
     * all. This proves the seeding path works, so an empty list is genuinely
     * the app degrading rather than the test misfiring.
     */
    await seedTasks(page, mixedList);

    expect(await titles(page)).toEqual(['Pay rent', 'Renew passport', 'Buy milk']);
  });

  test('the seeded payload is the one under the real key', async ({ page }) => {
    await seedTasks(page, [makeTask({ id: 'a', title: 'Seeded' })]);

    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys).toEqual([STORAGE_KEY]);
    expect(await readStorage(page)).toContain('Seeded');
  });
});
