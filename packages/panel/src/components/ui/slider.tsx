import * as SliderPrimitive from '@radix-ui/react-slider';
import * as React from 'react';

import { cn } from '../../lib/utils.js';

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="bg-border relative h-1 w-full grow overflow-hidden rounded-full">
      {/* The part behind the handle is how far the value has come, which is
          the same thing a switch says by being on — so it is filled with the
          same `--control-on` the switch is. */}
      <SliderPrimitive.Range className="bg-control-on absolute h-full" />
    </SliderPrimitive.Track>
    {/* A white handle in both themes, edged with the theme's own ink: in the
        light one that edge is what holds it against the pale track behind it,
        and in the dark one it is white on white — the plain circle it was. */}
    <SliderPrimitive.Thumb className="border-foreground focus-visible:ring-ring block h-3.5 w-3.5 rounded-full border bg-white shadow transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
