/**
 * How far a number moves per arrow key, wheel notch or step button, and how the
 * modifiers change that. Ported unchanged: these ratios are what the editors
 * were tuned around.
 */

export interface StepConfig {
  baseStep?: number;
  shiftMultiplier?: number;
  ctrlMultiplier?: number;
}

/** Shift for a coarse step, Ctrl/Cmd for a fine one. */
export function getStepFromEvent(
  event: Pick<KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  config: StepConfig = {},
): number {
  const { baseStep = 1, shiftMultiplier = 10, ctrlMultiplier = 0.1 } = config;

  if (event.shiftKey) return baseStep * shiftMultiplier;
  if (event.ctrlKey || event.metaKey) return baseStep * ctrlMultiplier;

  return baseStep;
}

export function computeNextNumberValue(
  current: number,
  direction: 1 | -1,
  step: number,
  options?: { min?: number; max?: number; precision?: number },
): number {
  let next = current + direction * step;

  if (options?.min !== undefined) next = Math.max(options.min, next);
  if (options?.max !== undefined) next = Math.min(options.max, next);

  // Without this a few steps of 0.1 land on 0.30000000000000004.
  if (options?.precision !== undefined) {
    const factor = Math.pow(10, options.precision);
    next = Math.round(next * factor) / factor;
  }

  return next;
}
