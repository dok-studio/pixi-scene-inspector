import * as TogglePrimitive from '@radix-ui/react-toggle';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils.js';

const toggleVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-accent aria-pressed:text-accent-foreground',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        /*
         * The accent fill is what says "on", so **hovering must not draw it** —
         * the same rule the `icon` size states below, and this variant was
         * breaking it. Hover reddened the button to `--primary/90` while pressed
         * was `--primary`: near enough that a button under the pointer looked
         * pressed whether it was or not, and letting go answered nothing.
         *
         * The four states are one ladder of the same hue, and no two rungs are
         * a shade apart: nothing, a **wash** of the accent, the accent, and the
         * accent softened. A wash previews what pressing would do and cannot be
         * read as the fill itself, while a pressed button still answers the
         * pointer in the colour it already is. The `icon` size draws the same
         * ladder in grey, because its "on" is a ring rather than a fill and a
         * hue in the hover would be the louder of the two marks.
         *
         * The theme's neutral hover was tried here first and is too quiet for
         * this: `--accent` is eight points off `--background`, which on a button
         * 16px tall is not a hover at all.
         *
         * The ink follows the fill it sits on rather than the base's:
         * `--accent-foreground` belongs to the pale `--accent`, and in the light
         * theme it is near-black, which on that pink came to about 2.9:1.
         * `--primary-foreground` is what the token exists to be read against.
         */
        outline:
          'border border-primary bg-background shadow-sm hover:bg-primary/25 hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/80 aria-pressed:hover:text-primary-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2',
        xs: 'h-4 px-2 text-xs',
        lg: 'h-10 px-3',
        /*
         * **The line closes into a ring.** This was a bar under the button,
         * ported from the previous project. It fell exactly where the button
         * meets the row's own border, and a rule there reads as the edge of
         * something rather than as a mark on a control — the same complaint
         * `ui/tab.tsx` makes about underlining the open tab. The tab answered it
         * by dropping the line; a button has no surface of its own to take
         * instead, so it keeps the line and runs it the whole way round. Muted
         * to 45%, or a row of switches out-shouts the tree it is pointing at.
         *
         * What was already right stays: the border is **always** there,
         * transparent when off, so nothing shifts by a pixel on press.
         * `border-transparent` has to be said out loud — `globals.css` gives
         * every element `@apply border-border`, so a bare `border` draws grey.
         *
         * **Hover is grey, with no hue at all.** The accent is spoken for: it
         * means "this is on". A hover in the same colour made a button under the
         * pointer look pressed whether it was or not, and letting go answered
         * nothing. A neutral wash says "this is what you would turn on" without
         * pretending to be the answer.
         *
         * **The numbers are stated per theme rather than derived**, the way
         * `--control-on` already is in `globals.css`. A wash that sinks into
         * white paper has to climb out of a dark panel: `primary/20` over the
         * dark `--background` comes out fainter than the plain grey hover above
         * it, which would leave the mark weaker than the thing it has to
         * outrank. So the dark theme takes a denser fill and a firmer ring, and
         * its hover moves up with them to keep its distance.
         */
        icon:
          'h-6 w-6 rounded-sm border border-transparent [&_svg]:size-3 ' +
          'aria-[pressed=false]:hover:bg-foreground/10 ' +
          'dark:aria-[pressed=false]:hover:bg-foreground/[0.16] ' +
          'aria-pressed:border-primary/45 aria-pressed:bg-primary/20 ' +
          'aria-pressed:hover:bg-primary/[0.32] ' +
          'dark:aria-pressed:border-primary/70 dark:aria-pressed:bg-primary/35 ' +
          'dark:aria-pressed:hover:bg-primary/[0.48]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root ref={ref} className={cn(toggleVariants({ variant, size, className }))} {...props} />
));
Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };
