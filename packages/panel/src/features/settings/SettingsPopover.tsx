import type { Json, OverlayStyle, PropertyDescriptor } from '@scene-inspector/protocol';
import { MAX_PICK_DEPTH } from '@scene-inspector/protocol';
import { useMemo, useRef, useState } from 'react';
import { FaAngleDown as FoldIcon } from 'react-icons/fa6';
import { LuSettings as SettingsIcon, LuX as CloseIcon } from 'react-icons/lu';

import type { PropertyCell } from '../../components/properties/propertyCells.js';
import { PropertyGrid } from '../../components/properties/propertyGrid.js';
import { tintOf } from '../../components/properties/groupTint.js';
import { cn } from '../../lib/utils.js';
import { useLocalStorage } from '../../lib/localStorage.js';
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
 * The stroke of a frame: what colour the line is, how hard it is drawn, how
 * thick it is.
 *
 * Three rows that every frame on this tab has, fill or no fill. The width sits
 * with the colour rather than off in a tab of its own — a frame is one
 * decision, and how thick its outline is belongs beside what colour it is.
 */
function strokeFields(t: T, prefix: string): PropertyDescriptor[] {
  return [
    { key: `${prefix}.stroke`, label: t('settings.overlay.outline'), editor: 'color' },
    alphaField(`${prefix}.strokeOpacity`, t('settings.overlay.outlineAlpha')),
    {
      key: `${prefix}.strokeWidth`,
      label: t('settings.overlay.outlineWidth'),
      editor: 'number',
      // No upper bound: the overlay is scaled onto the canvas, so how many
      // pixels read as a line depends on the page rather than on us.
      options: { min: 0, step: 0.5 },
    },
  ];
}

/** The same, with the wash it sits on described first. */
function filledFields(t: T, prefix: string): PropertyDescriptor[] {
  return [
    { key: `${prefix}.fill`, label: t('settings.overlay.fill'), editor: 'color' },
    alphaField(`${prefix}.fillOpacity`, t('settings.overlay.fillAlpha')),
    ...strokeFields(t, prefix),
  ];
}

const alphaField = (key: string, label: string): PropertyDescriptor => ({
  key,
  label,
  editor: 'range',
  options: { min: 0, max: 1, step: 0.05 },
});

/** A labelled run of rows inside a card. Unlabelled where the card is one run. */
interface ColorBlock {
  id: string;
  label: string | null;
  fields: PropertyDescriptor[];
}

/** One card on the Colors tab. */
interface ColorSection {
  /**
   * The identity, not the heading: `tintOf` hashes it for the card's colour and
   * the fold state is stored under it. Translated where it is drawn (§3.14).
   */
  name: string;
  label: string;
  blocks: ColorBlock[];
}

/**
 * The Colors tab, **grouped by what a frame looks like** rather than by which
 * node it is drawn on.
 *
 * That is the other way round from how it started, and the reason is the
 * highlight's outline-only setting. Grouped by node, its colours had to sit in
 * the same list as the filled look's — two answers to "what colour is the
 * outline" one above the other, with nothing but the row's wording to say which
 * of them was on screen. Grouped by look, a card is a picture: this is what the
 * overlay draws in that setting, and these are its colours.
 *
 * What it costs is a second level, since each of the first two cards holds two
 * frames. They are plain labels rather than cards of their own — the run of
 * rows under a word is small enough to be read as one thing, and folding two
 * rows away saves nothing.
 */
function colorSections(t: T): ColorSection[] {
  return [
    {
      name: 'Filled frame',
      label: t('settings.overlay.filled'),
      blocks: [
        { id: 'selected', label: t('settings.overlay.selected'), fields: filledFields(t, 'selected') },
        { id: 'hover', label: t('settings.overlay.hovered'), fields: filledFields(t, 'hover') },
      ],
    },
    {
      name: 'Bare frame',
      label: t('settings.overlay.bare'),
      blocks: [
        {
          id: 'bareSelected',
          label: t('settings.overlay.selected'),
          fields: strokeFields(t, 'bareSelected'),
        },
        {
          id: 'bareHover',
          label: t('settings.overlay.hovered'),
          fields: strokeFields(t, 'bareHover'),
        },
      ],
    },
    {
      // The wrap box is one frame and has no second look, so it is one run of
      // rows and wants no label over them — the card's own heading is it.
      name: 'Wrap box',
      label: t('settings.overlay.wrapBox'),
      blocks: [{ id: 'wrapBox', label: null, fields: strokeFields(t, 'wrapBox') }],
    },
  ];
}

