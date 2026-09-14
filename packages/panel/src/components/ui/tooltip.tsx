import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '../../lib/utils.js';
import { tipParts } from './tipParts.js';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    // Kept off the edges of the panel, the way a popover is: a label pushed
    // flush against the side of the window reads as something that overflowed
    // rather than as something that was placed.
    collisionPadding={8}
    className={cn(
      'bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 overflow-hidden rounded-md px-3 py-1.5 text-xs',
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * The name of a control, shown when the pointer rests on it — what a `title`
 * attribute used to do here.
 *
 * It used to be exactly that, and the browser drew it: a square black label
 * with a white edge, the same one whatever the panel's theme, and nothing CSS
 * can reach. So the panel draws its own instead, on the surface a popover
 * uses — dark in the dark theme, near-white in the light one — and it follows
 * the panel rather than the browser.
 *
 * **Not `TooltipWrapper` below.** That one is a paragraph about what a switch
 * does, filled with the accent so it reads as something to stop and read;
 * this is two or three words naming a button, and forty accent-filled labels
 * on forty small buttons would be a panel that flashes colour wherever the
 * pointer goes.
 *
 * The trigger is the child itself (`asChild`), so nothing is added to the
 * layout and a child that is already someone else's trigger — a popover's,
 * say — keeps working. The text is also hung on the child as its accessible
 * name, which is what the attribute quietly did for every icon-only button
 * here; a child naming itself keeps its own.
 */
const Hint: React.FC<{
  /** Empty for a control that has nothing to say about itself right now — it
   *  is then left as it is, rather than given a label with nothing in it. */
  text: string;
  children: React.ReactNode;
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side'];
  /** Distance from that side, in the sense Radix gives it: negative pulls the
   *  tip back over the trigger instead of past its edge. */
  sideOffset?: number;
}> = ({ text, children, side, sideOffset }) =>
  text === '' ? (
    <>{children}</>
  ) : (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild aria-label={text}>
          {children}
        </TooltipTrigger>
        <TooltipPrimitive.Portal>
          <TooltipContent
            side={side}
            sideOffset={sideOffset}
            className="bg-hint text-popover-foreground border-raised-border max-w-60 border font-normal shadow-md"
          >
            {text}
          </TooltipContent>
        </TooltipPrimitive.Portal>
      </Tooltip>
    </TooltipProvider>
  );

/**
 * A tip with a trigger, as the previous project wrapped it — the marker below
 * being this product's own.
 *
 * `[[...]]` marks the hotkey clause — `[[Toggle Alt+W]]`, the verb and the
 * combination together — and is the one thing in a tip that is not prose: a
 * hand reading for "what do I press" should find it without reading the
 * sentence above it. So it is given a line of its own and a colour of its own
 * (`--tip-hotkey` in `globals.css`, which is where the four accents it has to
 * stand on are answered), rather than a box, which set it apart from the
 * sentence by putting a second surface inside a surface.
 *
 * Where a clause ends and the verb inside it begins is `tipParts` — out on its
 * own because translation can break it, and a rule that can be broken silently
 * is one a test should hold.
 */
const TooltipWrapper: React.FC<{
  trigger: React.ReactNode;
  tip: string;
  triggerProps?: React.ComponentPropsWithoutRef<typeof TooltipTrigger>;
  contentProps?: React.ComponentPropsWithoutRef<typeof TooltipContent>;
  providerProps?: Omit<React.ComponentPropsWithoutRef<typeof TooltipProvider>, 'children'>;
}> = ({ trigger, tip, triggerProps, contentProps, providerProps }) => {
  const parts = tipParts(tip).map((part, index) =>
    part.kind === 'text' ? (
      <span key={index}>{part.text}</span>
    ) : (
      <span key={index} className="mt-1 block font-semibold text-[hsl(var(--tip-hotkey))]">
        {/* A step larger than the line it sits on: a monospace face at the
            same size reads smaller than the prose beside it, and this is the
            half of the line anyone is here for. */}
        {part.verb}: <span className="font-mono text-[13px]">{part.combo}</span>
      </span>
    ),
  );

  return (
    <TooltipProvider {...providerProps}>
      <Tooltip>
        <TooltipTrigger {...triggerProps}>{trigger}</TooltipTrigger>
        <TooltipPrimitive.Portal>
          <TooltipContent {...contentProps} className="max-w-72">
            <div>{parts}</div>
          </TooltipContent>
        </TooltipPrimitive.Portal>
      </Tooltip>
    </TooltipProvider>
  );
};

export { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, TooltipWrapper };
