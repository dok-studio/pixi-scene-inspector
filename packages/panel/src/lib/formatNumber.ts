/**
 * Number formatting and parsing for the property editors, ported unchanged from
 * the previous project.
 */

/**
 * Trailing zeros removed: `1.230` reads as `1.23`, `2.000` as `2`.
 *
 * Only after a decimal point, which is what the guard is for. `toFixed(0)`
 * produces no point at all, and the same replacement then read a hundred back
 * as "1". Every caller but one asks for at least one decimal, which is why it
 * went unseen — the one that does not is the scale beside a texture preview.
 */
export function formatNumber(value: number, maxFraction = 3): string {
  if (!Number.isFinite(value)) return '';

  const fixed = value.toFixed(maxFraction);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** Accepts a decimal comma, keeps one leading minus, drops everything else. */
export function normalizeNumberInput(input: string): string {
  return input
    .replace(',', '.')
    .replace(/(?!^)-/g, '')
    .replace(/[^0-9.-]/g, '');
}

/**
 * A single binary operation, so a field accepts `120 + 40` and lands on 160.
 * Deliberately not a general expression evaluator: this is a number field, and
 * the whole grammar is two operands and one operator.
 */
export function parseSimpleExpression(input: string): number | null {
  const match = input.trim().match(/^(-?\d+[.,]?\d*)(\s*[+\-*/]\s*)(-?\d+[.,]?\d*)$/);
  if (match === null) return null;

  const left = Number(match[1]?.replace(',', '.'));
  const right = Number(match[3]?.replace(',', '.'));
  if (Number.isNaN(left) || Number.isNaN(right)) return null;

  switch (match[2]?.trim()) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return right === 0 ? null : left / right;
    default:
      return null;
  }
}
