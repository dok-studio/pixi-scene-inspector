# Privacy Policy

**Scene Inspector for PixiJS** — last updated 16 September 2026.

## The short version

The extension collects nothing, sends nothing, and has no servers. Everything it
reads stays inside your browser, and everything it remembers stays on your
machine.

## What the extension does not do

- It does not collect, transmit, sell or share any data — not personally
  identifiable information, not health or financial information, not
  authentication information, not personal communications, not location, not
  your browsing history, not your web page content, and not your activity.
- It contains no analytics, no telemetry, no crash reporting and no advertising.
- It loads no remote code. Everything it runs is in the package you installed
  from the Chrome Web Store.
- It makes no network requests of its own, to us or to anyone else.

## What it stores, and where

The panel remembers how you have set it up: the interface language, the theme
and accent colour, which sections are open, the panel's split and strip sizes,
your keyboard shortcuts, the polling rate, the overlay style, the picker depth,
and your bookmarks.

All of it is kept in the `localStorage` of the extension's own pages — that is,
on your computer, in your browser profile. It is never uploaded. Removing the
extension removes it.

Bookmarks hold the position of a node inside the inspected application's scene
graph, so that the same node can be found again after a reload. They hold
nothing from the page beyond that.

## What it reads

While the **PixiJS** panel is open in DevTools, the extension reads the scene
graph, the renderer's statistics and the textures of the page you are
inspecting, and shows them to you. This happens in the page, in your browser,
and the result is displayed in the panel. Nothing is stored and nothing leaves
the browser.

Two details worth naming:

- A content script runs on every page. It does one thing: it places the
  inspector's host object on the page's `window`, before the page creates its
  application. Which page uses PixiJS cannot be known in advance, and a host
  that arrives after the application does is too late to be useful. The script
  reads nothing on its own and sends nothing anywhere.
- When the Spine section of the panel is open, the inspector may ask the
  **inspected page** to re-read a skeleton file that the page had already
  loaded, using the page's own network stack, in order to list the animations
  inside it. The request goes to the page's own asset, not to us, and the
  response is only read to fill the panel.

## Permissions

The extension declares no Chrome permissions at all. It uses the DevTools APIs
that are available to any DevTools extension, and the content script described
above.

## Changes

If this policy ever changes, the new version will be published in this file, in
the extension's repository, with a new date at the top.

## Contact

Questions and reports go to the issue tracker:
<https://github.com/dok-studio/pixi-scene-inspector/issues>
