import { defineConfig, devices } from '@playwright/test';

/**
 * Tier 3 of ADR-0008 — end-to-end, in a real browser.
 *
 * Deliberately small. This tier is reserved for the five scenarios that jsdom
 * cannot honestly verify (plan T-601 .. T-606):
 *
 *   - the journeys through a real event and render pipeline        (T-601)
 *   - J4: reload AND a genuine browser restart                     (T-602)
 *   - keyboard-only traversal with real focus order                (T-603)
 *   - corrupt data seeded into the genuine localStorage API        (T-604)
 *   - network silence, which needs real request interception       (T-605)
 *   - perceived latency at 500 tasks                               (T-606)
 *
 * Tests run against the production build via `vite preview`, so what is
 * verified is the artifact that ships (C-06), not a dev-server approximation.
 */
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Spread rather than `workers: undefined` — `exactOptionalPropertyTypes`
  // rejects an explicit undefined where the option means "use the default".
  ...(isCI ? { workers: 1 } : {}),
  reporter: isCI ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',

    /*
     * Pinned so runs are reproducible across machines. Neither affects the
     * application: dates are stored and compared as ISO `YYYY-MM-DD` strings
     * and never parsed into a `Date` (ADR-0005), so no locale or zone can
     * shift a due date.
     *
     * NOTE: this does NOT pin the segment order of `<input type="date">`.
     * Chromium takes that from its UI language, not from `navigator.language`,
     * so the same digits typed into the control mean 3 January on one machine
     * and 1 March on another. `tests/e2e/keyboard.spec.ts` therefore reads
     * back the ISO value the control produced rather than assuming a mapping.
     */
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  projects: [
    /*
     * The functional suites: T-601 .. T-605, T-607, T-608. Parallel, because
     * each owns its own browser context and none of them measures time.
     */
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /performance\.spec\.ts/,
    },

    /*
     * The benchmark (T-606), deliberately isolated.
     *
     * `dependencies` makes this project wait until every functional test has
     * finished, so it runs on a quiet machine with no other browser competing
     * for CPU. That is not a convenience: measured while four Chromium
     * instances were starting, the same operations reported roughly double
     * their isolated cost, which measures the runner rather than the
     * application. NFR-PERF-001 is a claim about what a user perceives, so the
     * measurement has to be taken under conditions a user would recognise.
     */
    {
      name: 'performance',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /performance\.spec\.ts/,
      dependencies: ['chromium'],
      fullyParallel: false,
    },
  ],

  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
