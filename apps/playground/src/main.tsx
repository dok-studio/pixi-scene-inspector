import '@scene-inspector/panel/globals.css';
import './stand/stand.css';

import { install } from '@scene-inspector/core';
import { createRoot } from 'react-dom/client';

import { keepAwake } from './stand/keepAwake.js';
import { Layout } from './stand/Layout.js';

/**
 * The stand's entry point.
 *
 * **The order below is the point of this file.** `install` runs first, in module
 * scope, before React is asked for anything:
 *
 *  - the init hooks it plants have to be in place before `Application.init()`,
 *    or a build that publishes no global is never found;
 *  - `watchLoaded` subscribes a `PerformanceObserver`, and a skeleton's `.atlas`
 *    fetched before that subscription is a skeleton the panel cannot offer;
 *  - and the panel should be able to say `not-detected` while PixiJS genuinely
 *    is not there yet, which is what the extension sees at `document_start`.
 *
 * The game is built inside an effect, so it cannot start before any of this —
 * but the ordering is load-bearing rather than incidental, and a refactor that
 * moves `install` below the render will break detection quietly.
 */
install(window);
keepAwake();

const container = document.getElementById('root');
if (container === null) throw new Error('index.html is missing its #root element');

createRoot(container).render(<Layout />);
