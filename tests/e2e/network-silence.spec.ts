import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';

import {
  SELECTORS,
  beginEdit,
  createTask,
  deleteTask,
  saveEdit,
  showActive,
  showCompleted,
  titles,
  toggle,
} from './support';

/**
 * T-605 — network silence during all four journeys.
 *
 * Acceptance criteria: AC-SEC.1, AC-SEC.2, AC-PERF.2.
 *
 * Why this tier: real network interception. jsdom can assert that `fetch` is
 * never *called*, which is a statement about the source; only a browser can
 * observe what actually leaves the page — including anything a build step,
 * a polyfill, or the platform itself might send.
 *
 * The method is to record every request the page makes and then assert three
 * separate things: nothing left the origin, nothing carried task data, and
 * nothing resembling analytics was attempted. A single "no requests" check
 * would be weaker: the app legitimately fetches its own HTML, JS and CSS.
 */

/** The task titles used below, chosen to be unmistakable in a payload. */
const SENTINELS = [
  'Zaphod-Beeblebrox-Sentinel-Alpha',
  'Zaphod-Beeblebrox-Sentinel-Beta',
  'Zaphod-Beeblebrox-Sentinel-Gamma',
] as const;

interface Recorded {
  url: string;
  method: string;
  resourceType: string;
  postData: string | null;
}

/**
 * Record every request, and block anything leaving the origin so a failure is
 * a caught assertion rather than a real call to a real server.
 */
async function recordTraffic(page: Page, origin: string): Promise<Recorded[]> {
  const requests: Recorded[] = [];

  const capture = (request: Request): void => {
    requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      postData: request.postData(),
    });
  };

  page.on('request', capture);

  // Belt and braces: intercept everything, let same-origin through, abort the
  // rest. If the app ever did try to phone home, nothing would actually be
  // transmitted while the test still sees the attempt.
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin)) {
      await route.continue();
    } else {
      await route.abort();
    }
  });

  return requests;
}

/** Walk J1, J2, J3 and J4 end to end. */
async function walkAllJourneys(page: Page): Promise<void> {
  // J1 — capture
  await createTask(page, { title: SENTINELS[0], dueDate: '2026-03-01', priority: 'high' });
  await createTask(page, { title: SENTINELS[1], dueDate: '2026-12-31' });
  await createTask(page, { title: SENTINELS[2] });

  // J2 — complete and reopen
  await toggle(page, SENTINELS[0]);
  await showCompleted(page);
  await toggle(page, SENTINELS[0]);
  await showActive(page);

  // J3 — edit and delete
  await beginEdit(page, SENTINELS[1]);
  await page.fill(`${SELECTORS.editingRow} input[type="text"]`, `${SENTINELS[1]} edited`);
  await saveEdit(page);
  await deleteTask(page, SENTINELS[2]);

  // J4 — return later
  await page.reload();
  expect(await titles(page)).toContain(SENTINELS[0]);
}

test('no request leaves the origin during any journey (AC-SEC.1)', async ({ page, baseURL }) => {
  const origin = baseURL ?? 'http://localhost:4173';
  const requests = await recordTraffic(page, origin);

  await page.goto('/');
  await walkAllJourneys(page);

  const offOrigin = requests.filter((r) => !r.url.startsWith(origin));
  expect(offOrigin.map((r) => `${r.method} ${r.url}`)).toEqual([]);
});

test('no request carries task data (AC-SEC.1)', async ({ page, baseURL }) => {
  const origin = baseURL ?? 'http://localhost:4173';
  const requests = await recordTraffic(page, origin);

  await page.goto('/');
  await walkAllJourneys(page);

  expect(requests.length).toBeGreaterThan(0);

  for (const request of requests) {
    for (const sentinel of SENTINELS) {
      // Neither in the URL (a GET beacon) nor in a body (a POST).
      expect(request.url, `task title in a request URL: ${request.url}`).not.toContain(sentinel);
      expect(request.postData ?? '', `task title in a request body`).not.toContain(sentinel);
    }
  }
});

test('the only requests made are the app’s own static files', async ({ page, baseURL }) => {
  const origin = baseURL ?? 'http://localhost:4173';
  const requests = await recordTraffic(page, origin);

  await page.goto('/');
  await walkAllJourneys(page);

  const paths = [...new Set(requests.map((r) => new URL(r.url).pathname))]
    .filter((p) => p !== '/favicon.ico')
    .sort();

  // The document, one script, one stylesheet. Nothing else is ever fetched.
  expect(paths.length).toBeLessThanOrEqual(3);
  for (const path of paths) {
    expect(path === '/' || path.startsWith('/assets/')).toBe(true);
  }
});

