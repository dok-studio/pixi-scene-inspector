import { cn } from '../../lib/utils.js';
import { tabVariants } from './tab.js';

/**
 * A row of tabs that fill their width, drawn with the shared `tabVariants`.
 *
 * Three strips are on screen at once now — the navbar's Scene/Assets, the
 * property panel's Properties/Text/Spine, and the settings' — and three ways of
 * marking the open one would be three things to read instead of one.
 *
 * The navbar's is not this component, because its tabs share their row with the
 * logo and the buttons; these two own their row and split it evenly.
 *
 * **No rule underneath.** The open tab takes the colour of what it opened and
 * that is the mark; a border here would run between the two — see `tab.ts`. The
 * border is kept in a colour that draws nothing, so the strip stays exactly as
 * tall as the toolbar it lines up with across a split.
 */
export function TabStrip({
  tabs,
  active,
  onSelect,
  className,
  activeClassName,
  labelOf,
}: {
  tabs: readonly string[];
  active: string;
  onSelect: (tab: string) => void;
  className?: string;
  /**
   * The surface the tab's content is drawn on, where it is not the panel's own
   * `--background`.
   *
   * The open tab **is** the content's colour — that is the whole mark, and a
   * strip sitting on some other surface has to be told which one, or the tab
   * and what it opened read as two things with a seam between them. A popover
   * is `--raised`, so its strip passes `bg-raised`.
   */
  activeClassName?: string;
  /**
   * What each tab is **called**, where that is not what it **is**.
   *
   * The strings stay the identity — the React key, `data-tab`, the comparison
   * with `active`, and in the property panel a section title compared against
   * the open tab (`SceneProperties.tsx`). Only the text node changes, and only
   * here. Absent means a tab names itself, which is what the property panel's
   * `Text` and `Spine` want: those are PixiJS classes, not words.
   */
  labelOf?: (tab: string) => string;
}) {
  return (
    <div
      className={cn(
        'flex h-8 max-h-8 flex-none flex-row items-center border-b border-b-transparent',
        className,
      )}
    >
      {tabs.map((tab) => (
        <div
          key={tab}
          data-tab={tab}
          className={cn(
            tabVariants({ variant: tab === active ? 'active' : 'inactive' }),
            'flex-1',
            tab === active && activeClassName,
          )}
          onClick={() => {
            onSelect(tab);
          }}
        >
          {labelOf === undefined ? tab : labelOf(tab)}
        </div>
      ))}
    </div>
  );
}
