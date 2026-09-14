import type { NodeId, SpineEvent } from '@scene-inspector/protocol';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../../../../../components/ui/button.js';
import { useT } from '../../../../../i18n/index.js';
import { CopyButton } from '../../../../../components/ui/copy-button.js';
import { formatNumber } from '../../../../../lib/formatNumber.js';
import type { Client } from '../../../../../transport/client.js';
import { cn } from '../../../../../lib/utils.js';

/**
 * What the skeleton has been doing.
 *
 * Spine pushes this — a listener on the animation state — and the panel pulls
 * (rule 3), so the push stops in a ring buffer in the page and this reads out
 * of it. Two consequences worth knowing about:
 *
 *  - **the listener exists only while this is open.** Opening the section turns
 *    capture on, closing or leaving turns it off, so a skeleton nobody is
 *    watching costs nothing. Same discipline as the render hook (rule 5).
 *  - **the log starts when you open it.** There is no history to show from
 *    before the listener went on, which is honest rather than a limitation to
 *    apologise for: a gap the panel *did* miss is reported as one.
 */

/** Slower than the tracks: a log is read, not watched. */
const INTERVAL_MS = 250;

/** More than fits on screen, and the buffer in the page holds 200 anyway. */
const KEPT = 200;

const KIND_COLOUR: Record<SpineEvent['kind'], string> = {
  start: 'text-primary',
  interrupt: 'text-amber-500',
  end: 'text-muted-foreground',
  dispose: 'text-muted-foreground',
  complete: 'text-emerald-500',
  event: 'text-sky-500',
};

function describe(event: SpineEvent): string {
  if (event.kind !== 'event') return event.animation ?? 'empty';

  const values = [
    event.intValue === undefined ? null : `int ${event.intValue}`,
    event.floatValue === undefined ? null : `float ${formatNumber(event.floatValue, 3)}`,
    event.stringValue === undefined ? null : `"${event.stringValue}"`,
  ].filter((value): value is string => value !== null);

  return values.length === 0 ? (event.name ?? '') : `${event.name ?? ''} (${values.join(', ')})`;
}

/** One line of the log as text, in the order the columns are drawn. */
function asText(line: SpineEvent | { gap: number; seq: number }): string {
  if ('gap' in line) return `… ${line.gap} missed`;

  return [formatNumber(line.time, 2), `#${line.track}`, line.kind, describe(line)].join('\t');
}

export function EventLog({ client, id }: { client: Client; id: NodeId }) {
  const t = useT();
  const [lines, setLines] = useState<Array<SpineEvent | { gap: number; seq: number }>>([]);

  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;

    client.send('spine.setEventCapture', { id: idRef.current, on: true });

    const tick = async (): Promise<void> => {
      if (cancelled) return;

      if (!document.hidden) {
        try {
          const answer = await client.call('spine.events', { id: idRef.current, since: cursor });
          if (cancelled) return;

          if (answer.dropped > 0 || answer.entries.length > 0) {
            setLines((held) => {
              const gap =
                answer.dropped > 0 ? [{ gap: answer.dropped, seq: cursor + 0.5 }] : [];

              return [...held, ...gap, ...answer.entries].slice(-KEPT);
            });
          }

          cursor = answer.cursor;
        } catch {
          // The node may have gone. The next tick finds out.
        }
      }

      if (!cancelled) timer = setTimeout(() => void tick(), INTERVAL_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      client.send('spine.setEventCapture', { id: idRef.current, on: false });
    };
  }, [client]);

  return (
    <div className="text-xs">
      <div className="flex items-center justify-end gap-1 px-2 py-1">
        {/*
         * Tab-separated, because the reason to copy a log is to put it
         * somewhere else — a bug report, a message, a spreadsheet — and what is
         * on screen is columns.
         */}
        <CopyButton
          value={lines.map(asText).join('\n')}
          title={t('spine.copyLog')}
        />

        <Button variant="outline" size="xs" className="px-2" onClick={() => setLines([])}>
          Clear
        </Button>
      </div>

      {lines.length === 0 ? (
        <p className="text-muted-foreground px-2 pb-2">Nothing yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          {lines.map((line) =>
            'gap' in line ? (
              <p key={line.seq} className="text-muted-foreground py-0.5 italic">
                … {line.gap} missed
              </p>
            ) : (
              <div key={line.seq} className="flex items-baseline gap-2 py-0.5">
                <span className="text-muted-foreground w-10 shrink-0 text-right tabular-nums">
                  {formatNumber(line.time, 2)}
                </span>
                <span className="text-muted-foreground w-6 shrink-0">#{line.track}</span>
                <span className={cn('w-16 shrink-0', KIND_COLOUR[line.kind])}>{line.kind}</span>
                {/*
                 * Wrapped, not clipped. A named event carries its values with
                 * it — `change_bg (int 0, float 0, "left")` — and those values
                 * are the whole reason to look at the line; cutting them off at
                 * the panel's edge hid exactly what was worth reading.
                 */}
                <span className="min-w-0 flex-1 break-words">{describe(line)}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
