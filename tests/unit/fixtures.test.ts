import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Task } from '../../src/core/types';
import {
  DATE_EARLY,
  DATE_LATE,
  DATE_MID,
  DATE_PAST,
  T0,
  awkwardTitles,
  emptyishTitles,
  everyPriority,
  makeManyTasks,
  makeTask,
  mixedList,
  mixedStatuses,
  orderingScenarios,
  resetTaskIdCounter,
} from '../support/fixtures';
import type { ComparatorKey } from '../support/fixtures';

/**
 * T-003 verification.
 *
 * Two things are under test here, and neither is application behavior — no
 * application code exists yet:
 *
 *   1. The builder behaves predictably (positive and negative cases).
 *   2. The fixture set genuinely covers every branch of the ADR-0007
 *      comparator, which is T-003's Definition of Done.
 */

// ──────────────────────────────── builder ─────────────────────────────────

describe('makeTask', () => {
  beforeEach(() => {
    resetTaskIdCounter();
  });

  it('produces a task with all six fields from architecture §2.1', () => {
    const task = makeTask();

    expect(Object.keys(task).sort()).toEqual(
      ['completed', 'createdAt', 'dueDate', 'id', 'priority', 'title'].sort(),
    );
  });

  it('defaults to an active, undated, unprioritised task', () => {
    const task = makeTask();

    expect(task.completed).toBe(false);
    expect(task.dueDate).toBeNull();
    expect(task.priority).toBeNull();
    expect(task.createdAt).toBe(T0);
    expect(task.title).toBeTruthy();
  });

  it('applies overrides', () => {
    const task = makeTask({
      id: 'custom',
      title: 'Buy milk',
      dueDate: DATE_MID,
      priority: 'high',
      completed: true,
      createdAt: T0 + 42,
    });

    expect(task).toEqual({
      id: 'custom',
      title: 'Buy milk',
      dueDate: DATE_MID,
      priority: 'high',
      completed: true,
      createdAt: T0 + 42,
    });
  });

  it('varies only the overridden field', () => {
    const task = makeTask({ dueDate: DATE_EARLY });
    const base = makeTask();

    expect(task.dueDate).toBe(DATE_EARLY);
    expect(task.title).toBe(base.title);
    expect(task.priority).toBe(base.priority);
    expect(task.completed).toBe(base.completed);
    expect(task.createdAt).toBe(base.createdAt);
  });

  it('honours a falsy override rather than falling back to the default', () => {
    // The trap this guards: `overrides.title || DEFAULT` would silently
    // replace an empty string, which would make the AC-009 rejection fixtures
    // untestable.
    expect(makeTask({ title: '' }).title).toBe('');
    expect(makeTask({ createdAt: 0 }).createdAt).toBe(0);
  });

  it('generates a distinct id on each call', () => {
    const ids = [makeTask().id, makeTask().id, makeTask().id];

    expect(new Set(ids).size).toBe(3);
  });

  it('restarts the id sequence after resetTaskIdCounter', () => {
    const first = makeTask().id;
    resetTaskIdCounter();

    expect(makeTask().id).toBe(first);
  });

  it('returns an independent object each call', () => {
    const a = makeTask();
    const b = makeTask();
    a.title = 'mutated';

    expect(b.title).not.toBe('mutated');
    expect(makeTask().title).not.toBe('mutated');
  });

  it('does not mutate the overrides object it is given', () => {
    const overrides: Partial<Task> = { title: 'Original' };
    const task = makeTask(overrides);
    task.title = 'Changed';

    expect(overrides.title).toBe('Original');
  });
});

describe('makeManyTasks', () => {
  beforeEach(() => {
    resetTaskIdCounter();
  });

  it('builds the requested count with unique ids', () => {
    const tasks = makeManyTasks(500);

    expect(tasks).toHaveLength(500);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(500);
  });

  it('staggers createdAt so ordering is deterministic', () => {
    const tasks = makeManyTasks(10);
    const timestamps = tasks.map((t) => t.createdAt);

    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(new Set(timestamps).size).toBe(10);
  });

  it('spans dated and undated tasks, every priority, and both statuses', () => {
    const tasks = makeManyTasks(20);

    expect(tasks.some((t) => t.dueDate === null)).toBe(true);
    expect(tasks.some((t) => t.dueDate !== null)).toBe(true);
    expect(new Set(tasks.map((t) => t.priority))).toEqual(
      new Set(['low', 'medium', 'high', null]),
    );
    expect(tasks.some((t) => t.completed)).toBe(true);
    expect(tasks.some((t) => !t.completed)).toBe(true);
  });

  it('returns an empty array for a count of zero', () => {
    expect(makeManyTasks(0)).toEqual([]);
  });
});

