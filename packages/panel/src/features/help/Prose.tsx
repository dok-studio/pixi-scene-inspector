import { INLINE_ICONS } from './inlineIcons.js';

/**
 * `` `Filter` `` becomes a code span, `**so**` becomes emphasis, `{{eye}}`
 * becomes a glyph, and `[words](#cost)` becomes a link.
 *
 * A link's address is restricted to the two shapes the document actually uses —
 * a fragment of this page, or `https:` — by the pattern itself rather than by a
 * check afterwards. Anything else is not a link and is left as the characters
 * it is written with.
 */
const MARKUP = /`([^`]+)`|\*\*([^*]+)\*\*|\{\{(\w+)\}\}|\[([^\]]+)\]\((#[\w-]+|https:\/\/[^\s)]+)\)/g;

/**
 * Prose with the marks the document uses.
 *
 * A string rather than JSX in the content files, because a translator should be
 * handed sentences and a test should be able to compare them. Backticks carry a
 * second meaning besides the styling: what is in them is quoting the panel, and
 * therefore stays English in every language (§3.14). `{{name}}` is not text at
 * all — it names one of `INLINE_ICONS`, so a sentence can point at the actual
 * glyph a button carries rather than describe it.
 *
 * A token naming no glyph is drawn **as written**. Rendering nothing would let
 * a typo leave a hole in a sentence that nobody could see to report.
 */
export function Prose({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(MARKUP)) {
    const [whole, code, strong, icon, label, href] = match;
    const start = match.index;

    if (start > last) parts.push(text.slice(last, start));

    const Glyph = icon === undefined ? undefined : INLINE_ICONS[icon];

    if (icon !== undefined) {
      parts.push(
        Glyph === undefined ? (
          whole
        ) : (
          <Glyph key={start} className="mb-0.5 inline-block h-[1em] w-[1em] align-middle" />
        ),
      );
    } else if (label !== undefined && href !== undefined) {
      const external = href.startsWith('https://');

      parts.push(
        <a
          key={start}
          href={href}
          className="text-primary underline decoration-from-font underline-offset-2"
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {label}
        </a>,
      );
    } else {
      parts.push(
        code === undefined ? (
          <strong key={start} className="text-foreground font-semibold">
            {strong}
          </strong>
        ) : (
          <code
            key={start}
            className="bg-muted text-foreground rounded px-1 py-px font-mono text-[0.9em]"
          >
            {code}
          </code>
        ),
      );
    }

    last = start + whole.length;
  }

  if (last < text.length) parts.push(text.slice(last));

  return <>{parts}</>;
}

