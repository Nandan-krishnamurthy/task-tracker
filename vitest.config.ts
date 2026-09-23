import { defineConfig } from 'vitest/config';

/**
 * Two of the three test tiers from ADR-0008 live here. The third (E2E,
 * Playwright) is configured separately in playwright.config.ts.
 *
 *   Tier 1 "unit" — node environment, no DOM.
 *       Covers src/core/ and the pure decoder in src/persistence/.
 *       Fast, exhaustive, the bulk of the suite. A test that needs a DOM does
 *       not belong here; that is the signal it belongs in tier 2.
 *
 *   Tier 2 "dom" — jsdom environment, storage faked.
 *       Covers store + render + event wiring together, focus management, and
 *       injected storage failure modes.
 *
 * Deliberately absent: visual regression tooling. ADR-0008 alternative D was
 * rejected — no acceptance criterion concerns pixels.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/dom/**/*.test.ts'],
        },
      },
    ],
  },
});
