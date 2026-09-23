import { beforeEach, describe, expect, it } from 'vitest';

import { mountPageSkeleton, readIndexHtml, readStylesheetCode } from '../support/page';

/**
 * T-401 verification — semantic page skeleton and base styles.
 *
 * Traceability: NFR-A11Y-001, architecture §4.1, §9.1, §9.6.
 * Acceptance criteria: AC-A11Y.3 (baseline).
 *
 * Two halves. The first asserts the document structure of architecture §4.1
 * exists and is semantic. The second checks the stylesheet's contrast and
 * focus-indicator obligations NUMERICALLY, by parsing the declared palette —
 * "contrast checked" in the task's Definition of Done is otherwise a claim
 * nobody can re-verify after the next edit.
 */

// ─────────────────────── WCAG 2.1 relative luminance ───────────────────────
//
// Implemented here rather than pulled from a package: ADR-0002 keeps the
// runtime dependency count at zero and there is no reason to spend a dev
// dependency on fifteen lines of arithmetic. The formulae are the WCAG 2.1
// definitions of "relative luminance" and "contrast ratio", verbatim.

function channelToLinear(byte: number): number {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());

  if (match === null || match[1] === undefined) {
    throw new Error(`Not a six-digit hex colour: ${hex}`);
  }

  const value = Number.parseInt(match[1], 16);
  const r = channelToLinear((value >> 16) & 0xff);
  const g = channelToLinear((value >> 8) & 0xff);
  const b = channelToLinear(value & 0xff);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);

  return (lighter + 0.05) / (darker + 0.05);
}

/** Every `--color-*` custom property declared in the stylesheet. */
function readPalette(): Record<string, string> {
  const css = readStylesheetCode();
  const palette: Record<string, string> = {};

  for (const match of css.matchAll(/(--color-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) palette[name] = value;
  }

  return palette;
}

// ───────────────────────────── the arithmetic ──────────────────────────────

describe('contrast helper (self-check)', () => {
  // The helper is the instrument every assertion below depends on, so it is
  // calibrated against the two ratios WCAG itself fixes by definition.
  it('rates black on white at 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('rates a colour against itself at 1:1', () => {
    expect(contrastRatio('#1f4ea8', '#1f4ea8')).toBeCloseTo(1, 5);
  });

  it('rejects anything that is not a six-digit hex colour', () => {
    expect(() => relativeLuminance('rebeccapurple')).toThrow();
    expect(() => relativeLuminance('#fff')).toThrow();
  });
});

// ─────────────────────────── document structure ────────────────────────────

describe('page skeleton (T-401, architecture §4.1)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = mountPageSkeleton();
  });

  it('has exactly one h1, naming the application', () => {
    const headings = document.querySelectorAll('h1');

    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent?.trim()).toBe('Task Tracker');
  });

  it('declares the document language', () => {
    // Read from the file: jsdom supplies its own <html> element, so the
    // attribute on the shipped document is not otherwise observable here.
    expect(readIndexHtml()).toMatch(/<html[^>]*\blang="en"/);
  });

  it('wraps the regions in a main landmark', () => {
    expect(root.querySelector('main')).not.toBeNull();
  });

  it.each(['form', 'filter', 'list'])('has a %s region container', (name) => {
    expect(root.querySelector(`[data-region="${name}"]`)).not.toBeNull();
  });

  it.each(['form', 'filter', 'list'])('names the %s region with a real heading', (name) => {
    const region = root.querySelector<HTMLElement>(`[data-region="${name}"]`);
    const labelledBy = region?.getAttribute('aria-labelledby');

    expect(labelledBy).toBeTruthy();

    const heading = document.getElementById(labelledBy ?? '');
    expect(heading).not.toBeNull();
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('leaves the three regions empty of controls — the UI modules mount into them', () => {
    // T-401 builds the shell only. A control appearing here would mean markup
    // had leaked out of the module that owns it.
    for (const name of ['form', 'filter', 'list']) {
      const region = root.querySelector(`[data-region="${name}"]`);
      expect(region?.querySelectorAll('input, select, button, ul')).toHaveLength(0);
    }
  });

  it('uses ids that are unique', () => {
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains no sign-in, account, or profile surface (NG-01, AC-SEC.3)', () => {
    const text = readIndexHtml().toLowerCase();

    expect(text).not.toMatch(/\bsign[- ]?in\b/);
    expect(text).not.toMatch(/\blog[- ]?in\b/);
    expect(text).not.toMatch(/type="password"/);
  });

  it('loads no third-party asset (ADR-0002, NFR-SEC-001)', () => {
    const html = readIndexHtml();

    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script[^>]*\bsrc="(?!\/src\/)/);
  });
});

