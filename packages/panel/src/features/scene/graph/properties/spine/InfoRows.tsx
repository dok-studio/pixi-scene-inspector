import type { SpineInfo } from '@scene-inspector/protocol';

import { formatNumber } from '../../../../../lib/formatNumber.js';

/**
 * What the skeleton *has*, as opposed to what it is doing.
 *
 * Everything above this reads as a control: a picker chooses, a slider scrubs,
 * a button applies. This is the one part that is only there to be read — the
 * whole cast of animations with their lengths, and the events an artist keyed
 * into the skeleton. Wanting to know what a skeleton contains is a question in
 * its own right, and answering it by opening a picker meant for choosing was
 * always a borrowed answer.
 *
 * It describes **the skeleton being chosen**, not necessarily the one running:
 * between a choice and Apply those differ, and the point of the list is to see
 * what you are about to get.
 *
 * The events are custom events — what was keyed into the animations, which the
 * log names as they fire. A skeleton with none draws no box at all rather than
 * an empty one: an absent list says "this skeleton has no events" more plainly
 * than a present and empty one does.
 */

/**
 * A list, in a box of its own.
 *
 * Two things the label-and-value rows elsewhere in this tab could not do. A list
 * of forty animations needs an edge and a scroll of its own, or it pushes the
 * rest of the panel off screen; and its label needs a line of its own, because
 * `animations` is wider than the label column every other row uses and ran into
 * its own values.
 *
 * The border is the one the read-only style snippet uses, for the same reason:
 * both are text to look at rather than fields to fill in.
 */
function Listing({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1">{label}</div>
      <div className="border-input bg-field max-h-40 overflow-y-auto rounded-md border px-2 py-1">
        {children}
      </div>
    </div>
  );
}

export function InfoRows({ info }: { info: SpineInfo }) {
  return (
    <div className="space-y-2 px-2 py-1.5 text-xs">
      <Listing label="animations">
        {info.animations.length === 0 ? (
          <span className="text-muted-foreground">{info.pending ? 'Reading…' : 'None.'}</span>
        ) : (
          info.animations.map((animation) => (
            <div key={animation.name} className="flex items-baseline justify-between gap-2 py-0.5">
              <span className="min-w-0 break-words">{animation.name}</span>
              {/*
               * Only where it is known. Two of the three ways a skeleton the
               * node is not carrying gets read do not parse its timelines, so
               * a zero there means "not read" rather than "instant".
               */}
              {animation.duration > 0 && (
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {formatNumber(animation.duration, 2)}
                </span>
              )}
            </div>
          ))
        )}
      </Listing>

      {info.events.length > 0 && (
        <Listing label="events">
          {info.events.map((event) => (
            <div key={event} className="break-words py-0.5">
              {event}
            </div>
          ))}
        </Listing>
      )}
    </div>
  );
}
