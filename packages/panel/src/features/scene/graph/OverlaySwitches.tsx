import type { AxesMode, HighlightMode } from '@scene-inspector/protocol';
import { Fragment } from 'react';
// `LuSquareDashed` is the glyph the previous project gave the highlight — it
// was `LuBoxSelect` there, renamed between that version of react-icons and this
// one. It now stands for the outline on its own, and the solid square beside it
// for the wash; see `HIGHLIGHT_ICON`.
import {
  LuAxis3D as AxesIcon,
  LuCircleDot as OriginIcon,
  LuScaling as TransformIcon,
  LuSquare as SquareIcon,
  LuSquareDashed as DashedIcon,
  LuWrapText as WrapBoxIcon,
} from 'react-icons/lu';

import { Separator } from '../../../components/ui/separator.js';
import { Toggle } from '../../../components/ui/toggle.js';
import { TooltipWrapper } from '../../../components/ui/tooltip.js';
import { useT } from '../../../i18n/index.js';
import { formatBinding, useHotkeys } from '../../settings/hotkeys.js';
import type { OverlayControls } from './useOverlay.js';

/**
 * Everything that changes **how the inspected page is drawn on** — four
 * switches, each answering for what it draws and for nothing else.
 *
 * They belong together, which is why they are one component; where they belong
 * is beside the picker, in the first row of the tree's own toolbar. All four
 * are ways of looking at the scene through the page rather than through the
 * list, and the picker is the one you reach for first, so the row reads left to
 * right as "point at it, then say what to draw on it".
 *
 * This used to be a bar of its own above **both** panes, on the grounds that
 * what it switches is neither pane's. True, and it cost a full 32px strip
 * across the whole tab for three icons, with the pane it actually serves
 * directly underneath. Sharing the tree's toolbar spends nothing.
 *
 * It draws no bar of its own — the row it sits in is the caller's, and the
 * separators here are the ones between the switches.
 */

/**
 * The gizmo's three settings, in the order the button walks through them.
 *
 * A button that cycles rather than a segmented control of three, because the
 * rest of this bar is single icon toggles and one three-wide control among them
 * would read as a different kind of thing. What it costs is that the third
 * setting is two clicks away, which for a set this small is a fair trade — and
 * the glyph says which of the two visible settings is on, while the pressed
 * state says whether anything is drawn at all.
 */
const AXES_CYCLE: readonly AxesMode[] = ['arrows', 'origin', 'off'];

/** The next setting the gizmo's button — or its hotkey — walks to. */
export function cycleAxes(current: AxesMode): AxesMode {
  const next = AXES_CYCLE[(AXES_CYCLE.indexOf(current) + 1) % AXES_CYCLE.length];
  return next ?? 'arrows';
}

const AXES_ICON: Record<AxesMode, React.ReactNode> = {
  arrows: <AxesIcon className="dark:stroke-white" />,
  origin: <OriginIcon className="dark:stroke-white" />,
  // Off keeps the control's own glyph: an unpressed button is already saying
  // that nothing is drawn, and a third icon for it would be a third thing to
  // learn rather than a state of the same one.
  off: <AxesIcon className="dark:stroke-white" />,
};

/**
 * The highlight's three settings, in the order the button walks through them —
 * the same shape as the gizmo's above, and for the same reason.
 *
 * The wash is what the frame opens on, because it is what answers the question
 * the highlight is usually asked: which of these is the node. The outline is
 * the setting for the other one — a node being read rather than found, where
 * the wash lies over the very thing being looked at.
 */
const HIGHLIGHT_CYCLE: readonly HighlightMode[] = ['fill', 'outline', 'off'];

/** The next setting the highlight's button — or its hotkey — walks to. */
export function cycleHighlight(current: HighlightMode): HighlightMode {
  const next = HIGHLIGHT_CYCLE[(HIGHLIGHT_CYCLE.indexOf(current) + 1) % HIGHLIGHT_CYCLE.length];
  return next ?? 'fill';
}

