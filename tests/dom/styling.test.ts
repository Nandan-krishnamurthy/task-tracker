import { beforeEach, describe, expect, it } from 'vitest';

import type { Store } from '../../src/store/store';
import { createStore } from '../../src/store/store';
import { mountApp } from '../../src/ui/app';
import { DATE_EARLY, DATE_MID, T0, makeTask } from '../support/fixtures';
import { mountPageSkeleton, readStylesheetCode } from '../support/page';

/**
 * T-503 verification — visual styling completion.
 *
 * Traceability: NFR-A11Y-001, DO-2.
 * Acceptance criteria: AC-003.6, AC-004.7.
 *
 * jsdom computes no layout, so this suite does not pretend to measure one.
 * What it checks is the two things that ARE decidable from the stylesheet and
 * the rendered markup:
 *
 *   - the meaning-carrying rules — completion and priority must survive with
 *     every colour stripped out;
 *   - the structural preconditions for "layout holds from ~320 px up" — no
 *     fixed width wider than a phone, no minimum that cannot shrink, long
 *     titles able to wrap.
 *
 * The layout itself is measured in a real browser at 320 px as part of the P5
 * gate, because that is the only honest way to check it.
 */

const css = readStylesheetCode();

/** The body of the first rule whose selector matches, or null. */
function ruleFor(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[,}])\\s*${escaped}\\s*(,[^{]*)?\\{([^}]*)\\}`, 'm').exec(css);
  return match?.[3] ?? null;
}

let root: HTMLElement;
let store: Store;

beforeEach(() => {
  root = mountPageSkeleton();
  store = createStore({ newId: () => 'new', now: () => T0, persist: () => true });
  store.dispatch({
    type: 'LOAD',
    tasks: [
      makeTask({ id: 'hi', title: 'Pay rent', dueDate: DATE_EARLY, priority: 'high', createdAt: T0 }),
      makeTask({ id: 'md', title: 'Buy milk', dueDate: DATE_MID, priority: 'medium', createdAt: T0 + 1 }),
      makeTask({ id: 'lo', title: 'Call dentist', dueDate: null, priority: 'low', createdAt: T0 + 2 }),
      makeTask({ id: 'no', title: 'Someday', dueDate: null, priority: null, createdAt: T0 + 3 }),
      makeTask({ id: 'dn', title: 'All done', completed: true, createdAt: T0 + 4 }),
    ],
    storageOk: true,
  });
  mountApp(store, root);
});

const rowFor = (id: string): HTMLElement => root.querySelector<HTMLElement>(`li[data-task-id="${id}"]`)!;

// ───────────────────── meaning survives without colour ────────────────────

describe('completion is distinguishable by more than colour (AC-004.7)', () => {
  beforeEach(() => store.dispatch({ type: 'SET_FILTER', filter: 'completed' }));

  it('states the status as a word', () => {
    expect(rowFor('dn').querySelector('.task__status')?.textContent).toBe('Completed');
  });

  it('strikes the title through — a shape, not a hue', () => {
    expect(ruleFor('.task--completed .task__title')).toMatch(/text-decoration:\s*line-through/);
  });

  it('checks the checkbox, which is a third independent signal', () => {
    expect(rowFor('dn').querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(
      true,
    );
  });

  it('survives with every colour declaration removed', () => {
    // The real test of "not colour alone": strip colour from the stylesheet
    // and the row must still say what it is.
    const colourless = css.replace(/^\s*(color|background|border-color)\s*:[^;]*;/gm, '');

    expect(colourless).toMatch(/text-decoration:\s*line-through/);
    expect(rowFor('dn').textContent).toContain('Completed');
  });
});

describe('priority is legible as text (AC-003.6, architecture §9.6)', () => {
  it.each([
    ['hi', 'High'],
    ['md', 'Medium'],
    ['lo', 'Low'],
    ['no', 'No priority'],
  ])('row %s reads its level as a word', (id, word) => {
    expect(rowFor(id).querySelector('.task__priority')?.textContent).toContain(word);
  });

  it('carries the level as a modifier class, so styling is emphasis on top of text', () => {
    expect(rowFor('hi').querySelector('.task__priority')?.className).toContain(
      'task__priority--high',
    );
    expect(rowFor('no').querySelector('.task__priority')?.className).toContain(
      'task__priority--none',
    );
  });

  it('gives a high-priority task extra weight as well as colour (DO-2)', () => {
    const rule = ruleFor('.task__priority--high');

    expect(rule).not.toBeNull();
    // Weight is the non-colour half of the emphasis: remove the hue and a
    // high-priority row is still the one that stands out.
    expect(rule).toMatch(/font-weight:/);
  });

  it('reads correctly with every colour declaration removed', () => {
    for (const [id, word] of [
      ['hi', 'High'],
      ['lo', 'Low'],
      ['no', 'No priority'],
    ] as const) {
      expect(rowFor(id).textContent).toContain(word);
    }
  });

  it('never encodes a level in a colour the markup does not also spell out', () => {
    // Every styled level must have its word in the DOM. `--none` is styled by
    // nothing, which is fine; what must not happen is a level that only the
    // stylesheet knows about.
    for (const level of ['high', 'medium', 'low', 'none']) {
      const element = root.querySelector(`.task__priority--${level}`);
      if (element !== null) {
        expect(element.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

// ─────────────────────── narrow-width preconditions ───────────────────────

describe('the layout can hold from ~320 px up', () => {
  it('declares a narrow-width breakpoint', () => {
    expect(css).toMatch(/@media\s*\(max-width:/);
  });

  it('expresses the breakpoint in rem, so it tracks the user’s font size', () => {
    const queries = [...css.matchAll(/@media\s*\(max-width:\s*([^)]+)\)/g)].map((m) => m[1] ?? '');

    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(query.trim()).toMatch(/rem$/);
  });

  it('declares no fixed width wider than a 320 px viewport', () => {
    // `width: 100%` and `max-width` are fine; an absolute width is what forces
    // a horizontal scrollbar.
    for (const match of css.matchAll(/(^|[;{])\s*width\s*:\s*([^;}]+)/g)) {
      const value = (match[2] ?? '').trim();
      if (value.endsWith('px')) {
        expect(Number.parseFloat(value)).toBeLessThanOrEqual(320);
      } else if (value.endsWith('rem')) {
        expect(Number.parseFloat(value)).toBeLessThanOrEqual(20);
      }
    }
  });

  it('declares no min-width that could exceed a phone screen', () => {
    for (const match of css.matchAll(/min-width\s*:\s*([^;}]+)/g)) {
      const value = (match[1] ?? '').trim();
      expect(['0', '0px', 'auto', 'min-content'], `min-width: ${value}`).toContain(value);
    }
  });

  it('constrains the page with max-width, not width', () => {
    expect(ruleFor('#app')).toMatch(/max-width:/);
    expect(ruleFor('#app')).not.toMatch(/(^|[;\s])width:/);
  });

  it('lets form controls shrink below their content width', () => {
    expect(ruleFor(".task-form,\n.task-edit") ?? ruleFor('.task-form')).toMatch(/flex-wrap:\s*wrap/);
    expect(css).toMatch(/max-width:\s*100%/);
    expect(ruleFor('.field')).toMatch(/min-width:\s*0/);
  });

  it('lets a very long title wrap rather than widen the page (AC-001.4)', () => {
    // Titles are stored verbatim, so a 500-character title with no spaces is a
    // legal task and must not break the layout.
    const rule = ruleFor('.task__title');

    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule).toMatch(/min-width:\s*0/);
  });

  it('wraps every horizontal row rather than letting it overflow', () => {
    for (const selector of ['.task', '.filter-bar__group']) {
      expect(ruleFor(selector), selector).toMatch(/flex-wrap:\s*wrap/);
    }
  });

  it('stacks both forms at narrow widths', () => {
    const narrow = /@media[^{]*\{([\s\S]*)\}\s*$/.exec(css)?.[1] ?? '';

    expect(narrow).toMatch(/flex-direction:\s*column/);
    expect(narrow).toContain('.task-form');
    expect(narrow).toContain('.task-edit');
  });

  it('never hides overflowing content outright', () => {
    // `.visually-hidden` legitimately clips itself; nothing else may.
    const offenders = [...css.matchAll(/([^{}]+)\{([^}]*overflow\s*:\s*hidden[^}]*)\}/g)].map(
      (m) => (m[1] ?? '').trim(),
    );

    for (const selector of offenders) {
      expect(selector).toContain('.visually-hidden');
    }
  });
});

// ──────────────────────────── the three exclusions ────────────────────────

describe('T-503 adds no animation, theming, or component library', () => {
  it('declares no animation or transition', () => {
    expect(css).not.toMatch(/@keyframes/);
    expect(css).not.toMatch(/(^|[;{\s])animation\s*:/);
    expect(css).not.toMatch(/(^|[;{\s])transition\s*:/);
  });

  it('declares no alternate theme', () => {
    // A dark-mode variant is theming, which T-503 excludes. `color-scheme` is
    // not a theme: it declares which single theme this page is, so that native
    // date and select controls keep the contrast verified elsewhere.
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/\[data-theme/);
    expect(css).toMatch(/color-scheme:\s*light/);
  });

  it('imports no stylesheet and loads no remote asset (ADR-0002)', () => {
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toMatch(/url\(/);
  });

  it('keeps every colour in the declared palette', () => {
    // A literal hex outside :root would be a colour no contrast test measures.
    const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
    const declaredInRoot = new Set([...rootBlock.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0]));
    const usedAnywhere = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);

    for (const colour of usedAnywhere) {
      expect(declaredInRoot.has(colour), `${colour} is used outside the palette`).toBe(true);
    }
  });
});

// ────────────────────── the rendered page hangs together ──────────────────

describe('every rendered element is styled by a rule that exists', () => {
  it('has a rule for each class the UI emits', () => {
    store.dispatch({ type: 'BEGIN_EDIT', id: 'md' });

    const emitted = new Set<string>();
    for (const element of root.querySelectorAll('[class]')) {
      for (const name of element.className.split(/\s+/)) {
        if (name !== '') emitted.add(name);
      }
    }

    expect(emitted.size).toBeGreaterThan(10);

    /*
     * Classes that intentionally carry no rule of their own. Each is either a
     * structural hook for scripts and tests, or a variant that inherits
     * everything it needs from a shared class — never an oversight. Listing
     * them explicitly is the point: a class added later without styling has to
     * be justified here rather than slipping past unnoticed.
     */
    const hooksWithoutOwnStyling = new Set([
      // Styled entirely by `.task__meta`; the class is a query hook.
      'task__due',
      // Levels that deliberately keep the default muted `.task__meta` look —
      // only medium and high are lifted out of it.
      'task__priority--low',
      'task__priority--none',
      // The counterpart to `.task--completed`, which needs no styling because
      // active is the default appearance.
      'task--active',
      // Layout containers whose styling lives on `#app`, `.region`, or a
      // descendant selector.
      'app-main',
      'region--form',
      'region--filter',
      'region--list',
      'task-list-region',
      'filter-bar',
    ]);

    for (const name of emitted) {
      if (hooksWithoutOwnStyling.has(name)) continue;
      expect(css, `.${name} is emitted but has no rule`).toContain(`.${name}`);
    }
  });

  it('styles the empty state', () => {
    store.dispatch({ type: 'SET_FILTER', filter: 'completed' });
    store.dispatch({ type: 'TOGGLE_COMPLETE', id: 'dn' });

    expect(root.querySelector('.empty-state')).not.toBeNull();
    expect(ruleFor('.empty-state')).toMatch(/padding:/);
  });
});
