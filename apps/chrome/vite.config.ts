import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const source = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The three notice files, carried into the build.
 *
 * Every licence in the bundle — this project's own MIT, the MIT of the project
 * it derives from, the Apache 2.0, BSD and ISC of what it installs — asks for
 * its notice to travel with the copy that is distributed. The copy that is
 * distributed is `dist`: nobody installs the repository.
 *
 * Read from the root at build time rather than duplicated into `public/`, which
 * would put a second set of files beside the first with nothing keeping them in
 * step. `THIRD_PARTY_LICENSES` is itself generated from the dependency tree —
 * see `scripts/licenses.mjs`, and the test beside it that keeps the committed
 * copy current.
 */
function notices(): Plugin {
  const names = ['LICENSE', 'NOTICE', 'THIRD_PARTY_LICENSES'];

  return {
    name: 'scene-inspector:notices',
    generateBundle() {
      for (const name of names) {
        this.emitFile({
          type: 'asset',
          // Named outright, so `assetFileNames` does not file them under
          // `assets/` with the code. A notice belongs beside the manifest.
          fileName: name,
          source: readFileSync(source(`../../${name}`), 'utf8'),
        });
      }
    },
  };
}

/**
 * The extension's documents: the DevTools page that registers the tab, the
 * panel itself, and the help page the panel's bar opens. All three are
 * extension pages, so ES modules and hashed asset names are fine — the manifest
 * only ever names `devtools.html`, and the other two are reached from inside
 * the extension.
 *
 * The content script is **not** built here. It has to be one classic script
 * with no imports, which is a different output format; it gets its own config
 * (`vite.content.config.ts`) and a second pass over the same `dist`.
 *
 * Workspace packages are aliased to their source, as in the playground: Vite
 * transforms them like project code, so there is no library build step between
 * an edit and a reload of the unpacked extension.
 */
export default defineConfig({
  plugins: [react(), notices()],
  resolve: {
    alias: {
      // The subpaths first: string aliases match by prefix, so the bare package
      // alias below would otherwise swallow them.
      '@scene-inspector/panel/globals.css': source('../../packages/panel/src/globals.css'),
      // The help page's own entry, so that importing it does not drag the whole
      // panel in behind it — see the note in `packages/panel/src/index.ts`.
      '@scene-inspector/panel/help': source('../../packages/panel/src/features/help/HelpPage.tsx'),
      '@scene-inspector/protocol': source('../../packages/protocol/src/index.ts'),
      '@scene-inspector/core': source('../../packages/core/src/index.ts'),
      '@scene-inspector/panel': source('../../packages/panel/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',

    /**
     * The default 500 kB warns about a page that is downloaded, and these are
     * not: they are loaded from the extension's own directory, over no network,
     * once per DevTools window.
     *
     * There *is* a second route now — the help page — and it is split from the
     * panel deliberately: `help.tsx` imports `@scene-inspector/panel/help`
     * rather than the barrel, so the panel does not carry a document it never
     * draws. What the two genuinely share (React, the theme, the settings
     * stores) Rollup hoists into a chunk of its own.
     *
     * Raised rather than switched off, and not by much, so a jump worth looking
     * at still says so.
     */
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        devtools: source('devtools.html'),
        panel: source('panel.html'),
        help: source('help.html'),
      },
      // No content hashes. They exist to defeat an HTTP cache, and there is no
      // HTTP here: the browser loads these files from the extension's own
      // directory, and a reload of the extension is what picks up a new build.
      // Stable names also keep `content.js` company — one naming rule for the
      // whole `dist` rather than "hashed, except the file the manifest names".
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