/**
 * Two glyphs, because the two settings draw two different things.
 *
 * A solid square filled in for the wash, a dashed empty one for the outline:
 * the pair differs in the line as well as in the middle, so it survives being
 * 16px in a row of five buttons — which the same square with and without a fill
 * did not, and which is why it is a pair at all.
 *
 * **The fill is washed rather than solid**, because the thing it stands for is:
 * the highlight lays a colour over a node at a fifth of its strength, and a
 * glyph filled in flat would be saying the node is painted out. Not a fifth
 * here — at 16px that is a square that reads as empty — but enough of the line
 * showing through to say wash rather than block.
 *
 * `fill-current` rather than only `dark:fill-white`: in the light theme that
 * class does nothing, and the filled setting would have been drawn hollow.
 *
 * **Off keeps the dashed one**, the same way the gizmo's button keeps its
 * arrows: an unpressed button already says that nothing is drawn, so a third
 * glyph for it would be a third thing to learn rather than a state of the two
 * that are. Which of the two it keeps is the emptier one — a filled square on
 * a button that draws nothing is the wrong half of the pair to be left looking
 * at.
 */
const WASHED = 'stroke-[3] fill-current dark:fill-white [fill-opacity:0.4]';
const BARE = 'stroke-[3]';

const HIGHLIGHT_ICON: Record<HighlightMode, React.ReactNode> = {
  fill: <SquareIcon className={WASHED} />,
  outline: <DashedIcon className={BARE} />,
  off: <DashedIcon className={BARE} />,
};

interface Switch {
  /** React identity. Was the tip, until the tip started depending on the
   *  language — four buttons that remount when a setting changes. */
  id: string;
  icon: React.ReactNode;
  on: boolean;
  press: () => void;
  tip: string;
}

export function OverlaySwitches({ overlay }: { overlay: OverlayControls }) {
  const hotkeys = useHotkeys();
  const t = useT();

  const switches: Switch[] = [
    {
      id: 'highlight',
      icon: HIGHLIGHT_ICON[overlay.highlight],
      on: overlay.highlight !== 'off',
      press: () => {
        overlay.setHighlight(cycleHighlight(overlay.highlight));
      },
      tip: t.fill('scene.overlay.highlight', { key: formatBinding(hotkeys.highlight) }),
    },
    {
      id: 'wrapBox',
      icon: <WrapBoxIcon className="dark:stroke-white" />,
      on: overlay.wrapBox,
      press: () => {
        overlay.setWrapBox(!overlay.wrapBox);
      },
      // Always available, even on a node that has no wrap box: whether a caption
      // wraps is in its style, which this bar does not read. Nothing is drawn
      // for a node without one.
      tip: t.fill('scene.overlay.wrapBox', { key: formatBinding(hotkeys.wrapBox) }),
    },
    {
      id: 'axes',
      icon: AXES_ICON[overlay.axes],
      on: overlay.axes !== 'off',
      press: () => {
        overlay.setAxes(cycleAxes(overlay.axes));
      },
      tip: t.fill('scene.overlay.axes', { key: formatBinding(hotkeys.axes) }),
    },
    /*
     * The one switch in this bar that **writes to the scene**, which is why it
     * is last: the row reads left to right as three ways of looking at a node
     * and then the one way of changing it, and the button that moves someone's
     * game is not the one a hand should land on by accident.
     */
    {
      id: 'transform',
      icon: <TransformIcon className="dark:stroke-white" />,
      on: overlay.transform,
      press: () => {
        overlay.setTransform(!overlay.transform);
      },
      tip: t.fill('scene.overlay.transform', { key: formatBinding(hotkeys.transform) }),
    },
  ];

  return (
    <>
      {switches.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 && <Separator orientation="vertical" className="h-4" />}
          <TooltipWrapper
            trigger={
              <Toggle
                asChild
                variant="ghost"
                size="icon"
                pressed={item.on}
                // The value is dropped rather than used: two of these are plain
                // switches and the third walks a cycle, and what they share is
                // that a press means "advance me", not "become this".
                onPressedChange={item.press}
              >
                {/* Bare, like the picker's — see `SceneTree`. */}
                <div>{item.icon}</div>
              </Toggle>
            }
            tip={item.tip}
          />
        </Fragment>
      ))}
    </>
  );
}
