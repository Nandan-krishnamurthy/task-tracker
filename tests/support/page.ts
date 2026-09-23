/**
 * Page-skeleton helper for the DOM tier (supports T-401 onward).
 *
 * The semantic skeleton lives in `index.html` (T-401). jsdom does not load
 * that file, so a DOM test needs the same structure in `document`. Copying the
 * markup into a fixture would create a second source of truth that drifts from
 * the shipped page the first time a region is renamed — and drift in exactly
 * this markup is invisible, because the tests would keep passing against the
 * copy while the real page broke.
 *
 * So this reads the real file instead. Every DOM test therefore runs against
 * the markup the browser is actually served.
 *
 * Contains NO assertions; it produces a DOM, the same way `fixtures.ts`
 * produces data.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
 * Resolved from the working directory rather than `import.meta.url`: under
 * jsdom, `import.meta.url` carries an http: scheme, which `fileURLToPath`
 * rejects. Vitest runs with the project root as its working directory. This is
 * the same approach `tests/dom/storage-isolation.test.ts` takes.
 */
const INDEX_HTML = resolve(process.cwd(), 'index.html');

/** The raw text of the shipped `index.html`. */
export function readIndexHtml(): string {
  return readFileSync(INDEX_HTML, 'utf8');
}

/**
 * The contents of `<body>`, with `<script>` elements removed.
 *
 * Scripts are stripped rather than left inert: Vitest's jsdom does not execute
 * them, but a test that mounts the skeleton and then imports `src/main.ts`
 * should be running exactly one composition root, not racing a second one if
 * that default ever changes.
 */
export function readBodyMarkup(): string {
  const html = readIndexHtml();
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);

  if (body === null || body[1] === undefined) {
    throw new Error(`No <body> found in ${INDEX_HTML}`);
  }

  return body[1].replace(/<script[\s\S]*?<\/script>/gi, '');
}

/**
 * Install the real page skeleton into the current document and return its
 * root element (the `#app` wrapper that `src/main.ts` mounts into).
 *
 * Call from `beforeEach`. Replaces whatever the document held, so tests do not
 * leak DOM into one another.
 */
export function mountPageSkeleton(): HTMLElement {
  document.body.innerHTML = readBodyMarkup();

  const root = document.getElementById('app');

  if (root === null) {
    throw new Error('index.html no longer contains an element with id="app"');
  }

  return root;
}

/** The container a UI module mounts into, by its `data-region` name. */
export function regionOf(root: ParentNode, name: 'form' | 'filter' | 'list'): HTMLElement {
  const region = root.querySelector<HTMLElement>(`[data-region="${name}"]`);

  if (region === null) {
    throw new Error(`index.html has no [data-region="${name}"] container`);
  }

  return region;
}

/** The shipped stylesheet's text, for rules a test needs to verify. */
export function readStylesheet(): string {
  return readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
}

/**
 * The stylesheet with its comments removed.
 *
 * Use this for any assertion about what the stylesheet DOES. The comments
 * legitimately discuss the declarations they forbid — the focus-indicator note
 * explains why `outline: none` never appears — so scanning raw text flags
 * exactly the file that is documenting its compliance. Same reasoning, and the
 * same `codeOf` shape, as `tests/dom/storage-isolation.test.ts`.
 */
export function readStylesheetCode(): string {
  return readStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
}
