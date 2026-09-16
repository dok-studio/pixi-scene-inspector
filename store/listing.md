# Chrome Web Store listing

Everything the submission form asks for, written down so the next submission
does not start from a blank page. English throughout: the public listing is
English, whatever language the panel is set to.

Character counts are the store's limits, checked by `scripts/listing.test.mjs`.

---

## Store listing tab

**Name** (75)

```
Scene Inspector for PixiJS
```

**Short description** (132) — the same sentence as `manifest.json`, which is
where the store reads it from anyway.

```
Inspect and edit the scene graph and textures of PixiJS applications — v6, v7 and v8.
```

**Category:** Developer Tools
**Language:** English

**Detailed description** (16 000)

```
Scene Inspector adds a PixiJS tab to Chrome DevTools. Open it on a page that runs a PixiJS application and you get the scene as the renderer sees it — the tree, the textures behind it, and what a frame costs.

Works with PixiJS v6, v7 and v8.

SCENE
• The scene graph as a tree, with the same names and the same nesting the application gave it.
• Click a node to edit it: position, scale, rotation, alpha, tint, blend mode, visibility, and the rest of what its type carries. Changes land in the running application immediately.
• Pick a node by clicking the canvas, and see the full stack of what is under the cursor rather than only the topmost hit.
• A highlight drawn over the canvas follows the selection, with a free transform for dragging, scaling and rotating a node in place.
• Dedicated sections for Text and for Spine — styles, tracks, skins, animations, and a scrub that works while the application is paused.
• Bookmark a node to find it again after a reload.

ASSETS
• Every texture the renderer holds: dimensions, GPU format, memory, and a preview.
• Atlas frames, listed and previewed one by one.
• For any texture, which nodes in the scene are drawing it.

STATS
• Frame time, render time and the worst frame in the window, live.
• Draw calls, texture counts, GPU memory and node counts.
• An optional recording behind the charts, for looking at a spike after it has passed.

THE PANEL
• English and Ukrainian.
• Light and dark themes, an accent colour, and keyboard shortcuts you can rebind.
• A help page ships with the extension — open it from the ? button in the panel's bar. No internet connection needed to read it.

PRIVACY
The extension collects nothing, sends nothing, and has no servers. It declares no Chrome permissions. Everything it reads stays in your browser, and the settings it remembers stay on your machine. The full policy is in the repository.

OPEN SOURCE
MIT licensed. The source, the issue tracker and the licence notices are at github.com/dok-studio/pixi-scene-inspector

Derived in part from PixiJS DevTools (github.com/pixijs/devtools), MIT licensed, © 2024 PixiJS. What came from where is listed in the NOTICE file that ships inside the extension.

This project is not affiliated with, endorsed by, or sponsored by the PixiJS project. PixiJS is a trademark of its respective owners.
```

---

## Privacy tab

**Single purpose**

```
Inspect and edit the scene graph and GPU textures of PixiJS applications from a DevTools panel.
```

**Justification — host access (`content_scripts` matching `<all_urls>`)**

```
The extension has to know whether a page runs PixiJS, and it cannot know that in advance: any page might, and the panel's answer to "is there anything to inspect" must not depend on the page's load order. So a single content script runs at document_start and places the inspector's host object on the page's window, before the page creates its application. A host that arrives later is too late to see the application being built.

The script does nothing else. It reads nothing on its own, stores nothing, and makes no network requests. Everything after that point happens only while the PixiJS DevTools panel is open, and only in response to the panel asking.

The extension declares no Chrome permissions of any kind — no storage, no tabs, no scripting, no host permissions.
```

**Remote code:** No, I am not using remote code.

```
Everything the extension runs is in the package. The panel talks to the page through chrome.devtools.inspectedWindow.eval, and every expression it evaluates is built inside the extension from a typed command map — there is no string protocol and nothing is fetched to be executed.
```

**Data usage:** none of the categories are collected.

Certifications, all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/dok-studio/pixi-scene-inspector/blob/main/PRIVACY.md
```

---

## Distribution tab

- **Visibility:** Unlisted for the first submission.
- **Pricing:** free.
- **Countries:** all.

---

## Images

Under `store/`, sized as the store asks:

| File | Size | Notes |
| --- | --- | --- |
| `icon-128.png` | 128×128 | the artwork inset to 96×96, transparent margin around it |
| `tile-440x280.png` | 440×280 | the small promotional tile |
| `screenshots/01-scene.png` | 1280×800 | Scene: tree, selection, highlight on the canvas |
| `screenshots/02-spine.png` | 1280×800 | Scene: a Spine node, with the bookmark list open under the tree |
| `screenshots/03-assets.png` | 1280×800 | Assets: the texture grid and the selected texture |
| `screenshots/04-stats.png` | 1280×800 | Stats: the charts during play |

The extension's own icons (`apps/chrome/public/icons/`) are full-bleed and stay
that way — `icon-128.png` is the store's copy and the only one with a margin.

Screenshots have to be exactly 1280×800, full bleed, with no padding and no
rounded corners — the store rejects anything else. On a display scaled to 125%
that is a 1024×640 CSS frame, so a capture of the browser viewport at its
natural size is not the right number of pixels; check the dimensions of the
file rather than the look of it. `scripts/listing.test.mjs` checks them too.

---

## Test instructions for the reviewer

```
No account or credentials are needed.

1. Open any page that runs a PixiJS application (v6, v7 or v8). For example: https://pixijs.com/8.x/examples
2. Open Chrome DevTools and choose the "PixiJS" tab.
3. The scene tree appears on the left; click a node to edit its properties on the right, or use the picker button to select a node by clicking the canvas.
4. The Assets tab lists the renderer's textures; the Stats tab shows frame and render time while the application runs.

A tab that was already open when the extension was installed has no inspector in it — the panel says so and asks for a reload. Reload the page and the panel connects.
```
