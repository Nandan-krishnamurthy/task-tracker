import { describe, expect, it } from 'vitest';

import type { Task } from '../../src/core/types';
import { SCHEMA_VERSION, decode, encode } from '../../src/persistence/schema';
import { DATE_EARLY, DATE_MID, T0, makeTask, mixedList } from '../support/fixtures';

/**
 * T-201 verification.
 *
 * Traceability: FR-008, NFR-SUP-001, ADR-0003, ADR-0005, ADR-0006.
 * Acceptance criteria: AC-008.5, AC-008.6, AC-SUP.1. Round-trip fidelity also
 * underwrites AC-008.1.
 */

/** A stored payload string with the given tasks and schema version. */
const payload = (tasks: unknown, schemaVersion: unknown = SCHEMA_VERSION): string =>
  JSON.stringify({ schemaVersion, tasks });

// ──────────────────────────────── encode ──────────────────────────────────

describe('encode', () => {
  it('produces an envelope carrying the schema version and the tasks', () => {
    const tasks = [makeTask({ id: 'a', title: 'Buy milk' })];

    expect(JSON.parse(encode(tasks))).toEqual({ schemaVersion: 1, tasks });
  });

  it('writes the whole array, preserving insertion order', () => {
    // ADR-0003: whole-array rewrite, atomic from any reader's perspective.
    // ADR-0007: storage carries insertion order and no sort meaning, because
    // display order is derived at render.
    const tasks = [
      makeTask({ id: 'third', dueDate: DATE_EARLY, createdAt: T0 + 3 }),
      makeTask({ id: 'first', dueDate: null, createdAt: T0 + 1 }),
    ];

    const envelope = JSON.parse(encode(tasks)) as { tasks: Task[] };

    expect(envelope.tasks.map((t) => t.id)).toEqual(['third', 'first']);
  });

  it('encodes an empty list', () => {
    expect(JSON.parse(encode([]))).toEqual({ schemaVersion: 1, tasks: [] });
  });

  it('does not mutate its input', () => {
    const tasks = [makeTask({ id: 'a' })];
    const before = structuredClone(tasks);

    encode(tasks);

    expect(tasks).toEqual(before);
  });

  it('emits dueDate as a plain calendar string, never a Date (ADR-0005)', () => {
    const encoded = encode([makeTask({ id: 'a', dueDate: DATE_MID })]);

    expect(encoded).toContain('"dueDate":"' + DATE_MID + '"');
    expect(encoded).not.toContain('T00:00:00');
  });
});

// ───────────────────────── round trip (AC-008.1) ──────────────────────────

describe('round trip', () => {
  it('returns tasks identical to those encoded', () => {
    expect(decode(encode(mixedList))).toEqual([...mixedList]);
  });

  it('preserves every field exactly, including the internal ones', () => {
    const task = makeTask({
      id: 'round-trip',
      title: 'Café — naïve façade 📌',
      dueDate: DATE_MID,
      priority: 'high',
      completed: true,
      createdAt: T0 + 12_345,
    });

    expect(decode(encode([task]))[0]).toEqual(task);
  });

  it('preserves interior spacing in titles (AC-001.4)', () => {
    const task = makeTask({ id: 'a', title: 'Call  the   dentist' });

    expect(decode(encode([task]))[0]?.title).toBe('Call  the   dentist');
  });

  it('preserves null due dates and null priorities', () => {
    const task = makeTask({ id: 'a', dueDate: null, priority: null });
    const result = decode(encode([task]))[0];

    expect(result?.dueDate).toBeNull();
    expect(result?.priority).toBeNull();
  });

  it('preserves both statuses', () => {
    const tasks = [
      makeTask({ id: 'active', completed: false }),
      makeTask({ id: 'done', completed: true }),
    ];

    expect(decode(encode(tasks))).toEqual(tasks);
  });

  it('survives repeated round trips unchanged', () => {
    let tasks = [...mixedList];
    for (let i = 0; i < 5; i += 1) tasks = decode(encode(tasks));

    expect(tasks).toEqual([...mixedList]);
  });

  it('round-trips an empty list', () => {
    expect(decode(encode([]))).toEqual([]);
  });

  it('round-trips a large list', () => {
    const many = Array.from({ length: 500 }, (_unused, i) =>
      makeTask({ id: 'bulk-' + i, title: 'Task ' + i, createdAt: T0 + i }),
    );

    expect(decode(encode(many))).toHaveLength(500);
  });
});

