import type { Language } from '../features/settings/language.js';
import { en } from './en.js';
import { uk } from './uk.js';

/**
 * English is the source and the type at once.
 *
 * `uk.ts` declares itself as `Messages`, so a key added here and forgotten
 * there is a build failure rather than a screen that quietly falls back to
 * English. That is deliberate, and it has a cost: a batch cannot land
 * half-translated. It is the cost we want, because a fallback that works is a
 * fallback nobody ever removes.
 *
 * Adding a language is a file of this type plus one entry here and one in
 * `LANGUAGE_LABELS`.
 */
export type MessageKey = keyof typeof en;

export type Messages = Record<MessageKey, string>;

export const MESSAGES: Record<Language, Messages> = { en, uk };
