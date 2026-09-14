import type { Json, PropertyDescriptor, PropertyEditor } from '@scene-inspector/protocol';

/**
 * What one editor is handed, ported from the previous project's
 * `PropertyPanelData` — the same shape, so the editor components carry over
 * unchanged.
 *
 * What is different is where it comes from. There it was the whole property
 * model, re-sent from the page ten times a second with its labels, sections and
 * options attached to every value. Here the descriptor is fetched once per node
 * type and only the values are polled; this object is assembled in the panel
 * from the two.
 */
export interface PropertyPanelData {
  value: Json | undefined;
  /** The descriptor's key — `'position'`, `'style.dropShadow.blur'`. */
  prop: string;
  readOnly?: boolean;
  entry: {
    type: PropertyEditor;
    label?: string;
    tooltip?: string;
    options?: Json;
    /**
     * What each option is **called**, where that is not what it **is**.
     *
     * The panel's own, and deliberately not in the protocol: every select the
     * page declares shows its values, because those values are the vocabulary
     * being edited — `left`, `bold`, `miter` are what a stylesheet says and
     * what a reader is looking for. Only the panel's own settings have a value
     * that is a tag and a label that is a word (`uk` → «Українська»), and
     * putting that across the bridge would invent a display concern for a
     * contract that has none.
     */
    optionLabels?: Readonly<Record<string, string>>;
    onChange: (value: Json) => void;
  };
}

/**
 * A descriptor and a value, assembled into what an editor is handed.
 *
 * Here rather than beside one of the sections that draws rows: the generic
 * layout and the Sprite section both build this, and an editor that behaved
 * differently depending on which section drew it would be a bug nobody would
 * think to look for.
 */
export function propertyData(
  descriptor: PropertyDescriptor,
  value: Json | undefined,
  onChange: (key: string, value: Json) => void,
  optionLabels?: Readonly<Record<string, string>>,
): PropertyPanelData {
  return {
    value,
    prop: descriptor.key,
    ...(descriptor.readOnly === true ? { readOnly: true } : {}),
    entry: {
      type: descriptor.editor,
      label: descriptor.label,
      ...(descriptor.options === undefined ? {} : { options: descriptor.options }),
      ...(optionLabels === undefined ? {} : { optionLabels }),
      onChange: (next) => {
        onChange(descriptor.key, next);
      },
    },
  };
}

/** Editor options, read defensively: they cross the bridge as plain JSON. */
export function optionsOf<T>(data: PropertyPanelData): Partial<T> {
  const raw = data.entry.options;
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Partial<T>) : {};
}
