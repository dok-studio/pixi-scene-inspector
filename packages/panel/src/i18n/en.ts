/**
 * Every string the panel says, in the language it is written in.
 *
 * **Not here:** a PixiJS property name (`Position`, `Word wrap`), a node or
 * element type (`Sprite`, `Container`), a select value the page is handed back
 * (`left`, `bold`, `miter`), and everything the property panel draws around
 * them. That vocabulary is the one PixiJS's own documentation is written in,
 * open in the tab next to this one — see docs/architecture.md §3.14 for the
 * full boundary and the reasoning.
 *
 * Flat dotted keys, namespaced by where they are said. `as const` so the keys
 * are literals: `uk.ts` is typed off this object, and a key missing there does
 * not build.
 */
export const en = {
  // ── settings ─────────────────────────────────────────────────────────────
  //
  // The label column of the property grid is eleven characters wide and wraps
  // rather than shortens (`propertyEntry.tsx`). Wrapping happens between
  // words, so a phrase may be as long as it likes — but **no single word may
  // run past eleven characters**, or `break-words` will cut it in half.
  'settings.open': 'Settings',
  'settings.close': 'Close',
  'settings.reset': 'Reset settings',
  'settings.tab.general': 'General',
  'settings.tab.colors': 'Colors',
  'settings.tab.hotkeys': 'Hotkeys',
  'settings.language': 'Language',
  'settings.customTab': 'Custom tab',
  'settings.pollRate': 'Poll rate',
  'settings.pickerDepth': 'Picker depth',
  'settings.bookmarkLimit': 'Bookmark limit',
  'settings.colorTheme': 'Color theme',

  // The four accents are stored as these very words (`accentTheme.ts`), so
  // what is translated is only what is shown — see `optionLabels` in
  // `propertyTypes.ts`. The poll rates are not here at all: `Max` / `Normal` /
  // `Min` read as a scale in either language, and translating one end of it
  // and not the other is how a scale stops reading as one.
  'settings.accent.Blue': 'Blue',
  'settings.accent.Yellow': 'Yellow',
  'settings.accent.Red': 'Red',
  'settings.accent.Green': 'Green',

  // ── hotkeys ──────────────────────────────────────────────────────────────
  //
  // A `[[…]]` clause in a tip is parsed by `tooltip.tsx` as **first word =
  // verb, rest = combination**. So the verb before a combination must be one
  // word in every language, and the combination itself is never translated:
  // `Alt` and `H` are what is printed on the key.
  'settings.hotkeys.enabled': 'Enabled',
  'settings.hotkeys.press': 'Press a key…',
  'hotkey.picker': 'Picker',
  'hotkey.highlight': 'Highlight',
  'hotkey.wrapBox': 'Wrap box',
  'hotkey.axes': 'Axes',
  'hotkey.transform': 'Transform',
  'hotkey.counts': 'Node counts',

  // ── the two tab strips ───────────────────────────────────────────────────
  //
  // Sections of this panel rather than names out of PixiJS, so they are words
  // and get translated. What stays are the two that name a class — `Text` and
  // `Spine` — and they have no entry here at all; the strips fall back to the
  // raw string, which is the class's own name (§3.14).
  //
  // The strings themselves stay the identity: `activeTab` in storage, the
  // `tab` a section declares, and the comparison that decides which is open.
  'tab.scene': 'Scene',
  'tab.assets': 'Assets',
  'tab.stats': 'Stats',
  'tab.custom': 'Custom',
  'tab.properties': 'Properties',

  // ── the Custom tab ───────────────────────────────────────────────────────
  //
  // The chips over the columns. Each panel names itself through `tab.*` above,
  // so what is here is only what the chips say **about** them.
  // Both names come from `tab.*`, and a translated name is not declined here:
  // the slot sits after a colon, or inside quotation marks, for the reason the
  // rest of the panel does it — see §3.14 on why there are no plurals either.
  'custom.anchor': 'Always shown — the other panels are read against the scene',
  'custom.show': 'Show {panel}',
  'custom.swap': 'Show in place of {other}: {panel}',
  'custom.hide': 'Hide {panel}',
  'custom.only': 'The only panel beside the scene — pick another to change it',

  // ── navbar ───────────────────────────────────────────────────────────────
  'navbar.reload': 'Reload the inspector',
  'navbar.theme': 'Toggle theme',
  'navbar.theme.light': 'Light',
  'navbar.theme.dark': 'Dark',
  'navbar.theme.system': 'System',
  // The only help string in this dictionary: the button is a control of the
  // bar. Everything the page itself says lives in `features/help/content`,
  // which is a document rather than a table of labels.
  'navbar.help': 'Help',

  // ── the screens with no scene on them ────────────────────────────────────
  // Four states rather than one "no PixiJS here", because what to do about it
  // differs in each. Written with the help document's marks — a backtick is a
  // code span — and drawn by the same `Prose`.
  'screen.connecting.title': 'Connecting',
  'screen.connecting.body': 'Polling the page…',
  'screen.noHost.title': 'Reload the page',
  'screen.noHost.body':
    'The inspector was not present when this page loaded. Reload the tab to inspect it.',
  'screen.notDetected.title': 'PixiJS not detected',
  'screen.notDetected.body':
    'This page exposes no `__PIXI_DEVTOOLS__`, no `__PIXI_APP__`, and no renderer or stage — neither in the top-level window nor in any of its iframes.',
  'screen.unsupported.title': 'Unsupported version',
  'screen.unsupported.body':
    'An application was found ({version}), but its version is outside the supported range (v6–v8).',
  'screen.unsupported.bodyUnknown':
    'An application was found, but its version is outside the supported range (v6–v8).',
  // Opens the help page at the section about being found, which is the one
  // thing every screen above has in common.
  'screen.help': 'How the panel finds an application',

  // ── scene: the tree and what hangs under it ──────────────────────────────
  'scene.search': 'Search',
  'scene.selectNode': 'Select a node in the tree.',
  'scene.unpinAll': 'Unpin every gizmo pinned in the tree',
  'scene.picker.tip':
    'Allows you to select a node in the scene by clicking on it. [[Toggle {key}]]',
  'scene.counts.tip': 'Counts what the scene is made of, under the tree. [[Toggle {key}]]',

  'scene.delete.title': 'Delete “{name}”?',
  'scene.delete.body':
    'The node and everything under it are removed from the scene. This cannot be undone.',
  'scene.delete.confirm': 'Delete',
  'scene.delete.cancel': 'Cancel',

  'scene.node.visible': 'Toggle the visibility of the node.',
  'scene.node.bookmark':
    'Keep this node on the bookmark list under the tree, so it can be found again after the page reloads.',
  'scene.node.pin':
    'Keep the origin gizmo on this node, captioned with its name, rather than only while it is selected.',

  // The overlay's four switches. Every one of them ends in a `[[…]]` clause,
  // whose first word is the verb — one word, in every language.
  'scene.overlay.highlight':
    'Frame the selected node in the scene, and the one under the pointer. Click to cycle: filled, outline only, off. [[Cycle {key}]]',
  'scene.overlay.wrapBox': 'Draw the box the selected text wraps inside. [[Toggle {key}]]',
  'scene.overlay.axes':
    'Mark the zero of the selected and hovered nodes. Click to cycle: the arrows, the centre, off. [[Cycle {key}]]',
  'scene.overlay.transform':
    'Drag the selected node in the scene: the frame moves it, the handles scale it, and the space just outside a corner turns it. [[Toggle {key}]]',

  'scene.counts.title': 'Counts',
  'scene.counts.close': 'Close the counts',
  'scene.counts.mode.scene': 'Everything in the scene',
  'scene.counts.mode.node': 'The selected node and everything under it',
  'scene.counts.mode.both': 'The whole scene, and the selected node’s share of it',
  'scene.counts.empty': 'Nothing in the scene.',

  'scene.picked.title': 'Under cursor',
  'scene.picked.close': 'Close this list',
  // `{type}` is a PixiJS class name and is spliced in untranslated, which is
  // why the slot is named and the sentence is one string per language.
  'scene.picked.filter': 'Show only {type} nodes',
  'scene.picked.empty': 'Nothing of that kind under the click.',

  'scene.bookmarks.title': 'Bookmarks',
  'scene.bookmarks.clearAll': 'Remove every bookmark',
  'scene.bookmarks.remove': 'Remove this bookmark',

  // ── scene: hints inside the property panel, whose rows stay English ───────
  'scene.prop.pickTexture': 'Pick a loaded texture',
  'scene.prop.copyTextureId': 'Copy the texture id',
  'scene.prop.copyObject': 'Copy the object to the clipboard',
  'scene.prop.logNode': 'Log the node to the page’s console, as the live object',
  'scene.prop.copyStyle': 'Copy the style to the clipboard',
  'scene.prop.addTag': 'Add a tag',
  'scene.prop.addTagProperty': 'Add a property to this tag',
  'scene.prop.resetOnTag': 'Reset {field} on <{tag}> to default',
  'scene.prop.deleteTag': 'Delete the <{tag}> tag',

  // ── scene: hints inside the Spine section, whose text stays English ───────
  'spine.addTest': 'Build a second Spine beside this one, to try things on',
  'spine.addTrack': 'Add an empty track. Nothing starts until Play.',
  'spine.clearTracks': 'Drop every track where it stands',
  'spine.trackIndex': 'Track index',
  'spine.chooseAnimation': 'Choose an animation',
  'spine.copyAnimation': 'Copy the animation name',
  'spine.repeat': 'Repeat the animation',
  'spine.removeTrack': 'Remove this track',
  'spine.clearQueue': 'Drop everything queued behind the current animation',
  'spine.copyLog': 'Copy the log to the clipboard',
  'spine.changeSkeleton': 'Change which skeleton this node carries',
  'spine.applySetup': 'Put this setup on the skeleton',
  // The API name is the subject and stays; only what it is being explained as
  // is translated.
  'spine.stateTimeScale': 'AnimationState.timeScale — every track at once',

  // ── assets: the two toolbar rows, and nothing below them ─────────────────
  //
  // The grid's own readings stay English — the summary strip, the empty
  // states, `Unnamed`, and the whole texture metadata vocabulary in the pane
  // beside it. What is translated here is how the grid is *worked*: the filter,
  // the search, and what the hints explain (§3.14).
  'assets.filter': 'Filter',
  'assets.filter.gpu': 'GPU',
  'assets.filter.gpu.all': 'All',
  'assets.filter.gpu.loaded': 'GPU Loaded',
  'assets.filter.gpu.unloaded': 'GPU Unloaded',
  'assets.filter.name': 'Name',
  'assets.filter.name.all': 'All',
  'assets.filter.name.named': 'Named only',
  'assets.filter.name.unnamed': 'Unnamed only',
  'assets.search': 'Search',
  'assets.refresh': 'Refresh the textures',
  'assets.grid': 'Textures',

  // The sort **labels** are not here on purpose: `Name` and `Size` would sit
  // opposite the English `Name` and `Size` of the metadata table half a screen
  // to the right. Only what each one means is translated.
  'assets.sort': 'Sort',
  'assets.sort.latest': 'The order the renderer uploaded them in',
  'assets.sort.name': 'By the name the texture is shown under',
  'assets.sort.size': 'By what it costs on the GPU',
  'assets.sort.reverse': 'Click to reverse the order',

  'assets.selectTexture': 'Select a texture to view its properties',
  'assets.background.checker': 'Chequerboard',
  'assets.background.black': 'Black',
  'assets.background.white': 'White',
  'assets.noName': 'This texture carries no name',
  'assets.openFile': 'Double-click to open the file in a new tab',
  // The three foldable sections under the preview. `Info` is the panel's own
  // heading over the metadata table, not one of the row names inside it —
  // those are the renderer's vocabulary and stay English in every language.
  'assets.info': 'Info',
  'assets.frames': 'Frames',
  'assets.usedBy': 'Used by',

  // ── stats: the retention control and the hints, and nothing else ─────────
  //
  // Chart titles and group names stay English — they are read against the
  // renderer's own vocabulary, and the per-type charts are named after PixiJS
  // classes. What is translated is `Keep` and everything that *explains*.
  'stats.keep': 'Keep',
  'stats.keep.tip':
    'How much history the charts keep. Off by default, and off again tomorrow — recording costs the game a little on every frame, so turn it back on when you need it.',
  'stats.keep.off': 'Keep nothing: the page stops recording, and the charts are the live window only',
  'stats.keep.some': 'Keep the last {n} minutes',
  'stats.dropped': 'Samples the panel was too slow to collect — there is a hole in the history',
  'stats.pickCharts': 'Choose which charts to draw',
  'stats.minimap': 'The whole recording; drag to move the charts through it',

  // The prose over each chart's title. The longest run of text in the panel,
  // and the one place a reader is told how to *read* a number rather than what
  // it is called.
  'stats.about.fps': 'Frames the renderer drew, per second.',
  'stats.about.frameMs':
    'Milliseconds between frames. Catches the stutters a rate averaged over a second smooths away.',
  'stats.about.renderMs':
    'How much of the frame PixiJS spent inside its own render. Read against Frame time above it: the difference is everything that is not drawing — the game logic, other scripts, the browser. That is the first thing worth knowing when a frame is slow.',
  'stats.about.worstFrameMs':
    'The longest single gap between frames in the last second. Frame time is a mean, and a mean hides a stutter: one frame of 120 ms among sixty of 16 barely moves it. The distance between the two is the stutter.',
  'stats.about.filters':
    'Nodes carrying at least one filter. Each one costs a render target to switch to and back from, so a handful is often the whole reason a scene is slow. Not a node type — a filtered Container is still a Container — so nothing in the counts below would mention it.',
  'stats.about.masks':
    'Nodes carrying a mask. Each one breaks the batch either side of it, which is why the draw call count climbs faster than the node count does.',
  'stats.about.drawCalls':
    'Draw submissions per frame — roughly how many batches the scene breaks into, and the usual cause of a slow frame that is not game logic. A dash rather than a number means this renderer has no draw path the inspector recognises.',
  'stats.about.heapMB':
    'Memory the page is holding in JavaScript: objects, arrays, closures — the game and everything else running on it. Not textures and not the GPU; that is the chart below. A line that climbs and never comes back down is what a leak looks like.',
  'stats.about.gpuMB':
    'Estimated bytes the renderer textures occupy on the GPU, from their size and format.',
  'stats.about.textures': 'Textures the renderer is tracking.',
  'stats.about.texturesOnGpu':
    'How many of the renderer’s textures have actually been uploaded to the GPU.',
  'stats.about.nodes': 'Every node in the scene graph.',

  // ── shared editors: hints only ───────────────────────────────────────────
  //
  // Everything else in these controls stays English: they are drawn inside the
  // property panel, whose rows and values are PixiJS's own vocabulary. `Solid`,
  // `Gradient`, `HEX`, `R`/`G`/`B` are labels of that kind. What each control
  // *does* is the hint, and that is translated.
  'ui.color.keyword': 'This colour is a CSS keyword, not a number',
  'ui.color.pick': 'Pick a colour',
  'ui.gradient.needsTwo': 'A gradient needs two colours',
  'ui.gradient.removeStop': 'Remove this colour',
  'ui.gradient.offset': 'Where this colour sits along the ramp, 0 to 1',
  'ui.gradient.preview': 'The ramp as it will be drawn',
  'ui.gradient.vertical': 'Vertical',
  'ui.gradient.horizontal': 'Horizontal',
  'ui.gradient.radial': 'Radial',
  'ui.fill.solid': 'One colour',
  'ui.fill.gradient': 'A ramp of colours',
  'ui.textList.onePerLine': 'One item per line',
  'ui.split.drag': 'Drag to divide the two panes',
  // ── settings: the overlay's own colours ──────────────────────────────────
  // The three cards of the Colors tab, named by what the overlay draws
  // rather than by which node it draws on.
  'settings.overlay.filled': 'Filled frame',
  'settings.overlay.bare': 'Frame without fill',
  // The two runs of rows inside each of the first two.
  'settings.overlay.selected': 'Selected',
  'settings.overlay.hovered': 'Hovered',
  'settings.overlay.wrapBox': 'Wrap box',
  'settings.overlay.fill': 'Fill',
  'settings.overlay.fillAlpha': 'Fill alpha',
  'settings.overlay.outline': 'Outline',
  'settings.overlay.outlineAlpha': 'Outline alpha',
  'settings.overlay.outlineWidth': 'Outline width',

  // ── the counts strip's three modes ───────────────────────────────────────
  'scene.counts.mode.scene.label': 'Scene',
  'scene.counts.mode.node.label': 'Node',
  'scene.counts.mode.both.label': 'Both',

  // ── assets: the order row ────────────────────────────────────────────────
  'assets.sort.latest.label': 'Latest',
  'assets.sort.name.label': 'Name',
  'assets.sort.size.label': 'Size',
  'assets.order.latest.desc': 'Newest first',
  'assets.order.latest.asc': 'Oldest first',
  'assets.order.name.asc': 'A to Z',
  'assets.order.name.desc': 'Z to A',
  'assets.order.size.desc': 'Largest first',
  'assets.order.size.asc': 'Smallest first',

  // ── stats: the chart picker ──────────────────────────────────────────────
  'stats.charts': 'Charts',
  'stats.charts.all': 'All',
  'stats.charts.none': 'None',

  // ── spine: what the one button under a track is for ──────────────────────
  //
  // Four states of the same button, so all four are said in the same language:
  // a hint that changed from Ukrainian to English as a track started playing
  // was the panel telling on itself.
  'spine.chosen': 'Chosen — press Play to start it',
  'spine.play': 'Start the chosen animation',
  'spine.pause': 'Pause',
  'spine.resume': 'Resume',
  'spine.playOffline': 'Put this setup on the skeleton to play it',
} as const;
