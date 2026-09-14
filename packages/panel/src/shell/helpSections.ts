import { COLUMNS } from '../features/custom/columns.js';
import type { SectionId } from '../features/help/content/types.js';

/**
 * Which part of the help document the bar's `?` opens.
 *
 * A tab and the section that explains it, keyed by the names the tab set
 * already uses. The reader is standing in one of them when they press the
 * button, and what they get is a document of fourteen sections — landing them
 * at the top of it and leaving them to find their own tab again is the kind of
 * help that gets closed.
 *
 * A module of its own, small as it is, because it is the one place where two
 * things that never otherwise meet have to agree: the tab names, which are
 * storage keys, and the section ids, which are addresses in another document.
 * `helpSections.test.ts` holds them to each other — a renamed section would
 * otherwise leave the button pointing at a fragment nothing answers to, and
 * the page would simply open at the top with nothing to say it had failed.
 */
export const HELP_SECTIONS: Record<string, SectionId> = {
  Scene: 'scene',
  Assets: 'assets',
  Stats: 'stats',
  /** Not a `Column`: the tab that holds the columns, and its own section. */
  Custom: 'custom',
};

/** Every tab the bar can be standing on, `Custom` included. */
export const HELP_TABS = [...COLUMNS, 'Custom'] as const;
