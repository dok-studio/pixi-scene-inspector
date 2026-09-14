import { spawn } from 'node:child_process';

/**
 * Rebuilds both halves of the extension on change.
 *
 * There are two of them because the content script is a different kind of
 * bundle — one IIFE under a fixed name, injected into the page — and so it has
 * a config of its own. A single `vite build --watch` therefore covers the panel
 * and leaves `dist/content.js` at whatever it was, which shows up as an edit to
 * the core that reaches the panel and not the page: the panel asks for a reload
 * that cannot help.
 *
 * A script rather than one shell line: `&` backgrounds a process in sh and
 * merely separates commands in cmd.exe, where the first watcher never returns
 * and the second would never start.
 */
const builds = [['vite', 'build', '--watch'], ['vite', 'build', '--config', 'vite.content.config.ts', '--watch']];

const children = builds.map(([command, ...args]) =>
  spawn(command, args, { stdio: 'inherit', shell: true }),
);

const stop = () => {
  for (const child of children) child.kill();
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// One watcher failing leaves the other building half an extension, which is the
// state this script exists to prevent.
for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exit(code ?? 1);
  });
}
