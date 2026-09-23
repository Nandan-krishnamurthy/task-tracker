import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ACTION_TYPES } from '../../src/store/actions';
import { FILTERS, PRIORITIES } from '../../src/core/types';

/**
 * T-608 — the scope-guard review, as an executable check.
 *
 * Traceability: plan §0.4 (the forbidden table), NG-01 – NG-07.
 *
 * The plan's Definition of Done is "every row confirmed absent; `package.json`
 * dependencies is empty". A review done once by eye confirms that for one
 * afternoon; this confirms it on every run.
 *
 * Scope creep is the failure this project is most exposed to — every forbidden
 * row is a thing a reasonable engineer might add believing it an improvement.
 * Each is out of scope because the PRD says so, not because it would be bad
 * software, which is exactly why the guard needs to be mechanical rather than
 * a matter of remembering.
 *
 * Comments are stripped before scanning: several modules legitimately DISCUSS
 * what they must not do, and scanning raw text would flag the files that are
 * documenting their own compliance. Same approach as T-203.
 */

const ROOT = process.cwd();
const SRC = resolve(ROOT, 'src');

/** Every .ts file under src/, relative to src/. */
function sourceFiles(dir = SRC, prefix = ''): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    const relative = prefix === '' ? entry : `${prefix}/${entry}`;

    if (statSync(full).isDirectory()) found.push(...sourceFiles(full, relative));
    else if (entry.endsWith('.ts')) found.push(relative);
  }

  return found;
}

