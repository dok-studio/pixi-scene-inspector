import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { cn } from '../../lib/utils.js';

/**
 * A panel anchored to a trigger, in a portal.
 *
 * The portal is the whole point. The colour picker used to position itself with
 * `absolute bottom-full right-0` inside the property row, which put it inside
 * every scrolling ancestor the row has: a panel narrow enough — the drawer
 * docked to the side — cut the picker off at its own edge, and a row near the
 * top of a scrolled section had it hidden above. Radix places it against the
 * viewport instead and turns it over to the other side when there is no room,
 * which is the behaviour a control this size needs at the widths this panel
 * actually gets.
 */

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'end', side = 'top', sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      side={side}
      sideOffset={sideOffset}
      collisionPadding={8}
      className={cn(
        // `bg-raised`, not `bg-popover`: the panel and `--popover` are the same
        // colour, so a panel this size would have no edge of its own where it
        // covers one. See the token in `globals.css`.
        'bg-raised text-popover-foreground border-raised-border z-50 rounded-md border p-2 shadow-lg outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger };
