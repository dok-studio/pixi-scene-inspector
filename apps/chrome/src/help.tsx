import '@scene-inspector/panel/globals.css';

import { HelpPage } from '@scene-inspector/panel/help';
import { createRoot } from 'react-dom/client';

/**
 * The help page — its own extension document, opened from the panel's bar.
 *
 * Deliberately **not** importing `panel.css`. That stylesheet pins the document
 * to the height of the DevTools drawer and hides its overflow, which is right
 * for a panel and wrong for something you scroll. This page is a page.
 *
 * It talks to nothing. There is no bridge, no client and no inspected window
 * here: everything it shows is either written down or read out of the same
 * `localStorage` the panel keeps its settings in — which works because both
 * documents are served from the extension's own origin. That is also why the
 * language, the theme and the accent arrive already set.
 */
const container = document.getElementById('root');
if (container === null) throw new Error('help.html is missing its #root element');

createRoot(container).render(
  <HelpPage extensionVersion={chrome.runtime.getManifest().version} />,
);