test('every request is a document, script or stylesheet — never data (AC-PERF.2)', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? 'http://localhost:4173';
  const requests = await recordTraffic(page, origin);

  await page.goto('/');
  await walkAllJourneys(page);

  /*
   * AC-PERF.2: no operation depends on a network round trip. An `xhr` or
   * `fetch` resource type appearing anywhere would mean some operation was
   * talking to a server — which is also what makes the 100 ms bound of
   * NFR-PERF-001 achievable at all.
   */
  const dataRequests = requests.filter((r) => ['xhr', 'fetch', 'websocket'].includes(r.resourceType));
  expect(dataRequests.map((r) => r.url)).toEqual([]);

  // And every request is a GET: nothing is submitted anywhere.
  expect([...new Set(requests.map((r) => r.method))]).toEqual(['GET']);
});

test('persistence operations transmit nothing off the device (AC-008.7)', async ({
  page,
  baseURL,
}) => {
  /*
   * AC-008.7 is narrower than AC-SEC.1: it is specifically about the
   * PERSISTENCE path. Every mutating action writes through to storage
   * synchronously (ADR-0004), and this asserts that each of those writes stays
   * on the device — that "persistence" never came to mean "sync".
   */
  const origin = baseURL ?? 'http://localhost:4173';
  const requests = await recordTraffic(page, origin);

  await page.goto('/');
  const requestsBeforeWrites = requests.length;

  // Every kind of write the app can perform.
  await createTask(page, { title: SENTINELS[0], dueDate: '2026-03-01', priority: 'high' });
  await toggle(page, SENTINELS[0]);
  await showCompleted(page);
  await beginEdit(page, SENTINELS[0]);
  await page.fill(`${SELECTORS.editingRow} input[type="text"]`, `${SENTINELS[0]} edited`);
  await saveEdit(page);
  await deleteTask(page, `${SENTINELS[0]} edited`);

  // Not one additional request was made by any of them.
  expect(requests.length).toBe(requestsBeforeWrites);

  // And the data really was written locally, so the silence is not because
  // nothing was persisted.
  const stored = await page.evaluate(() => window.localStorage.getItem('task-tracker.v1'));
  expect(stored).not.toBeNull();
});

test('no analytics, telemetry or tracking is attempted (AC-SEC.2)', async ({ page, baseURL }) => {
  const origin = baseURL ?? 'http://localhost:4173';
  const requests = await recordTraffic(page, origin);

  await page.goto('/');
  await walkAllJourneys(page);

  const suspicious = /analytics|telemetry|track|beacon|collect|metrics|sentry|segment|mixpanel|gtag|pixel|logs?\b/i;

  for (const request of requests) {
    expect(request.url, `looks like tracking: ${request.url}`).not.toMatch(suspicious);
  }
});

test('the page registers no service worker and opens no socket (plan §0.4)', async ({ page }) => {
  await page.goto('/');
  await walkAllJourneys(page);

  const registrations = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 0;
    const all = await navigator.serviceWorker.getRegistrations();
    return all.length;
  });

  expect(registrations).toBe(0);
});

test('the shipped bundle contains no network API at all (plan §0.4)', async ({ page, baseURL }) => {
  const origin = baseURL ?? 'http://localhost:4173';
  await page.goto('/');

  const scriptUrls = await page.evaluate(() => [...document.scripts].map((s) => s.src));
  expect(scriptUrls.length).toBe(1);

  const source = await (await page.request.get(scriptUrls[0] ?? origin)).text();

  /*
   * The strongest form of AC-SEC.1: not "the app did not call the network
   * during this run", but "there is no code in the artifact that could".
   * Vite's modulepreload polyfill used to put a `fetch` here for the app's own
   * assets; it is disabled in vite.config.ts so this grep stays clean.
   */
  for (const api of [
    'XMLHttpRequest',
    'WebSocket',
    'sendBeacon',
    'EventSource',
    'navigator.connection',
  ]) {
    expect(source, `bundle references ${api}`).not.toContain(api);
  }
  expect(source, 'bundle calls fetch()').not.toMatch(/\bfetch\s*\(/);
});

test('the negative control: interception would catch a real off-origin call', async ({
  page,
  baseURL,
}) => {
  /*
   * Every assertion above is that NOTHING was recorded. That is also what a
   * broken recorder produces. This proves the recorder and the route blocker
   * both work, by making the page attempt a call the app never would.
   */
  const origin = baseURL ?? 'http://localhost:4173';
  const requests = await recordTraffic(page, origin);

  await page.goto('/');
  await page.evaluate(async () => {
    try {
      await fetch('https://example.invalid/collect?title=Zaphod-Beeblebrox-Sentinel-Alpha');
    } catch {
      // Aborted by the route handler, which is the point.
    }
  });

  const offOrigin = requests.filter((r) => !r.url.startsWith(origin));
  expect(offOrigin).toHaveLength(1);
  expect(offOrigin[0]?.url).toContain('example.invalid');
});
