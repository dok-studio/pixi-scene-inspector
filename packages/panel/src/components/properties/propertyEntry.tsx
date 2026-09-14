import { cn } from '../../lib/utils.js';
import { Separator } from '../ui/separator.js';
import { TooltipWrapper } from '../ui/tooltip.js';
import { useCopyGesture } from './useCopyGesture.js';

/**
 * One labelled row in a property section. Ported from the previous project.
 *
 * Not memoised, though it was: `input` is a React element the parent builds
 * afresh on every render, so no comparison of these props could ever hold and
 * the memo was a cost with no saving behind it. What is memoised, and
 * genuinely, is the editor inside — on its value, which is data
 * (`propertyMap.tsx`).
 */

export const PropertyEntry: React.FC<{
  title: string;
  input: React.ReactNode;
  className?: string;
  tooltip?: string;
  /**
   * The field as source, put in the clipboard when its **name** is
   * double-clicked (`useCopyGesture`). Absent leaves the name inert, which is
   * what a row whose value is nothing anyone would write is.
   */
  copy?: string;
  isLast?: boolean;
  /**
   * The width of the name column, where eleven characters are not the right
   * measure. The Assets pane's `Info` is read rather than edited, and its
   * longest name — `Power of two` — broke over two lines at the shared width;
   * widening it there costs nothing, because none of those readings fills the
   * field beside it.
   */
  titleClassName?: string;
  /**
   * A hairline under the row, unless it is the last one.
   *
   * Off for a table that is **read** rather than edited: the Assets pane's
   * `Info` is eighteen short readings in a row, and a rule between every pair
   * of them made a picket fence out of what is really one block of text. Where
   * a row can be edited the rule earns its keep — it says where one field ends
   * and the next begins.
   */
  separated?: boolean;
}> = ({
  title,
  input,
  className,
  tooltip,
  copy,
  isLast = false,
  separated = true,
  titleClassName,
}) => {
  const { className: nameClass, onDoubleClick } = useCopyGesture(copy);

  return (
    <>
      <div className={cn('flex h-full items-center pt-0', className)}>
        {tooltip === undefined ? (
          // Eleven characters wide, said in `ch` because the panel is set in a
          // monospace face and that is exactly what the unit measures. A fixed
          // 144px left the two fields of a vector too narrow to hold their own
          // digits at the panel's minimum width; eleven is what keeps every name
          // this schema declares whole — `Interactive` is the longest word of
          // them — while still being a third of what it was.
          <div
            onDoubleClick={onDoubleClick}
            className={cn(
              'mr-2 w-[11ch] flex-none self-center break-words text-xs leading-tight',
              nameClass,
              titleClassName,
            )}
          >
            {title}
          </div>
        ) : (
          <div
            onDoubleClick={onDoubleClick}
            className={cn(
              'mr-2 w-[11ch] flex-none break-words text-xs leading-tight',
              nameClass,
              titleClassName,
            )}
          >
            <TooltipWrapper trigger={<div className="text-start">{title}</div>} tip={tooltip} />
          </div>
        )}
        {/* `min-w-0`: what a narrow panel takes away comes off the editor's own
            field, never off the controls beside it. */}
        <div className="flex w-full min-w-0 items-center pl-2">{input}</div>
      </div>
      {separated && !isLast && <Separator orientation="horizontal" className="my-0.5 opacity-40" />}
    </>
  );
};
