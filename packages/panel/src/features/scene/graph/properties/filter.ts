import type { Json, PropertyDescriptor } from '@scene-inspector/protocol';

/**
 * Which property rows are drawn, and why one is not.
 *
 * Two rules, both pure, both here rather than scattered through the markup:
 *
 *  - a field the node does not carry is not drawn, which is what lets one
 *    schema describe every version and every application;
 *  - a field can depend on another — the shadow settings on the shadow being
 *    on, the wrap width on wrapping being on.
 */

export interface Condition {
  /**
   * The keys whose truth decides whether this field is shown — **any** of them
   * is enough. More than one because a setting can serve two switches: a wrap
   * width is what wrapping wraps at, and also what a game's `flexFont` shrinks
   * the text to fit, and either of those makes it worth showing.
   */
  anyOf: readonly string[];
}

export function isPresent(field: PropertyDescriptor, values: Record<string, Json> | null): boolean {
  // Until the first values arrive there is nothing to judge by, and hiding
  // everything would make the panel flash empty on each new selection.
  if (values === null) return true;

  // `null` is the page saying the node does not carry this. A key the reading
  // does not mention at all says nothing — a folded section is not asked about,
  // and taking its silence for absence would remove the section along with the
  // header that unfolds it.
  const value = values[field.key];
  return value === undefined || value !== null;
}

export function meetsCondition(
  field: PropertyDescriptor,
  values: Record<string, Json> | null,
  conditions: Record<string, Condition>,
): boolean {
  const condition = conditions[field.key];
  if (condition === undefined || values === null) return true;

  return condition.anyOf.some((key) => values[key] === true);
}

export function visibleFields(
  fields: readonly PropertyDescriptor[],
  values: Record<string, Json> | null,
  conditions: Record<string, Condition> = {},
): PropertyDescriptor[] {
  return fields.filter(
    (field) => isPresent(field, values) && meetsCondition(field, values, conditions),
  );
}
