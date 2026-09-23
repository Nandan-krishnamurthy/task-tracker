import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T-203 — the storage-isolation invariant.
 *
 * ADR-0001 confines every storage call to one module. That is what reduces the
 * NFR-SUP-001 no-crash guarantee to a single reviewable claim: "every entry
 * point of persistence/storage.ts is wrapped in try/catch". If any other
 * module reached for localStorage directly, an unwrapped access could throw
 * from anywhere and AC-SUP.1 through AC-SUP.3 would rest on nothing.
 *
 * Nothing in the language enforces this, so it is enforced here. Placed in the
 * DOM tier to match ADR-0008 §10.2, which lists it as the tier-2 structural
 * test.
 */

/*
 * Resolved from the working directory rather than `import.meta.url`: under
 * jsdom, `import.meta.url` carries an http: scheme (jsdom gives the document a
 * URL), and `fileURLToPath` rejects anything that is not file:. Vitest runs
 * with the project root as its working directory in both environments.
 */
const SRC_DIR = resolve(process.cwd(), 'src');

/** The one module permitted to touch storage, as a path suffix. */
const PERMITTED = 'persistence/storage.ts';

/** Every .ts file under src/, as a path relative to src/. */
function collectSourceFiles(dir: string, prefix = ''): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    const relative = prefix === '' ? entry : `${prefix}/${entry}`;

    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full, relative));
    } else if (entry.endsWith('.ts')) {
      found.push(relative);
    }
  }

  return found;
}

/**
 * File contents with comments stripped.
 *
 * Doc comments legitimately discuss localStorage — several explain WHY a
 * module must not use it. Scanning raw text would flag exactly the files that
 * are documenting their compliance.
 */
function codeOf(relativePath: string): string {
  const source = readFileSync(`${SRC_DIR}/${relativePath}`, 'utf8');
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const sourceFiles = collectSourceFiles(SRC_DIR);
const otherFiles = sourceFiles.filter((path) => !path.endsWith(PERMITTED));

describe('storage isolation (ADR-0001, T-203)', () => {
  it('finds source files to scan', () => {
    // Guards against the scan silently passing because it found nothing —
    // the failure mode that would make this whole test vacuous.
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(sourceFiles).toContain(PERMITTED);
  });

  it('has at least one non-permitted file to check', () => {
    expect(otherFiles.length).toBeGreaterThan(0);
  });

  it.each(otherFiles)('%s does not reference localStorage', (relativePath) => {
    expect(codeOf(relativePath)).not.toMatch(/\blocalStorage\b/);
  });

  it.each(otherFiles)('%s does not reference sessionStorage', (relativePath) => {
    // sessionStorage would fail AC-008.2 outright — it does not survive a
    // browser restart, which is the whole of journey J4.
    expect(codeOf(relativePath)).not.toMatch(/\bsessionStorage\b/);
  });

  it.each(otherFiles)('%s does not reference document.cookie', (relativePath) => {
    // Cookies are transmitted with HTTP requests, which would violate
    // NFR-SEC-001's "nothing is transmitted to a server".
    expect(codeOf(relativePath)).not.toMatch(/document\s*\.\s*cookie/);
  });

  it.each(otherFiles)('%s does not reference indexedDB', (relativePath) => {
    expect(codeOf(relativePath)).not.toMatch(/\bindexedDB\b/);
  });

  it('confirms the permitted module does use localStorage', () => {
    // Otherwise the invariant could be satisfied by nothing using storage at
    // all, and this suite would prove nothing about where it is confined.
    expect(codeOf(PERMITTED)).toMatch(/\blocalStorage\b/);
  });

  it('wraps every storage access in the permitted module in try/catch', () => {
    const code = codeOf(PERMITTED);
    const tryBlocks = code.match(/\btry\s*\{/g) ?? [];
    const catchBlocks = code.match(/\bcatch\s*\{/g) ?? [];

    // Three guarded paths: the property read in getBrowserStorage, the read in
    // load, and the write in save (architecture §8, failure modes 1-3).
    expect(tryBlocks.length).toBeGreaterThanOrEqual(3);
    expect(catchBlocks.length).toBe(tryBlocks.length);
  });
});

describe('unload-family listeners (AC-REL.3)', () => {
  it.each(sourceFiles)('%s registers no beforeunload, pagehide, or storage listener', (relativePath) => {
    // AC-REL.3 rules out deferring persistence to page unload, because an
    // unload handler is not guaranteed to run on a crash. A 'storage'
    // listener would be building NG-07, multi-tab consistency.
    const code = codeOf(relativePath);

    expect(code).not.toMatch(/['"]beforeunload['"]/);
    expect(code).not.toMatch(/['"]pagehide['"]/);
    expect(code).not.toMatch(/['"]visibilitychange['"]/);
    expect(code).not.toMatch(/addEventListener\s*\(\s*['"]storage['"]/);
    expect(code).not.toMatch(/\bBroadcastChannel\b/);
  });
});
