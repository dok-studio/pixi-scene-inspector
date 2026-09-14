import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const source = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The local stand: the game and the panel in one document.
 *
 * Workspace packages are aliased to their source, exactly as the extension does
 * it — Vite transforms them like project code, so an edit in the panel reaches
 * the page through HMR with no library build in between. That is the whole
 * reason this stand is faster to work against than an unpacked extension.
 *
 * The order of the aliases matters: string aliases match by prefix, so the bare
 * package name would otherwise swallow the subpath above it.
 *
 * `@scene-inspector/panel/help` is deliberately absent. The help page is a
 * document of the extension's, reached through `chrome.runtime.getURL`, and the
 * stand passes no `onOpenHelp` — so nothing here can ask for it.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@scene-inspector/panel/globals.css': source('../../packages/panel/src/globals.css'),
      '@scene-inspector/protocol': source('../../packages/protocol/src/index.ts'),
      '@scene-inspector/core': source('../../packages/core/src/index.ts'),
      '@scene-inspector/panel': source('../../packages/panel/src/index.ts'),
    },
  },
});
