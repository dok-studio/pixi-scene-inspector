import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

const source = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The content script, built as a second pass into the same `dist`.
 *
 * A separate config because the format differs from everything else: Chrome
 * loads `content.js` as a classic script, so it must be a single self-contained
 * file with no `import` and no chunks. That rules out sharing a build with the
 * HTML entries, which are ES modules.
 *
 * The file name is fixed rather than hashed — `manifest.json` names it, and a
 * mismatch between the two is a silent failure: the page would simply never get
 * a host, and the panel would keep asking for a reload that cannot help.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@scene-inspector/protocol': source('../../packages/protocol/src/index.ts'),
      '@scene-inspector/core': source('../../packages/core/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    // The first pass already emptied it, and this one must not undo it.
    emptyOutDir: false,
    lib: {
      entry: source('src/content.ts'),
      formats: ['iife'],
      name: 'SceneInspectorContent',
      fileName: () => 'content.js',
    },
  },
});
