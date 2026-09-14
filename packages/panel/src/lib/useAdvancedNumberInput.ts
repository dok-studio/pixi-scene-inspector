import { useEffect, useRef, useState } from 'react';

import { formatNumber, parseSimpleExpression } from './formatNumber.js';
import { useLiveNumber } from './liveNumber.js';
import { computeNextNumberValue, getStepFromEvent } from './numberStep.js';
import { startScrubDrag } from './scrubDrag.js';

/**
 * Everything a number field in this panel does, ported from the previous
 * project: type a value or a small expression, step with the arrow keys or the
 * wheel, scrub by Alt-dragging, commit on Enter or blur, roll back on Escape.
 *
 * The draft is held as a **string** while editing, because half-typed input is
 * not a number: `-`, `0.` and an empty field all have to survive being held.
 * Outside editing the displayed text comes from the value itself, so a polled
 * update lands immediately — but never while the field is being typed into.
 */

interface Params {
  value: number | null | undefined;
  onCommit: (value: number) => void;

  step?: number;
  min?: number;
  max?: number;
  precision?: number;

  /** Pixels of Alt-drag per step. */
  pixelsPerStep?: number;
  wheelStep?: number;
}

const asText = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

export function useAdvancedNumberInput({
  value,
  onCommit,
  step = 1,
  min,
  max,
  precision,
  pixelsPerStep = 10,
  wheelStep,
}: Params) {
  const [buffer, setBuffer] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isInvalid, setIsInvalid] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Arrows and the wheel count from their own running value, so a burst of
  // presses is a burst of steps rather than one — see `liveNumber`.
  const live = useLiveNumber(value);
  const liveRef = useRef(live);
  liveRef.current = live;

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!isEditing) setBuffer(asText(value));
  }, [value, isEditing]);

  useEffect(() => {
    const el = inputRef.current;
    if (el === null) return;

    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return;
      // Alt makes the wheel work without focusing the field first.
      if (document.activeElement !== el && !event.altKey) return;

      event.preventDefault();

      const direction = event.deltaY < 0 ? 1 : -1;
      const actualStep = getStepFromEvent(event, { baseStep: wheelStep ?? step });
      const next = computeNextNumberValue(liveRef.current.get(), direction, actualStep, {
        min,
        max,
        precision,
      });

      liveRef.current.emit(next);
      onCommitRef.current(next);
    };

    // Not passive: the wheel must scrub the value instead of scrolling the panel.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [step, wheelStep, min, max, precision]);

  /** @returns null for input that is not a number yet, and for input that never will be. */
  const parse = (raw: string): number | null => {
    if (['', '-', '.', '-.', ',', '-,'].includes(raw)) return null;

    const trimmed = raw.trim();

    const asNumber = Number(trimmed.replace(',', '.'));
    if (!Number.isNaN(asNumber)) return asNumber;

    return parseSimpleExpression(trimmed);
  };

  const clamp = (next: number): number => {
    let result = next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);

    if (precision !== undefined) {
      const factor = Math.pow(10, precision);
      result = Math.round(result * factor) / factor;
    }

    return result;
  };

  const commit = (): void => {
    const parsed = parse(buffer);

    if (parsed === null) {
      setBuffer(asText(value));
      setIsInvalid(false);
    } else {
      const next = clamp(parsed);
      live.emit(next);
      onCommit(next);
    }

    setIsEditing(false);
  };

  const rollback = (): void => {
    setBuffer(asText(value));
    setIsEditing(false);
    setIsInvalid(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      commit();
      return;
    }

    if (event.key === 'Escape') {
      rollback();
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();

      const direction = event.key === 'ArrowUp' ? 1 : -1;
      const actualStep = getStepFromEvent(event, { baseStep: step });
      const next = computeNextNumberValue(live.get(), direction, actualStep, { min, max, precision });

      live.emit(next);
      onCommit(next);
    }
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const raw = event.target.value;

    setIsEditing(true);
    setBuffer(raw);
    setIsInvalid(raw !== '' && parse(raw) === null);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLInputElement>): void => {
    if (event.button !== 0 || !event.altKey) return;

    event.preventDefault();

    const target = event.currentTarget;
    const startValue = Number(value ?? 0);

    startScrubDrag(target, event.pointerId, {
      onMove: (deltaX, moveEvent) => {
        let multiplier = 10;
        if (moveEvent.shiftKey) multiplier = 20;
        if (moveEvent.ctrlKey || moveEvent.metaKey) multiplier = 1;

        const steps = deltaX / pixelsPerStep;
        const next = computeNextNumberValue(startValue, 1, steps * step * multiplier, {
          min,
          max,
          precision,
        });

        // Kept in step with the drag, so an arrow press straight afterwards
        // continues from where the drag left the value.
        live.emit(next);
        onCommit(next);
      },

      onEnd: (cancelled) => {
        if (!cancelled) return;
        live.emit(startValue);
        onCommit(startValue);
      },
    });
  };

  return {
    inputProps: {
      value: isEditing ? buffer : value === null || value === undefined ? '' : formatNumber(value, 3),
      onChange,
      onKeyDown,
      onBlur: commit,
      onPointerDown,
      ref: inputRef,
    },
    isInvalid,
    isEditing,
  };
}
