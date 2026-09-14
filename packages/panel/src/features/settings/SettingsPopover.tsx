import type { Json, PropertyDescriptor } from '@scene-inspector/protocol';
import { MAX_PICK_DEPTH } from '@scene-inspector/protocol';
import { useMemo, useRef, useState } from 'react';
import { LuSettings as SettingsIcon, LuX as CloseIcon } from 'react-icons/lu';

import type { PropertyCell } from '../../components/properties/propertyCells.js';
import { PropertyGrid } from '../../components/properties/propertyGrid.js';
import { Button } from '../../components/ui/button.js';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '../../components/ui/popover.js';
import { TabStrip } from '../../components/ui/tab-strip.js';
import { Hint } from '../../components/ui/tooltip.js';
import type { MessageKey, T } from '../../i18n/index.js';
import { useT } from '../../i18n/index.js';
import { POLL_RATES, resetPollRate, setPollRate, usePollRate } from '../../transport/pollRate.js';
import { AccentSwatches } from './AccentSwatches.js';
import { resetAccentTheme, setAccentTheme, useAccentTheme } from './accentTheme.js';
import type { Language } from './language.js';
import { LANGUAGE_LABELS, LANGUAGES, setLanguage, useLanguage } from './language.js';
import {
  MAX_BOOKMARK_LIMIT,
  resetBookmarkLimit,
  setBookmarkLimit,
  useBookmarkLimit,
} from './bookmarkLimit.js';
import { HotkeysSettings } from './HotkeysSettings.js';
import { resetHotkeys } from './hotkeys.js';
import type { OverlayStyleControls } from './overlayStyle.js';
import {
  resetCustomTabOffered,
  setCustomTabOffered,
  useCustomTabOffered,
} from './customTab.js';
import { resetPickDepth, setPickDepth, usePickDepth } from './pickDepth.js';

/**
 * The panel's settings, behind the gear at the end of the navbar.
 *
 * In the bar rather than in the Scene tab's own, although everything in it so
 * far is about the overlay: these are settings of the **panel**, and a panel
 * has one place they live. The Scene tree's toolbar holds switches — what is
 * drawn right now — and this holds what it looks like when it is.
 *
 * The rows are ordinary property descriptors drawn by the ordinary
 * `PropertyGrid`. Nothing here is a node's property and none of it crosses the
 * bridge as `scene.setProp`; what is reused is the layout and the editors,
 * which is the same swatch and the same slider the Properties tab uses, so a
 * colour is chosen the one way this panel chooses colours.
 */

/**
 * One frame, described the way it is read: what fills it, then what edges it.
 *
 * The width sits with the colour rather than off in a tab of its own — a frame
 * is one decision, and how thick its outline is belongs beside what colour that
 * outline is.
 *
 * The wrap box has no fill and gets no rows for one. That is not an omission to
 * be filled in later: it is drawn over the very text it measures, and a wash of
 * colour there would be in the way of the one thing the frame exists to let you
 * look at.
 */
function frameFields(t: T, group: string, prefix: string, filled: boolean): PropertyDescriptor[] {
  const alpha = (key: string, label: string): PropertyDescriptor => ({
    key,
    label,
    editor: 'range',
    options: { min: 0, max: 1, step: 0.05 },
    group,
  });

  return [
    ...(filled
      ? [
          {
            key: `${prefix}.fill`,
            label: t('settings.overlay.fill'),
            editor: 'color' as const,
            group,
          },
          alpha(`${prefix}.fillOpacity`, t('settings.overlay.fillAlpha')),
        ]
      : []),
    { key: `${prefix}.stroke`, label: t('settings.overlay.outline'), editor: 'color', group },
    alpha(`${prefix}.strokeOpacity`, t('settings.overlay.outlineAlpha')),
    {
      key: `${prefix}.strokeWidth`,
      label: t('settings.overlay.outlineWidth'),
      editor: 'number',
      // No upper bound: the overlay is scaled onto the canvas, so how many
      // pixels read as a line depends on the page rather than on us.
      options: { min: 0, step: 0.5 },
      group,
    },
  ];
}

/**
 * What each frame's band is called.
 *
 * Keyed by the raw group name, because that name is what `tintOf` hashes for
 * the band's colour and what `groupCells` gathers on — the heading is
 * translated where it is drawn, and nowhere else (§3.14).
 */
