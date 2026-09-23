/**
 * Stored payload shape and decoding (plan T-201).
 *
 * Pure: this module performs no I/O. It turns tasks into a string and a string
 * back into tasks. `persistence/storage.ts` owns every actual storage call
 * (ADR-0001), which is what keeps the no-crash guarantee auditable.
 *
 * Stored data is a TRUST BOUNDARY even in an app with no server. The payload
 * can be malformed for entirely mundane reasons: a write interrupted by a
 * crash, an extension writing to the same origin, a user editing storage by
 * hand, or a future version of the app writing a shape this version does not
 * understand. NFR-SUP-001 therefore requires that any such payload degrade to
 * an empty task list rather than crash the app.
 */

import { PRIORITIES } from '../core/types';
import type { Priority, Task } from '../core/types';

/**
 * Version of the stored envelope.
 *
 * C-06 confirms there is no prior format to migrate from, so in v1 this has
 * exactly one job: make unrecognized data DETECTABLE rather than silently
 * misread. Any other value is treated as unreadable. No migration code is
 * written now.
 */
export const SCHEMA_VERSION = 1;

/** The stored envelope. Serialized as JSON under a single key (ADR-0003). */
export interface StoredEnvelope {
  schemaVersion: number;
  tasks: Task[];
}

// ───────────────────────────── field predicates ───────────────────────────
//
// Hand-written rather than a schema library. ADR-0006 alternative E was
// rejected on principle P2: a runtime dependency for six field checks, in an
// application whose runtime dependency count is otherwise zero.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A real calendar date in `YYYY-MM-DD` form (ADR-0005).
 *
 * Shape alone is not enough: "2026-13-45" matches the pattern but is not a
 * date, and neither is "2026-02-30". The check is pure arithmetic with an
 * explicit leap-year rule — deliberately NOT `new Date(...)`, which would
 * reintroduce the instant-versus-calendar-day confusion that ADR-0005 exists
 * to remove, and which silently rolls "2026-02-30" over into March.
 */
function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) return false;

  const [, rawYear = '', rawMonth = '', rawDay = ''] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;

  return true;
}

function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

/**
 * Whether one decoded entry is a valid task.
 *
 * Every field is checked. `priority` must be one of the three literals or
 * null (C-04); `dueDate` a real calendar date or null (ADR-0005); `createdAt`
 * a finite number, since NaN or Infinity would make the ADR-0007 tie-break
 * meaningless.
 */
function isValidTask(value: unknown): boolean {
  if (!isObject(value)) return false;

  if (!isNonEmptyString(value['id'])) return false;
  if (!isNonEmptyString(value['title'])) return false;
  if (value['dueDate'] !== null && !isIsoCalendarDate(value['dueDate'])) return false;
  if (value['priority'] !== null && !isPriority(value['priority'])) return false;
  if (typeof value['completed'] !== 'boolean') return false;
  if (typeof value['createdAt'] !== 'number' || !Number.isFinite(value['createdAt'])) return false;

  return true;
}

/**
 * Build a Task from an entry already proven valid by `isValidTask`.
 *
 * Constructed field by field rather than spread, so a payload carrying extra
 * keys cannot smuggle them into application state. C-03 closes the attribute
 * list; anything beyond the six fields is not part of the domain and is
 * dropped here rather than carried around unrecognised.
 */
function toTask(value: Record<string, unknown>): Task {
  return {
    id: value['id'] as string,
    title: value['title'] as string,
    dueDate: value['dueDate'] as string | null,
    priority: value['priority'] as Priority | null,
    completed: value['completed'] as boolean,
    createdAt: value['createdAt'] as number,
  };
}

// ──────────────────────────────── encode ──────────────────────────────────

/**
 * Serialize tasks into the stored envelope.
 *
 * The whole array is written every time rather than per-task records: simpler,
 * atomic from any reader's perspective, and trivially fast at this size
 * (ADR-0003). Insertion order is preserved — display order is derived at
 * render (ADR-0007), so storage carries no ordering meaning.
 */
export function encode(tasks: readonly Task[]): string {
  const envelope: StoredEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    tasks: [...tasks],
  };

  return JSON.stringify(envelope);
}

// ──────────────────────────────── decode ──────────────────────────────────

/**
 * Parse a stored payload into tasks. TOTAL: never throws, for any input.
 *
 * ALL-OR-NOTHING (ADR-0006). If any part fails validation — invalid JSON, a
 * wrong envelope shape, an unrecognized schemaVersion, or a single task
 * failing a single field check — the entire result is an empty array.
 *
 * Partial recovery was considered and rejected. NFR-SUP-001 and AC-SUP.1 both
 * say "degrade to an empty task list", not "to the recoverable subset"; and a
 * user who opens the app to an empty list knows at once that something is
 * wrong, where one who opens it to seventeen of their twenty tasks may never
 * notice the three that vanished. Losing more data loudly beats losing less
 * data silently.
 *
 * Returning `[]` for a null input is not a failure: it is a first visit, with
 * nothing stored yet (AC-008.5).
 */
export function decode(raw: string | null): Task[] {
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isObject(parsed)) return [];
    if (parsed['schemaVersion'] !== SCHEMA_VERSION) return [];

    const tasks = parsed['tasks'];
    if (!Array.isArray(tasks)) return [];

    if (!tasks.every(isValidTask)) return [];

    return (tasks as Record<string, unknown>[]).map(toTask);
  } catch {
    // Malformed JSON, or anything else unforeseen. The contract is totality:
    // no input may propagate an exception to the caller.
    return [];
  }
}
