import { Fragment } from 'react';

import { cn } from '../../../../../lib/utils.js';

/**
 * Long animation names, in a panel a few hundred pixels wide.
 *
 * Real skeletons name their animations as paths — `collector/collect/lvl_4/win/loop`
 * — and the part that tells two of them apart can be anywhere in it. These two
 * helpers keep such a name readable without measuring anything: one lets it wrap
 * where a person would break it, the other lets a single line lose its middle
 * rather than its end.
 */

/** Where a name may break: after each of these, never inside a word. */
const SEPARATOR = /([/_.-])/;

/**
 * The name with a break opportunity after every separator, so a list that wraps
 * it puts `loop` on the next line instead of `op`.
 */
export function breakableName(name: string): React.ReactNode {
  const parts = name.split(SEPARATOR);

  return parts.map((part, index) =>
    SEPARATOR.test(part) ? (
      <Fragment key={index}>
        {part}
        <wbr />
      </Fragment>
    ) : (
      part
    ),
  );
}

/**
 * The name split at its last `/`: everything before the slash, and the slash
 * with the last segment — so a head cut short still reads `collector/co…/loop`.
 * A name with no slash, or one that ends in it, is all tail.
 */
export function splitTail(name: string): { head: string; tail: string } {
  const cut = name.lastIndexOf('/');
  if (cut <= 0 || cut === name.length - 1) return { head: '', tail: name };

  return { head: name.slice(0, cut), tail: name.slice(cut) };
}

/**
 * A name on one line that, when it does not fit, loses its **middle**:
 * `collector/co…/loop`. The beginning and the last segment both survive, which
 * is where two animations of the same set usually differ.
 *
 * Two spans in a flex row, each truncating on its own. The head shrinks a
 * thousand times faster than the tail, so the tail gives way only once the head
 * is down to a few characters — kept so the name still shows where it starts.
 */
export function MiddleTruncated({ name, className }: { name: string; className?: string }) {
  const { head, tail } = splitTail(name);

  return (
    <span className={cn('flex min-w-0', className)}>
      {head !== '' && <span className="min-w-[4ch] shrink-[1000] truncate">{head}</span>}
      <span className="min-w-0 truncate">{tail}</span>
    </span>
  );
}
