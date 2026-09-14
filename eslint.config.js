import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Version checks live only in the adapters — see docs/architecture.md §3.3.
 *
 * In the previous project the version lived nowhere in particular: branches on
 * `majorVersion` were scattered across property extensions, textures, the tree
 * and the overlay. This rule makes the boundary mechanical rather than a
 * matter of discipline: needing a version check elsewhere in the core is a
 * signal to add a method to PixiAdapter instead.
 */
const versionGuard = {
  'no-restricted-syntax': [
    'error',
    {
      selector: "MemberExpression[property.name='majorVersion']",
      message:
        'Version checks are allowed only in packages/core/src/adapters/**. Add a PixiAdapter method instead of branching on the version.',
    },
    {
      selector: "Identifier[name='majorVersion']",
      message:
        'Version checks are allowed only in packages/core/src/adapters/**. Add a PixiAdapter method instead of branching on the version.',
    },
    {
      selector: "MemberExpression[property.name='major']",
      message:
        'Reading adapter.major outside the adapters is a version branch. Add a PixiAdapter method instead.',
    },
  ],
};

/**
 * The core does not depend on the real PixiJS — that is what keeps it testable
 * (docs/architecture.md §3.10). It only ever sees the scene through
 * `PixiAdapter` and `unknown`, so it runs under vitest against plain objects
 * with no browser involved.
 */
const pixiImportGuard = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'pixi.js',
          message:
            'The core works through PixiAdapter, not through pixi.js directly. The exception is tests that deliberately check the heuristics against the real library.',
        },
      ],
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Build scripts run under Node rather than in a page or a panel.
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly' },
    },
  },

  // Core: no version branches, no direct PixiJS imports.
  {
    files: ['packages/core/src/**/*.ts'],
    rules: { ...versionGuard, ...pixiImportGuard },
  },

  // Adapters: the one place where version differences are allowed.
  {
    files: ['packages/core/src/adapters/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // Core tests may check against the real PixiJS — that is their whole point.
  // Last block so it overrides the restriction above.
  {
    files: ['packages/core/src/**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
