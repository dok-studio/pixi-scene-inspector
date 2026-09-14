/**
 * The DevTools panel UI.
 *
 * The transport here is a module singleton rather than a field on a store, and
 * state is split per feature instead of living in one global store. Polling is
 * encapsulated in `useResource`, so panels do not hand-roll `setInterval` and
 * manual diffing.
 */

export type { Bridge, EvalFn } from './transport/bridge.js';
export { buildCallExpression, createBridge } from './transport/bridge.js';
export type { Client } from './transport/client.js';
export { ProtocolCallError, createClient } from './transport/client.js';
export type { ResourceOptions, ResourceState } from './transport/useResource.js';
export { useResource } from './transport/useResource.js';
export { useRevisioned } from './transport/useRevisioned.js';
export { SceneTree } from './features/scene/graph/SceneTree.js';
export { ScenePanel } from './features/scene/ScenePanel.js';
export { SceneProperties } from './features/scene/graph/SceneProperties.js';
export { AssetsPanel } from './features/assets/AssetsPanel.js';
export { ThemeProvider, useTheme } from './components/theme-provider.js';
export { Navbar } from './components/navbar/navbar.js';
export { Shell } from './shell/Shell.js';
/*
 * `HelpPage` is deliberately **not** exported here.
 *
 * This barrel is what the panel document imports, and everything it names ends
 * up in the panel's bundle. The help page is a separate document that nothing
 * in the panel renders, so putting it here would make every panel carry a few
 * dozen kilobytes of prose and schematics it will never draw. It has an entry
 * point of its own — `@scene-inspector/panel/help`.
 */
