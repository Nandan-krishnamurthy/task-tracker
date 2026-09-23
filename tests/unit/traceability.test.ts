import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T-607 — the traceability audit, as an executable check.
 *
 * Traceability: the whole of `01-requirements.md` §4 and §5.
 *
 * The plan's Definition of Done is "every AC-* maps to a named passing test",
 * and it is explicit that a criterion without a test is a DEFECT rather than a
 * documentation gap. A hand-written table would record that fact on the day it
 * was written and then quietly rot, so the audit lives here instead: it reads
 * the requirements document and the test suite on every run and fails if they
 * have drifted apart.
 *
 * `docs/05-traceability.md` is the human-readable table this generates; the
 * test below keeps it honest too.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. It proves every criterion is claimed by a
 * named test, that the test exists, and that the suite it lives in passes. It
 * cannot prove a test actually verifies what it cites — no mechanical check
 * can. It removes the failure mode that is mechanical (a forgotten criterion)
 * and leaves the one that needs review (a weak test), which is where review
 * effort belongs.
 */

const ROOT = process.cwd();
const REQUIREMENTS = resolve(ROOT, 'docs/01-requirements.md');
const COVERAGE_DOC = resolve(ROOT, 'docs/05-traceability.md');
const TESTS_DIR = resolve(ROOT, 'tests');

/** Every acceptance criterion defined in the requirements document. */
function definedCriteria(): string[] {
  const text = readFileSync(REQUIREMENTS, 'utf8');
  const ids = new Set<string>();

  // Criteria are defined as the first cell of a table row: "| AC-001.1 | ..."
  for (const match of text.matchAll(/^\|\s*(AC-[A-Z0-9]+\.\d+)\s*\|/gm)) {
    if (match[1] !== undefined) ids.add(match[1]);
  }

  return [...ids].sort();
}

/**
 * Every real test file under tests/, as an absolute path.
 *
 * Support modules are excluded even though they mention criteria in their
 * comments: they verify nothing, so counting them would report coverage that
 * does not exist. This file is excluded for the same reason — it names
 * criteria in its tier checks below, and must not thereby appear to cover
 * them.
 */
function testFiles(dir = TESTS_DIR): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) found.push(...testFiles(full));
    else if (/\.(test|spec)\.ts$/.test(entry) && entry !== 'traceability.test.ts') {
      found.push(full);
    }
  }

  return found;
}

/** Which test files cite each criterion. */
function citations(): Map<string, string[]> {
  const byCriterion = new Map<string, string[]>();

  for (const file of testFiles()) {
    const relative = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    const source = readFileSync(file, 'utf8');

    for (const match of source.matchAll(/\bAC-[A-Z0-9]+\.\d+\b/g)) {
      const id = match[0];
      const existing = byCriterion.get(id) ?? [];
      if (!existing.includes(relative)) existing.push(relative);
      byCriterion.set(id, existing);
    }
  }

  return byCriterion;
}

const CRITERIA = definedCriteria();
const CITED = citations();

/** The tier a test file belongs to, from its directory. */
function tierOf(path: string): 'unit' | 'dom' | 'e2e' {
  if (path.includes('/unit/')) return 'unit';
  if (path.includes('/dom/')) return 'dom';
  return 'e2e';
}

