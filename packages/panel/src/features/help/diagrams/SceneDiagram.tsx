import { FaRedoAlt } from 'react-icons/fa';
import {
  FaCircleQuestion,
  FaEye,
  FaSun,
  FaWandMagicSparkles,
  FaMinus,
  FaPlus,
} from 'react-icons/fa6';
import {
  LuAxis3D,
  LuBookmark,
  LuScaling,
  LuSearch,
  LuSettings,
  LuSigma,
  LuSquareDashed,
  LuWrapText,
} from 'react-icons/lu';

import type { T } from '../../../i18n/index.js';
import { Badge, Cap, Ghost, Icon, INK, Plate, Sheet } from './parts.js';

/**
 * The panel as a whole, drawn on the tab it opens on.
 *
 * This is the one schematic that has to carry the bar as well as a tab, because
 * the bar is where the other two tabs and every setting are reached from — and
 * because someone reading the first section has not yet been told there is a
 * bar.
 *
 * The glyphs are the panel's own components, imported from where the panel
 * imports them, so a picture of a button cannot drift from the button. The
 * words are real too, and translated exactly where the panel translates them:
 * the tab names come from the dictionary, while `Text`, `Spine` and the node
 * types are PixiJS's own vocabulary and stay as they are (§3.14).
 */

/** The badges this picture draws. `content` names them; a test holds the two together. */
export const SCENE_CALLOUTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const W = 620;
const H = 372;

/** One row of the tree: the fold glyph, `name (Type)`, and its three buttons. */
function TreeRow({
  y,
  indent,
  name,
  type,
  branch,
  on = false,
}: {
  y: number;
  indent: number;
  name: string;
  type: string;
  branch?: boolean;
  on?: boolean;
}) {
  const ink = on ? INK.onAccent : INK.text;

  return (
    <g>
      {on && <Plate x={6} y={y - 8} w={282} h={17} fill={INK.accent} stroke="none" r={2} />}
      {branch === true && (
        <Icon glyph={on ? FaMinus : FaPlus} x={12 + indent} y={y - 3} size={6} color={ink} />
      )}
      <Cap x={22 + indent} y={y} fill={ink}>
        {name}
      </Cap>
      <Cap x={26 + indent + name.length * 4.6} y={y} size={8} fill={on ? ink : INK.faint}>
        ({type})
      </Cap>
      <Icon glyph={FaEye} x={238} y={y - 4} size={9} color={ink} />
      <Icon glyph={LuBookmark} x={254} y={y - 4} size={9} color={ink} />
      <Icon glyph={LuAxis3D} x={270} y={y - 4} size={9} color={ink} />
    </g>
  );
}

/** A section in the property pane: a heading band and some named rows. */
function PropSection({ y, title, rows }: { y: number; title: string; rows: string[] }) {
  return (
    <g>
      <Plate x={314} y={y} w={298} h={14} fill={INK.bar} r={2} />
      <Cap x={320} y={y + 7} weight={600}>
        {title}
      </Cap>
      {rows.map((row, i) => (
        <g key={row}>
          <Cap x={320} y={y + 27 + i * 14} size={8} fill={INK.faint}>
            {row}
          </Cap>
          <Plate x={384} y={y + 22 + i * 14} w={222} h={10} r={2} />
          <Ghost x={390} y={y + 26 + i * 14} w={34} opacity={0.5} />
        </g>
      ))}
    </g>
  );
}