// ─────────────────────── ADR-0007 comparator coverage ─────────────────────

/**
 * Re-derives the ADR-0007 rule to determine which key first separates two
 * tasks. This duplicates the comparator's decision structure deliberately: at
 * T-003 the comparator does not exist, and the point is to prove the FIXTURE
 * DATA forces a decision on each key. T-103 tests the real implementation.
 *
 * Returns 0 when the two tasks are indistinguishable under all four keys.
 */
function firstDecidingKey(a: Task, b: Task): ComparatorKey | 0 {
  if ((a.dueDate !== null) !== (b.dueDate !== null)) return 1;
  if (a.dueDate !== b.dueDate) return 2;
  if (a.createdAt !== b.createdAt) return 3;
  if (a.id !== b.id) return 4;
  return 0;
}

/** The keys that adjacent pairs of a scenario's expected order decide on. */
function decidingKeysOf(scenario: (typeof orderingScenarios)[number]): Set<ComparatorKey | 0> {
  const byId = new Map(scenario.tasks.map((t) => [t.id, t]));
  const keys = new Set<ComparatorKey | 0>();

  for (let i = 0; i < scenario.expectedIdOrder.length - 1; i += 1) {
    const aId = scenario.expectedIdOrder[i];
    const bId = scenario.expectedIdOrder[i + 1];
    const a = aId === undefined ? undefined : byId.get(aId);
    const b = bId === undefined ? undefined : byId.get(bId);
    if (a && b) keys.add(firstDecidingKey(a, b));
  }

  return keys;
}

describe('ordering fixtures', () => {
  it.each(orderingScenarios.map((s) => [s.name, s] as const))(
    'scenario %s lists an expected order that is a permutation of its tasks',
    (_name, scenario) => {
      expect([...scenario.expectedIdOrder].sort()).toEqual(
        scenario.tasks.map((t) => t.id).sort(),
      );
    },
  );

  it.each(orderingScenarios.map((s) => [s.name, s] as const))(
    'scenario %s exercises the comparator key it declares',
    (_name, scenario) => {
      expect(decidingKeysOf(scenario)).toContain(scenario.key);
    },
  );

  it.each(orderingScenarios.map((s) => [s.name, s] as const))(
    'scenario %s has no pair that is indistinguishable under all four keys',
    (_name, scenario) => {
      // A deciding key of 0 would mean two fixtures are total duplicates, and
      // the expected order between them would be arbitrary — which is exactly
      // the non-determinism AC-010.7 forbids.
      expect(decidingKeysOf(scenario)).not.toContain(0);
    },
  );

  it('covers every branch of the ADR-0007 four-key comparator', () => {
    // This is T-003's Definition of Done.
    const covered = new Set<ComparatorKey | 0>();
    for (const scenario of orderingScenarios) {
      for (const key of decidingKeysOf(scenario)) covered.add(key);
    }

    expect(covered).toContain(1); // dated before undated       — AC-010.2
    expect(covered).toContain(2); // due date ascending         — AC-010.1
    expect(covered).toContain(3); // createdAt tie-break        — OQ-01/OQ-02
    expect(covered).toContain(4); // id determinism guard       — AC-010.7
  });

  it('covers the key-3 and key-4 tie-breaks for undated tasks too', () => {
    // OQ-02 concerns ordering *within* the undated group, which is a distinct
    // path from the dated tie-break even though it uses the same keys.
    const undatedOnly = orderingScenarios.filter((s) =>
      s.tasks.every((t) => t.dueDate === null),
    );
    const covered = new Set<ComparatorKey | 0>();
    for (const scenario of undatedOnly) {
      for (const key of decidingKeysOf(scenario)) covered.add(key);
    }

    expect(covered).toContain(3);
    expect(covered).toContain(4);
  });

  it('includes a past due date so AC-010.6 can be exercised', () => {
    const allDates = orderingScenarios.flatMap((s) => s.tasks.map((t) => t.dueDate));

    expect(allDates).toContain(DATE_PAST);
    expect(allDates).toContain(DATE_LATE);
  });

  it('includes a scenario where priority varies but must not affect order', () => {
    const scenario = orderingScenarios.find((s) =>
      new Set(s.tasks.map((t) => t.priority)).size > 1,
    );

    expect(scenario).toBeDefined();
    // Same due date throughout, so priority is the only other varying field
    // and the comparator must ignore it (AC-003.7).
    expect(new Set(scenario?.tasks.map((t) => t.dueDate)).size).toBe(1);
  });
});

