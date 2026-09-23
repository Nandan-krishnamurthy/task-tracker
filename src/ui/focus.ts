/**
 * Focus capture and restore across a list rebuild (plan T-402).
 *
 * This module is the cost ADR-0002 accepted when it chose no framework, and
 * architecture §4.3 names it "mandatory, not optional". Rebuilding the `<ul>`
 * on every state change destroys the element the user's keyboard focus was on;
 * without this, a user who tabs to a checkbox and presses Space is returned to
 * `<body>` on every single toggle, and AC-A11Y.3 and AC-A11Y.4 both fail.
 *
 * The mechanism is a stable logical name — `data-focus-key` — on every
 * focusable control. `captureFocus` records which key held focus (plus the
 * text cursor, so a half-typed title is not silently reset to its start);
 * `restoreFocus` finds that key again in the freshly built DOM.
 *
 * It is scheduled as the FIRST real task of P4 so the risk is proven before
 * anything depends on it.
 *
 * No storage, no state, no dispatch: this module reads and writes focus and
 * nothing else.
 */

/** The attribute carrying a control's stable logical name. */
export const FOCUS_KEY_ATTR = 'data-focus-key';

/** The create form's title input — the last-resort focus target (§9.4). */
export const TITLE_FOCUS_KEY = 'form:title';

/** Marks a list row and names the task it renders. */
export const TASK_ID_ATTR = 'data-task-id';

/**
 * Focus keys are colon-separated. Per-task controls are
 * `task:<id>:<control>`; everything else is `<area>:<control>`. The task id is
 * in the middle because it is the part that changes between renders, and the
 * control name is last so it can be read off without parsing the id.
 */
const TASK_KEY_PATTERN = /^task:(.+):([^:]+)$/;

/** Build the focus key for one of a task's controls. */
export function taskFocusKey(taskId: string, control: string): string {
  return `task:${taskId}:${control}`;
}

/**
 * What was focused before a rebuild.
 *
 * Deliberately a plain data record and not a DOM reference: the element it
 * describes is about to be discarded, and holding a reference to a detached
 * node is how a rebuild comes to restore focus to something no longer in the
 * document.
 */
export interface FocusSnapshot {
  /** The `data-focus-key` that held focus, or null if nothing relevant did. */
  readonly key: string | null;

  /** Text cursor start, when the focused control had one. */
  readonly selectionStart: number | null;

  /** Text cursor end, when the focused control had one. */
  readonly selectionEnd: number | null;

  /**
   * Position of the focused control's row among the rendered rows, or null
   * when focus was outside the list.
   *
   * This is what makes the §9.4 delete fallback possible. Once the row is
   * gone its id says nothing about where it used to be, so the index is the
   * only record of "the next task" — the task that now occupies the position
   * the deleted one held.
   */
  readonly rowIndex: number | null;

  /**
   * The trailing segment of a per-task key — `toggle`, `edit`, `delete` —
   * or null. Used to prefer the same control on the fallback row.
   */
  readonly control: string | null;
}

/** A snapshot that asks for no restoration at all. */
export const NO_FOCUS: FocusSnapshot = {
  key: null,
  selectionStart: null,
  selectionEnd: null,
  rowIndex: null,
  control: null,
};

/**
 * A snapshot that directs focus to one named control.
 *
 * Used by `ui/app.ts` for the three transitions of architecture §9.4 where
 * focus must MOVE rather than stay: an edit opening, an edit closing, and a
 * task being created. Expressing those as a snapshot means there is one
 * restore path rather than two, so the fallback chain applies to a directed
 * move as well — which matters when the directed target does not exist,
 * as happens when the task being edited is deleted.
 */
export function snapshotForKey(key: string): FocusSnapshot {
  const parsed = TASK_KEY_PATTERN.exec(key);

  return {
    key,
    selectionStart: null,
    selectionEnd: null,
    rowIndex: null,
    control: parsed?.[2] ?? null,
  };
}

/** The focus key of an element, or null if it carries none. */
export function focusKeyOf(element: Element | null): string | null {
  return element?.getAttribute(FOCUS_KEY_ATTR) ?? null;
}