// ───────────────────────── focus indicator and colour ──────────────────────

describe('base styles (T-401, architecture §9.6)', () => {
  const css = readStylesheetCode();
  const palette = readPalette();

  it('declares the palette the rest of this suite measures', () => {
    // Guards against the contrast assertions passing vacuously because the
    // parser stopped matching and every lookup became undefined.
    for (const name of [
      '--color-bg',
      '--color-surface',
      '--color-text',
      '--color-text-muted',
      '--color-border',
      '--color-accent',
      '--color-danger',
      '--color-on-accent',
      '--color-focus',
    ]) {
      expect(palette[name]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  /*
   * Text pairs must reach 4.5:1 (WCAG 2.1 AA, normal-size text); non-text UI
   * boundaries and the focus indicator must reach 3:1 (SC 1.4.11).
   */
  const textPairs: ReadonlyArray<readonly [string, string, string]> = [
    ['body text on the page', '--color-text', '--color-bg'],
    ['body text on a surface', '--color-text', '--color-surface'],
    ['muted text on the page', '--color-text-muted', '--color-bg'],
    ['muted text on a surface', '--color-text-muted', '--color-surface'],
    ['button text on the accent fill', '--color-on-accent', '--color-accent'],
    ['button text on the danger fill', '--color-on-accent', '--color-danger'],
    ['the validation message on the page', '--color-danger', '--color-bg'],
  ];

  it.each(textPairs)('%s meets AA contrast (4.5:1)', (_name, fg, bg) => {
    expect(contrastRatio(palette[fg] ?? '', palette[bg] ?? '')).toBeGreaterThanOrEqual(4.5);
  });

  const uiPairs: ReadonlyArray<readonly [string, string, string]> = [
    ['control borders against the page', '--color-border', '--color-bg'],
    ['control borders against a surface', '--color-border', '--color-surface'],
    ['the focus ring against the page', '--color-focus', '--color-bg'],
    ['the focus ring against a surface', '--color-focus', '--color-surface'],
  ];

  it.each(uiPairs)('%s meets AA non-text contrast (3:1)', (_name, fg, bg) => {
    expect(contrastRatio(palette[fg] ?? '', palette[bg] ?? '')).toBeGreaterThanOrEqual(3);
  });

  it('gives every interactive element a visible focus outline', () => {
    // One rule must cover each of the element kinds NFR-A11Y-001 names.
    for (const selector of ['button:focus', 'input:focus', 'select:focus', 'a:focus']) {
      expect(css).toContain(selector);
    }

    expect(css).toMatch(/outline:\s*\d+px solid var\(--color-focus\)/);
    expect(css).toMatch(/outline-offset:/);
  });

  it('also covers :focus-visible, so the ring survives pointer interaction', () => {
    expect(css).toContain('button:focus-visible');
  });

  it('never removes an outline', () => {
    // Architecture §9.6 permits removal only with a replacement. Never
    // removing it is the version that cannot be got subtly wrong.
    expect(css).not.toMatch(/outline\s*:\s*(none|0)\b/);
  });

  it('distinguishes a completed task by more than colour (AC-004.7)', () => {
    expect(css).toMatch(/\.task--completed[^{]*\{[^}]*text-decoration:\s*line-through/);
  });

  it('hides text accessibly, never with display:none', () => {
    const rule = /\.visually-hidden\s*\{([^}]*)\}/.exec(css);

    expect(rule).not.toBeNull();
    expect(rule?.[1]).not.toMatch(/display\s*:\s*none/);
  });

  it('uses no @import and no remote font (ADR-0002)', () => {
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/https?:\/\//);
  });
});
