import { cva } from 'class-variance-authority';

/**
 * One tab, wherever tabs are drawn — the navbar's Scene/Assets and the property
 * panel's Properties/Text/Spine.
 *
 * Shared because there are now two strips on screen at once, and two strips
 * marking the active tab differently would be two things to read instead of
 * one.
 *
 * **The mark is the surface, not a line.** The previous project underlined the
 * open tab; that line fell exactly where the tab meets what it opened, which
 * with a second strip underneath read as a cut rather than as a selection. A
 * coloured line along the top edge was tried in its place and had the same
 * trouble in reverse — a rule bright enough to be the mark is also loud enough
 * to be read as the edge of something. So there is no rule at all: the open tab
 * takes the colour of the content, drops the muted background and sets its
 * label bold and full-strength, and the closed ones stay muted in both.
 *
 * For that to hold, **a strip of tabs draws no bottom border of its own**: a
 * rule there would run between the open tab and what it opened. The edge under
 * the other tabs comes from the colour change instead — muted above, the
 * content's colour below.
 *
 * Hover is the label coming back to full strength, and nothing else. A tab
 * under the pointer is about to be the open one, so it borrows the one thing
 * the open one has.
 */
export const tabVariants = cva(
  'inline-flex h-8 min-h-8 cursor-pointer items-center justify-center whitespace-nowrap border-r border-border px-3 text-sm',
  {
    variants: {
      variant: {
        active: 'bg-background font-bold',
        inactive: 'text-muted-foreground hover:text-foreground bg-muted font-medium',
      },
    },
    defaultVariants: { variant: 'inactive' },
  },
);