/**
 * The colours a card holds, drawn in its heading.
 *
 * Folding a card away costs the thing the tab is mostly used for — seeing what
 * colour something is. These give it back, so a folded card still says who it
 * is. Drawn open as well as folded: a heading that gains chips on folding is a
 * heading that moves when it is clicked.
 */
function SectionSwatches({ section, style }: { section: ColorSection; style: OverlayStyle }) {
  const colours = section.blocks
    .flatMap((block) => block.fields)
    .filter((field) => field.editor === 'color')
    .map((field) => ({
      key: field.key,
      value: valueAt(style as unknown as Record<string, unknown>, field.key),
    }))
    .filter((swatch): swatch is { key: string; value: string } => typeof swatch.value === 'string');

  return (
    <span className="flex flex-none items-center gap-1">
      {colours.map((colour) => (
        <span
          key={colour.key}
          style={{ backgroundColor: colour.value }}
          className="border-border h-2.5 w-2.5 rounded-[2px] border"
        />
      ))}
    </span>
  );
}

/**
 * One card: a heading that folds it, and a bordered body that says where the
 * rows under it stop.
 *
 * The border is the point of the card. The rows of three frames down one column
 * under three bands were a list that had to be read from the nearest heading
 * upwards to know what a row belonged to; a box answers that by being shut.
 */
function ColorCard({
  section,
  style,
  folded,
  onFold,
  children,
}: {
  section: ColorSection;
  style: OverlayStyle;
  folded: boolean;
  onFold: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border overflow-hidden rounded-md border">
      {/* Tinted the same way a group band is, and for the same reason: three
          identical grey strips down a narrow column are told apart by counting.
          See `groupTint.ts`, which is also where the amount of it is argued. */}
      <div
        style={{ backgroundColor: tintOf(section.name) }}
        className="bg-muted text-foreground flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1 text-xs font-semibold"
        onClick={onFold}
      >
        <span className="mr-auto truncate">{section.label}</span>
        <SectionSwatches section={section} style={style} />
        <FoldIcon className={cn('flex-none opacity-60', folded && '-rotate-90')} />
      </div>
      {/* A surface of its own, not the popover's.
          The border alone drew the edge of the card and left what was inside it
          the same colour as what was outside, so a fold read as a line around
          nothing in particular rather than as a lid over something.

          Downwards, because there is no up: the popover is already `--raised`,
          which is this panel's lifted surface, and nothing stands above it. So
          the body sinks into it — `--sunken`, which exists for this — and the
          band, which is `--muted`, lands between the two in both themes. Three
          surfaces, each a step from its neighbour, with the heading nearer the
          lid than the well. */}
      {!folded && (
        <div className="bg-sunken flex flex-col gap-y-2 px-2.5 py-2.5">{children}</div>
      )}
    </div>
  );
}

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
 * The rows of General, built per render rather than declared once: the labels
 * are the panel's own words, and a module constant would hold whatever
 * language was on at import time and never hear about a change (§3.14).
 *
 * Colors builds its own — see `colorSections` — and Hotkeys draws itself.
 */
