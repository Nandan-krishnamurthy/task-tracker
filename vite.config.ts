import { defineConfig } from 'vite';

/**
 * Build configuration.
 *
 * The deliverable is a static bundle (C-06: "ship as a standalone client-side
 * web app"). There is no server, no proxy, and no API target to configure,
 * because C-01 puts all of that out of scope.
 */
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: true,

    /*
     * No modulepreload polyfill.
     *
     * Vite injects one by default, and it calls `fetch()` to warm the app's
     * own script assets. That transmits no task data — but plan §0.4 forbids
     * `fetch` in shipped code outright, and T-605 asserts network silence, so
     * a grep of the bundle should come back empty rather than come back with
     * an exception that has to be argued every time someone runs it.
     *
     * Safe to drop: architecture §12 targets modern evergreen browsers, all of
     * which support `<link rel="modulepreload">` natively.
     */
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
