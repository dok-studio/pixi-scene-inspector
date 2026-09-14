import { FaXmark } from 'react-icons/fa6';

import { Hint } from '../../../../../components/ui/tooltip.js';
import { cn } from '../../../../../lib/utils.js';
import type { Setup } from './setups.js';

/**
 * The Spines of one selection, and which of them is on screen.
 *
 * The first is the game's own node. The rest are tests — a Spine apiece, built
 * beside it — so the strip is a list of objects rather than of arrangements.
 *
 * Two different questions live on one row, and it keeps them apart on purpose:
 *
 *  - **the label opens a tab** — you can look at one, and change it, while
 *    something else is on screen;
 *  - **the box shows it** — the scene has room for one Spine in that place, so
 *    turning one on turns the others off, and there is no "none".
 *
 * Splitting them is what makes a comparison possible: set the test up while the
 * original is still what you see, then flip to it.
 *
 * The first tab is called what it is; a test is called after the skeleton it
 * carries, which is the thing that distinguishes one test from another. Until
 * one is chosen it has no Spine at all, and `Test N` says so.
 */
export function SetupTabs({
  setups,
  shown,
  applied,
  onShow,
  onApply,
  onRemove,
}: {
  setups: readonly Setup[];
  shown: number;
  applied: number;
  onShow: (index: number) => void;
  onApply: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="border-border flex items-stretch overflow-x-auto border-b">
      {setups.map((setup, index) => (
        <div
          key={index}
          className={cn(
            'border-border flex min-w-0 shrink-0 items-center gap-1.5 border-r px-2 py-1',
            index === shown ? 'bg-background' : 'bg-muted text-muted-foreground',
          )}
        >
          <Hint text={index === applied ? 'On screen now' : 'Show this one instead'}>
            <input
              type="radio"
              checked={index === applied}
              onChange={() => onApply(index)}
              className="accent-primary size-3 shrink-0 cursor-pointer"
            />
          </Hint>

          <Hint
            text={
              index === 0
                ? "The game's own Spine — open it without changing the scene"
                : 'Open this one without changing the scene'
            }
          >
            <button
              type="button"
              className={cn('min-w-0 cursor-pointer truncate', index === shown && 'font-bold')}
              onClick={() => onShow(index)}
            >
              {index === 0 ? 'Original' : (setup.skeleton ?? `Test ${index}`)}
            </button>
          </Hint>

          {/* The game's own node is not the panel's to take out of the scene. */}
          {index > 0 && (
            <Hint text="Take this test Spine out of the scene">
              <button
                type="button"
                className="hover:text-foreground shrink-0 opacity-60"
                onClick={() => onRemove(index)}
              >
                <FaXmark />
              </button>
            </Hint>
          )}
        </div>
      ))}
    </div>
  );
}
