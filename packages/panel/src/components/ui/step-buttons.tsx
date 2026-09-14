import type { useStepButtons } from '../../lib/useStepButtons.js';

/** The ▲▼ pair beside a number field. Behaviour lives in `useStepButtons`. */

/**
 * `flex-none` is not decoration.
 *
 * These sit at the end of a flex row that can be squeezed — two of them share
 * one row inside a vector — and a shrinking button behind `overflow-hidden` is
 * a half-drawn arrow, which is what a narrow panel used to show. What gives way
 * instead is the field beside them, which has a `min-w-0` for that purpose.
 */
const STEP =
  'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground active:bg-secondary/80 flex h-[12px] w-[14px] flex-none items-center justify-center text-[8px] leading-none transition-colors';

export function StepButtons({ incProps, decProps }: ReturnType<typeof useStepButtons>) {
  return (
    <div className="flex flex-none flex-col overflow-hidden rounded-r">
      <button {...incProps} type="button" className={STEP}>
        ▲
      </button>
      <button {...decProps} type="button" className={STEP}>
        ▼
      </button>
    </div>
  );
}
