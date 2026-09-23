import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * P1 exit gate: "core/ imports nothing from siblings."
 *
 * ADR-0001 places `core/` at the centre of the dependency graph — it imports
 * from no other layer, touches no DOM, and performs no I/O. That purity is
 * what makes most of the acceptance criteria testable without a browser, and
 * it is a convention rather than something the language enforces, so it is
 * asserted here.
 *
 * This is the same style of structural guard that T-203 will apply to
 * localStorage in P2.
 */

const CORE_DIR = fileURLToPath(new URL('../../src/core', import.meta.url));

const coreFiles = readdirSync(CORE_DIR).filter((name) => name.endsWith('.ts'));

/** Source with comments stripped, so prose about `document` is not a hit. */
function codeOf(fileName: string): string {
  const source = readFileSync(`${CORE_DIR}/${fileName}`, 'utf8');
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('core/ purity (ADR-0001)', () => {
  it('contains the five modules P1 defines', () => {
    expect(coreFiles.sort()).toEqual(
      ['filter.ts', 'sort.ts', 'tasks.ts', 'types.ts', 'validation.ts'].sort(),
    );
  });

  it.each(coreFiles)('%s imports from no sibling layer', (fileName) => {
    const code = codeOf(fileName);

    expect(code).not.toMatch(/from\s+['"]\.\.\/persistence/);
    expect(code).not.toMatch(/from\s+['"]\.\.\/store/);
    expect(code).not.toMatch(/from\s+['"]\.\.\/ui/);
    // Nothing outside src/core at all — the only legal relative import is a
    // sibling inside this directory.
    expect(code).not.toMatch(/from\s+['"]\.\.\//);
  });

  it.each(coreFiles)('%s imports no third-party package', (fileName) => {
    const code = codeOf(fileName);
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');

    for (const specifier of imports) {
      expect(specifier.startsWith('./')).toBe(true);
    }
  });

  it.each(coreFiles)('%s touches no DOM or storage API', (fileName) => {
    const code = codeOf(fileName);

    expect(code).not.toMatch(/\bdocument\b/);
    expect(code).not.toMatch(/\bwindow\b/);
    expect(code).not.toMatch(/\blocalStorage\b/);
    expect(code).not.toMatch(/\bsessionStorage\b/);
  });

  it.each(coreFiles)('%s performs no I/O or network call', (fileName) => {
    const code = codeOf(fileName);

    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/XMLHttpRequest|WebSocket|sendBeacon/);
  });

  it.each(coreFiles)('%s reads no ambient clock or randomness', (fileName) => {
    // Both are side effects. `createTask` takes its id and timestamp as
    // arguments precisely so that core/ stays a total function of its inputs.
    const code = codeOf(fileName);

    expect(code).not.toMatch(/Date\.now/);
    expect(code).not.toMatch(/new Date/);
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/crypto\./);
  });
});
