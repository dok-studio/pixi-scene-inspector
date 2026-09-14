# Scene Inspector for PixiJS

A DevTools extension for inspecting the scene graph and textures of PixiJS
applications. Supports **PixiJS v6, v7 and v8**.

Three tabs:

- **Scene** — scene tree, property editing, highlight and picker on the canvas,
  the full stack under a click, bookmarks, free transform, and dedicated
  sections for `Text` and Spine;
- **Assets** — GPU textures: sizes, formats, previews, atlas frames, and which
  nodes draw them;
- **Stats** — frame and render time, draw calls, memory and node counts, with
  an optional recording behind them.

The panel speaks English and Ukrainian. A help page ships with the extension and
is opened from the `?` button in the panel's bar.

> Not affiliated with the PixiJS project. PixiJS is a trademark of its respective owners.

## Status

The tabs work, the panel is localised, and the extension builds and loads into
Chrome.

## Development

```bash
npm i             # install workspace dependencies
npm test          # vitest
npm run lint      # eslint
npm run typecheck # tsc
npm run playground   # local playground on http://localhost:5173/
npm run build:chrome # extension build into apps/chrome/dist
```

The playground is a small Snake game on PixiJS v8 with the panel mounted beside
it, so the inspector can be driven end to end without loading anything into
Chrome. Its art and its two hand-written Spine skeletons are generated rather
than drawn in a tool — `npm run assets:playground` rebuilds them from
`scripts/playground-assets`, and the output is committed.

## Loading the extension

Requires Chrome 111 or newer.

1. `npm run build:chrome`
2. Open `chrome://extensions`, turn on **Developer mode**
3. **Load unpacked** → `apps/chrome/dist`
4. Open DevTools on a page with a PixiJS application — the **PixiJS** tab is
   there

A tab that was already open when the extension was installed carries no
inspector; the panel says so and asks for a reload.

## Licence

MIT — see [`LICENSE`](LICENSE).

Derived from [pixijs/devtools](https://github.com/pixijs/devtools) (MIT). The
code here was rewritten, but a good deal of it descends from that project —
the panel's component layer and stylesheet, the shape of the Scene and Assets
tabs, the node type detection, the texture format tables, the picker, the
overlay geometry and the per-type property lists. What came from where is
listed in [`NOTICE`](NOTICE).

[`THIRD_PARTY_LICENSES`](THIRD_PARTY_LICENSES) carries the licence of
everything the extension bundles. Its first four sections are written by hand —
the inheritance above, the shadcn/ui components the panel carries rather than
installs, and the icon artwork inside `react-icons`, which has a licence its
package manifest does not mention. The rest is generated from the dependency
closure of `apps/chrome` by `npm run licenses`, and a test fails if the
committed file has fallen behind the lock file.

All three ship inside the built extension, since that, and not this
repository, is the copy people install.
