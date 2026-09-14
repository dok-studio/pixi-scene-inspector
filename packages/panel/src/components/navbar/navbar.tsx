import { FaRedoAlt } from 'react-icons/fa';
import { FaCircleQuestion } from 'react-icons/fa6';

import type { PixiMajor } from '@scene-inspector/protocol';

import { useT } from '../../i18n/index.js';
import { cn } from '../../lib/utils.js';
import logo from '../../assets/logo.svg';
import { ModeToggle } from '../mode-toggle.js';
import { Button } from '../ui/button.js';
import { tabVariants } from '../ui/tab.js';
import { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.js';
import { pixiVersionLabel } from './version.js';

/**
 * The top bar, ported from the previous project.
 *
 * The settings popover is back in the shape the previous project left in this
 * bar, with contents of its own: what its MCP settings were is a dev build's
 * business, and what the panel actually has to offer is how the overlay is
 * painted. The bar takes it as a node rather than building it — this component
 * is the shape of the strip, and the settings belong to whoever owns them.
 *
 * The tabs are drawn by the shared `tabVariants`, so this strip and the
 * property panel's mark their active tab the same way.
 */

const TabsTrigger: React.FC<{
  children: React.ReactNode;
  value: string;
  isActive: boolean;
  onClick: (value: string) => void;
}> = ({ children, value, isActive, onClick }) => (
  <div
    onClick={() => {
      onClick(value);
    }}
    className={cn(tabVariants({ variant: isActive ? 'active' : 'inactive' }), 'w-full')}
  >
    {children}
  </div>
);

export function Navbar({
  tabs = {},
  defaultTab = '',
  activeTab,
  onTabChange,
  version,
  major,
  extensionVersion,
  tabLabel,
  settings,
  onOpenHelp,
}: {
  /** When empty — the "not detected" screen — the bar is just its buttons. */
  tabs?: Record<string, React.ReactNode>;
  defaultTab?: string;
  /**
   * Which tab is open, and how to change it.
   *
   * Both come from the shell rather than being kept here, which they were until
   * something outside the bar needed to change the tab: the Assets tab lists
   * the nodes drawing a texture, and following one of them means opening Scene
   * on a selection — a click inside a tab cannot reach state above it.
   *
   * Optional only because the bar is also drawn on the screens that have no
   * tabs at all ("not detected", and the rest), where there is nothing to hold.
   * The shell is what remembers the choice across the panel being closed.
   */
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  version?: string | null;
  /**
   * What each tab is **called**, where that is not what it **is**.
   *
   * The keys of `tabs` stay the identity — they are what `activeTab` holds in
   * storage and what `onTabChange` hands back — so only the text node changes.
   * The same split `TabStrip` makes for the property panel's strip (§3.14).
   */
  tabLabel?: (tab: string) => string;
  /** The gear and what it opens, last in the row. Absent on the screens with
   *  nothing to set. */
  settings?: React.ReactNode;
  /**
   * Opens the help page, if there is one to open.
   *
   * A callback rather than a URL: the page lives in the extension, and this
   * package has no `chrome` to ask where that is — the same reason
   * `extensionVersion` is handed in rather than read. Absent in the playground,
   * which ships no such page, and then the button is not drawn at all.
   */
  onOpenHelp?: () => void;
  /** Carries the old lines, where no version string exists to be read. */
  major?: PixiMajor | null;
  extensionVersion?: string | null;
}) {
  const t = useT();
  const current = activeTab ?? defaultTab;
  const hasTabs = Object.keys(tabs).length > 0;

  // A persisted tab can name one that no longer exists, or one absent from the
  // current set. Without this the bar renders with nothing highlighted and a
  // blank body underneath.
  const validTab = current in tabs ? current : defaultTab;

  return (
    <>
      {/* The bottom border is repainted while there are tabs: the strip below
          carries the edge, and a rule here would run between the open tab and
          what it opened. Kept rather than dropped so the bar's height does not
          change with the screen.

          The content's colour, not `transparent`: a border paints over the
          element's own background, and this bar's is `--muted`, so a transparent
          one left a hairline of muted running under the open tab — between two
          surfaces that are both `--background` and are meant to read as one.
          Under a closed tab the same line only moves the edge up by its own
          width, into the strip that is already that colour. */}
      <div
        className={cn(
          'border-border bg-muted relative flex flex-none flex-row items-center overflow-y-auto border-b',
          hasTabs && 'border-b-background',
        )}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-none p-1"
                onClick={() => {
                  // This project's own repository, not PixiJS's. The logo is
                  // the inspector's, the tooltip under it names the inspector's
                  // version, and somebody clicking it is looking for the tool
                  // they are holding — which is also where a bug about it goes.
                  window.open('https://github.com/dok-studio/pixi-scene-inspector');
                }}
              >
                <img src={logo} alt="Scene Inspector logo" className="size-full" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>PixiJS: {pixiVersionLabel(version, major)}</p>
              <p>Scene Inspector: {extensionVersion ?? 'unknown'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex h-8 flex-1 items-center justify-evenly [&>*:first-child]:border-l-2">
          {Object.keys(tabs).map((tab) => (
            <TabsTrigger
              key={tab}
              onClick={onTabChange ?? (() => undefined)}
              value={tab}
              isActive={validTab === tab}
            >
              {tabLabel === undefined ? tab : tabLabel(tab)}
            </TabsTrigger>
          ))}
        </div>

        {/* The bar's own buttons, grouped so they can breathe. They are
            rounded now, and a rounded button that runs edge to edge against
            its neighbours reads as a strip that has been cut up rather than as
            separate controls — so the group spends two pixels between them and
            one at the end of the row. The logo keeps the far edge to itself.

            Help comes last, after the gear. It is the one button here that
            leaves the panel, and the end of the row is where a way out belongs
            — next to the settings, which is the other thing people reach for
            when they do not know where something is. */}
        <div className="flex flex-none items-center gap-0.5 px-1">
          <Hint text={t('navbar.reload')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-sm hover:bg-foreground/10 dark:hover:bg-foreground/[0.16]"
              onClick={() => {
                window.location.reload();
              }}
            >
              <FaRedoAlt className="dark:fill-white" />
            </Button>
          </Hint>
          <ModeToggle />
          {settings}
          {onOpenHelp !== undefined && (
            <Hint text={t('navbar.help')}>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-sm hover:bg-foreground/10 dark:hover:bg-foreground/[0.16]"
                onClick={onOpenHelp}
              >
                <FaCircleQuestion className="dark:fill-white" />
              </Button>
            </Hint>
          )}
        </div>
      </div>

      {/* The strip the active tab runs into.
          It carries the content's own colour, so the tab that is open has no
          edge between itself and it while every other tab still ends at the
          bar's border — which is what makes the selection unmistakable. It
          belongs to the tabs rather than to a panel, so both tabs get it and
          neither has to draw its own. Absent where there are no tabs: the
          "not detected" screens have nothing for it to join. */}
      {hasTabs && <div className="border-border bg-background h-2 min-h-2 flex-none border-b" />}

      {tabs[validTab] ?? null}
    </>
  );
}