// ─────────────────────── first visit (AC-008.5) ───────────────────────────

describe('decode — nothing stored (AC-008.5)', () => {
  it('returns an empty list for a null input', () => {
    // Not a failure: a first visit, with nothing stored yet.
    expect(decode(null)).toEqual([]);
  });

  it('returns an empty list for an empty string', () => {
    expect(decode('')).toEqual([]);
  });

  it('accepts a stored envelope holding no tasks', () => {
    expect(decode(payload([]))).toEqual([]);
  });
});

// ──────────────── malformed payloads (AC-008.6, AC-SUP.1) ─────────────────

describe('decode — malformed payloads degrade to empty', () => {
  it.each([
    ['not JSON at all', 'this is not json'],
    ['truncated JSON', '{"schemaVersion":1,"tasks":[{"id":"a"'],
    ['a lone opening brace', '{'],
    ['a JSON null', 'null'],
    ['a JSON number', '42'],
    ['a JSON string', '"hello"'],
    ['a JSON boolean', 'true'],
    ['a JSON array at the top level', '[{"id":"a"}]'],
    ['an empty object', '{}'],
  ])('degrades on %s', (_label, raw) => {
    expect(decode(raw)).toEqual([]);
  });

  it('degrades when schemaVersion is missing', () => {
    expect(decode(JSON.stringify({ tasks: [] }))).toEqual([]);
  });

  it('degrades on an unrecognized schemaVersion', () => {
    // A future version's payload is DETECTED rather than misread. That is the
    // only job the version field does in v1 (C-06: no prior format exists).
    expect(decode(payload([], 2))).toEqual([]);
    expect(decode(payload([], 0))).toEqual([]);
    expect(decode(payload([], '1'))).toEqual([]);
    expect(decode(payload([], null))).toEqual([]);
    expect(decode(payload([], 1.5))).toEqual([]);
  });

  it('degrades when tasks is not an array', () => {
    expect(decode(payload({}))).toEqual([]);
    expect(decode(payload('nope'))).toEqual([]);
    expect(decode(payload(null))).toEqual([]);
    expect(decode(payload(7))).toEqual([]);
  });

  it('degrades when tasks is missing entirely', () => {
    expect(decode(JSON.stringify({ schemaVersion: 1 }))).toEqual([]);
  });
});

// ──────────────────── per-field validation (ADR-0006) ─────────────────────

