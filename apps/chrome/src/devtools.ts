/**
 * The DevTools page. It has no interface of its own and exists solely to
 * register the tab — Chrome keeps it loaded for as long as DevTools is open on
 * the tab, which is why nothing expensive belongs here.
 *
 * The icon argument is empty on purpose: Chrome does not draw it in the tab
 * strip (docs/architecture.md §1), so passing a path would only add a file that
 * nothing renders.
 */
chrome.devtools.panels.create('PixiJS', '', 'panel.html');
