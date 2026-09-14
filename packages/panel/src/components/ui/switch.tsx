import * as SwitchPrimitives from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '../../lib/utils.js';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      /*
        Filled with `--control-on` when it is on — the theme's colour for a
        control this size, which is not always the accent itself; see
        `globals.css`. Opaque, because a fill that lets the panel through
        muddies at every strength worth using.
        Edged with the accent under the pointer while it is off.
        On it cannot be: an accent edge around an accent fill is no edge at
        all, so the one it takes there is the theme's own ink — near-white in
        the dark theme, which is the white it used to be written as, and
        near-black in the light one, where that white was invisible against
        both the panel and the fill.
      */
      'border-border hover:border-primary focus-visible:ring-ring focus-visible:ring-offset-background data-[state=checked]:bg-control-on data-[state=unchecked]:bg-background peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:hover:border-foreground',
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-3.5 w-3.5 rounded-full bg-black/60 shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-1 data-[state=checked]:bg-white dark:bg-white',
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
