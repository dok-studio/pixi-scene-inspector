import { cn } from '../../../../lib/utils.js';
import { Toggle } from '../../../../components/ui/toggle.js';

/**
 * The little pressed-state buttons pinned to the right of a tree row — the eye
 * and the padlock. Ported from the previous project, minus the extension
 * registry that fed it arbitrary buttons: this product has no user extensions,
 * so the two it ships are declared where they are used.
 */
export function NodeToggleButton({
  pressed,
  icon,
  onPressedChange,
  className,
}: {
  pressed: boolean;
  icon: React.ReactNode;
  onPressedChange: (pressed: boolean) => void;
  className?: string;
}) {
  const stop = (event: React.MouseEvent): void => {
    // The row underneath selects on click and folds on double click.
    event.stopPropagation();
  };

  return (
    <Toggle
      asChild
      variant="outline"
      size="xs"
      className={cn('overflow-hidden whitespace-nowrap px-1', className)}
      onClick={stop}
      onDoubleClick={stop}
      onPressedChange={onPressedChange}
      pressed={pressed}
    >
      <div>{icon}</div>
    </Toggle>
  );
}
