import type { Language } from '../features/settings/language.js';
import { useLanguage } from '../features/settings/language.js';
import { MESSAGES } from './messages.js';
import type { MessageKey } from './messages.js';

/** `{name}` — named rather than positional, because word order moves. */
const SLOT = /\{(\w+)\}/g;

/**
 * A slot with no value is left exactly as it was written.
 *
 * A visible `{name}` in the panel is a bug somebody reports; a gap where a
 * name should be is a mystery nobody can describe. The replacement is not
 * re-scanned, so a node actually called `{name}` cannot expand into anything.
 */
export function fill(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(SLOT, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole,
  );
}

/**
 * What a component is handed.
 *
 * A callable object rather than several hooks: it is one thing to put in a
 * `useMemo`'s dependency list, and its identity changes exactly when the
 * language does — which is what makes a memoised table of labels correct
 * rather than stale (§3.14).
 */
export interface T {
  (key: MessageKey): string;
  /** `t.fill('scene.delete.title', { name })` */
  fill(key: MessageKey, values: Readonly<Record<string, string | number>>): string;
  language: Language;
}

const TRANSLATORS = new Map<Language, T>();

export function translator(language: Language): T {
  const cached = TRANSLATORS.get(language);
  if (cached !== undefined) return cached;

  const messages = MESSAGES[language];

  const t = ((key: MessageKey) => messages[key]) as T;
  t.fill = (key, values) => fill(messages[key], values);
  t.language = language;

  TRANSLATORS.set(language, t);
  return t;
}

/**
 * The **only** way to reach a translation.
 *
 * There is deliberately no module-scope `t(key)`: a call outside a render is a
 * string resolved once, under whatever language was on at import time, and
 * never again. Making that impossible is cheaper than remembering it.
 */
export function useT(): T {
  return translator(useLanguage());
}
