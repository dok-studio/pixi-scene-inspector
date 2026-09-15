import type { HelpContent } from './types.js';

/**
 * The help document, in the language it is written in.
 *
 * Backticks mark a phrase that is quoting the panel — a button, a section, a
 * value it prints. Those stay **English in every language**, because they name
 * something the reader is looking at, and half of them are PixiJS's own
 * vocabulary besides (§3.14).
 *
 * Two blocks carry no prose at all: `metrics` and `hotkeys` are built from the
 * panel's own tables at render time. Anything the panel already says well, the
 * help quotes rather than restates.
 *
 * The document opens with the short version and gets longer as it goes. Someone
 * who reads only the first section should be able to use the panel; everything
 * after it is there to be arrived at — from the contents list, from `Ctrl+F`,
 * or from the panel's own `?`, which opens this page at the section for the tab
 * they are standing in.
 */
export const en: HelpContent = {
  title: 'Scene Inspector for PixiJS',
  tagline: 'Inspect and edit the scene graph of a PixiJS application.',
  contents: 'Contents',
  versionLabel: 'Version',
  disclaimer:
    'Not affiliated with the PixiJS project. PixiJS is a trademark of its respective owners.',
  hotkeysOff: '`Hotkeys` are switched off in `Settings`, so none of these fire.',

  sections: {
    // ── 1 ─────────────────────────────────────────────────────────────────
    quickStart: {
      title: 'Start here',
      blocks: [
        {
          kind: 'note',
          text: 'It works with **PixiJS v6, v7 and v8**. From **8.2** on, the library hands the application over by itself and nothing has to be done to the page; the earlier lines publish one global — [Connecting](#connecting). A version outside that range is named as an `Unsupported version` rather than left as a blank panel.',
        },
        {
          kind: 'p',
          text: 'The whole of it in five steps. Everything further down this page is detail to come back for.',
        },
        {
          kind: 'steps',
          items: [
            'Open DevTools on the page and pick the `PixiJS` tab. A panel that says it found nothing, or a version it cannot read, is [Connecting](#connecting).',
            'Click a row in the tree to select a node. It is framed on the application’s canvas, and its properties fill the pane on the right.',
            'Or go the other way: arm the {{picker}} picker and click the canvas. The node you clicked is selected, and everything **behind** it is listed in the drawer under the tree.',
            'Edit a property in place — type, or hold `Alt` and drag the field to scrub it. `Enter` commits and `Escape` rolls back.',
            'Turn on {{transform}} `Transform` and the frame on the canvas itself drags the node, scales it by the handles, and turns it from just outside a corner.',
          ],
        },

        { kind: 'h', id: 'keys', text: 'The keys' },
        { kind: 'hotkeys' },

        { kind: 'h', id: 'gotchas', text: 'Worth knowing on the first day' },
        {
          kind: 'rows',
          rows: [
            {
              term: '`Picker` or `Transform`',
              text: 'Only one of the two can be armed: both read a click on the canvas, and they read it differently.',
            },
            {
              term: 'A folded section is not polled',
              text: 'Folding what you are not reading is the cheapest thing you can do for the application’s frame rate — see [what the panel costs](#cost).',
            },
            {
              term: 'Bookmarks outlive the page',
              text: 'They are kept as **paths** through the tree rather than as ids, so a bookmarked node is one click away again after a reload.',
            },
            {
              term: 'The panel only ever asks',
              text: 'There is nothing to press after a reload, a navigation, or the application being swapped out: give it a second and it is back.',
            },
            {
              term: 'Nothing leaves the browser',
              text: 'No permissions, no server, nothing collected — see [Privacy](#privacy).',
            },
          ],
        },
      ],
    },

    // ── 2 ─────────────────────────────────────────────────────────────────
    worthKnowing: {
      title: 'Worth knowing',
      blocks: [
        {
          kind: 'p',
          text: 'What the panel can do that is not obvious from looking at it.',
        },
        {
          kind: 'cards',
          cards: [
            {
              title: 'Everything under the cursor, not just the top of it',
              text: 'One picker click lists **every** node under that point, topmost first — which is how you reach the sprite behind the full-screen invisible button that has been swallowing your clicks.',
              where: 'Scene → the picker, then the drawer under the tree',
              goes: 'scene',
            },
            {
              title: 'Bookmarks that outlive the page',
              text: 'A bookmarked node is one click away after a reload, and on every application you open the panel on, because a bookmark is a **path** rather than an id.',
              where: 'Scene → the bookmark on a tree row',
              goes: 'scene',
            },
            {
              title: 'Move the node on the canvas itself',
              text: 'With `Transform` on, the frame drags the node, the handles scale it and the space outside a corner turns it — no typing numbers into `Position` to find out where something should go.',
              where: 'Scene → the toolbar',
              goes: 'scene',
            },
            {
              title: 'Copy things out as code, not as JSON',
              text: 'The `Object` and `Style` sections write the node out as source you can paste back; double-clicking a property’s **label** copies that one field the same way.',
              where: 'Scene → the property pane',
              goes: 'properties',
            },
            {
              title: 'A control panel for Spine',
              text: 'Every track with its animation, `loop`, speed and `mix`; the skins; the queue; a log of the events the skeleton fires — and a second skeleton to try things on without touching the application’s own.',
              where: 'Scene → select a Spine node → the `Spine` tab',
              goes: 'spine',
            },
            {
              title: 'The overlay is yours to colour',
              text: 'Three frames — filled, the outline on its own, and the wrap box — each with its own colour, opacity and width, and the first two set apart for the selected node and the hovered one: a hairline for picking through a crowded scene, a thick frame for a screenshot.',
              where: 'Settings → `Colors`',
              goes: 'settings',
            },
            {
              title: 'Three panels at once, on a wide window',
              text: 'DevTools in a window of its own has more width than one tab can spend, so the scene, the textures and the frame cost can stand side by side.',
              where: 'Settings → `General` → `Custom tab`',
              goes: 'custom',
            },
          ],
        },
      ],
    },

    // ── 3 ─────────────────────────────────────────────────────────────────
    connecting: {
      title: 'Connecting',
      blocks: [
        {
          kind: 'p',
          text: 'The inspector is installed **with** the page, before it has run a line of its own. That is why there is no connect button — and why a tab that was already open when the extension was installed, updated or re-enabled carries no inspector at all.',
        },

        { kind: 'h', id: 'screens', text: 'What the panel says instead of a scene' },
        {
          kind: 'p',
          text: 'Four answers, because the fix is different in each.',
        },
        {
          kind: 'rows',
          rows: [
            {
              term: 'Connecting',
              text: 'It is asking. Give it a moment — this is also what a page mid-navigation looks like.',
            },
            {
              term: 'Reload the page',
              text: 'The inspector was not present when this page loaded, and nothing but a reload can put it there.',
            },
            {
              term: 'PixiJS not detected',
              text: 'No application was found — not in the page, and not in any of its frames. Either it has not started yet, or it keeps its application somewhere nothing can reach; the globals below are how you hand it over.',
            },
            { term: 'Unsupported version', text: 'Something was found, but outside v6–v8.' },
          ],
        },

        { kind: 'h', id: 'hooks', text: 'Most applications need nothing done to them' },
        {
          kind: 'p',
          text: 'Since **PixiJS 8.2** the library calls two hooks of its own as it starts up — `__PIXI_APP_INIT__` and `__PIXI_RENDERER_INIT__` — and the inspector is already sitting in them, because it is installed before the page has run a line of its own. Detection is turned around: nothing has to be found, the application is handed over. A minified production build that publishes nothing at all still works.',
        },
        {
          kind: 'note',
          text: 'The inspector chains whatever was in those hooks before it rather than replacing it, so another PixiJS tool — or the application’s own hook — keeps working alongside.',
        },

        { kind: 'h', id: 'globals', text: 'When the application has to say where it is' },
        {
          kind: 'p',
          text: 'On **v6 and v7**, and on 8.0 and 8.1, there are no such hooks: the application is a local variable inside a bundle, and there is nothing on the page to find. Publish **one** of these on `window` and the panel has what it needs. They are looked for in this order, and the first one found wins.',
        },
        {
          kind: 'rows',
          rows: [
            {
              term: '__PIXI_DEVTOOLS__',
              text: 'An object carrying any of `app`, `stage`, `renderer` and `pixi`. The explicit way, and it overrides every guess below. `pixi` is the library module itself — worth passing where you have it, because it is what lets `Frames` read an atlas on v6 and v7.',
            },
            {
              term: '__PIXI_APP__',
              text: 'The `Application`. Its stage and renderer are read off it, so on most applications this one line is the whole job.',
            },
            {
              term: '__PIXI_STAGE__',
              text: 'The root container, for something built without an `Application`.',
            },
            { term: '__PIXI_RENDERER__', text: 'The renderer on its own.' },
          ],
        },
        {
          kind: 'note',
          text: 'Set it **after** the application exists. An empty `__PIXI_DEVTOOLS__ = {}` does not count as a find — the panel keeps looking rather than latching on to nothing — so declaring the global early and filling it in later is fine.',
        },

        { kind: 'h', id: 'frames', text: 'An application inside a frame' },
        {
          kind: 'p',
          text: 'The top-level window is searched first and then its frames, so an application in an `<iframe>` of the same origin is found with nothing extra done. A frame from another origin cannot be read by anybody and is skipped — that is ordinary, not a failure, and the panel simply carries on looking elsewhere.',
        },
      ],
    },

    // ── 4 ─────────────────────────────────────────────────────────────────
    scene: {
      title: 'Scene',
      blocks: [
        {
          kind: 'p',
          text: 'The scene graph on the left, the selected node’s properties on the right. Selecting a node in the tree marks it on the application’s canvas; hovering a row marks it too, in the second colour.',
        },
        {
          kind: 'diagram',
          diagram: 'scene',
          callouts: [
            {
              n: 1,
              name: 'The logo',
              text: 'Hover it for two lines: the PixiJS version the page is running, and the inspector’s own. Clicking it opens this project’s repository.',
            },
            {
              n: 2,
              name: 'The three tabs',
              text: '`Scene`, `Assets` and `Stats`. Only the open one is mounted, so the other two ask the page for nothing at all.',
            },
            {
              n: 3,
              name: 'The bar’s buttons',
              text: 'Reload the inspector, the light/dark theme, `Settings`, and this page — last in the row, and it opens at the section for the tab you are on. The reload restarts the panel, not the page.',
            },
            {
              n: 4,
              name: 'The tree toolbar',
              text: 'Six switches for what is drawn over the application’s canvas, each with a key of its own.',
            },
            {
              n: 5,
              name: 'Search',
              text: 'Narrows the tree as you type. The button beside it appears only once a gizmo is pinned, and unpins them all.',
            },
            {
              n: 6,
              name: 'The buttons on a row',
              text: 'Visibility, a bookmark, and a pin that keeps the origin gizmo on that node.',
            },
            {
              n: 7,
              name: 'The drawer',
              text: '`Under cursor` appears after a picker click and lists everything under that point, topmost first, so a node is still reachable even when another one covers it. The drawer can be folded and dragged taller.',
            },
            {
              n: 8,
              name: 'Bookmarks',
              text: 'Nodes bookmarked to reach again in one click — even deep in the tree, or after the page has reloaded. The bookmark on a row adds a node here, and the `✕` takes it off.',
            },
            {
              n: 9,
              name: 'Counts',
              text: 'A census of the scene by class: how many nodes of each, with the selected node’s share beside it.',
            },
            {
              n: 10,
              name: 'The property tabs',
              text: '`Properties` always; `Text` and `Spine` appear on the nodes that have them.',
            },
            {
              n: 11,
              name: 'The sections',
              text: 'Fold one and it stops being polled — folding what you are not reading is how you make the panel cost the application less.',
            },
          ],
        },
        { kind: 'h', id: 'toolbar', text: 'The toolbar over the tree' },
        {
          kind: 'rows',
          rows: [
            {
              term: '{{picker}} Picker',
              text: 'A click on the application’s canvas selects a node. If more than one thing is under the point, the drawer opens with the whole stack.',
            },
            {
              term: '{{highlight}} Highlight',
              text: 'Frames the selected node, and whatever the pointer is over. Click to cycle three states: filled, the outline on its own, then off. The two looks are coloured separately in `Settings`, so the outline on its own can be as loud as it needs to be. Filled by default.',
            },
            {
              term: '{{wrapBox}} Wrap box',
              text: 'Draws the box a `Text` wraps inside.',
            },
            {
              term: '{{axes}} Axes',
              text: 'Marks where a node’s zero actually is. Click to cycle three states: the arrows, then just the centre, then off.',
            },
            {
              term: '{{transform}} Transform',
              text: 'The frame moves the node, the handles scale it, the space just outside a corner turns it.',
            },
            {
              term: '{{nodeCounts}} Node counts',
              text: 'Opens the census under the tree — what the scene is made of, by class.',
            },
          ],
        },
        {
          kind: 'note',
          text: '`Picker` and `Transform` cannot be armed together: one interprets a click on the canvas as "tell me what is here", the other as "move this". Turning on either turns the other off.',
        },

        { kind: 'h', id: 'tree', text: 'The tree' },
        {
          kind: 'rows',
          rows: [
            { term: 'Search', text: 'Narrows the tree to matching rows as you type.' },
            {
              term: 'Rename',
              text: 'Press `Enter` on the focused row. `Enter` again commits, `Escape` abandons it.',
            },
            { term: 'Reparent', text: 'Drag a row onto another. Drops on empty space are ignored.' },
            {
              term: 'Delete',
              text: '`Delete` or `Backspace` on the focused row — and it asks first, because the node and everything under it go, with nothing to undo it. The stage itself cannot be deleted.',
            },
          ],
        },
        {
          kind: 'image',
          diagram: 'treeRow',
          title: 'A tree row with its three buttons on the right',
        },
        {
          kind: 'p',
          text: 'Each row carries three buttons on its right: {{eye}} the **eye** toggles `visible`; {{bookmark}} the **bookmark** adds the node to the list; {{pin}} the **pin** keeps the origin gizmo on it, captioned with its name, even when something else is selected.',
        },

        { kind: 'h', id: 'underCursor', text: 'Under cursor' },
        {
          kind: 'image',
          diagram: 'underCursor',
          title: 'The `Under cursor` drawer, with its filters and the nodes it found',
        },
        {
          kind: 'p',
          text: 'One picker click asks the page what is under that point and lists all of it, topmost first — so a node hidden behind another is still one click away. The topmost is selected for you. The chips filter the list to `Container`, `Sprite`, `Graphics`, `Spine` or `Text`, and the count then reads `shown / total`.',
        },
        {
          kind: 'note',
          text: 'The list only appears when the click found **more than one** node — with a single hit there is nothing to choose between, so the node is simply selected. How deep one click is allowed to look is `Picker depth` in `Settings`.',
        },

        { kind: 'h', id: 'bookmarks', text: 'Bookmarks' },
        {
          kind: 'image',
          diagram: 'bookmarks',
          title: 'The `Bookmarks` drawer, with the nodes kept on the list',
        },
        {
          kind: 'p',
          text: 'A bookmark is stored as the node’s **path** through the tree, not as an id, and ids are reissued on every page load. That is what lets a bookmark survive a reload — and why a bookmark from another application simply does not show: the list draws only the rows that resolve in the scene in front of you. The tooltip on a row is its full path.',
        },

        { kind: 'h', id: 'counts', text: 'Counts' },
        {
          kind: 'image',
          diagram: 'counts',
          title: 'The `Counts` strip, with the mode switch and a figure per class',
        },
        {
          kind: 'p',
          text: 'What the scene is made of, by class, biggest first, with a `Total` on top. Three modes: `Scene` counts everything, `Node` counts the selected node and everything under it, and `Both` shows the whole scene with the selected node’s share of it beside each figure.',
        },
      ],
    },

    // ── 5 ─────────────────────────────────────────────────────────────────
    properties: {
      title: 'Properties',
      blocks: [
        {
          kind: 'p',
          text: 'The right-hand pane. `Properties` is always there; `Text` and `Spine` appear beside it on the nodes that have them, and a tab you were on is remembered even while a node without it is selected.',
        },
        { kind: 'h', id: 'editors', text: 'The editors' },
        {
          kind: 'rows',
          rows: [
            {
              term: 'Numbers',
              text: 'Type, use the arrows, the arrow keys, or the mouse wheel. **Hold `Alt` and drag the field** to scrub the value continuously — the whole panel shows the scrub cursor while `Alt` is down. `Enter` commits, `Escape` rolls back, and bad input turns the border red rather than writing anything.',
              key: 'Alt + drag',
            },
            { term: 'Ranges', text: 'A number field and a slider on the same value.' },
            {
              term: 'Colours',
              text: 'A swatch that opens a picker with a hex field and `R`/`G`/`B` channels. A colour the application set as a CSS keyword says so and leaves the channels alone.',
            },
            {
              term: 'Fills',
              text: 'A colour, or a gradient: stops with offsets from 0 to 1, a direction of vertical, horizontal or radial, and a live preview of the ramp.',
            },
          ],
        },

        { kind: 'h', id: 'copying', text: 'Copying into code' },
        {
          kind: 'rows',
          rows: [
            {
              term: 'One field',
              text: 'Double-click a property’s **label**. It flashes and `key: value,` is on the clipboard.',
              key: 'Double-click',
            },
            {
              term: 'The whole node',
              text: 'The `Object` section at the foot of `Properties` writes the node’s transform out as source, with a copy button in its heading.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'A folded section is not polled — see [what the panel costs](#cost).',
        },
      ],
    },

    // ── 6 ─────────────────────────────────────────────────────────────────
    text: {
      title: 'Text',
      blocks: [
        {
          kind: 'rows',
          rows: [
            { term: 'Font', text: 'Family, size, style, weight, letter spacing, line height.' },
            {
              term: 'Fill',
              text: 'One colour, or a gradient — the band itself carries the switch between them.',
            },
            {
              term: 'Stroke',
              text: 'Colour, width and join. The band has a switch: turn the stroke off and the three rows go with it, and turn it back on and the values you had come back.',
            },
            {
              term: 'Shadow',
              text: 'Colour, alpha, blur, angle and distance, behind a switch of its own.',
            },
            { term: 'Layout', text: 'Alignment, padding, resolution and word wrap.' },
          ],
        },
        {
          kind: 'note',
          text: 'Fields that cannot apply are not drawn: `Wrap width` appears only once word wrap is on. A row that is missing is a row this node has no use for.',
        },
      ],
    },

    // ── 7 ─────────────────────────────────────────────────────────────────
    spine: {
      title: 'Spine',
      blocks: [
        {
          kind: 'p',
          text: 'Select a Spine node and the `Spine` tab appears.',
        },
        {
          kind: 'note',
          text: 'The rule the whole tab is built on: **choosing an animation is a choice, not a command.** A track is added empty, an animation sits on it as pending, and nothing reaches the skeleton until you press play. Nothing is started behind your back.',
        },

        { kind: 'h', id: 'skeleton', text: 'Skeleton' },
        {
          kind: 'rows',
          rows: [
            {
              term: 'skeleton',
              text: 'Which skeleton the node carries. The picker searches what the page has loaded, and accepts a name you type where the list came up short.',
            },
            {
              term: 'Apply',
              text: 'Swapping a skeleton rebuilds the animation state, so the skeleton and its tracks go down to the page **together**, on this button. Until then the section says `not on the scene yet`.',
            },
            { term: 'skin', text: 'One at a time, with `—` for none.' },
            { term: 'speed', text: '`AnimationState.timeScale` — every track at once.' },
          ],
        },

        { kind: 'h', id: 'tracks', text: 'Tracks' },
        {
          kind: 'rows',
          rows: [
            {
              term: 'Index',
              text: 'Editable. Moving a running track clears the old index and restarts on the new one; an index already taken is refused.',
            },
            { term: 'Animation', text: 'A searchable list, each name with its duration.' },
            {
              term: 'loop',
              text: 'Written straight onto the running entry — it does not restart the animation.',
            },
            {
              term: 'Scrub',
              text: 'Drag the bar to move through the animation. It pauses the track for the length of the drag and resumes at the speed it had — **and it works on a paused scene**, because the page applies the pose and asks for one frame.',
            },
            {
              term: 'speed · alpha · mix',
              text: '`TrackEntry.timeScale`, `.alpha` and `.mixDuration` on that track alone.',
            },
            {
              term: 'Queue',
              text: 'What the application has queued behind the current animation, and a button to drop all of it.',
            },
          ],
        },

        { kind: 'h', id: 'events', text: 'Events' },
        {
          kind: 'p',
          text: 'A log of what the skeleton fires — `start`, `interrupt`, `end`, `complete`, `dispose` and the application’s own named events with their payloads. It is copyable in one button, which is what makes it worth pasting into a bug report.',
        },
        {
          kind: 'note',
          text: 'The listener exists only while the section is open, so the log begins when you open it, not when the page loaded. Open it first, then make the thing happen.',
        },

        { kind: 'h', id: 'testSpine', text: 'Test setups' },
        {
          kind: 'p',
          text: '`Add test Spine` builds a **second** skeleton beside the application’s own and gives it a tab. Experiment there and the application’s node is never written to; the tabs switch which one is on screen, and removing a test takes it back out of the scene and restores the original’s visibility exactly as it was.',
        },
      ],
    },

    // ── 8 ─────────────────────────────────────────────────────────────────
    assets: {
      title: 'Assets',
      blocks: [
        {
          kind: 'p',
          text: 'Every texture the renderer is holding. Thumbnails are fetched only for the tiles actually on screen, and only once each, so an application with hundreds of textures costs no more to look at than one with ten.',
        },
        {
          kind: 'diagram',
          diagram: 'assets',
          callouts: [
            {
              n: 1,
              name: 'What to show',
              text: '`Filter` narrows by whether a texture is on the GPU and by whether it has a name. Search matches every word you type, in any order. The funnel goes coloured while a filter is on, so "nothing here" never gets mistaken for "everything is hidden".',
            },
            {
              n: 2,
              name: 'In what order',
              text: '`Latest`, `Name` or `Size`, and a button that says the direction in words — `Newest first`, `A to Z`, `Largest first` — rather than leaving it to an arrow.',
            },
            {
              n: 3,
              name: 'The grid',
              text: 'Arrow keys, `Home` and `End` move the selection; `Escape` clears it. Clicking the selected tile deselects it. The caption band is coloured when the texture is on the GPU.',
            },
            {
              n: 4,
              name: 'The summary',
              text: 'How many textures, how many on the GPU, and what they cost. A `+` means some format could not be measured, so the total is a floor rather than the answer.',
            },
            {
              n: 5,
              name: 'The preview',
              text: 'Fit to the box, on a chequerboard, black or white — whichever makes the alpha readable. **Double-click opens the file it was loaded from** in a new tab, where there is a file to open.',
            },
            {
              n: 6,
              name: 'Info',
              text: 'What the texture is, down to what it cost and where it came from. `unknown` is an honest answer, not a failure: it cannot be known from here. The section folds, and it is worth folding: eighteen rows is the whole height of the pane.',
            },
            {
              n: 7,
              name: 'Frames',
              text: 'The regions cut out of a sheet, each with its size and its position in the source’s own texels. Hovering a row outlines that region on the preview above — the quickest way to find out why a sprite is showing next door’s pixels. It opens folded and is only asked for while open, because the question is an expensive one.',
            },
            {
              n: 8,
              name: 'Used by',
              text: 'Which nodes in the scene are drawing this texture. Click one and the panel selects it and switches to `Scene` — the way back from a picture to the thing that draws it. An empty list on an atlas page is worth a second look: nothing in the scene is using what you are paying to keep on the GPU.',
            },
          ],
        },
      ],
    },

    // ── 9 ─────────────────────────────────────────────────────────────────
    stats: {
      title: 'Stats',
      blocks: [
        {
          kind: 'p',
          text: 'What the frame is costing, as it happens. Opening the tab is what starts the measuring, and leaving it is what stops it — there is no switch to remember, and a closed tab costs the application nothing.',
        },
        {
          kind: 'diagram',
          diagram: 'stats',
          callouts: [
            {
              n: 1,
              name: 'Keep',
              text: 'How much history to record: off, or the last 5 to 20 minutes. Off by default, **and off again tomorrow** — recording costs the application a little on every frame, so it is opt-in each day rather than something left running.',
            },
            {
              n: 2,
              name: 'Paused, and back to Live',
              text: 'Scroll back through the recording and the charts stop following the application; the button puts them back on the live edge. `N missed` means the panel was too slow to collect some samples, so there is a hole rather than a smooth lie.',
            },
            {
              n: 3,
              name: 'Which charts',
              text: 'Choose what is drawn, grouped, with `All` and `None`. A chart you switch off stays off; one the panel has never seen before arrives switched on.',
            },
            {
              n: 4,
              name: 'The minimap',
              text: 'The whole recording at once, reduced by **peak** so a spike survives being shrunk. Drag it to move the charts through the history; drag to the end to follow the application again. It appears only once there is more history than fits.',
            },
            {
              n: 5,
              name: 'The clock',
              text: 'The wall time at both edges of what you are looking at, with the moment under the pointer in the middle.',
            },
            {
              n: 6,
              name: 'The groups',
              text: '`Rendering`, `Memory` and `Scene nodes`. Fold one and its polling stops with it.',
            },
            {
              n: 7,
              name: 'A chart',
              text: 'The title carries an explanation, the big figure is the current reading, and the ceiling, `max` and `min` are printed on the canvas. **Hover any chart and every chart** moves its reading to that same instant — which is how you see that the frame time spike and the draw-call spike are the same event.',
            },
          ],
        },

        { kind: 'h', id: 'charts', text: 'The charts' },
        {
          kind: 'p',
          text: 'These are the panel’s own descriptions, the ones shown on each chart’s title. Beyond them there is one chart per node type the scene has ever held, named after the PixiJS class.',
        },
        { kind: 'metrics' },
        {
          kind: 'note',
          text: '`Draw calls` shows a dash rather than a zero where the renderer has no draw path the inspector recognises: a real zero means nothing was drawn, and the two must not look alike.',
        },
      ],
    },

    // ── 10 ────────────────────────────────────────────────────────────────
    custom: {
      title: 'Custom',
      blocks: [
        {
          kind: 'p',
          text: 'A fourth tab that holds several of the others at once, side by side. DevTools opened in a window of its own gives the panel more width than one tab can spend, and the scene, the textures drawing it and the cost of the frame are usually read together.',
        },
        {
          kind: 'p',
          text: 'It appears on its own as soon as the panel is wide enough to hold two panels side by side, and goes again when it is not. If you would rather not be offered it at all, switch it off in Settings → `General` → `Custom tab`.',
        },
        {
          kind: 'diagram',
          diagram: 'custom',
          callouts: [
            {
              n: 1,
              name: 'The tab',
              text: 'Present only while the setting is on **and** the panel is wide enough. Narrow the window past that and it goes, leaving you on `Scene`; widen it again and you are back where you were, with the same panels.',
            },
            {
              n: 2,
              name: 'Which panels',
              text: 'A chip per panel: lit means a column on screen. `Scene` is always one of them and cannot be switched off. Hover a chip and it says what clicking it will do.',
            },
            {
              n: 3,
              name: 'The dividers',
              text: 'Drag to give a column more room. The layout is remembered **per set of panels**, so dropping one and putting it back does not find the others where a different arrangement left them. No column goes below the width it needs to be read at.',
            },
            {
              n: 4,
              name: 'The panels themselves',
              text: 'Each column is the whole tab, with its own toolbars and its own inner split — not a reduced version of it. Selecting a node in the tree fills the properties beside it as usual, and following a texture to a node that draws it now just selects it, since the scene is already in front of you.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'Where the panel has room for only two columns, clicking a panel that is off **replaces** the one already showing rather than adding a third. Widen the panel and a click adds again. So there is no width at which some panel is out of reach.',
        },
        {
          kind: 'note',
          text: 'An open `Custom` tab costs the application what all of its columns cost, at once — see [what the panel costs](#cost).',
        },
      ],
    },

    // ── 11 ────────────────────────────────────────────────────────────────
    settings: {
      title: 'Settings',
      blocks: [
        { kind: 'h', id: 'general', text: 'General' },
        {
          kind: 'rows',
          rows: [
            { term: 'Language', text: 'English or Ukrainian, applied immediately.' },
            {
              term: 'Custom tab',
              text: 'Whether to offer the fourth tab, which holds several panels side by side. On, and it shows up by itself on a panel wide enough for two of them — switch it off to keep the strip to three whatever the width. See `Custom`.',
            },
            {
              term: 'Poll rate',
              text: '`Max`, `Normal` or `Min` — how hard the panel is allowed to lean on the page. One setting scales every interval at once; drop it to `Min` when the application is struggling and you still want to watch.',
            },
            {
              term: 'Picker depth',
              text: 'How many times one picker click may ask what is under it. Raise it to reach further down a deep stack.',
            },
            {
              term: 'Bookmark limit',
              text: 'How many bookmarks are kept, across every page the panel has been opened on.',
            },
          ],
        },

        { kind: 'h', id: 'colors', text: 'Colors' },
        {
          kind: 'p',
          text: 'The panel’s own accent — blue, yellow, red or green — and then the overlay itself, a card per frame: the filled highlight, the same highlight with no fill under it, and the wrap box. Each card holds a colour, an alpha and a width; the first two hold a set for the selected node and a set for the hovered one. Click a card’s heading to fold it away.',
        },

        { kind: 'h', id: 'hotkeys', text: 'Hotkeys' },
        {
          kind: 'p',
          text: 'Every binding can be changed: press the button and then the key you want. There is also one switch that turns them all off, for the application that wants `Alt` and those letters for itself. Bindings are by physical key, so they do not move with the keyboard layout.',
        },
        {
          kind: 'note',
          text: '`Reset settings` puts back **the open tab only**.',
        },
      ],
    },

    // ── 12 ────────────────────────────────────────────────────────────────
    cost: {
      title: 'What it costs the application',
      blocks: [
        {
          kind: 'p',
          text: 'Everything the panel shows it had to ask the page for, and every question costs the application a little of its frame. Four levers, in the order they are worth reaching for.',
        },
        {
          kind: 'rows',
          rows: [
            {
              term: 'Fold what you are not reading',
              text: 'A folded section is not polled at all — a property group, a chart group, `Frames` in `Assets`. This is the cheapest of the four and the one that costs you nothing in return.',
            },
            {
              term: 'Leave the tab',
              text: 'Only the open tab is mounted; the others ask the page for nothing. An open `Custom` tab is the exception — it costs what all of its columns cost, at once.',
            },
            {
              term: '`Poll rate`',
              text: '`Settings` → `General`. `Max`, `Normal` or `Min` scales every interval in the panel at once. Drop it to `Min` when the application is struggling and you still want to watch.',
            },
            {
              term: '`Keep` in `Stats`',
              text: 'Recording history costs a little on every frame, which is why it is off by default and off again tomorrow. The charts themselves work without it.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'The render hook — what the overlay, the Spine scrub on a frozen scene and the live figures in `Stats` all need — is installed only while something actually wants a frame, and taken away again when nothing does. There is nothing left running in the application once you stop looking.',
        },
      ],
    },

    // ── 13 ────────────────────────────────────────────────────────────────
    privacy: {
      title: 'Privacy',
      blocks: [
        {
          kind: 'p',
          text: 'The extension asks for **no permissions**, contacts no server and collects nothing. Everything it knows it read out of the page you opened DevTools on, and everything it remembers is in this browser’s own storage.',
        },
        {
          kind: 'note',
          text: 'There is no version check and no update banner either: the Chrome Web Store does the updating, so the panel never has a reason to call home.',
        },
      ],
    },

    // ── 14 ────────────────────────────────────────────────────────────────
    reference: {
      title: 'Reference',
      blocks: [
        { kind: 'h', id: 'otherKeys', text: 'Keys' },
        {
          kind: 'p',
          text: 'The six overlay switches and the keys bound to them are in [Start here](#quickStart). The rest are these.',
        },
        {
          kind: 'rows',
          rows: [
            {
              term: 'In the tree',
              text: 'Rename the focused row, or delete it — which asks first.',
              key: 'Enter · Delete',
            },
            {
              term: 'In the texture grid',
              text: 'Move the selection, jump to either end, or clear it.',
              key: '← ↑ → ↓ · Home · End · Escape',
            },
            { term: 'On a number field', text: 'Scrub the value by dragging.', key: 'Alt + drag' },
            {
              term: 'On a property label',
              text: 'Copy that field as source.',
              key: 'Double-click',
            },
          ],
        },

        { kind: 'h', id: 'remembers', text: 'What the panel remembers' },
        {
          kind: 'p',
          text: 'Kept between sessions, in the browser and nowhere else: the language, theme and accent; the poll rate, picker depth and bookmark limit; your key bindings; which tab was open; the toolbar switches that persist; the size of the panes and the drawers; the preview background; and which charts and groups are folded or hidden. Bookmarks are kept the same way, as paths.',
        },

        { kind: 'h', id: 'project', text: 'The project' },
        {
          kind: 'rows',
          rows: [
            {
              term: 'Source and issues',
              text: '[github.com/dok-studio/pixi-scene-inspector](https://github.com/dok-studio/pixi-scene-inspector) — bugs and feature requests both go in the tracker there.',
            },
            {
              term: 'What to put in a report',
              text: 'The inspector’s version, printed at the top of this page, and the PixiJS version the page is running — the panel’s logo carries both.',
            },
          ],
        },
      ],
    },

    // ── 15 ────────────────────────────────────────────────────────────────
    licences: {
      title: 'Licences',
      blocks: [
        {
          kind: 'p',
          text: 'The inspector is open source under the MIT licence. Three files travel inside the extension and say the whole of it: `LICENSE` is this project’s own grant, `NOTICE` is what it inherited and from whom, and `THIRD_PARTY_LICENSES` carries the licence text of everything the build bundles. All three are in [the repository](https://github.com/dok-studio/pixi-scene-inspector) as well.',
        },

        { kind: 'h', id: 'derivedFrom', text: 'Where it comes from' },
        {
          kind: 'p',
          text: 'This extension is derived from [PixiJS devtools](https://github.com/pixijs/devtools), the official one, which is MIT licensed and copyright PixiJS. The code here was rewritten, but a good deal of it descends from that project: the components the panel is assembled from and the stylesheet they are written against, the shape of the Scene and Assets tabs, the way a node’s type is recognised without holding the application’s classes, the texture format tables, the picker, the geometry that aligns the highlight with the canvas, and the property lists behind each kind of node.',
        },
        {
          kind: 'note',
          text: 'Derived from it, not affiliated with it. Anything wrong here is this project’s to answer for, and belongs in this project’s tracker.',
        },

        { kind: 'h', id: 'thirdParty', text: 'What it is built on' },
        {
          kind: 'rows',
          rows: [
            {
              term: 'PixiJS devtools',
              text: 'MIT — © 2024 PixiJS. [github.com/pixijs/devtools](https://github.com/pixijs/devtools)',
            },
            {
              term: 'shadcn/ui',
              text: 'MIT — © 2023 shadcn. The panel’s components follow it, and several are unchanged copies of it. [ui.shadcn.com](https://ui.shadcn.com)',
            },
            {
              term: 'Font Awesome Free',
              text: 'Most of the glyphs on these screens. The artwork is under CC BY 4.0, and using it implies no endorsement by Fonticons, Inc. [fontawesome.com](https://fontawesome.com)',
            },
            {
              term: 'Lucide',
              text: 'The rest of the glyphs, under the ISC licence. [lucide.dev](https://lucide.dev)',
            },
            {
              term: 'The packages the bundle carries',
              text: 'React, Radix UI, react-arborist and everything behind them — dozens of packages, nearly all MIT, with two under Apache 2.0 and one under BSD. Every one of them is named, with its own licence text, in `THIRD_PARTY_LICENSES`.',
            },
          ],
        },
      ],
    },
  },
};
