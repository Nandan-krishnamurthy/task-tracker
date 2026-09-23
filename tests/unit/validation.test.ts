import { describe, expect, it } from 'vitest';

import { EMPTY_TITLE_MESSAGE, validateTitle } from '../../src/core/validation';
import { awkwardTitles, emptyishTitles } from '../support/fixtures';

/**
 * T-102 verification.
 *
 * Traceability: FR-001, FR-009.
 * Acceptance criteria: AC-001.4, AC-009.1, AC-009.4, AC-005.6.
 */

describe('validateTitle — accepts', () => {
  it('a plain non-empty title', () => {
    const result = validateTitle('Buy milk');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe('Buy milk');
  });

  it('a single character', () => {
    const result = validateTitle('x');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe('x');
  });

  it.each(awkwardTitles)('the awkward but legitimate title %j', (title) => {
    // AC-001.4: stored and displayed exactly as entered. Unicode, emoji,
    // markup-looking text, and very long titles are all ordinary input — the
    // PRD specifies no character restriction and no maximum length.
    const result = validateTitle(title);

    expect(result.ok).toBe(true);
  });
});

describe('validateTitle — trimming (AC-001.4)', () => {
  it('strips leading whitespace', () => {
    const result = validateTitle('   Buy milk');

    expect(result.ok && result.value).toBe('Buy milk');
  });

  it('strips trailing whitespace', () => {
    const result = validateTitle('Buy milk   ');

    expect(result.ok && result.value).toBe('Buy milk');
  });

  it('strips tabs and newlines at the ends', () => {
    const result = validateTitle('\t\nBuy milk\n\t');

    expect(result.ok && result.value).toBe('Buy milk');
  });

  it('PRESERVES interior spacing exactly', () => {
    // The case a naive whitespace-normalise would break. AC-001.4 forbids
    // altering the title's visible content, and interior runs of spaces are
    // visible content; only the ends are not.
    const result = validateTitle('Call  the   dentist');

    expect(result.ok && result.value).toBe('Call  the   dentist');
  });

  it('preserves interior newlines and tabs', () => {
    const result = validateTitle('line one\tline two');

    expect(result.ok && result.value).toBe('line one\tline two');
  });

  it('preserves unicode and emoji unchanged', () => {
    const result = validateTitle('  Café — naïve façade 📌  ');

    expect(result.ok && result.value).toBe('Café — naïve façade 📌');
  });

  it('leaves a title with no surrounding whitespace byte-identical', () => {
    const title = 'Review PR #42 <script>alert(1)</script>';
    const result = validateTitle(title);

    expect(result.ok && result.value).toBe(title);
  });
});

describe('validateTitle — rejects (AC-009.1, AC-009.4)', () => {
  it('an empty string', () => {
    const result = validateTitle('');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toBe(EMPTY_TITLE_MESSAGE);
  });

  it.each(emptyishTitles)('the whitespace-only title %j', (title) => {
    // AC-009.4, resolving OQ-06: whitespace-only is treated as empty.
    const result = validateTitle(title);

    expect(result.ok).toBe(false);
  });

  it('a title of non-breaking spaces', () => {
    // String.trim treats every Unicode whitespace character as whitespace, so
    // a title that LOOKS blank is rejected rather than producing a row the
    // user cannot identify.
    const result = validateTitle('  ');

    expect(result.ok).toBe(false);
  });

  it('a title of assorted Unicode whitespace', () => {
    const result = validateTitle('  ﻿');

    expect(result.ok).toBe(false);
  });

  it('with a non-empty, human-readable message', () => {
    const result = validateTitle('   ');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message.length).toBeGreaterThan(0);
    expect(!result.ok && result.message).toMatch(/title/i);
  });
});

describe('validateTitle — contract', () => {
  it('never exposes a value on the failure branch', () => {
    // The discriminated union is what stops a caller writing a rejected title
    // to a task: `value` is unreachable without first narrowing on `ok`.
    const result = validateTitle('');

    expect(result).toEqual({ ok: false, message: EMPTY_TITLE_MESSAGE });
    expect(result).not.toHaveProperty('value');
  });

  it('never exposes a message on the success branch', () => {
    const result = validateTitle('Buy milk');

    expect(result).toEqual({ ok: true, value: 'Buy milk' });
    expect(result).not.toHaveProperty('message');
  });

  it('is pure — repeated calls give identical results', () => {
    expect(validateTitle('  Buy milk  ')).toEqual(validateTitle('  Buy milk  '));
    expect(validateTitle('')).toEqual(validateTitle(''));
  });

  it('is the single rule shared by the create and edit paths (AC-005.6)', () => {
    // Architecture §6.1: one function serves both, which is what makes it
    // impossible for a task to reach an empty title by any route. This test
    // pins the shared behavior; T-302 and T-406 verify both call sites use it.
    for (const emptyish of emptyishTitles) {
      expect(validateTitle(emptyish).ok).toBe(false);
    }
    expect(validateTitle('Renamed').ok).toBe(true);
  });

  it('applies no maximum length (architecture §6.2)', () => {
    // Explicitly NOT validated: the PRD specifies no limit, so imposing one
    // would be inventing product behavior.
    const result = validateTitle('a'.repeat(10_000));

    expect(result.ok).toBe(true);
  });
});
