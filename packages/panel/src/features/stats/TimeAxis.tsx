/**
 * The one time axis every chart is read against.
 *
 * One row above the list instead of a caption under each chart. Twenty charts
 * each saying "60 seconds … now" spent two rows apiece to answer a question
 * that has one answer for all of them, and none of those answers was **when**:
 * "two minutes ago" is not a moment that can be lined up against a log line, a
 * screenshot, or anything else somebody is holding.
 *
 * Sticky, because the answer has to still be there after scrolling past six
 * charts to reach the one in question.
 */

function clock(at: number): string {
  const time = new Date(at);
  const two = (value: number): string => String(value).padStart(2, '0');

  return `${two(time.getHours())}:${two(time.getMinutes())}:${two(time.getSeconds())}`;
}

export function TimeAxis({
  from,
  to,
  /** The moment under the pointer, if there is one. */
  at,
}: {
  from: number;
  to: number;
  at: number | null;
}) {
  const middle = from + (to - from) / 2;

  return (
    <div className="border-border bg-background text-muted-foreground sticky top-0 z-10 flex h-5 items-center justify-between border-b px-2 text-[10px] tabular-nums">
      <span>{clock(from)}</span>
      {/*
        The hovered moment takes the middle slot rather than a place of its own.
        It is the same kind of fact as the two beside it — a time on this axis —
        and giving it a row would leave that row empty most of the time.
      */}
      {at === null ? (
        <span>{clock(middle)}</span>
      ) : (
        <span className="text-foreground font-bold">{clock(at)}</span>
      )}
      <span>{clock(to)}</span>
    </div>
  );
}
