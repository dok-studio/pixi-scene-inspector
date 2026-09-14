import { Shell } from '@scene-inspector/panel';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { client } from './transport.js';
import { StandPane } from './StandPane.js';

/**
 * The stand: the game on the left, the real panel on the right.
 *
 * A draggable split rather than two fixed halves, because the shell changes
 * with its own width — `useElementWidth` decides whether there is room for the
 * Custom tab, and the strip lays out against it. A set of screenshots wants
 * several widths, and a handle makes that a mouse movement instead of an edit.
 *
 * No `ThemeProvider` here: `Shell` mounts its own. And no colour on the wrapper
 * — see the note in `stand.css`.
 */
export function Layout(): JSX.Element {
  return (
    <div className="h-full">
      <PanelGroup autoSaveId="playground.split" direction="horizontal">
        <Panel className="h-full min-w-0" defaultSize={62} minSize={35}>
          <StandPane />
        </Panel>
        <PanelResizeHandle className="w-px bg-[#23282e] transition-colors hover:bg-[#3a4048]" />
        <Panel className="h-full min-w-0" defaultSize={38} minSize={22}>
          <Shell client={client} />
        </Panel>
      </PanelGroup>
    </div>
  );
}