export function SceneDiagram({ title, t }: { title: string; t: T }) {
  return (
    <Sheet w={W} h={H} title={title}>
      {/* ── the bar ──────────────────────────────────────────────────────── */}
      <Plate x={0} y={0} w={W} h={26} fill={INK.bar} stroke="none" r={0} />
      <line x1={0} y1={26} x2={W} y2={26} stroke={INK.line} strokeWidth={1} />

      <Plate x={5} y={4} w={18} h={18} fill={INK.page} r={3} />

      {/* three tabs; the first is open and runs into the strip below */}
      <Plate x={40} y={4} w={130} h={22} fill={INK.page} r={2} />
      <Cap x={105} y={15} anchor="middle" weight={600}>
        {t('tab.scene')}
      </Cap>
      <Cap x={235} y={15} anchor="middle" fill={INK.faint}>
        {t('tab.assets')}
      </Cap>
      <Cap x={365} y={15} anchor="middle" fill={INK.faint}>
        {t('tab.stats')}
      </Cap>

      {/* the bar's own buttons: reload, theme, settings, help */}
      <Icon glyph={FaRedoAlt} x={520} y={9} size={9} color={INK.text} />
      <Icon glyph={FaSun} x={538} y={8} color={INK.text} />
      <Icon glyph={LuSettings} x={557} y={8} color={INK.text} />
      <Plate x={573} y={7} w={14} h={13} fill={INK.accent} stroke="none" r={2} />
      <Icon glyph={FaCircleQuestion} x={575} y={8} color={INK.onAccent} />

      {/* the strip the open tab runs into */}
      <Plate x={0} y={26} w={W} h={8} fill={INK.page} stroke="none" r={0} />
      <line x1={0} y1={34} x2={W} y2={34} stroke={INK.line} strokeWidth={1} />

      {/* ── the tree, left ───────────────────────────────────────────────── */}
      <Plate x={6} y={40} w={282} h={18} fill={INK.bar} r={2} />
      <Icon glyph={FaWandMagicSparkles} x={12} y={44} color={INK.text} />
      <line x1={30} y1={43} x2={30} y2={55} stroke={INK.line} strokeWidth={1} />
      <Plate x={35} y={43} w={14} h={13} fill={INK.accent} stroke="none" r={2} />
      <Icon glyph={LuSquareDashed} x={37} y={44} color={INK.onAccent} />
      <Icon glyph={LuWrapText} x={55} y={44} color={INK.text} />
      <Icon glyph={LuAxis3D} x={73} y={44} color={INK.text} />
      <Icon glyph={LuScaling} x={91} y={44} color={INK.text} />
      <Icon glyph={LuSigma} x={268} y={44} color={INK.text} />

      {/* search, and the unpin-all button that only appears when it applies */}
      <Plate x={6} y={64} w={244} h={16} r={2} />
      <Icon glyph={LuSearch} x={12} y={67} size={9} color={INK.faint} />
      <Cap x={26} y={72} size={8} fill={INK.faint}>
        {t('scene.search')}
      </Cap>
      <Plate x={256} y={64} w={32} h={16} r={2} />
      <Icon glyph={LuAxis3D} x={261} y={67} size={9} color={INK.text} />
      <Cap x={278} y={72} size={8} anchor="middle" fill={INK.faint}>
        2
      </Cap>

      <TreeRow y={92} indent={0} name="app" type="Stage" branch />
      <TreeRow y={110} indent={10} name="background" type="Container" branch />
      <TreeRow y={128} indent={20} name="sky" type="Sprite" />
      <TreeRow y={146} indent={10} name="hero" type="Sprite" on />
      <TreeRow y={164} indent={10} name="ui" type="Container" branch />
      <TreeRow y={182} indent={20} name="score" type="Text" />

      {/* the drawer under the tree — stacked here so each of the three things
          it can hold gets its own badge (7-9). Only the top two really trade
          places in the panel; `Counts` genuinely sits under them at once, as
          drawn — see callout 7 for the one pair that does not. */}
      <Plate x={6} y={206} w={282} h={154} fill={INK.raised} r={2} />

      {/* Under cursor */}
      <Plate x={6} y={206} w={282} h={16} fill={INK.bar} r={2} />
      <Cap x={12} y={214} size={8} weight={600}>
        {t('scene.picked.title')}
      </Cap>
      <Cap x={258} y={214} size={7} anchor="end" fill={INK.faint}>
        1/4
      </Cap>
      <Plate x={8} y={224} w={278} h={14} fill={INK.accent} stroke="none" r={2} />
      <Cap x={14} y={231} size={8} fill={INK.onAccent}>
        hero
      </Cap>
      <Cap x={44} y={231} size={7} fill={INK.onAccent}>
        (Sprite)
      </Cap>
      <Cap x={14} y={247} size={8}>
        shadow
      </Cap>
      <Cap x={54} y={247} size={7} fill={INK.faint}>
        (Sprite)
      </Cap>

      <line x1={6} y1={257} x2={288} y2={257} stroke={INK.line} strokeWidth={1} />

      {/* Bookmarks */}
      <Plate x={6} y={257} w={282} h={16} fill={INK.bar} r={0} />
      <Cap x={12} y={265} size={8} weight={600}>
        {t('scene.bookmarks.title')}
      </Cap>
      <Cap x={258} y={265} size={7} anchor="end" fill={INK.faint}>
        3
      </Cap>
      <Cap x={14} y={283} size={8}>
        hero
      </Cap>
      <Cap x={44} y={283} size={7} fill={INK.faint}>
        (Sprite)
      </Cap>
      <Cap x={14} y={299} size={8}>
        background
      </Cap>
      <Cap x={84} y={299} size={7} fill={INK.faint}>
        (Container)
      </Cap>

      <line x1={6} y1={309} x2={288} y2={309} stroke={INK.line} strokeWidth={1} />

      {/* Counts */}
      <Plate x={6} y={309} w={282} h={16} fill={INK.bar} r={0} />
      <Cap x={12} y={317} size={8} weight={600}>
        {t('scene.counts.title')}
      </Cap>
      <Cap x={14} y={335} size={8} fill={INK.faint}>
        Total
      </Cap>
      <Cap x={100} y={335} size={8} weight={600}>
        40
      </Cap>
      <Cap x={14} y={351} size={8} fill={INK.faint}>
        Sprite
      </Cap>
      <Cap x={100} y={351} size={8}>
        12
      </Cap>

      {/* ── the divider ──────────────────────────────────────────────────── */}
      <Plate x={296} y={40} w={4} h={320} fill={INK.line} stroke="none" r={2} />

      {/* ── properties, right ────────────────────────────────────────────── */}
      <Plate x={310} y={40} w={306} h={16} fill={INK.bar} r={2} />
      <Plate x={312} y={41} w={80} h={14} fill={INK.page} r={2} />
      <Cap x={352} y={48} anchor="middle" weight={600}>
        {t('tab.properties')}
      </Cap>
      {/* Not translated, and that is the rule rather than an omission: these
          two name a PixiJS class. */}
      <Cap x={412} y={48} fill={INK.faint}>
        Text
      </Cap>
      <Cap x={450} y={48} fill={INK.faint}>
        Spine
      </Cap>

      <PropSection y={64} title="Info" rows={['Type', 'Label']} />
      <PropSection y={122} title="General" rows={['Position', 'Scale', 'Alpha', 'Visible']} />
      <PropSection y={208} title="Object" rows={['', '', '']} />

      {/* ── the badges ───────────────────────────────────────────────────── */}
      <Badge n={1} x={27} y={13} />
      <Badge n={2} x={170} y={15} />
      <Badge n={3} x={505} y={13} />
      <Badge n={4} x={112} y={38} />
      <Badge n={5} x={246} y={62} />
      <Badge n={6} x={288} y={100} />
      <Badge n={7} x={280} y={214} />
      <Badge n={8} x={280} y={265} />
      <Badge n={9} x={280} y={317} />
      <Badge n={10} x={492} y={48} />
      <Badge n={11} x={604} y={64} />
    </Sheet>
  );
}