describe('decode — invalid fields degrade to empty', () => {
  const valid = {
    id: 'task-1',
    title: 'Buy milk',
    dueDate: DATE_MID,
    priority: 'high',
    completed: false,
    createdAt: T0,
  };

  it('accepts the valid baseline, so the negative cases mean something', () => {
    expect(decode(payload([valid]))).toHaveLength(1);
  });

  it.each([
    ['id is missing', { ...valid, id: undefined }],
    ['id is empty', { ...valid, id: '' }],
    ['id is a number', { ...valid, id: 7 }],
    ['id is null', { ...valid, id: null }],
    ['title is missing', { ...valid, title: undefined }],
    ['title is empty', { ...valid, title: '' }],
    ['title is a number', { ...valid, title: 42 }],
    ['title is null', { ...valid, title: null }],
    ['dueDate is malformed', { ...valid, dueDate: 'not-a-date' }],
    ['dueDate has an impossible month and day', { ...valid, dueDate: '2026-13-45' }],
    ['dueDate is 30 February', { ...valid, dueDate: '2026-02-30' }],
    ['dueDate is in day-month-year order', { ...valid, dueDate: '15-06-2026' }],
    ['dueDate carries a time component', { ...valid, dueDate: '2026-06-15T00:00:00Z' }],
    ['dueDate is a number', { ...valid, dueDate: 1_700_000_000_000 }],
    ['dueDate is missing', { ...valid, dueDate: undefined }],
    ['dueDate is unpadded', { ...valid, dueDate: '2026-6-15' }],
    ['priority is outside the closed set', { ...valid, priority: 'urgent' }],
    ['priority is capitalised', { ...valid, priority: 'High' }],
    ['priority is a number', { ...valid, priority: 2 }],
    ['priority is missing', { ...valid, priority: undefined }],
    ['completed is a string', { ...valid, completed: 'false' }],
    ['completed is a number', { ...valid, completed: 0 }],
    ['completed is missing', { ...valid, completed: undefined }],
    ['createdAt is a string', { ...valid, createdAt: '1700000000000' }],
    ['createdAt is missing', { ...valid, createdAt: null }],
    ['the entry is a string', 'not an object'],
    ['the entry is null', null],
    ['the entry is an array', []],
  ])('degrades when %s', (_label, task) => {
    expect(decode(payload([task]))).toEqual([]);
  });

  it('degrades when a Date object was serialized into dueDate', () => {
    // JSON.stringify turns a Date into an ISO INSTANT string. ADR-0005 stores
    // a calendar day, so that shape is not ours and is rejected.
    const withDate = JSON.stringify({
      schemaVersion: 1,
      tasks: [{ ...valid, dueDate: new Date('2026-06-15') }],
    });

    expect(decode(withDate)).toEqual([]);
  });

  it('degrades when createdAt is NaN or Infinity', () => {
    // JSON has no NaN literal, so these arrive as null after stringify — but
    // a hand-edited payload can carry them, and a non-finite createdAt would
    // make the ADR-0007 tie-break meaningless.
    expect(decode('{"schemaVersion":1,"tasks":[{"id":"a","title":"t","dueDate":null,"priority":null,"completed":false,"createdAt":1e999}]}')).toEqual([]);
  });

  it('accepts a leap day in a leap year', () => {
    expect(decode(payload([{ ...valid, dueDate: '2024-02-29' }]))).toHaveLength(1);
  });

  it('rejects a leap day in a non-leap year', () => {
    expect(decode(payload([{ ...valid, dueDate: '2026-02-29' }]))).toEqual([]);
  });

  it('rejects 29 February in a century that is not a leap year', () => {
    expect(decode(payload([{ ...valid, dueDate: '1900-02-29' }]))).toEqual([]);
  });

  it('accepts 29 February in a 400-year leap century', () => {
    expect(decode(payload([{ ...valid, dueDate: '2000-02-29' }]))).toHaveLength(1);
  });

  it('accepts each of the three priority levels and null', () => {
    for (const priority of ['low', 'medium', 'high', null]) {
      expect(decode(payload([{ ...valid, priority }]))).toHaveLength(1);
    }
  });

  it('accepts a past due date — overdue is not special-cased (AC-010.6)', () => {
    expect(decode(payload([{ ...valid, dueDate: '2020-01-15' }]))).toHaveLength(1);
  });
});

// ─────────────────── all-or-nothing (ADR-0006, AC-SUP.1) ──────────────────

describe('decode — all-or-nothing', () => {
  const good = (id: string) => ({
    id,
    title: 'Task ' + id,
    dueDate: null,
    priority: null,
    completed: false,
    createdAt: T0,
  });

  it('discards EVERY task when a single one is invalid', () => {
    // The substantive decision of ADR-0006. Partial recovery would hand the
    // user a quietly shortened list they may never notice was shortened.
    const tasks = [good('a'), good('b'), { ...good('c'), priority: 'urgent' }, good('d')];

    expect(decode(payload(tasks))).toEqual([]);
  });

  it('discards everything when the LAST task is invalid', () => {
    const tasks = [good('a'), good('b'), { ...good('c'), completed: 'yes' }];

    expect(decode(payload(tasks))).toEqual([]);
  });

  it('discards everything when the FIRST task is invalid', () => {
    const tasks = [{ ...good('a'), title: '' }, good('b'), good('c')];

    expect(decode(payload(tasks))).toEqual([]);
  });

  it('discards everything for one bad task among a hundred valid ones', () => {
    const tasks: unknown[] = Array.from({ length: 100 }, (_unused, i) => good('t-' + i));
    tasks[57] = { ...good('t-57'), createdAt: 'yesterday' };

    expect(decode(payload(tasks))).toEqual([]);
  });

  it('keeps all tasks when every one is valid', () => {
    const tasks = [good('a'), good('b'), good('c')];

    expect(decode(payload(tasks))).toHaveLength(3);
  });
});

