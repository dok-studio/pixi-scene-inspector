import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class name composition, the shadcn convention: `clsx` resolves conditionals
 * and `tailwind-merge` drops earlier utilities a later one overrides, so a
 * caller can pass `className` and actually win.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** `dropShadowBlur` → `Drop shadow blur`, for labels derived from a key. */
export function formatCamelCase(value: string) {
  const spaced = value.replace(/([A-Z])/g, ' $1');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