describe('T-607 traceability audit', () => {
  it('finds the full set of acceptance criteria to audit', () => {
    // Guards against the whole audit passing vacuously because the parser
    // stopped matching and there was nothing left to check.
    expect(CRITERIA.length).toBeGreaterThanOrEqual(85);
    expect(CRITERIA).toContain('AC-001.1');
    expect(CRITERIA).toContain('AC-A11Y.5');
    expect(CRITERIA).toContain('AC-SUP.3');
  });

  it('finds test files to scan', () => {
    expect(testFiles().length).toBeGreaterThan(10);
  });

  it.each(CRITERIA)('%s is verified by at least one test', (criterion) => {
    const files = CITED.get(criterion) ?? [];

    expect(files, `${criterion} has no test — that is a defect, not a doc gap`).not.toEqual([]);
  });

  it('scans only real test files', () => {
    const scanned = testFiles().map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));

    expect(scanned.every((f) => /\.(test|spec)\.ts$/.test(f))).toBe(true);
    expect(scanned).not.toContain('tests/support/fixtures.ts');
    expect(scanned).not.toContain('tests/e2e/support.ts');
    expect(scanned.some((f) => f.includes('traceability'))).toBe(false);
  });

  it('cites no criterion that the requirements document does not define', () => {
    // Catches a typo in a test annotation, which would otherwise look like
    // coverage while pointing at nothing.
    const unknown = [...CITED.keys()].filter((id) => !CRITERIA.includes(id));

    expect(unknown, 'these ids are cited in tests but defined nowhere').toEqual([]);
  });

  it('covers the criteria ADR-0008 assigns to the E2E tier in the E2E tier', () => {
    /*
     * Architecture §10.3 reserves tier 3 for what jsdom cannot honestly
     * verify. These are the criteria it names: each must be covered by a real
     * browser, not only in jsdom. Coverage at a lower tier alone would be a
     * test that cannot actually decide the criterion.
     */
    const mustBeE2E = [
      'AC-001.3',
      'AC-004.2',
      'AC-006.1',
      'AC-006.2',
      'AC-006.3',
      'AC-008.1',
      'AC-008.2',
      'AC-008.3',
      'AC-008.6',
      'AC-010.7',
      'AC-A11Y.1',
      'AC-A11Y.4',
      'AC-PERF.2',
      'AC-SEC.1',
      'AC-SEC.2',
      'AC-SUP.1',
    ];

    for (const criterion of mustBeE2E) {
      const tiers = (CITED.get(criterion) ?? []).map(tierOf);
      expect(tiers, `${criterion} is not covered in the e2e tier`).toContain('e2e');
    }
  });

  it('validates the performance criteria at the size ADR-0008 fixes (AC-PERF.3)', () => {
    // AC-PERF.3 requires the list size to be STATED by the test.
    const perf = readFileSync(resolve(ROOT, 'tests/e2e/performance.spec.ts'), 'utf8');

    expect(perf).toMatch(/LIST_SIZE\s*=\s*500/);
    expect(perf).toContain('AC-PERF.3');
  });

  // ─────────────────── the published table stays in step ──────────────────

  describe('docs/05-traceability.md', () => {
    const doc = readFileSync(COVERAGE_DOC, 'utf8');

    it('lists every acceptance criterion', () => {
      for (const criterion of CRITERIA) {
        expect(doc, `${criterion} is missing from the coverage table`).toContain(criterion);
      }
    });

    it('names a test file for every criterion it lists', () => {
      const rows = [...doc.matchAll(/^\|\s*`(AC-[A-Z0-9]+\.\d+)`\s*\|([^|]*)\|([^|]*)\|/gm)];

      expect(rows.length).toBe(CRITERIA.length);

      for (const row of rows) {
        const id = row[1] ?? '';
        const files = row[3] ?? '';
        expect(files.trim().length, `${id} names no test file`).toBeGreaterThan(0);
      }
    });

    it('agrees with the suite about which files cover each criterion', () => {
      // The table is generated from the same scan this test performs, so a
      // divergence means the doc was hand-edited or is stale.
      const rows = [...doc.matchAll(/^\|\s*`(AC-[A-Z0-9]+\.\d+)`\s*\|([^|]*)\|([^|]*)\|/gm)];

      for (const row of rows) {
        const id = row[1] ?? '';
        const listed = (row[3] ?? '')
          .split(',')
          .map((f) => f.replace(/`/g, '').trim())
          .filter((f) => f !== '');

        expect([...listed].sort(), `${id} is stale in the coverage table`).toEqual(
          [...(CITED.get(id) ?? [])].sort(),
        );
      }
    });
  });
});
