import type { NodeId } from '@scene-inspector/protocol';
import { useEffect, useState } from 'react';

import { Navbar } from '../components/navbar/navbar.js';
import { Button } from '../components/ui/button.js';
import type { MessageKey } from '../i18n/index.js';
import { useT } from '../i18n/index.js';
import { ThemeProvider } from '../components/theme-provider.js';
import { useDigitWidth } from '../components/properties/useDigitWidth.js';
import { useElementWidth } from '../lib/useElementWidth.js';
import { useGlobalAltState } from '../lib/useGlobalAltState.js';
import { useLocalStorage } from '../lib/localStorage.js';
import { AssetsPanel } from '../features/assets/AssetsPanel.js';
import { CustomPanel } from '../features/custom/CustomPanel.js';
import type { Column } from '../features/custom/columns.js';
import { normalize } from '../features/custom/columns.js';
import { fits, narrowToFit } from '../features/custom/columnFloor.js';
import type { SectionId } from '../features/help/content/types.js';
import { Prose } from '../features/help/Prose.js';
import { ScenePanel } from '../features/scene/ScenePanel.js';
import { useAccentTheme } from '../features/settings/accentTheme.js';
import { useBookmarks } from '../features/scene/bookmarks/useBookmarks.js';
import { StatsPanel } from '../features/stats/StatsPanel.js';
import { useRecording } from '../features/stats/useRecording.js';
import { SettingsPopover } from '../features/settings/SettingsPopover.js';
import { useCustomTabOffered } from '../features/settings/customTab.js';
import { useOverlayStyle } from '../features/settings/overlayStyle.js';
import type { Client } from '../transport/client.js';
import { useResource } from '../transport/useResource.js';
import { HELP_SECTIONS } from './helpSections.js';
import { screenFor } from './screen.js';

/** How often the panel re-reads the session state. */
const STATUS_INTERVAL_MS = 1500;

/**
 * What the three tabs are called.
 *
 * Keyed by the record's own keys, which stay English: they are the identity
 * `activeTab` holds in storage and what the bar hands back on a click. Only
 * the word drawn in the strip comes from here (§3.14).
 */
const TAB_LABEL_KEYS: Record<string, MessageKey> = {
  Scene: 'tab.scene',
  Assets: 'tab.assets',
  Stats: 'tab.stats',
  Custom: 'tab.custom',
};

/**
 * A screen with nothing to inspect on it.
 *
 * The body is written with the help document's marks and drawn by the same
 * `Prose`, so a global's name reads here as it reads there. Where there is a
 * help page to open, the screen also carries the way into it: these four
 * screens are the moment somebody wants `Connecting`, and leaving them to find
 * it from the top of the document is leaving them to look.
 */
function Message({
  title,
  body,
  onOpenHelp,
}: {
  title: string;
  body: string;
  onOpenHelp?: (section?: SectionId) => void;
}) {
  const t = useT();

  return (
    <div className="p-4">
      <h1 className="mb-3 text-[15px] font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">
        <Prose text={body} />
      </p>
      {onOpenHelp !== undefined && (
        <Button
          variant="outline"
          size="xs"
          className="mt-3"
          onClick={() => {
            onOpenHelp('connecting');
          }}
        >
          {t('screen.help')}
        </Button>
      )}
    </div>
  );
}

/**
 * The panel's root screen.
 *
 * State is fetched by **pull requests only**: no message from the page is
 * needed for the panel to learn that an application appeared. That is why it
 * recovers on its own after a page reload or an application swap — within one
 * interval, with no separate recovery mechanism.
 *
 * The tab set is Scene, Assets and Stats — the whole product — plus **Custom**,
 * which holds several of them at once and appears only where there is room for
 * it and permission to offer it (§3.15). Only the open tab's element is
 * mounted, so the others poll nothing; the Custom tab is the one place where
 * that means two or three panels rather than one. The bar renders without tabs
 * on the screens where there is nothing to inspect, as it did in the previous
 * project.
 */
