import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Apps are in as well: the extension's one piece of `chrome.*` glue is
    // testable on a fake evaluator, and it is the layer most worth testing.
    // `.tsx` is in as well: the panel's one timing rule — fields stay on screen
    // while the next node is being read — is only observable once rendered.
    // `scripts/` is in as well: the notices the extension ships are generated
    // from the dependency tree, and the check that the committed file still
    // matches that tree is the only thing standing between a bumped dependency
    // and a stale legal notice.
    include: ['{packages,apps}/*/src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    environment: 'node',
    passWithNoTests: true,
  },
});
