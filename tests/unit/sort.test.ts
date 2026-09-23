import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compareTasks, sortTasks } from '../../src/core/sort';
import type { Task } from '../../src/core/types';
import {
  DATE_EARLY,
  DATE_LATE,
  DATE_MID,
  DATE_PAST,
  T0,
  makeTask,
  orderingScenarios,
} from '../support/fixtures';

/**
 * T-103 verification.
 *
 * Traceability: FR-010, ADR-0005, ADR-0007.
 * Acceptance criteria: AC-010.1, AC-010.2, AC-010.5, AC-010.6, AC-010.7,
 * AC-003.7. Also closes OQ-01 and OQ-02.
 */

const idsOf = (tasks: readonly Task[]): string[] => tasks.map((t) => t.id);

/**
 * Sign of a comparator result, normalised to -1 / 0 / 1.
 *
 * Deliberately not `Math.sign`, which returns -0 for a negated zero. Vitest's
 * `toBe` uses Object.is, under which -0 and 0 differ, so `Math.sign` would
 * make the antisymmetry check fail on every self-comparison.
 */
const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

/** Deterministic shuffle, so a failure reproduces exactly. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const j = state % (i + 1);
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

// ─────────────────────────── the declared scenarios ───────────────────────

describe('sortTasks — fixture scenarios', () => {
  it.each(orderingScenarios.map((s) => [s.name, s] as const))(
    'orders correctly: %s',
    (_name, scenario) => {
      expect(idsOf(sortTasks(scenario.tasks))).toEqual([...scenario.expectedIdOrder]);
    },
  );
});

// ──────────────────────────────── key 2 ───────────────────────────────────

describe('due date ascending (AC-010.1)', () => {
  it('places the soonest due date first', () => {
    const tasks = [
      makeTask({ id: 'late', dueDate: DATE_LATE }),
      makeTask({ id: 'early', dueDate: DATE_EARLY }),
      makeTask({ id: 'mid', dueDate: DATE_MID }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['early', 'mid', 'late']);
  });

  it('orders dates within the same month and year', () => {
    const tasks = [
      makeTask({ id: 'c', dueDate: '2026-06-30' }),
      makeTask({ id: 'a', dueDate: '2026-06-01' }),
      makeTask({ id: 'b', dueDate: '2026-06-15' }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['a', 'b', 'c']);
  });

  it('orders across year boundaries', () => {
    const tasks = [
      makeTask({ id: 'next-year', dueDate: '2027-01-01' }),
      makeTask({ id: 'this-year', dueDate: '2026-12-31' }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['this-year', 'next-year']);
  });

  it('sorts overdue tasks ahead of future ones with no special case (AC-010.6)', () => {
    const tasks = [
      makeTask({ id: 'future', dueDate: DATE_LATE }),
      makeTask({ id: 'overdue', dueDate: DATE_PAST }),
      makeTask({ id: 'soon', dueDate: DATE_EARLY }),
    ];

    // Overdue is not grouped, badged, or promoted — it is simply the earliest
    // date. The PRD defines no overdue behavior, and NG-06 rules out the
    // reminders that would motivate one.
    expect(idsOf(sortTasks(tasks))).toEqual(['overdue', 'soon', 'future']);
  });
});

// ──────────────────────────────── key 1 ───────────────────────────────────

describe('undated tasks sort last (AC-010.2)', () => {
  it('places every undated task after every dated one', () => {
    const tasks = [
      makeTask({ id: 'u1', dueDate: null, createdAt: T0 }),
      makeTask({ id: 'd-late', dueDate: DATE_LATE, createdAt: T0 + 1 }),
      makeTask({ id: 'u2', dueDate: null, createdAt: T0 + 2 }),
      makeTask({ id: 'd-early', dueDate: DATE_EARLY, createdAt: T0 + 3 }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['d-early', 'd-late', 'u1', 'u2']);
  });

  it('keeps an undated task last even when it was created first', () => {
    const tasks = [
      makeTask({ id: 'undated-oldest', dueDate: null, createdAt: T0 }),
      makeTask({ id: 'dated-newest', dueDate: DATE_LATE, createdAt: T0 + 9_999 }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['dated-newest', 'undated-oldest']);
  });

  it('handles a list where every task is undated', () => {
    const tasks = [
      makeTask({ id: 'b', dueDate: null, createdAt: T0 + 2 }),
      makeTask({ id: 'a', dueDate: null, createdAt: T0 + 1 }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['a', 'b']);
  });

  it('handles a list where every task is dated', () => {
    const tasks = [
      makeTask({ id: 'b', dueDate: DATE_MID }),
      makeTask({ id: 'a', dueDate: DATE_EARLY }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['a', 'b']);
  });
});

// ──────────────────────────── keys 3 and 4 ────────────────────────────────

describe('tie-breaks (OQ-01, OQ-02, AC-010.7)', () => {
  it('falls through to createdAt when due dates are equal (OQ-01)', () => {
    const tasks = [
      makeTask({ id: 'newer', dueDate: DATE_MID, createdAt: T0 + 200 }),
      makeTask({ id: 'older', dueDate: DATE_MID, createdAt: T0 + 100 }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['older', 'newer']);
  });

  it('orders undated tasks among themselves by createdAt (OQ-02)', () => {
    const tasks = [
      makeTask({ id: 'third', dueDate: null, createdAt: T0 + 3 }),
      makeTask({ id: 'first', dueDate: null, createdAt: T0 + 1 }),
      makeTask({ id: 'second', dueDate: null, createdAt: T0 + 2 }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['first', 'second', 'third']);
  });

  it('falls through to id when dueDate and createdAt are both equal', () => {
    // Two tasks created in the same millisecond. Without key 4 the comparator
    // would return 0 here and ordering would rest on engine behavior.
    const tasks = [
      makeTask({ id: 'zz', dueDate: DATE_MID, createdAt: T0 }),
      makeTask({ id: 'aa', dueDate: DATE_MID, createdAt: T0 }),
      makeTask({ id: 'mm', dueDate: DATE_MID, createdAt: T0 }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['aa', 'mm', 'zz']);
  });

  it('falls through to id for undated tasks created in the same millisecond', () => {
    const tasks = [
      makeTask({ id: 'u-z', dueDate: null, createdAt: T0 }),
      makeTask({ id: 'u-a', dueDate: null, createdAt: T0 }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['u-a', 'u-z']);
  });
});

// ─────────────────────────────── AC-003.7 ─────────────────────────────────

describe('priority does not affect order (AC-003.7)', () => {
  it('ignores priority entirely when dates and timestamps are equal', () => {
    const tasks = [
      makeTask({ id: 'low', dueDate: DATE_MID, priority: 'low', createdAt: T0 + 1 }),
      makeTask({ id: 'high', dueDate: DATE_MID, priority: 'high', createdAt: T0 + 2 }),
      makeTask({ id: 'none', dueDate: DATE_MID, priority: null, createdAt: T0 + 3 }),
    ];

    // Creation order decides, not priority. A "high" task created last stays
    // last — the approved decision "Default task list order" names due date
    // only (OQ-03).
    expect(idsOf(sortTasks(tasks))).toEqual(['low', 'high', 'none']);
  });

  it('produces identical order however priorities are permuted', () => {
    const base = [
      makeTask({ id: 'a', dueDate: DATE_EARLY, createdAt: T0 + 1 }),
      makeTask({ id: 'b', dueDate: DATE_MID, createdAt: T0 + 2 }),
      makeTask({ id: 'c', dueDate: null, createdAt: T0 + 3 }),
    ];
    const expected = idsOf(sortTasks(base));

    const permutations: (Task['priority'])[][] = [
      ['high', 'medium', 'low'],
      ['low', 'high', 'medium'],
      [null, null, 'high'],
      ['high', null, null],
    ];

    for (const priorities of permutations) {
      const varied = base.map((task, i) => ({ ...task, priority: priorities[i] ?? null }));
      expect(idsOf(sortTasks(varied))).toEqual(expected);
    }
  });

  it('does not let a high priority jump an earlier due date', () => {
    const tasks = [
      makeTask({ id: 'high-but-later', dueDate: DATE_LATE, priority: 'high' }),
      makeTask({ id: 'low-but-sooner', dueDate: DATE_EARLY, priority: 'low' }),
    ];

    expect(idsOf(sortTasks(tasks))).toEqual(['low-but-sooner', 'high-but-later']);
  });
});

// ─────────────────────────── determinism (AC-010.7) ───────────────────────

describe('determinism (AC-010.7)', () => {
  const tasks = [
    makeTask({ id: 'a', dueDate: DATE_EARLY, createdAt: T0 + 1 }),
    makeTask({ id: 'b', dueDate: DATE_MID, createdAt: T0 + 2 }),
    makeTask({ id: 'c', dueDate: DATE_MID, createdAt: T0 + 2 }),
    makeTask({ id: 'd', dueDate: null, createdAt: T0 + 3 }),
    makeTask({ id: 'e', dueDate: null, createdAt: T0 + 3 }),
    makeTask({ id: 'f', dueDate: DATE_LATE, createdAt: T0 + 4 }),
  ];

  it('produces the same order regardless of input order', () => {
    // This is the criterion that forces keys 3 and 4 to exist. A reload hands
    // the app whatever order the decoder produced; if that changed the result,
    // the list would visibly reshuffle for no reason the user can see.
    const expected = idsOf(sortTasks(tasks));

    for (let seed = 1; seed <= 25; seed += 1) {
      expect(idsOf(sortTasks(shuffle(tasks, seed)))).toEqual(expected);
    }
  });

  it('is idempotent — sorting an already-sorted list changes nothing', () => {
    const once = sortTasks(tasks);

    expect(idsOf(sortTasks(once))).toEqual(idsOf(once));
  });

  it('never returns 0 for two distinct tasks', () => {
    // A 0 would hand ordering to the engine's sort implementation.
    for (const a of tasks) {
      for (const b of tasks) {
        if (a.id !== b.id) expect(compareTasks(a, b)).not.toBe(0);
      }
    }
  });
});

// ───────────────────────── comparator is a total order ────────────────────

describe('compareTasks — ordering contract', () => {
  const sample = orderingScenarios.flatMap((s) => s.tasks);

  it('returns 0 when comparing a task with itself', () => {
    for (const task of sample) {
      expect(compareTasks(task, task)).toBe(0);
    }
  });

  it('is antisymmetric', () => {
    for (const a of sample) {
      for (const b of sample) {
        // Negate inside `sign`, not outside: `-sign(0)` would be -0 again.
        expect(sign(compareTasks(a, b))).toBe(sign(-compareTasks(b, a)));
      }
    }
  });

  it('is transitive', () => {
    for (const a of sample) {
      for (const b of sample) {
        for (const c of sample) {
          if (compareTasks(a, b) < 0 && compareTasks(b, c) < 0) {
            expect(compareTasks(a, c)).toBeLessThan(0);
          }
        }
      }
    }
  });
});

// ───────────────────────────── purity and edges ───────────────────────────

describe('sortTasks — purity and edge cases', () => {
  it('does not mutate its input', () => {
    const tasks = [
      makeTask({ id: 'z', dueDate: DATE_LATE }),
      makeTask({ id: 'a', dueDate: DATE_EARLY }),
    ];
    const before = structuredClone(tasks);

    sortTasks(tasks);

    expect(tasks).toEqual(before);
    expect(idsOf(tasks)).toEqual(['z', 'a']);
  });

  it('returns a new array, not the input', () => {
    const tasks = [makeTask({ id: 'only' })];

    expect(sortTasks(tasks)).not.toBe(tasks);
  });

  it('returns the same task objects by reference', () => {
    // Sorting reorders; it must not clone, or identity checks elsewhere break.
    const task = makeTask({ id: 'only' });

    expect(sortTasks([task])[0]).toBe(task);
  });

  it('handles an empty list', () => {
    expect(sortTasks([])).toEqual([]);
  });

  it('handles a single task', () => {
    const tasks = [makeTask({ id: 'only', dueDate: null })];

    expect(idsOf(sortTasks(tasks))).toEqual(['only']);
  });
});

// ──────────────────────────── ADR-0005 conformance ────────────────────────

describe('sort module — ADR-0005 conformance', () => {
  it('parses no dates', () => {
    // T-103 DoD: "no date parsing anywhere". ISO YYYY-MM-DD strings compare
    // lexicographically in chronological order, so any Date construction or
    // parsing here would be both unnecessary and a timezone hazard.
    const source = readFileSync(
      fileURLToPath(new URL('../../src/core/sort.ts', import.meta.url)),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/new Date/);
    expect(code).not.toMatch(/Date\.parse/);
    expect(code).not.toMatch(/getTime|getFullYear|toISOString/);
  });
});
