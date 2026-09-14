import type { Language } from '../../settings/language.js';
import { en } from './en.js';
import { uk } from './uk.js';
import type { HelpContent } from './types.js';

/**
 * The document in each language, reached the same way the panel's own strings
 * are — off `useLanguage()`, so the help page and the panel behind it are never
 * in two different languages.
 *
 * English is the source and Ukrainian declares itself as `HelpContent`, so a
 * section written in one and forgotten in the other does not build. Same
 * bargain as `i18n/messages.ts`: a batch cannot land half-translated, which is
 * the cost we want, because a fallback that works is a fallback nobody removes.
 */
export const HELP: Record<Language, HelpContent> = { en, uk };

export type { Block, Callout, Card, HelpContent, Row, Section, SectionId } from './types.js';
export { SECTION_IDS } from './types.js';
