import { describe, expect, it } from 'vitest';

import { FILTERS, PRIORITIES } from '../../src/core/types';
import type { AppState, Filter, Priority, Task } from '../../src/core/types';

/**
 * T-101 verification.
 *
 * Traceability: C-03 (closed attribute list), C-04 (three priority levels),
 * AC-003.3, architecture §2.1 and §2.3.
 *
 * The `@ts-expect-error` cases below are COMPILE-TIME tests. `tsc` fails the
 * build if the line beneath a directive does NOT error, so each one asserts
 * that the type system really does reject what C-03 and C-04 forbid. They are
 * checked by `npm run typecheck`, not by the Vitest run.
 *
 * Note that each such value is then used in an assertion. That is deliberate:
 * an unused local would itself be an error under `noUnusedLocals`, which would
 * satisfy the directive for the wrong reason and make the test vacuous.
 */

describe('Priority', () => {
  it('has exactly the three approved levels', () => {
    // C-04 and PRD decision "Priority levels": Low / Medium / High.
    expect(PRIORITIES).toEqual(['low', 'medium', 'high']);
    expect(PRIORITIES).toHaveLength(3);
  });

  it('offers no fourth level (AC-003.3)', () => {
    expect(PRIORITIES).not.toContain('urgent');
    expect(PRIORITIES).not.toContain('none');
    expect(PRIORITIES).not.toContain('critical');
  });

  it('rejects a fourth level at compile time', () => {
    // @ts-expect-error 'urgent' is not a member of the closed Priority union (C-04).
    const invalid: Priority = 'urgent';
    expect(invalid).toBe('urgent');
  });

  it('rejects an arbitrary string at compile time', () => {
    // @ts-expect-error Priority is a closed union, not a string alias.
    const invalid: Priority = 'Low';
    expect(invalid).toBe('Low');
  });

  it('derives the type from the runtime tuple, so the two cannot drift', () => {
    // Every runtime member is assignable to the type. If PRIORITIES gained a
    // fourth entry, this would still compile — but the two @ts-expect-error
    // cases above would then stop erroring and fail the typecheck.
    const all: Priority[] = [...PRIORITIES];
    expect(all).toEqual(['low', 'medium', 'high']);
  });
});

describe('Filter', () => {
  it('has exactly the two views FR-007 names', () => {
    expect(FILTERS).toEqual(['active', 'completed']);
    expect(FILTERS).toHaveLength(2);
  });

  it('offers no combined "all" view (OQ-05)', () => {
    expect(FILTERS).not.toContain('all');
  });

  it('rejects an "all" filter at compile time', () => {
    // @ts-expect-error OQ-05 was resolved against a combined view.
    const invalid: Filter = 'all';
    expect(invalid).toBe('all');
  });
});

describe('Task', () => {
  const valid: Task = {
    id: 'task-1',
    title: 'Buy milk',
    dueDate: '2026-06-15',
    priority: 'high',
    completed: false,
    createdAt: 1_700_000_000_000,
  };

  it('has exactly the six fields of architecture §2.1', () => {
    expect(Object.keys(valid).sort()).toEqual(
      ['completed', 'createdAt', 'dueDate', 'id', 'priority', 'title'].sort(),
    );
  });

  it('accepts null for both optional attributes', () => {
    const minimal: Task = {
      id: 'task-2',
      title: 'Title only',
      dueDate: null,
      priority: null,
      completed: false,
      createdAt: 0,
    };

    expect(minimal.dueDate).toBeNull();
    expect(minimal.priority).toBeNull();
  });

  it('rejects an out-of-scope attribute at compile time (C-03, NG-05)', () => {
    const withNotes: Task = {
      id: 'task-3',
      title: 'Has notes',
      dueDate: null,
      priority: null,
      completed: false,
      createdAt: 0,
      // @ts-expect-error Notes are explicitly excluded by C-03 and NG-05.
      notes: 'Some free text',
    };

    expect(withNotes.title).toBe('Has notes');
  });

  it('rejects a grouping attribute at compile time (NG-04)', () => {
    const withTags: Task = {
      id: 'task-4',
      title: 'Has tags',
      dueDate: null,
      priority: null,
      completed: false,
      createdAt: 0,
      // @ts-expect-error Tags and other groupings are forbidden by NG-04.
      tags: ['home'],
    };

    expect(withTags.title).toBe('Has tags');
  });

  it('rejects a Date for dueDate at compile time (ADR-0005)', () => {
    const withDateObject: Task = {
      id: 'task-5',
      title: 'Wrong date type',
      // @ts-expect-error dueDate is an ISO YYYY-MM-DD string, never a Date.
      dueDate: new Date('2026-06-15'),
      priority: null,
      completed: false,
      createdAt: 0,
    };

    expect(withDateObject.title).toBe('Wrong date type');
  });

  it('requires a title at compile time (FR-001)', () => {
    // @ts-expect-error title is required; a task without one cannot exist.
    const noTitle: Task = {
      id: 'task-6',
      dueDate: null,
      priority: null,
      completed: false,
      createdAt: 0,
    };

    expect(noTitle.id).toBe('task-6');
  });
});

describe('AppState', () => {
  const state: AppState = {
    tasks: [],
    filter: 'active',
    editingId: null,
    formError: null,
    editError: null,
    storageOk: true,
  };

  it('has the six fields of architecture §2.3', () => {
    expect(Object.keys(state).sort()).toEqual(
      ['editError', 'editingId', 'filter', 'formError', 'storageOk', 'tasks'].sort(),
    );
  });

  it('keeps formError and editError as separate fields', () => {
    // T-101 DoD. The two forms can be wrong at the same time and about
    // different things: a rejected create (AC-009.2) must not blank a
    // rejected edit's message (AC-005.6), or the reverse.
    const both: AppState = {
      ...state,
      formError: 'Enter a title for the task.',
      editError: 'Enter a title for the task.',
    };

    expect(both.formError).not.toBeUndefined();
    expect(both.editError).not.toBeUndefined();

    const onlyForm: AppState = { ...state, formError: 'create failed' };
    expect(onlyForm.formError).toBe('create failed');
    expect(onlyForm.editError).toBeNull();
  });

  it('defaults are expressible: empty list, active view, nothing in error', () => {
    expect(state.tasks).toEqual([]);
    expect(state.filter).toBe('active');
    expect(state.editingId).toBeNull();
    expect(state.storageOk).toBe(true);
  });
});