function generalFields(t: T): PropertyDescriptor[] {
  return [languageField(t), customTabField(t), pollField(t), pickDepthField(t), bookmarkField(t)];
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
  /** The one tab whose rows are grouped, and so the one that folds. */
  const colors = tab === 'Colors';
  const panel = useRef<HTMLDivElement | null>(null);
  const t = useT();
  const language = useLanguage();
  const rate = usePollRate();
  const bookmarkLimit = useBookmarkLimit();
  const depth = usePickDepth();
  const customTab = useCustomTabOffered();
  const accent = useAccentTheme();

  /**
   * Which frames' rows are folded away in Colors, by the raw group name.
   *
   * **Stored**, like everything else the tabs hold: a DevTools panel is torn
   * down and rebuilt constantly, and a fold that had to be made again on every
   * reopen would be a fold nobody used twice.
   *
   * The filled frame starts open and the other two folded, which is the shape
   * of the tab rather than a guess about anyone: three headings and nothing
   * else is a tab that has to be opened before it says what it holds, and the
   * look the overlay is nearly always in is the filled one. The two that start
   * folded say who they are through their swatches.
   */
  const [folded, setFolded] = useLocalStorage<string[]>('settings.colors.folded', [
    'Bare frame',
    'Wrap box',
  ]);
  const toggleFold = (name: string): void => {
    setFolded((previous) =>
      previous.includes(name) ? previous.filter((held) => held !== name) : [...previous, name],
    );
  };

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
    const fields = tab === 'General' ? generalFields(t) : [];
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

  const sections = useMemo(() => colorSections(t), [t]);

  /**
   * The Colors tab's rows, which are every one of them a setting of the
   * overlay's style: no `own` table, no special cases, one path from the key
   * to the value and back through `set`.
   */
  const cellsFor = (fields: PropertyDescriptor[]): PropertyCell[] =>
    fields.map((descriptor) => ({
      descriptor,
      value: valueAt(style as unknown as Record<string, unknown>, descriptor.key),
      onChange: set,
    }));

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
        /* A column bounded by the room the popover actually has.

           `--radix-popover-content-available-height` is Radix's measurement of
           the gap between the trigger and the edge of the viewport, and it is
           the only honest bound here: this panel is a DevTools drawer, which is
           a couple of hundred pixels tall as often as it is full height, and a
           `vh` fraction picked by hand is wrong in one of those two. The
           header and the foot are held out of the scroll, so what moves is the
           settings and not the tab strip above them. */
        className="flex max-h-[var(--radix-popover-content-available-height)] w-80 flex-col overflow-hidden p-0"
      >
        <div className="flex flex-none items-center">
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

        {/* Roomier than it was. The cards below draw their own edges, and a
            box that ends a pixel or two from the popover's own reads as a
            mistake rather than as a box — so the air around them is what says
            they are inside something.

            `min-h-0` beside `flex-1`: a flex item will not shrink below its own
            content without it, so the column would have grown to whatever the
            Colors tab needed and the bound above would have clipped the foot
            off instead of scrolling. */}
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {tab === 'Hotkeys' && <HotkeysSettings />}

          {tab === 'General' && (
            /* Roomier than the grid's default, and undivided because of it:
               nearly every label here wraps once translated, and at the default
               gap two of them running together read as one block. The air does
               the dividing, so a rule as well would say it twice. */
            <PropertyGrid className="gap-y-2" divided={false} cells={cells} />
          )}

          {colors && (
            <div className="flex flex-col gap-2">
              {/* The panel's own accent, above the overlay's colours below it:
                  it is not one more row of the grid — see `AccentSwatches`. */}
              <AccentSwatches value={accent} onChange={setAccentTheme} />
              {sections.map((section) => (
                <ColorCard
                  key={section.name}
                  section={section}
                  style={style}
                  folded={folded.includes(section.name)}
                  onFold={() => {
                    toggleFold(section.name);
                  }}
                >
                  {section.blocks.map((block) => (
                    <div key={block.id} className="flex flex-col gap-y-2">
                      {/* Quieter and smaller than the card's own heading, and
                          drawn as a word rather than as a band: two frames
                          inside one look are a division of it, not two looks. */}
                      {block.label !== null && (
                        <span className="text-muted-foreground text-[11px] font-medium">
                          {block.label}
                        </span>
                      )}
                      <PropertyGrid
                        className="gap-y-2"
                        divided={false}
                        cells={cellsFor(block.fields)}
                      />
                    </div>
                  ))}
                </ColorCard>
              ))}
            </div>
          )}
        </div>

        {/* Every tab's, not this one's: Reset puts the settings back, and
            which half of them was on screen at the time is not a limit anyone
            would mean by pressing it.

            Outside the scroll, so it is where it was left however far down the
            Colors tab someone has gone. */}
        <div className="border-border flex flex-none justify-end border-t px-3 py-2">
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
      </PopoverContent>
    </Popover>
  );
}
