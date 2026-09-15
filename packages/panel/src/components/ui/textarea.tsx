import * as React from 'react';

import { cn } from '../../lib/utils.js';

/**
 * A textarea that grows with its content, ported from the previous project.
 * The text of a Text node is the one property worth more than a single line.
 */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoSize?: boolean;
  minRows?: number;
  maxRows?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoSize = true, minRows = 2, maxRows, onChange, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (el === null || !autoSize) return;

      // Reset first, or `scrollHeight` reports the height it already has.
      el.style.height = 'auto';

      const lineHeight = Number.parseInt(window.getComputedStyle(el).lineHeight || '16', 10);
      let next = Math.max(el.scrollHeight, lineHeight * minRows);

      if (maxRows !== undefined && next > lineHeight * maxRows) {
        next = lineHeight * maxRows;
        el.style.overflowY = 'auto';
      } else {
        el.style.overflowY = 'hidden';
      }

      el.style.height = `${String(next)}px`;

      // `scrollHeight` measures the content and its padding, but the height
      // just set is a border box — so the border comes off the part that can
      // be seen, and on a box that does not wrap so does the horizontal
      // scrollbar the browser lays inside it. The border alone is a pixel and
      // never showed; the bar is 10 against a 16px line, and the last entry of
      // a class list read as a column came out with a grey stripe across it.
      // Measure what was taken and give it back.
      const taken = el.offsetHeight - el.clientHeight;
      if (taken > 0) el.style.height = `${String(next + taken)}px`;
    }, [autoSize, minRows, maxRows]);

    React.useLayoutEffect(() => {
      resize();
    }, [props.value, resize]);

    return (
      <textarea
        ref={innerRef}
        rows={minRows}
        className={cn(
          'border-input placeholder:text-muted-foreground focus-visible:ring-ring flex w-full resize-none rounded-md border bg-field px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        onChange={(event) => {
          resize();
          onChange?.(event);
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
