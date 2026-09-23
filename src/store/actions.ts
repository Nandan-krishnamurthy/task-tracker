/**
 * The action set (plan T-301).
 *
 * Exactly the eight transitions of architecture §3.2 — the transitions
 * FR-001 through FR-010 require, and no others.
 *
 * What is deliberately absent is as much the point as what is present. There
 * is no SET_SORT (FR-010 fixes one order; user-selectable sorting is not a
 * stated goal), no CLEAR_COMPLETED or bulk operation (no requirement names
 * one), no UNDO (J3 applies deletion "immediately" and the PRD specifies no
 * reversal), and nothing touching accounts, sync, or sharing (NG-01, NG-02,
 * NG-03). An action here is a commitment to behavior, so the set stays closed.
 */

import type { Filter, Priority, Task } from '../core/types';

/**
 * Every state transition the application can make.
 *
 * A discriminated union on `type`, so the reducer's switch is checked for
 * exhaustiveness by the compiler: adding a member here without handling it is
 * a build error, not a silent no-op.
 */
export type Action =
  /** Startup only: adopt the tasks read from storage (FR-008, AC-008.3). */
  | { readonly type: 'LOAD'; readonly tasks: Task[]; readonly storageOk: boolean }
  /** Create from the form's three fields (FR-001, FR-002, FR-003). */
  | {
      readonly type: 'CREATE_TASK';
      readonly title: string;
      readonly dueDate: string | null;
      readonly priority: Priority | null;
    }
  /** Complete or reopen — one action, both directions (FR-004). */
  | { readonly type: 'TOGGLE_COMPLETE'; readonly id: string }
  /** Edit all three editable attributes at once (FR-005, AC-005.2). */
  | {
      readonly type: 'UPDATE_TASK';
      readonly id: string;
      readonly title: string;
      readonly dueDate: string | null;
      readonly priority: Priority | null;
    }
  /** Remove a task (FR-006). */
  | { readonly type: 'DELETE_TASK'; readonly id: string }
  /** Switch between the two views (FR-007). */
  | { readonly type: 'SET_FILTER'; readonly filter: Filter }
  /** Open the inline edit form. UI mode only; no task data changes. */
  | { readonly type: 'BEGIN_EDIT'; readonly id: string }
  /** Close the inline edit form, discarding the in-progress edit. */
  | { readonly type: 'CANCEL_EDIT' };

/**
 * The action type names, as data.
 *
 * Lets a test assert the set is exactly these eight at runtime, which a type
 * alone cannot do. The test also pins the two in correspondence, so this list
 * cannot drift from the union above.
 */
export const ACTION_TYPES = [
  'LOAD',
  'CREATE_TASK',
  'TOGGLE_COMPLETE',
  'UPDATE_TASK',
  'DELETE_TASK',
  'SET_FILTER',
  'BEGIN_EDIT',
  'CANCEL_EDIT',
] as const;

/** Convenience alias for the discriminant. */
export type ActionType = Action['type'];
