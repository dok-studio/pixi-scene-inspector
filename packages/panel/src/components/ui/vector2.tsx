import { useAdvancedNumberInput } from '../../lib/useAdvancedNumberInput.js';
import { useStepButtons } from '../../lib/useStepButtons.js';
import { cn } from '../../lib/utils.js';
import { Input } from './input.js';
import { StepButtons } from './step-buttons.js';

/**
 * Two number fields side by side, ported from the previous project.
 *
 * One change: `onChange` hands over a pair of numbers instead of a JSON string.
 * There the string existed because the value was about to be interpolated into
 * a line of JavaScript; this project sends typed commands, so the workaround
 * has nothing left to work around.
 */

export interface Vector2Value {
  x: number;
  y: number;
}

interface AxisOptions {
  label: string;
  step?: number;
  min?: number;
  max?: number;
  wheelStep?: number;
}

export interface Vector2Props {
  x: AxisOptions;
  y: AxisOptions;
  value: Vector2Value | null;
  onChange: (value: Vector2Value) => void;
  className?: string;
}

const Axis: React.FC<{
  options: AxisOptions;
  value: number;
  onCommit: (value: number) => void;
}> = ({ options, value, onCommit }) => {
  const { inputProps, isInvalid } = useAdvancedNumberInput({
    value,
    onCommit,
    step: options.step,
    min: options.min,
    max: options.max,
    precision: 3,
    wheelStep: options.wheelStep,
  });

  const steps = useStepButtons({
    value,
    onChange: onCommit,
    step: options.step,
    min: options.min,
    max: options.max,
    precision: 3,
  });

  return (
    // `flex-1 min-w-0`: the two axes share what there is and give way from the
    // field, not from the arrows beside it (see `StepButtons`).
    <div className="flex min-w-0 flex-1 items-center">
      <div className="flex-none pr-1">{options.label}</div>
      <Input
        {...inputProps}
        type="text"
        inputMode="decimal"
        data-number-input
        className={cn(
          'border-border hover:border-secondary focus:border-secondary h-6 w-full min-w-0 rounded rounded-r-none text-xs outline-none',
          isInvalid && 'border-red-500',
        )}
      />
      <StepButtons {...steps} />
    </div>
  );
};

export const Vector2: React.FC<Vector2Props> = ({ x, y, value, onChange, className }) => {
  const current = value ?? { x: 0, y: 0 };

  return (
    <div className={cn('mr-0.5 flex min-w-0 gap-2 text-xs', className)}>
      <Axis
        options={x}
        value={current.x}
        onCommit={(next) => {
          onChange({ x: next, y: current.y });
        }}
      />
      <Axis
        options={y}
        value={current.y}
        onCommit={(next) => {
          onChange({ x: current.x, y: next });
        }}
      />
    </div>
  );
};