// ───────────────────────── attribute-coverage fixtures ────────────────────

describe('attribute fixtures', () => {
  it('everyPriority covers all three levels plus the absent case', () => {
    expect(new Set(everyPriority.map((t) => t.priority))).toEqual(
      new Set(['low', 'medium', 'high', null]),
    );
  });

  it('mixedStatuses contains both active and completed tasks', () => {
    expect(mixedStatuses.filter((t) => !t.completed).length).toBeGreaterThan(0);
    expect(mixedStatuses.filter((t) => t.completed).length).toBeGreaterThan(0);
  });

  it('mixedList spans dated and undated, both statuses, and several priorities', () => {
    expect(mixedList.some((t) => t.dueDate === null)).toBe(true);
    expect(mixedList.some((t) => t.dueDate !== null)).toBe(true);
    expect(mixedList.some((t) => t.completed)).toBe(true);
    expect(mixedList.some((t) => !t.completed)).toBe(true);
    expect(new Set(mixedList.map((t) => t.priority)).size).toBeGreaterThan(1);
  });

  it('awkwardTitles includes interior spacing, unicode, and markup', () => {
    // AC-001.4: visible content must survive unaltered. Interior runs of
    // spaces are the case a naive trim/normalise would break.
    expect(awkwardTitles.some((t) => /\w {2,}\w/.test(t))).toBe(true);
    expect(awkwardTitles.some((t) => /[^ -]/.test(t))).toBe(true);
    expect(awkwardTitles.some((t) => t.includes('<script>'))).toBe(true);
  });

  it('emptyishTitles covers empty, spaces, tabs, and newlines', () => {
    // AC-009.4: whitespace-only is treated as empty.
    expect(emptyishTitles).toContain('');
    expect(emptyishTitles.some((t) => t.length > 0 && t.trim() === '')).toBe(true);
    expect(emptyishTitles.some((t) => t.includes('\t'))).toBe(true);
    expect(emptyishTitles.some((t) => t.includes('\n'))).toBe(true);
  });

  it('every fixture date is an ISO calendar date, never a Date object', () => {
    // ADR-0005: dueDate is `YYYY-MM-DD` or null. A Date here would reintroduce
    // exactly the timezone drift that ADR rules out.
    const dates = [DATE_PAST, DATE_EARLY, DATE_MID, DATE_LATE];
    for (const date of dates) {
      expect(typeof date).toBe('string');
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ─────────────────────────── fixture module hygiene ───────────────────────

describe('fixture module', () => {
  it('contains no assertions', () => {
    // Plan T-003: "Does not: contain assertions." A fixture module that
    // asserts is a test masquerading as data, and it would run in whichever
    // tier imported it.
    const source = readFileSync(
      fileURLToPath(new URL('../support/fixtures.ts', import.meta.url)),
      'utf8',
    );

    expect(source).not.toMatch(/from ['"]vitest['"]/);
    expect(source).not.toMatch(/\bexpect\s*\(/);
    expect(source).not.toMatch(/\b(describe|it|test)\s*\(/);
  });

  it('declares no local copy of the domain types', () => {
    // T-003 carried a provisional `Task`/`Priority` declaration because it
    // depended on T-101, which had not yet been written. T-101 removed it.
    // A second copy of the shape could drift from the canonical one, and the
    // fixtures would then be testing something the application is not.
    const source = readFileSync(
      fileURLToPath(new URL('../support/fixtures.ts', import.meta.url)),
      'utf8',
    );

    expect(source).toMatch(/from '\.\.\/\.\.\/src\/core\/types'/);
    expect(source).not.toMatch(/interface Task\b/);
    expect(source).not.toMatch(/type Priority\s*=/);
  });

  it('references no browser or storage API', () => {
    // Keeps the module importable from the node-environment unit tier.
    const source = readFileSync(
      fileURLToPath(new URL('../support/fixtures.ts', import.meta.url)),
      'utf8',
    );

    expect(source).not.toMatch(/\blocalStorage\b/);
    expect(source).not.toMatch(/\bdocument\./);
    expect(source).not.toMatch(/\bwindow\./);
  });
});
