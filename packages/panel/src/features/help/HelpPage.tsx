import { useEffect, useRef, useState } from 'react';

import { ModeToggle } from '../../components/mode-toggle.js';
import { ThemeProvider } from '../../components/theme-provider.js';
import { Button } from '../../components/ui/button.js';
import { useT } from '../../i18n/index.js';
import { cn } from '../../lib/utils.js';
import { useAccentTheme } from '../settings/accentTheme.js';
import {
  HOTKEY_LABEL_KEYS,
  formatBinding,
  useHotkeys,
  useHotkeysEnabled,
} from '../settings/hotkeys.js';
import { LANGUAGES, LANGUAGE_LABELS, setLanguage, useLanguage } from '../settings/language.js';
import { METRICS } from '../stats/metrics.js';
import { HELP } from './content/index.js';
import type { Block, Callout, Card, HelpContent, Row, SectionId } from './content/types.js';
import { OUTLINE, SECTION_IDS } from './content/types.js';
import { DIAGRAMS } from './diagrams/index.js';
import { Prose } from './Prose.js';

/**
 * The help page — a document, not a panel.
 *
 * It is its own extension page rather than a fourth tab: the product is Scene,
 * Assets and Stats, and a tab that explains the other three would be competing
 * with them for the same strip. Being a page also buys the things a reader
 * expects of documentation and a panel cannot give — `Ctrl+F` over the whole of
 * it, a scroll position, a window of its own beside the game.
 *
 * It shares an origin with `panel.html`, so the language, the theme and the
 * accent are simply *there*: same `localStorage`, same stores, no message
 * passing and nothing to keep in step.
 *
 * The panel opens it at a **section** — the one for the tab the reader is
 * standing in, or the one that explains the screen they are stuck on. That is
 * why every section and every heading inside one carries an id that does not
 * move with the language: an address has to survive being written down.
 */

/**
 * Which sections carry a number, and what it is.
 *
 * The top level of the contents list, and only that: the three sections under
 * Scene are parts of it rather than subjects of their own, so they are drawn
 * one tier down and go uncounted — the same distinction the list makes.
 */
const NUMBERED = new Map(OUTLINE.map((entry, i) => [entry.id, i + 1]));

/** Membership test for a fragment that arrived from outside — a hash, mostly. */
const isSection = (id: string): id is SectionId => SECTION_IDS.includes(id as SectionId);