const GROUP_LABEL_KEYS: Record<string, MessageKey> = {
  Selected: 'settings.overlay.selected',
  Hovered: 'settings.overlay.hovered',
  'Wrap box': 'settings.overlay.wrapBox',
};

/**
 * Which language the panel speaks — see `language.ts`.
 *
 * **First in General**, and that is the whole of its placement argument:
 * somebody who opened this popover to change the language should not have to
 * read three settings in the language they came here to leave in order to find
 * it.
 *
 * The one select in the panel whose label is not its value. The poll rate
 * below is shown as it is stored because there are three of them and the words
 * *are* the values; a language cannot be, because `uk` is a tag and
 * «Українська» is the word — and the word is written in the language being
 * offered, not in the one currently on. Hence `optionLabels`.
 */
function languageField(t: T): PropertyDescriptor {
  return {
    key: 'panel.language',
    label: t('settings.language'),
    editor: 'select',
    options: [...LANGUAGES],
  };
}

/**
 * Whether the Custom tab is offered at all — see `customTab.ts`.
 *
 * Second, under the language, because the two are the same kind of row: what
 * the panel **is**, rather than how hard it leans on the page or how much of
 * the browser's storage it spends, which is what the three below are about.
 */
function customTabField(t: T): PropertyDescriptor {
  return {
    key: 'custom.tab',
    label: t('settings.customTab'),
    editor: 'boolean',
  };
}

/**
 * How hard the panel leans on the page — see `transport/pollRate.ts`. One
 * setting rather than the eight intervals it scales: nobody wants to tune a
 * tree poll against a property poll.
 */
function pollField(t: T): PropertyDescriptor {
  return {
    key: 'poll.rate',
    label: t('settings.pollRate'),
    editor: 'select',
    options: [...POLL_RATES],
  };
}

/**
 * How many bookmarks are kept, over every page the panel has been opened on —
 * see `bookmarkLimit.ts` for why there is a ceiling at all, and why it is one
 * number rather than one per game.
 *
 * In General rather than in the Scene tab's own bar, although only the Scene
 * tab has bookmarks: what it limits is how much of the browser's storage the
 * panel spends, which is the panel's business the way the poll rate above it
 * is.
 */
function bookmarkField(t: T): PropertyDescriptor {
  return {
    key: 'bookmarks.limit',
    label: t('settings.bookmarkLimit'),
    editor: 'number',
    options: { min: 1, max: MAX_BOOKMARK_LIMIT, step: 1 },
  };
}

/**
 * How many times one picker click may ask the page what is under it — see
 * `pickDepth.ts`, which is also where the cost of raising it is written down.
 *
 * In General beside the poll rate, and for the same reason: both are how hard
 * the panel is allowed to lean on the page it is watching.
 */
function pickDepthField(t: T): PropertyDescriptor {
  return {
    key: 'picker.depth',
    label: t('settings.pickerDepth'),
    editor: 'number',
    options: { min: 1, max: MAX_PICK_DEPTH, step: 8 },
  };
}

/**
 * Three tabs, because a settings panel gains things and a single column of
 * everything is where they stop being findable. Colours are the half about
 * how the overlay looks; General is what is not about looks; Hotkeys is not
 * even a property of the overlay, which is why it draws itself rather than
 * being one more entry in `FIELDS` — see `HotkeysSettings`.
 */
const TABS = ['General', 'Colors', 'Hotkeys'] as const;

/** What each tab is called. The strings above stay the identity — see §3.14. */
const TAB_LABEL_KEYS: Record<(typeof TABS)[number], MessageKey> = {
  General: 'settings.tab.general',
  Colors: 'settings.tab.colors',
  Hotkeys: 'settings.tab.hotkeys',
};

/**
 * The rows of a tab, built per render rather than declared once.
 *
 * General's labels are the panel's own words and are translated, so they
 * cannot be a module constant: one would hold whatever language was on at
 * import time and never hear about a change (§3.14).
 *
 * Colors' too. Its group names stay raw here — the band's tint is hashed from
 * them — and are translated where the heading is drawn, through `groupLabel`.
 */
