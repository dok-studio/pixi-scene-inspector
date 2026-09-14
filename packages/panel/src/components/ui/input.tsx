import * as React from 'react';

import { cn } from '../../lib/utils.js';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  // Keeps the input controlled when a value is polled in: without this, a null
  // value would make React switch the field to uncontrolled mid-session.
  const value = props.defaultValue === undefined ? (props.value ?? '') : props.value;

  return (
    <input
      type={type}
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-field px-1.5 py-0 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
      value={value}
    />
  );
});
Input.displayName = 'Input';

export { Input };
