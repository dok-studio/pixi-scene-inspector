import { install } from '@scene-inspector/core';

/**
 * The whole page-side of the extension: put the host on the page's `window`.
 *
 * This file runs as a content script declared with `"world": "MAIN"`, so it
 * shares the global object with the application instead of the isolated world —
 * there is no `<script>` tag to inject, nothing to expose through
 * `web_accessible_resources`, and a page with a strict `script-src` cannot
 * block it. That world is also why `chrome.*` is unavailable here, and nothing
 * in this file wants it.
 *
 * `run_at: "document_start"` matters: the host must exist before the page
 * creates its application, exactly as in the playground, so the panel's answer
 * to "is there anything to inspect" never depends on load order.
 */
install(window);
