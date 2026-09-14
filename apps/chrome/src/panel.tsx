import '@scene-inspector/panel/globals.css';
import './panel.css';

import { createBridge, createClient, Shell } from '@scene-inspector/panel';
import { createRoot } from 'react-dom/client';

import { createInspectedEval } from './transport/inspectedEval.js';

/**
 * The panel document, and the only place in the extension that talks to the
 * inspected page.
 *
 * Nothing here knows which command is being sent: the expression comes from the
 * bridge, and `inspectedWindow.eval` runs it in the page's main world — the
 * same world the content script installed the host into.
 */
const evaluate = createInspectedEval((expression, callback) =>
  chrome.devtools.inspectedWindow.eval(expression, callback),
);

const client = createClient(createBridge(evaluate));

const container = document.getElementById('root');
if (container === null) throw new Error('panel.html is missing its #root element');

/**
 * The help page, in a tab of its own, at the section that was asked for.
 *
 * Built here rather than in the panel package, which has no `chrome` to ask
 * where the extension lives. A window rather than a route: the point of a
 * separate document is that it can sit beside the game while the panel stays
 * open on it.
 *
 * The window is **named**, so the second press of `?` lands in the tab the
 * first one opened rather than piling up another copy of the document. Asking
 * for a different section of a document that is already open is a fragment
 * change, which the page handles itself — it listens for `hashchange`, because
 * on arrival the browser cannot scroll to a section React has not rendered yet.
 */
const openHelp = (section?: string): void => {
  const page = chrome.runtime.getURL('help.html');

  window.open(section === undefined ? page : `${page}#${section}`, 'scene-inspector-help');
};

createRoot(container).render(
  <Shell
    client={client}
    extensionVersion={chrome.runtime.getManifest().version}
    onOpenHelp={openHelp}
  />,
);