/** A term and its explanation, with the key combination where there is one. */
function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="border-border my-3 grid grid-cols-1 gap-x-4 border-t sm:grid-cols-[minmax(0,11rem)_1fr]">
      {rows.map((row) => (
        <div key={row.term} className="contents">
          <dt className="border-border pt-2.5 text-[13px] font-semibold sm:border-b sm:pb-2.5">
            <Prose text={row.term} />
            {row.key !== undefined && (
              <span className="mt-0.5 block font-mono text-[11px] font-normal opacity-80">
                {row.key}
              </span>
            )}
          </dt>
          <dd className="border-border border-b pb-2.5 text-[13px] leading-relaxed sm:pt-2.5">
            <Prose text={row.text} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The legend under a schematic: the badge, what it is, what it does. */
function Legend({ callouts }: { callouts: Callout[] }) {
  return (
    <ol className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {callouts.map((callout) => (
        <li key={callout.n} className="flex gap-2.5">
          <span className="bg-primary text-primary-foreground mt-px flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold">
            {callout.n}
          </span>
          <span className="text-[13px] leading-relaxed">
            <span className="font-semibold">{callout.name}</span>{' '}
            <span>
              <Prose text={callout.text} />
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Cards({ cards, titleOf }: { cards: Card[]; titleOf: (id: SectionId) => string }) {
  return (
    <div className="my-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
      {cards.map((card) => (
        <a
          key={card.title}
          href={`#${card.goes}`}
          className="border-border bg-raised hover:border-primary block rounded-md border p-3.5 no-underline transition-colors"
        >
          <h3 className="text-[13px] font-semibold">{card.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed">
            <Prose text={card.text} />
          </p>
          {/* Through `Prose` like every other sentence: the trail names controls
              — `Colors`, `Custom tab` — and they were being drawn with their
              backticks still on. */}
          <p className="text-muted-foreground mt-2 text-[11px]">
            <span className="text-primary">→</span> <Prose text={card.where} /> ·{' '}
            {titleOf(card.goes)}
          </p>
        </a>
      ))}
    </div>
  );
}

/**
 * Every chart the Stats tab has, described in the panel's own words.
 *
 * Built from `METRICS` and the `stats.about.*` dictionary rather than copied
 * into the document, so a chart added to the tab appears here by itself and one
 * that is reworded cannot be described two ways at once.
 */
function Metrics() {
  const t = useT();

  return (
    <Rows
      rows={METRICS.filter((metric) => metric.aboutKey !== undefined).map((metric) => ({
        term: metric.unit === undefined ? metric.title : `${metric.title} (${metric.unit})`,
        // Every row here has an `aboutKey` — the filter above is what says so.
        text: t(metric.aboutKey as NonNullable<typeof metric.aboutKey>),
        key: metric.group,
      }))}
    />
  );
}

/**
 * The six overlay switches, against the keys they are bound to **now**.
 *
 * Someone who has rebound a key reads their own binding here. A table of the
 * defaults would be right for exactly as long as nobody used the settings the
 * document is telling them about.
 */
function Hotkeys({ off }: { off: string }) {
  const t = useT();
  const bindings = useHotkeys();
  const enabled = useHotkeysEnabled();

  return (
    <div className={cn(!enabled && 'opacity-60')}>
      <ul className="my-3 flex flex-wrap gap-1.5">
        {Object.entries(HOTKEY_LABEL_KEYS).map(([action, key]) => (
          <li
            key={action}
            className="border-border bg-raised flex items-center gap-2 rounded border px-2 py-1 text-[13px]"
          >
            <span>{t(key)}</span>
            <kbd className="bg-muted rounded px-1.5 py-px font-mono text-[11px]">
              {formatBinding(bindings[action as keyof typeof bindings])}
            </kbd>
          </li>
        ))}
      </ul>
      {!enabled && (
        <p className="text-muted-foreground text-[12px]">
          <Prose text={off} />
        </p>
      )}
    </div>
  );
}

function Blocks({ blocks, content }: { blocks: Block[]; content: HelpContent }) {
  const t = useT();
  const titleOf = (id: SectionId): string => content.sections[id].title;

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'p':
            return (
              <p key={i} className="my-3 text-[13px] leading-relaxed">
                <Prose text={block.text} />
              </p>
            );

          case 'note':
            return (
              <p
                key={i}
                className="border-primary bg-primary/5 my-4 border-l-2 py-2 pl-3 text-[13px] leading-relaxed"
              >
                <Prose text={block.text} />
              </p>
            );

          case 'h':
            // An address of its own, and the same `scroll-mt` its section has,
            // so arriving at a heading does not land it against the top edge.
            // The `#` is the link: shown on hover, because a document does not
            // need a column of them down its margin to be read.
            return (
              <h3
                key={i}
                id={block.id}
                className="group mt-6 mb-2 scroll-mt-6 text-[14px] font-semibold"
              >
                {block.text}
                <a
                  href={`#${block.id}`}
                  aria-hidden
                  tabIndex={-1}
                  className="text-muted-foreground ml-1.5 opacity-0 no-underline transition-opacity group-hover:opacity-100"
                >
                  #
                </a>
              </h3>
            );

          case 'rows':
            return <Rows key={i} rows={block.rows} />;

          case 'steps':
            return (
              <ol
                key={i}
                className="my-3 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed"
              >
                {block.items.map((item) => (
                  <li key={item}>
                    <Prose text={item} />
                  </li>
                ))}
              </ol>
            );

          case 'diagram': {
            const Diagram = DIAGRAMS[block.diagram];
            return (
              <figure key={i} className="my-4">
                {/* Every diagram depicts a tab, and every tab is a section, so
                    the tab's own translated name is what it is read out as. */}
                <Diagram title={titleOf(block.diagram)} t={t} />
                <figcaption>
                  <Legend callouts={block.callouts} />
                </figcaption>
              </figure>
            );
          }

          case 'image': {
            const Diagram = DIAGRAMS[block.diagram];
            return (
              // Capped rather than let out to the column's full width, which is
              // what a `diagram` takes. These draw one row or one strip, at the
              // size that row or strip actually is in the panel — blown up to
              // the width of the page they would read as something else.
              <figure key={i} className="my-3 max-w-[400px]">
                <Diagram title={block.title} t={t} />
              </figure>
            );
          }

          case 'cards':
            return <Cards key={i} cards={block.cards} titleOf={titleOf} />;

          case 'metrics':
            return <Metrics key={i} />;

          case 'hotkeys':
            return <Hotkeys key={i} off={content.hotkeysOff} />;
        }
      })}
    </>
  );
}

/** English is offered in English and Ukrainian in Ukrainian — see `language.ts`. */
function LanguagePicker() {
  const language = useLanguage();

  return (
    <div className="border-border flex overflow-hidden rounded border">
      {LANGUAGES.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => {
            setLanguage(tag);
          }}
          className={cn(
            'px-2 py-1 text-[12px] transition-colors',
            tag === language
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {LANGUAGE_LABELS[tag]}
        </button>
      ))}
    </div>
  );
}

export function HelpPage({ extensionVersion }: { extensionVersion?: string | null }) {
  const language = useLanguage();
  const content = HELP[language];

  // The panel's own accent, keyed off the same attribute `globals.css` reads —
  // exactly what `Shell` does, for exactly the same reason.
  const accent = useAccentTheme();
  useEffect(() => {
    document.documentElement.dataset['accent'] = accent.toLowerCase();
  }, [accent]);

  // The document is what the tab is called, and it changes with the language.
  useEffect(() => {
    document.title = content.title;
    document.documentElement.lang = language;
  }, [content.title, language]);

  // The page's scroll box, so the foot of the document can get back to the top
  // of it — the window itself no longer scrolls.
  const scroller = useRef<HTMLDivElement | null>(null);

  /** Which section the reader is in, as far as the contents list is concerned. */
  const [active, setActive] = useState<SectionId | null>(null);
  const [scrolled, setScrolled] = useState(false);

  /**
   * Going to a fragment, whether it arrived with the page or after it.
   *
   * The browser cannot do this for us on arrival: the hash is read while the
   * document is still empty, and the section it names does not exist until
   * React has rendered. So the page scrolls itself, once, after the first
   * paint — and again on `hashchange`, which is what a second click on the
   * panel's `?` looks like once this tab is already open.
   */
  useEffect(() => {
    const go = (): void => {
      const id = window.location.hash.slice(1);
      if (id === '') return;

      document.getElementById(id)?.scrollIntoView();
      // A heading's id is not a section's; only the latter is in the list.
      if (isSection(id)) setActive(id);
    };

    go();
    window.addEventListener('hashchange', go);
    return () => {
      window.removeEventListener('hashchange', go);
    };
  }, []);

  /**
   * Which entry of the contents list is lit.
   *
   * The band that decides is the **top** of the scroll box rather than the
   * whole of it: on a wide window three sections can be on screen at once, and
   * the one being read is the one under the top edge. `rootMargin` cuts the
   * observer's view down to that band, and the first section still in it — in
   * document order, not in the order the entries happen to arrive — is the one
   * the reader is in.
   */
  useEffect(() => {
    const root = scroller.current;
    if (root === null || typeof IntersectionObserver === 'undefined') return;

    const showing = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) showing.set(entry.target.id, entry.isIntersecting);
        setActive(SECTION_IDS.find((id) => showing.get(id) === true) ?? null);
      },
      { root, rootMargin: '0px 0px -70% 0px' },
    );

    for (const id of SECTION_IDS) {
      const section = document.getElementById(id);
      if (section !== null) observer.observe(section);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const toTop = (): void => {
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <ThemeProvider defaultTheme="dark">
      {/* The header is **outside** the thing that scrolls.

          It was `position: sticky` before, and the sidebar beside it was too,
          pinned at a number meant to match the header's height. That number can
          only ever be approximately right — the header is a hair taller than
          its content because of its own bottom border, and that hair was a
          pixel of travel before the sidebar settled.

          So the page is a column instead: a header that cannot move because
          nothing scrolls past it, and one scroll container under it. The
          sidebar pins at `top-0` of that container, which *is* the underside of
          the header, whatever height it happens to be. Nothing to keep in step,
          and nothing left to drift. */}
      <div className="bg-background text-foreground flex h-screen flex-col">
        {/* Kept shallow: a document is scrolled for minutes at a time, and a bar
            that never goes away has to pay for the height it takes out of every
            screenful. The tagline sits up beside the title where there is room
            and drops away where there is not — it says what the page is, which
            is worth a line on arrival and nothing by the third section. */}
        <header className="border-border bg-muted flex-none border-b">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2">
            <div className="flex flex-1 flex-wrap items-baseline gap-x-3">
              <h1 className="text-[14px] font-semibold">{content.title}</h1>
              <p className="text-muted-foreground hidden text-[12px] md:block">{content.tagline}</p>
            </div>
            {extensionVersion != null && (
              <span className="text-muted-foreground font-mono text-[12px]">
                {content.versionLabel} {extensionVersion}
              </span>
            )}
            <LanguagePicker />
            <ModeToggle />
          </div>
        </header>

        {/* The one thing that scrolls. Still padding-free at the top: each
            column brings its own, so the sidebar's box starts flush with the
            container and carries its padding along when it pins. */}
        <div
          ref={scroller}
          className="flex-1 overflow-y-auto"
          onScroll={(event) => {
            setScrolled(event.currentTarget.scrollTop > 400);
          }}
        >
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 pb-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
            <nav aria-label={content.contents} className="pt-6 lg:sticky lg:top-0 lg:self-start">
              <h2 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">
                {content.contents}
              </h2>

              {/* Numbered at the top level only. `Properties`, `Text` and
                  `Spine` are the property pane's three tabs, so they hang under
                  Scene rather than standing beside it — an indent says that,
                  and a second tier of numbers would only be more to read.

                  The entry for the section being read carries the accent on its
                  rule, and the rule doubles in width. On a document this long
                  the list is also a position: an entry that says "you are here"
                  is the difference between a contents list and a menu.

                  The extra pixel of rule is taken back out of the padding, so
                  the words do not step sideways as the mark travels down the
                  list while the reader scrolls. Only the colour and the opacity
                  are transitioned, never the width: `transition-all` animated
                  the rule from one pixel to two, and a mark that grows into
                  place reads as a twitch rather than as a move. */}
              <ol className="space-y-0.5">
                {OUTLINE.map((entry, i) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      aria-current={active === entry.id ? 'true' : undefined}
                      className={cn(
                        'block py-1 text-[13px] no-underline transition-[border-color,opacity]',
                        active === entry.id
                          ? 'border-primary border-l-2 pl-[9px] opacity-100'
                          : 'border-border hover:border-primary border-l pl-2.5 opacity-75 hover:opacity-100',
                      )}
                    >
                      {/* The same size and the same ink as the title it counts.
                          Dimmer and smaller, it read as a smudge rather than as
                          a number, which is the one thing it is for. */}
                      <span className="mr-1.5 font-semibold">{i + 1}</span>
                      {content.sections[entry.id].title}
                    </a>

                    {entry.children.length > 0 && (
                      <ol className="space-y-0.5">
                        {entry.children.map((child) => (
                          <li key={child}>
                            <a
                              href={`#${child}`}
                              aria-current={active === child ? 'true' : undefined}
                              className={cn(
                                'block py-1 text-[12px] no-underline transition-[border-color,opacity]',
                                active === child
                                  ? 'border-primary border-l-2 pl-[27px] opacity-100'
                                  : 'border-border hover:border-primary border-l pl-7 opacity-60 hover:opacity-100',
                              )}
                            >
                              {content.sections[child].title}
                            </a>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <main className="pt-6">
              {SECTION_IDS.map((id) => {
                const number = NUMBERED.get(id);

                return (
                  // The header no longer overlaps anything, so an anchor needs
                  // only enough room to not sit against the top edge.
                  <section
                    key={id}
                    id={id}
                    className={cn('scroll-mt-6', number === undefined ? 'mb-10' : 'mb-14')}
                  >
                    {/* Two tiers, and they are the tiers the contents list
                        draws: a numbered section starts a subject, and the
                        three that hang under Scene continue one. The number is
                        repeated here so that arriving from the contents list
                        lands somewhere recognisable — in the heading's own size
                        and ink, because it is part of the heading rather than a
                        decoration beside it. */}
                    <h2
                      className={cn(
                        'border-border mb-4 flex items-baseline gap-2 font-semibold',
                        number === undefined
                          ? 'border-b pb-1.5 text-[15px]'
                          : 'border-b-2 pb-2 text-[19px]',
                      )}
                    >
                      {number !== undefined && <span>{number}</span>}
                      {content.sections[id].title}
                    </h2>
                    <Blocks blocks={content.sections[id].blocks} content={content} />
                  </section>
                );
              })}

              <footer className="border-border text-muted-foreground border-t pt-4 text-[12px]">
                <p>{content.disclaimer}</p>
                <Button variant="ghost" size="xs" className="mt-2 -ml-2" onClick={toTop}>
                  ↑ {content.contents}
                </Button>
              </footer>
            </main>
          </div>
        </div>

        {/* The way back, from wherever the reader got to.

            The contents list is pinned beside the document on a wide window and
            scrolled away above it on a narrow one, which is exactly where a
            reader is least able to get back to it. Held out of the way until
            there is a distance worth undoing. */}
        {scrolled && (
          <Button
            variant="outline"
            size="icon"
            aria-label={content.contents}
            className="bg-raised fixed right-4 bottom-4 h-8 w-8 rounded-full shadow-md"
            onClick={toTop}
          >
            ↑
          </Button>
        )}
      </div>
    </ThemeProvider>
  );
}
