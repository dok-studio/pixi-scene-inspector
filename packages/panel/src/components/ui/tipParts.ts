/**
 * A tooltip, split into prose and the hotkey clauses inside it.
 *
 * Out here rather than inline in `TooltipWrapper` because there is a rule in it
 * that only a test can hold: **the verb is the first word**, and everything
 * after it is the combination. That survives translation only while the verb of
 * every language is one word — `Toggle` → `Перемкнути`, `Cycle` → `Перебрати` —
 * and a translator who reaches for two would break the tip silently, with the
 * second word sliding into the key combination (§3.14).
 */

/** `[[Toggle Alt+W]]` — the clause is what stands between the brackets. */
const HOTKEY = /\[\[(.*?)\]\]/g;

export type TipPart =
  | { kind: 'text'; text: string }
  | { kind: 'hotkey'; verb: string; combo: string };

export function tipParts(tip: string): TipPart[] {
  const parts: TipPart[] = [];
  let last = 0;

  for (const match of tip.matchAll(HOTKEY)) {
    const [whole, clause = ''] = match;
    const start = match.index;

    if (start > last) parts.push({ kind: 'text', text: tip.slice(last, start) });

    const [verb = '', ...comboWords] = clause.split(' ');
    parts.push({ kind: 'hotkey', verb, combo: comboWords.join(' ') });

    last = start + whole.length;
  }

  if (last < tip.length) parts.push({ kind: 'text', text: tip.slice(last) });

  return parts;
}