function fieldsFor(tab: string, t: T): PropertyDescriptor[] {
  switch (tab) {
    case 'General':
      return [
        languageField(t),
        customTabField(t),
        pollField(t),
        pickDepthField(t),
        bookmarkField(t),
      ];
    case 'Colors':
      return [
        ...frameFields(t, 'Selected', 'selected', true),
        ...frameFields(t, 'Hovered', 'hover', true),
        ...frameFields(t, 'Wrap box', 'wrapBox', false),
      ];
    default:
      // Drawn by HotkeysSettings instead of the grid below.
      return [];
  }
}

/** The value at a settings key, which is two steps and never more. */
function valueAt(style: Record<string, unknown>, key: string): Json | undefined {
  const [group, field] = key.split('.');
  if (group === undefined || field === undefined) return undefined;

  const section = style[group];
  if (typeof section !== 'object' || section === null) return undefined;

  const value = (section as Record<string, unknown>)[field];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

export function SettingsPopover({ overlayStyle }: { overlayStyle: OverlayStyleControls }) {
  const { style, set, reset } = overlayStyle;
  // Not stored, unlike everything the tabs hold: which tab was open is where
  // someone was, not what they decided.
  const [tab, setTab] = useState<string>(TABS[0]);
  const panel = useRef<HTMLDivElement | null>(null);
  const t = useT();
  const language = useLanguage();
  const rate = usePollRate();
  const bookmarkLimit = useBookmarkLimit();
  const depth = usePickDepth();
  const customTab = useCustomTabOffered();
  const accent = useAccentTheme();

  /**
   * What the button at the foot of the popover puts back.
   *
   * **The open tab's settings, and only those.** It sits inside a tab, under
   * that tab's rows, and a button in that position that quietly reached into
   * the other two would be undoing work nobody could see it undo — the tabs
   * exist because these are three separate decisions.
   *
   * The language is in none of the three. It is the row that decides how every
   * other row reads, and a button that changed the language of the panel would
   * be answering a question nobody asked it.
   */
  const resetTab = (): void => {
    switch (tab) {
      case 'General':
        resetCustomTabOffered();
        resetPollRate();
        resetPickDepth();
        resetBookmarkLimit();
        return;
      case 'Colors':
        reset();
        resetAccentTheme();
        return;
      default:
        resetHotkeys();
    }
  };

  const cells = useMemo((): PropertyCell[] => {
    const fields = fieldsFor(tab, t);
    /*
     * The rows that are settings of the panel itself rather than of the
     * overlay. They do not go through `set`; what is shared with the rows below
     * is the grid and the editors, so that a number is typed the one way this
     * panel types numbers. (The picker's depth does end up crossing the bridge,
     * but as part of the overlay's own poll rather than as a setting being
     * written anywhere — see `useOverlay`.)
     */
    /*
     * Keyed by the descriptor's **key** rather than by its object identity,
     * which is what it was until the labels started being translated: a
     * descriptor is now built per render, so no two of them are ever the same
     * object. The key was always the thing that identified a row anyway.
     */
    const own: Record<string, Omit<PropertyCell, 'descriptor'>> = {
      'panel.language': {
        value: language,
        // Stable while the language is: `LANGUAGE_LABELS` is a module constant.
        optionLabels: LANGUAGE_LABELS,
        onChange: (_key: string, value: Json) => {
          // The select hands back one of the tags it was given.
          if (typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)) {
            setLanguage(value as Language);
          }
        },
      },
      'custom.tab': {
        value: customTab,
        onChange: (_key: string, value: Json) => {
          if (typeof value === 'boolean') setCustomTabOffered(value);
        },
      },
      'poll.rate': {
        value: rate,
        onChange: (_key: string, value: Json) => {
          // The select hands back one of the strings it was given, and
          // those are the values themselves — see `POLL_RATES`.
          if (typeof value === 'string') setPollRate(value as (typeof POLL_RATES)[number]);
        },
      },
      'picker.depth': {
        value: depth,
        onChange: (_key: string, value: Json) => {
          if (typeof value === 'number') setPickDepth(value);
        },
      },
      'bookmarks.limit': {
        value: bookmarkLimit,
        onChange: (_key: string, value: Json) => {
          // Clamped again in the store: the editor's own bounds hold for
          // what is typed into it, not for what is already in storage.
          if (typeof value === 'number') setBookmarkLimit(value);
        },
      },
    };

    return fields.map((descriptor) => {
      const mine = own[descriptor.key];

      return mine === undefined
        ? {
            descriptor,
            value: valueAt(style as unknown as Record<string, unknown>, descriptor.key),
            onChange: set,
          }
        : { descriptor, ...mine };
    });
  }, [tab, t, style, set, rate, bookmarkLimit, depth, language, customTab]);

  return (
    <Popover>
      <Hint text={t('settings.open')}>
        <PopoverTrigger asChild>
          {/* The reload button up the row, exactly: they are the bar's own
              buttons and have to read as one kind of control. */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-sm hover:bg-foreground/10 dark:hover:bg-foreground/[0.16]"
          >
            <SettingsIcon className="dark:stroke-white" />
          </Button>
        </PopoverTrigger>
      </Hint>

      {/* Below the bar it hangs from, and against its right edge. Wide enough
          for a label and an editor side by side — the grid's own column is
          eleven characters, and a slider needs the rest.

          The padding is dropped so the tabs can reach the edges the way every
          other strip does, and the overflow is clipped so the strip's own fill
          stops at the rounded corners instead of squaring off the top of the
          panel. The rows put the padding back for themselves. */}
      {/* Opened onto itself rather than onto its first control.

          A popover puts the focus on the first thing in it that can take it,
          and the first thing here is the close button in the header — which
          carries a hint, and a hint opens on focus as readily as on the
          pointer. So the settings appeared with "Close" already floating over
          them, naming a button nobody had gone anywhere near.

          The panel takes the focus instead: the trap still holds, Tab still
          walks the controls in order and Escape still closes, but nothing is
          named until somebody actually reaches it. The container draws no ring
          — `PopoverContent` is `outline-none` — so this is invisible. */}
      <PopoverContent
        ref={panel}
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panel.current?.focus();
        }}
        side="bottom"
        align="end"
        className="w-80 overflow-hidden p-0"
      >
        <div className="flex items-center">
          {/* The open tab takes this panel's surface, not the panel's default
              `--background`: the mark is that the tab and what it opened are
              one colour, and a seam between them is exactly what that is not. */}
          <TabStrip
            tabs={TABS}
            active={tab}
            onSelect={setTab}
            labelOf={(name) => t(TAB_LABEL_KEYS[name as (typeof TABS)[number]])}
            activeClassName="bg-raised"
            className="flex-1"
          />

          <Hint text={t('settings.close')}>
            <PopoverClose asChild>
              <Button variant="ghost" size="xs" className="mr-1 h-5 w-7 flex-none p-0">
                <CloseIcon />
              </Button>
            </PopoverClose>
          </Hint>
        </div>

        <div className="p-2">
          {tab === 'Hotkeys' ? (
            <HotkeysSettings />
          ) : (
            <>
              {/* The panel's own accent, above the overlay's colours below it:
                  it is not one more row of the grid — see `AccentSwatches`. */}
              {tab === 'Colors' && <AccentSwatches value={accent} onChange={setAccentTheme} />}
              {/* Roomier than the grid's default, and undivided because of
                  it: nearly every label here wraps once translated, and at the
                  default gap two of them running together read as one block.
                  The air does the dividing, so a rule as well would say it
                  twice. */}
              <PropertyGrid
                className="gap-y-2"
                divided={false}
                cells={cells}
                groupLabel={(name) => {
                  const key = GROUP_LABEL_KEYS[name];
                  return key === undefined ? name : t(key);
                }}
              />
            </>
          )}

          {/* Every tab's, not this one's: Reset puts the settings back, and
              which half of them was on screen at the time is not a limit anyone
              would mean by pressing it. */}
          <div className="border-border mt-2 flex justify-end border-t pt-2">
            {/* Tinted with `--secondary` rather than with the accent: the
                Colors tab's reset takes the accent with it, and a button that
                changed colour with the thing it undoes would be the odd one
                out on three of the four themes. Diluted, because the same teal
                at full strength is a button that asks to be pressed, and this
                one only has to be findable. */}
            <Button
              variant="ghost"
              size="xs"
              className="bg-secondary/30 hover:bg-secondary/50 h-6 px-2.5"
              onClick={resetTab}
            >
              {t('settings.reset')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