// ───────────────────── no repair, no coercion (ADR-0006) ──────────────────

describe('decode — neither repairs nor coerces', () => {
  const valid = {
    id: 'task-1',
    title: 'Buy milk',
    dueDate: null,
    priority: null,
    completed: false,
    createdAt: T0,
  };

  it('does not null out an invalid priority to rescue the task', () => {
    // ADR-0006 alternative B, rejected: a coerced task is one the user never
    // created, presented as one they did.
    expect(decode(payload([{ ...valid, priority: 'urgent' }]))).toEqual([]);
  });

  it('does not coerce a string createdAt into a number', () => {
    expect(decode(payload([{ ...valid, createdAt: '123' }]))).toEqual([]);
  });

  it('does not coerce a truthy value into a boolean completed', () => {
    expect(decode(payload([{ ...valid, completed: 1 }]))).toEqual([]);
  });

  it('does not treat a whitespace-only stored title as empty', () => {
    // A deliberate distinction. core/validation.ts rejects whitespace-only
    // user INPUT (AC-009.4); the decoder checks the SHAPE of stored data, and
    // a non-empty string is a non-empty string. Conflating the two would mean
    // the decoder silently discarding a list over a cosmetic issue.
    expect(decode(payload([{ ...valid, title: '   ' }]))).toHaveLength(1);
  });

  it('drops keys outside the closed attribute list rather than carrying them', () => {
    // C-03 closes the attribute list. An extra key is not part of the domain,
    // so it never reaches application state.
    const decoded = decode(payload([{ ...valid, notes: 'smuggled', tags: ['x'] }]));

    expect(decoded).toHaveLength(1);
    expect(Object.keys(decoded[0] ?? {}).sort()).toEqual(
      ['completed', 'createdAt', 'dueDate', 'id', 'priority', 'title'].sort(),
    );
  });
});

// ───────────────────────────── totality (DoD) ─────────────────────────────

describe('decode — totality', () => {
  const hostile: (string | null)[] = [
    null,
    '',
    ' ',
    ' ',
    'undefined',
    'NaN',
    '{',
    '}',
    '[]',
    '[[[[[',
    '{"schemaVersion":1,"tasks":',
    '{"schemaVersion":1,"tasks":[null]}',
    '{"schemaVersion":1,"tasks":[[]]}',
    '{"schemaVersion":1,"tasks":{"0":{}}}',
    '{"__proto__":{"polluted":true},"schemaVersion":1,"tasks":[]}',
    JSON.stringify({ schemaVersion: 1, tasks: [{ id: { nested: true } }] }),
    JSON.stringify({ schemaVersion: 1, tasks: [], extra: 'ignored' }),
    '\uD800',
    'a'.repeat(100_000),
  ];

  it.each(hostile.map((raw, i) => [i, raw] as const))(
    'never throws on hostile input #%i',
    (_i, raw) => {
      expect(() => decode(raw)).not.toThrow();
    },
  );

  it('always returns an array', () => {
    for (const raw of hostile) {
      expect(Array.isArray(decode(raw))).toBe(true);
    }
  });

  it('does not pollute Object.prototype via a __proto__ key', () => {
    decode('{"__proto__":{"polluted":true},"schemaVersion":1,"tasks":[]}');

    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('is pure — repeated calls give equal results', () => {
    const raw = encode(mixedList);

    expect(decode(raw)).toEqual(decode(raw));
  });

  it('tolerates an unrecognized top-level key alongside a valid envelope', () => {
    const raw = JSON.stringify({ schemaVersion: 1, tasks: [], extra: 'ignored' });

    expect(decode(raw)).toEqual([]);
  });
});
