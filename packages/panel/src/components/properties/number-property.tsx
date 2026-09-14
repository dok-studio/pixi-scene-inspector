import { useAdvancedNumberInput } from '../../lib/useAdvancedNumberInput.js';
import { useStepButtons } from '../../lib/useStepButtons.js';
import { cn } from '../../lib/utils.js';
import { Input } from '../ui/input.js';
import { StepButtons } from '../ui/step-buttons.js';
import type { PropertyPanelData } from './propertyTypes.js';
import { optionsOf } from './propertyTypes.js';

interface NumberOptions {
  step: number;
  min: number;
  max: number;
  wheelStep: number;
}

/** Ported from the previous project unchanged. */
export const NumberProperty: React.FC<PropertyPanelData> = (data) => {
  const options = optionsOf<NumberOptions>(data);
  const value = typeof data.value === 'number' ? data.value : null;

  const commit = (next: number): void => {
    data.entry.onChange(next);
  };

  const { inputProps, isInvalid } = useAdvancedNumberInput({
    value,
    onCommit: commit,
    step: options.step,
    min: options.min,
    max: options.max,
    precision: 3,
    wheelStep: options.wheelStep,
  });

  const steps = useStepButtons({
    value: value ?? 0,
    onChange: commit,
    step: options.step,
    min: options.min,
    max: options.max,
    precision: 3,
  });

  return (
    <div className="flex w-full min-w-0">
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