/** The element carrying `key`, or null. */
export function findByFocusKey(root: ParentNode, key: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${FOCUS_KEY_ATTR}="${escapeForSelector(key)}"]`);
}

/**
 * Escape a focus key for use inside an attribute selector.
 *
 * `CSS.escape` is not implemented by jsdom, and task ids are opaque strings
 * that may in principle contain a quote. Escaping the two characters that can
 * terminate the selector is sufficient here and needs no polyfill.
 */
function escapeForSelector(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/** Every rendered task row, in document order. */
function rowsOf(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`li[${TASK_ID_ATTR}]`)];
}

/**
 * The text-cursor position of an element, when it has one.
 *
 * Reading `selectionStart` throws on input types that do not support text
 * selection — `date` among them, which this application uses. The guard is a
 * type allow-list plus a try/catch, because the set of throwing types is a
 * browser-by-browser detail not worth tracking.
 */
// `password` is deliberately absent: it supports a text cursor, but this
// application has no password field and never will (NG-01), and naming one
// here would put an auth-shaped string in shipped code for no behaviour.
const SELECTABLE_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel']);

function readSelection(element: Element): { start: number | null; end: number | null } {
  const isTextarea = element instanceof HTMLTextAreaElement;
  const isSelectableInput =
    element instanceof HTMLInputElement && SELECTABLE_INPUT_TYPES.has(element.type);

  if (!isTextarea && !isSelectableInput) {
    return { start: null, end: null };
  }

  try {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    return { start: input.selectionStart, end: input.selectionEnd };
  } catch {
    return { start: null, end: null };
  }
}

/**
 * Record what currently has focus.
 *
 * Call immediately before rebuilding the list region.
 *
 * `active` is injectable so a test can describe a focus situation without
 * driving the browser into it; it defaults to the document's real active
 * element. When focus is on `<body>` — or on anything without a focus key —
 * the snapshot's `key` is null, and restoring it falls through to the defined
 * fallback rather than pretending nothing was focused.
 */
export function captureFocus(
  root: ParentNode,
  active: Element | null = documentOf(root)?.activeElement ?? null,
): FocusSnapshot {
  const key = focusKeyOf(active);

  if (key === null || active === null) {
    return NO_FOCUS;
  }

  const selection = readSelection(active);
  const row = active.closest(`li[${TASK_ID_ATTR}]`);
  const rowIndex = row === null ? null : rowsOf(root).indexOf(row as HTMLElement);
  const parsed = TASK_KEY_PATTERN.exec(key);

  return {
    key,
    selectionStart: selection.start,
    selectionEnd: selection.end,
    // indexOf returns -1 for a row outside `root`; normalise that to null so
    // the fallback treats it as "focus was not in this list".
    rowIndex: rowIndex === null || rowIndex < 0 ? null : rowIndex,
    control: parsed?.[2] ?? null,
  };
}

function documentOf(root: ParentNode): Document | null {
  if (root instanceof Document) return root;
  return (root as Element).ownerDocument ?? null;
}

/**
 * Put focus back after a rebuild. Returns the element that received it.
 *
 * The fallback chain, in order (architecture §9.4):
 *
 *   1. The same logical control, if it still exists. The ordinary case: the
 *      row was re-created, so the key is present on a new element.
 *
 *   2. The row that now occupies the position the old one held — the "next
 *      task" of §9.4 — preferring the SAME control the user was on, and its
 *      Delete button otherwise. §9.4 specifies the Delete button for the case
 *      it covers, a focused row being deleted; that case is a focused Delete
 *      button, so preferring the same control reproduces the specified
 *      behavior exactly, and gives a sensible answer for the row §9.4 does
 *      not cover — a task toggled out of the current view.
 *
 *      When the deleted row was last, the index is out of range and the final
 *      row is used instead.
 *
 *   3. The create form's title input, when the list is now empty.
 *
 *   4. The first control on the page carrying any focus key.
 *
 * Steps 3 and 4 are what make the "focus is never left on `<body>`" invariant
 * hold: there is always somewhere defined to go, as long as the page has a
 * single focusable control.
 */
export function restoreFocus(root: ParentNode, snapshot: FocusSnapshot): HTMLElement | null {
  const direct = snapshot.key === null ? null : findByFocusKey(root, snapshot.key);

  if (direct !== null) {
    focusWithSelection(direct, snapshot);
    return direct;
  }

  const fallback = resolveFallback(root, snapshot);

  if (fallback !== null) {
    // Deliberately WITHOUT the recorded selection: the cursor offset belonged
    // to a different control, and applying it to the fallback would put the
    // caret at an arbitrary point in unrelated text.
    fallback.focus();
    return fallback;
  }

  return null;
}

function resolveFallback(root: ParentNode, snapshot: FocusSnapshot): HTMLElement | null {
  if (snapshot.rowIndex !== null) {
    const rows = rowsOf(root);

    if (rows.length > 0) {
      const row = rows[Math.min(snapshot.rowIndex, rows.length - 1)];
      const sameControl =
        snapshot.control === null
          ? null
          : row?.querySelector<HTMLElement>(
              `[${FOCUS_KEY_ATTR}$="${escapeForSelector(`:${snapshot.control}`)}"]`,
            );

      const deleteButton = row?.querySelector<HTMLElement>(`[${FOCUS_KEY_ATTR}$=":delete"]`);
      const target = sameControl ?? deleteButton ?? null;

      if (target !== null) return target;
    }
  }

  return findByFocusKey(root, TITLE_FOCUS_KEY) ?? root.querySelector<HTMLElement>(`[${FOCUS_KEY_ATTR}]`);
}

function focusWithSelection(element: HTMLElement, snapshot: FocusSnapshot): void {
  element.focus();

  if (snapshot.selectionStart === null || snapshot.selectionEnd === null) return;

  const selection = readSelection(element);
  if (selection.start === null) return;

  try {
    (element as HTMLInputElement).setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  } catch {
    // The control no longer supports a text cursor. Focus is what mattered.
  }
}