/** Source with comments removed. */
function codeOf(relativePath: string): string {
  return readFileSync(`${SRC}/${relativePath}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const FILES = sourceFiles();

/** Everything shipped: application source, the page, and the stylesheet. */
const SHIPPED = [
  ...FILES.map((f) => ({ name: `src/${f}`, code: codeOf(f) })),
  {
    name: 'index.html',
    code: readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, ''),
  },
  {
    name: 'src/styles.css',
    code: readFileSync(resolve(ROOT, 'src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
  },
];

describe('T-608 scope guard', () => {
  it('finds the source files to scan', () => {
    // Without this the whole suite could pass by scanning nothing.
    expect(FILES.length).toBeGreaterThanOrEqual(10);
    expect(FILES).toContain('main.ts');
    expect(FILES).toContain('ui/app.ts');
    expect(FILES).toContain('persistence/storage.ts');
  });

  // ─────────── plan §0.4 row 1 — no network of any kind ───────────────────

  describe('no network call (C-01, NFR-SEC-001, AC-SEC.1)', () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bEventSource\b/,
      /\bsendBeacon\b/,
      /\bserviceWorker\b/,
      /navigator\s*\.\s*sendBeacon/,
      /\bimportScripts\b/,
    ];

    it.each(SHIPPED)('$name issues no network call', ({ code }) => {
      for (const pattern of forbidden) {
        expect(code, `matched ${String(pattern)}`).not.toMatch(pattern);
      }
    });

    it('the built bundle is free of them too', () => {
      /*
       * The source can be clean while a BUILD STEP injects something — Vite's
       * modulepreload polyfill used to add a `fetch` for the app's own assets,
       * which is why it is disabled in vite.config.ts.
       *
       * Skipped when `dist/` has not been built, so `npx vitest run` works on
       * a fresh clone. Nothing is lost by that: the e2e suite makes the same
       * assertion against a freshly built artifact every time it runs, and
       * Playwright always builds first.
       */
      const assets = resolve(ROOT, 'dist/assets');
      if (!existsSync(assets)) {
        expect(existsSync(resolve(ROOT, 'dist'))).toBe(false);
        return;
      }

      const bundles = readdirSync(assets).filter((f) => f.endsWith('.js'));

      expect(bundles.length).toBeGreaterThan(0);

      for (const file of bundles) {
        const code = readFileSync(`${assets}/${file}`, 'utf8');
        for (const pattern of forbidden) {
          expect(code, `${file} matched ${String(pattern)}`).not.toMatch(pattern);
        }
      }
    });
  });

  // ─────────── plan §0.4 row 2 — no auth surface (NG-01) ──────────────────

  it.each(SHIPPED)('$name has no auth, login, account or profile surface (NG-01, AC-SEC.3)', ({
    code,
  }) => {
    for (const pattern of [
      /\bsign[\s-]?in\b/i,
      /\bsign[\s-]?up\b/i,
      /\blog[\s-]?in\b/i,
      /\blogout\b/i,
      /type=['"]password['"]/i,
      /\bpassword\b/i,
      /\bauthToken\b/i,
      /\bcredential/i,
      /\bemail\b/i,
    ]) {
      expect(code, `matched ${String(pattern)}`).not.toMatch(pattern);
    }
  });

  // ────── plan §0.4 row 3 — no cross-tab machinery (NG-07) ────────────────

  it.each(SHIPPED)('$name registers no cross-tab or unload listener (NG-07, AC-REL.3)', ({
    code,
  }) => {
    expect(code).not.toMatch(/addEventListener\s*\(\s*['"]storage['"]/);
    expect(code).not.toMatch(/\bBroadcastChannel\b/);
    expect(code).not.toMatch(/\bSharedWorker\b/);
    expect(code).not.toMatch(/['"]beforeunload['"]/);
    expect(code).not.toMatch(/['"]pagehide['"]/);
    expect(code).not.toMatch(/['"]visibilitychange['"]/);
  });

  // ────── plan §0.4 row 4 — the task shape is closed (C-03, NG-04, NG-05) ─

  describe('the task attribute list is closed (C-03)', () => {
    it('declares exactly the six fields of architecture §2.1', () => {
      const types = readFileSync(`${SRC}/core/types.ts`, 'utf8');
      const body = /export interface Task \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? '';
      const fields = [...body.matchAll(/^\s{2}(\w+)[?]?:/gm)].map((m) => m[1]);

      expect(fields.sort()).toEqual([
        'completed',
        'createdAt',
        'dueDate',
        'id',
        'priority',
        'title',
      ]);
    });

    it.each(SHIPPED)('$name introduces no forbidden task field (NG-04, NG-05)', ({ code }) => {
      // The two most tempting additions, plus grouping concepts.
      for (const pattern of [
        /\bnotes\b/i,
        /\bdescription\b/i,
        /\btags?\b/i,
        /\bproject\b/i,
        /\bboard\b/i,
        /\bworkspace\b/i,
        /\bassignee\b/i,
        /\bcompletedAt\b/,
        /\bsubtask/i,
      ]) {
        expect(code, `matched ${String(pattern)}`).not.toMatch(pattern);
      }
    });

    it('offers exactly three priority levels (C-04, AC-003.3)', () => {
      expect([...PRIORITIES]).toEqual(['low', 'medium', 'high']);
    });
  });

  // ────── plan §0.4 row 5 — no reminders or overdue treatment (NG-06) ─────

  it.each(SHIPPED)('$name has no reminder, notification or overdue concept (NG-06)', ({ code }) => {
    for (const pattern of [
      /\bNotification\b/,
      /\bremind/i,
      /\balarm\b/i,
      /\boverdue\b/i,
      /\bsetTimeout\b/,
      /\bsetInterval\b/,
      /requestPermission/,
    ]) {
      expect(code, `matched ${String(pattern)}`).not.toMatch(pattern);
    }
  });

  // ────── plan §0.4 row 6 — one sort order, priority excluded ─────────────

  describe('ordering is fixed and priority-free (ADR-0007, AC-003.7)', () => {
    it('exposes no action that changes the sort order', () => {
      expect([...ACTION_TYPES]).toEqual([
        'LOAD',
        'CREATE_TASK',
        'TOGGLE_COMPLETE',
        'UPDATE_TASK',
        'DELETE_TASK',
        'SET_FILTER',
        'BEGIN_EDIT',
        'CANCEL_EDIT',
      ]);
      expect(ACTION_TYPES).not.toContain('SET_SORT');
    });

    it.each(SHIPPED)('$name offers no user-selectable sort', ({ code }) => {
      expect(code).not.toMatch(/\bSET_SORT\b/);
      expect(code).not.toMatch(/\bsortBy\b/);
      expect(code).not.toMatch(/\bsortOrder\b/);
      expect(code).not.toMatch(/\bdescending\b/i);
    });

    it('never reads priority in the comparator', () => {
      const sort = codeOf('core/sort.ts');

      expect(sort).not.toMatch(/\bpriority\b/);
    });
  });

  // ────── plan §0.4 row 7 — no delete confirmation (OQ-04) ────────────────

  it.each(SHIPPED)('$name shows no delete confirmation (OQ-04)', ({ code }) => {
    expect(code).not.toMatch(/\bconfirm\s*\(/);
    expect(code).not.toMatch(/window\s*\.\s*confirm/);
    expect(code).not.toMatch(/\balert\s*\(/);
    expect(code).not.toMatch(/\bprompt\s*\(/);
    expect(code).not.toMatch(/<dialog/i);
    expect(code).not.toMatch(/are you sure/i);
    expect(code).not.toMatch(/\bundo\b/i);
  });

  // ────── plan §0.4 row 8 — exactly two views, no "all" (OQ-05) ───────────

  describe('there are exactly two views (OQ-05, FR-007)', () => {
    it('declares only active and completed', () => {
      expect([...FILTERS]).toEqual(['active', 'completed']);
    });

    it('offers no combined "all" filter anywhere', () => {
      const filterBar = codeOf('ui/filterBar.ts');

      expect(filterBar).not.toMatch(/['"]all['"]/i);
      expect(codeOf('core/filter.ts')).not.toMatch(/['"]all['"]/i);
    });
  });

  // ────── plan §0.4 row 9 — zero runtime dependencies (ADR-0002) ──────────

  describe('zero runtime dependencies (ADR-0002)', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    it('declares an empty dependencies object', () => {
      expect(pkg.dependencies ?? {}).toEqual({});
    });

    it('declares no peer or optional dependencies either', () => {
      expect(pkg.peerDependencies ?? {}).toEqual({});
      expect(pkg.optionalDependencies ?? {}).toEqual({});
    });

    it('keeps the dev dependencies to the toolchain ADR-0008 names', () => {
      // Not a scope-guard row, but the same discipline: a runtime library
      // added here would eventually find its way into src/.
      expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
        '@playwright/test',
        '@types/node',
        'jsdom',
        'typescript',
        'vite',
        'vitest',
      ]);
    });

    it.each(FILES)('src/%s imports nothing from node_modules', (file) => {
      const specifiers = [...codeOf(file).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');

      for (const specifier of specifiers) {
        expect(specifier.startsWith('.'), `src/${file} imports "${specifier}"`).toBe(true);
      }
    });

    it('imports no node built-in into the browser bundle (C-01)', () => {
      for (const file of FILES) {
        expect(codeOf(file)).not.toMatch(/from\s+['"]node:/);
        expect(codeOf(file)).not.toMatch(/\bprocess\s*\.\s*env\b/);
      }
    });
  });

  // ────────────────── the negative control for this suite ─────────────────

  it('would actually catch a violation', () => {
    /*
     * Every assertion above is that something is ABSENT, which is also what a
     * broken scan reports. This feeds the same patterns a string that violates
     * them, so a scan that had stopped matching would be caught here.
     */
    const violating = `
      const x = fetch('/api/tasks');
      window.confirm('Are you sure?');
      const notes = task.notes;
      addEventListener('storage', () => {});
      const sortBy = 'priority';
    `;

    expect(violating).toMatch(/\bfetch\s*\(/);
    expect(violating).toMatch(/\bconfirm\s*\(/);
    expect(violating).toMatch(/\bnotes\b/i);
    expect(violating).toMatch(/addEventListener\s*\(\s*['"]storage['"]/);
    expect(violating).toMatch(/\bsortBy\b/);
  });
});