export function Shell({
  client,
  extensionVersion,
  onOpenHelp,
}: {
  client: Client;
  /** The extension's own version, shown alongside the PixiJS version in the
   *  navbar tooltip. Read from `chrome.runtime.getManifest()` by the app
   *  shell — the panel package itself has no chrome API access. */
  extensionVersion?: string | null;
  /**
   * Opens the help page, at a section of it. Handed in for the same reason the
   * version above is: the page is the extension's, and this package cannot name
   * it.
   *
   * Threaded to **both** navbars below, not just the one with tabs. The screens
   * that have no scene to show — "not detected", "reload the page" — are
   * exactly where somebody wants to read what the panel expects of a page, and
   * they open the section that says it rather than the top of the document.
   */
  onOpenHelp?: (section?: SectionId) => void;
}) {
  const t = useT();
  const state = useResource(() => client.call('session.status', {}), {
    intervalMs: STATUS_INTERVAL_MS,
  });
  const { data, error } = state;

  // Alt marks the document so number fields can show the scrub cursor before a
  // drag starts. Installed once, at the root.
  useGlobalAltState();

  // The panel's own accent: `globals.css` keys `--primary` off this attribute
  // rather than off the store directly, the same way `data-alt` above does.
  const accent = useAccentTheme();
  useEffect(() => {
    document.documentElement.dataset['accent'] = accent.toLowerCase();
  }, [accent]);

  /*
   * Held here because it is read in two places that have no other meeting
   * point: the gear in the bar, which edits it, and the Scene tab's poll, which
   * sends it to the page. The shell is the one component both are inside, so it
   * is threaded rather than kept in a module of its own — which is what the
   * wrap box switch needed back when it lived four components from the poll.
   *
   * Not keyed on the generation, unlike the tabs below: a colour is the panel's
   * own, and a page reloading has nothing to say about it.
   */
  const overlayStyle = useOverlayStyle();

  /** The `?`, already told where to land. Absent where there is no page. */
  const helpAt = (section?: SectionId): (() => void) | undefined =>
    onOpenHelp === undefined
      ? undefined
      : () => {
          onOpenHelp(section);
        };

  const screen = screenFor(state);
  const version = data?.version ?? null;
  const major = data?.major ?? null;

  /**
   * Both tabs are keyed on the page's generation.
   *
   * The panel deliberately survives a navigation — the polls that fail while
   * the new page loads are ridden out rather than shown — but everything the
   * tabs hold is named in ids the page reissues from scratch: a cached preview
   * under texture 1, a selection pointing at node 12, an expanded row. Keeping
   * them across a load left the Assets grid drawing the old page's images
   * under the new page's labels. The key throws that state away and nothing
   * else, so the shell itself does not flicker.
   */
  const generation = data?.generation ?? 0;

  /*
   * And the bookmarks are held here for the opposite reason: they are notes
   * about nodes someone means to come back to, and the moment they are wanted
   * is the moment the key above throws everything else away. Which of them the
   * game in front of us actually has is settled in the Scene tab, against the
   * tree it is holding — see `bookmarks/store.ts`.
   */
  const bookmarks = useBookmarks();

  /*
   * The recording, held here rather than inside the Stats tab.
   *
   * The navbar mounts one tab at a time, so a recording owned by Stats would
   * stop the moment the scene was looked at — which is when it is most wanted,
   * since working the tree is how the game is made to do the thing being
   * measured. Same reason the bookmarks are here.
   */
  const recording = useRecording(client, generation);

  /*
   * The selected node, and which tab is open — both here for the same reason
   * the recording above is. The navbar mounts one tab at a time, so anything
   * either tab has to be able to hand the other cannot live inside one of them.
   *
   * What made that necessary is the Assets tab's list of the nodes drawing a
   * texture: following one means opening Scene on it, which is a selection and
   * a tab at once. The selection is keyed on the generation like everything
   * else the page names — a node id means nothing after a reload.
   */
  const [activeTab, setActiveTab] = useLocalStorage('activeTab', 'Scene');
  const [selectedNode, setSelectedNode] = useState<NodeId | null>(null);

  /*
   * What the Custom tab is holding, and whether there is anywhere to hold it.
   *
   * Measured here rather than inside the tab because the width decides whether
   * the tab is **offered at all**, and that is a question about the bar, which
   * is above it. The panel is not the window — in the playground it is a pane
   * beside the canvas, and in DevTools a drawer that can be docked to the side
   * — so it is this element that is measured, not `window.innerWidth`.
   *
   * The choice is stored as it was made; what is drawn is that choice narrowed
   * to what fits, worked out afresh on every resize. So dragging the window in
   * takes columns away and dragging it back out returns them, and neither
   * touches what was asked for.
   */
  const { ref: root, width } = useElementWidth<HTMLDivElement>();
  const { digit, face } = useDigitWidth();
  const [storedColumns, setStoredColumns] = useLocalStorage<string[]>('panel.custom', [
    'Scene',
    'Assets',
  ]);
  const columns = normalize(storedColumns);
  const offersCustom =
    useCustomTabOffered() && fits(narrowToFit(columns, width, digit), width, digit);

  useEffect(() => {
    setSelectedNode(null);
  }, [generation]);

  const reveal = (id: NodeId): void => {
    setSelectedNode(id);

    /*
     * Unless the scene is already in front of them. The Custom tab always holds
     * it — it is the anchor — so following a texture out of the Assets column
     * is a selection and nothing else, and switching tabs would take the view
     * they arranged away in order to show them a panel they were looking at.
     */
    if (!(offersCustom && activeTab === 'Custom')) setActiveTab('Scene');
  };

  /*
   * What each panel **is**, in one place.
   *
   * Built here rather than written out inside the tab set, because the Custom
   * tab needs the very same elements and a second copy of this markup is a
   * second place for a prop to be forgotten.
   *
   * Every one of them is keyed on the generation, for the reason the tabs were
   * before there were columns: everything they hold is named in ids the page
   * reissues from scratch.
   */
  const panelFor = (column: Column): React.ReactNode => {
    switch (column) {
      case 'Scene':
        return (
          <ScenePanel
            key={generation}
            client={client}
            overlayStyle={overlayStyle.style}
            bookmarks={bookmarks}
            selectedId={selectedNode}
            onSelect={setSelectedNode}
          />
        );
      case 'Assets':
        return <AssetsPanel key={generation} client={client} onReveal={reveal} />;
      case 'Stats':
        return (
          <StatsPanel
            key={generation}
            client={client}
            recording={recording}
            generation={generation}
          />
        );
    }
  };

  const body = (): React.ReactNode => {
    switch (screen) {
      // The one screen with no way out offered: it is on its way somewhere, and
      // a button that shows for a second is a button nobody reads.
      case 'connecting':
        return <Message title={t('screen.connecting.title')} body={t('screen.connecting.body')} />;
      case 'no-host':
        return (
          <Message
            title={t('screen.noHost.title')}
            body={t('screen.noHost.body')}
            onOpenHelp={onOpenHelp}
          />
        );
      case 'not-detected':
        return (
          <Message
            title={t('screen.notDetected.title')}
            body={t('screen.notDetected.body')}
            onOpenHelp={onOpenHelp}
          />
        );
      case 'unsupported':
        return (
          <Message
            title={t('screen.unsupported.title')}
            body={
              version === null
                ? t('screen.unsupported.bodyUnknown')
                : t.fill('screen.unsupported.body', { version })
            }
            onOpenHelp={onOpenHelp}
          />
        );
      case 'ready':
        return null;
    }
  };

  return (
    <ThemeProvider defaultTheme="dark">
      <div ref={root} className="relative flex h-full flex-col overflow-hidden text-sm">
        {face}
        {screen === 'ready' ? (
          <Navbar
            tabs={{
              Scene: panelFor('Scene'),
              Assets: panelFor('Assets'),
              Stats: panelFor('Stats'),
              /* The fourth tab, where there is both room for it and leave to
                 offer it. Absent rather than disabled: a tab is a place, and a
                 place that cannot be gone to is one that has to be clicked to
                 find that out. What happens to somebody standing in it when it
                 goes is already written — the bar falls back to the default and
                 `activeTab` keeps saying Custom, so widening the window puts
                 them back where they were. */
              ...(offersCustom
                ? {
                    Custom: (
                      <CustomPanel
                        chosen={columns}
                        onChoose={(next) => {
                          setStoredColumns([...next]);
                        }}
                        panelFor={panelFor}
                        width={width}
                        digitPx={digit}
                      />
                    ),
                  }
                : {}),
            }}
            defaultTab="Scene"
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabLabel={(tab) => {
              const key = TAB_LABEL_KEYS[tab];
              return key === undefined ? tab : t(key);
            }}
            version={version}
            major={major}
            extensionVersion={extensionVersion}
            onOpenHelp={helpAt(HELP_SECTIONS[activeTab])}
            settings={<SettingsPopover overlayStyle={overlayStyle} />}
          />
        ) : (
          <>
            <Navbar
              version={version}
              major={major}
              extensionVersion={extensionVersion}
              onOpenHelp={helpAt('connecting')}
            />
            {body()}
          </>
        )}

        {/* The reload screen already says what went wrong; repeating the failure
            underneath it would tell the same story twice. */}
        {error !== null && screen !== 'no-host' && (
          <p className="text-destructive px-3 py-1 text-xs">Last request failed: {error.message}</p>
        )}
      </div>
    </ThemeProvider>
  );
}
