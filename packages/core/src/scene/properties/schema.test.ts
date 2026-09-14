import { describe, expect, it } from 'vitest';

import { schemaFor } from './schema.js';

/**
 * Which properties a node type offers.
 *
 * The schema is static data keyed by type, and it is what the panel searches
 * and lays out. Two things are worth holding still: that every type gets the
 * properties every Pixi node really has, and that keys stay unique — they are
 * the identity used for reading, writing and caching.
 */
describe('schemaFor', () => {
  const keysOf = (type: string): string[] =>
    schemaFor(type).flatMap((section) => section.fields.map((field) => field.key));

  /** The sections, and their order, as the previous project laid them out. */
  it('offers Info, General and Interaction, in that order', () => {
    expect(schemaFor('Container').map((section) => section.title)).toEqual([
      'Info',
      'General',
      'Interaction',
      // Last, because it restates what the sections above it draw.
      'Object',
    ]);
  });

  /**
   * The order inside General is the order the panel draws, and it is the one
   * the previous project arrived at through per-field `position` numbers.
   */
  it('keeps the General fields in the order they are drawn', () => {
    const general = schemaFor('Container').find((section) => section.id === 'general');

    expect(general?.fields.map((field) => field.key)).toEqual([
      'position',
      'width',
      'height',
      'scale',
      'scaleXY',
      'rotation',
      // Degrees next to the radians they restate, rather than six rows below.
      'angle',
      // Anchor sits in front of pivot: both move the node's origin, and the one
      // a sprite is actually adjusted by should be the one nearer to hand.
      'anchor',
      'pivot',
      'skew',
      'alpha',
      // Depth beside opacity: the two of them are the answer to "why can I not
      // see it", and the switches below are a separate question.
      'zIndex',
      'visible',
      'renderable',
    ]);
  });

  it('offers the identity fields, including the ones only some applications set', () => {
    expect(keysOf('Container')).toEqual(
      expect.arrayContaining(['type', 'label', 'id', 'classesList']),
    );
  });

  it('marks the type as read-only', () => {
    const type = schemaFor('Container')
      .flatMap((section) => section.fields)
      .find((field) => field.key === 'type');

    expect(type?.readOnly).toBe(true);
  });

  it('offers the interaction flags', () => {
    expect(keysOf('Container')).toEqual(
      expect.arrayContaining(['interactive', 'interactiveChildren']),
    );
  });

  /**
   * `anchor` is declared for every type rather than only for the ones that have
   * it: a node without one answers null and the row is not drawn, which is the
   * same rule that keeps `label` off v6 and `id` off applications that set none.
   */
  it('declares anchor for every type, and lets the value decide', () => {
    expect(keysOf('Container')).toContain('anchor');
  });

  /**
   * The type is a string the panel sends, and an object literal answers more
   * names than were put in it: BY_TYPE['constructor'] is a function, which is
   * not undefined and would reach the spread as something that cannot be
   * spread.
   */
  it('falls back to Container for a name inherited from Object', () => {
    for (const type of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(schemaFor(type).map((section) => section.id)).toEqual(
        schemaFor('Container').map((section) => section.id),
      );
    }
  });

  describe('the Sprite section', () => {
    const sectionsOf = (type: string): string[] => schemaFor(type).map((section) => section.id);

    it('is offered to a Sprite', () => {
      expect(sectionsOf('Sprite')).toContain('sprite');
      expect(keysOf('Sprite')).toContain('textureId');
    });

    /** A sprite is a sprite whichever way it draws itself. */
    it('is offered to the types that derive from it', () => {
      for (const type of ['AnimatedSprite', 'TilingSprite', 'NineSliceSprite']) {
        expect(sectionsOf(type)).toContain('sprite');
      }
    });

    it('is not offered to a plain Container', () => {
      expect(sectionsOf('Container')).not.toContain('sprite');
    });

    /**
     * The markup is the panel's — a list of loaded textures to pick from, and
     * the id to copy — but the value still travels as a declared descriptor,
     * through the same commands as every other property (§3.4).
     */
    it('draws itself, and still declares its field', () => {
      const sprite = schemaFor('Sprite').find((section) => section.id === 'sprite');

      expect(sprite?.layout).toBe('custom:sprite');
      expect(sprite?.fields.map((field) => field.key)).toEqual(['textureId']);
    });
  });

  /**
   * A multi-style text is a Text with a set of named overrides on top, so it
   * keeps the whole Text section and adds one for the tags.
   */
  describe('the MultiStyleText section', () => {
    it('keeps the Text section as well as its own', () => {
      // The tags go between the style rows and the snippet, which is what puts
      // the snippet at the bottom of the tab on both kinds of text.
      expect(schemaFor('MultiStyleText').map((section) => section.id)).toEqual([
        'info',
        'general',
        'interaction',
        'text',
        'multiStyleText',
        'textStyleSnippet',
        'objectSnippet',
      ]);
    });

    /**
     * A tag's name belongs to the application and changes while the panel is
     * open, so a schema keyed by type cannot declare one. What a tag may carry
     * is static and travels as `text.tagStyleFields` instead.
     */
    it('declares no descriptors, and draws itself', () => {
      const tags = schemaFor('MultiStyleText').find((section) => section.id === 'multiStyleText');

      expect(tags?.layout).toBe('custom:multiStyleText');
      expect(tags?.fields).toEqual([]);
    });

    /**
     * Offered to a plain `Text` as well, because on PixiJS 8 that is what a
     * multi-style text *is* — there is no class of that name on the newer line,
     * and whether a text carries tags is a fact about the node. The page answers
     * `text.tagStyleFields` with nothing for a text that has none, and the panel
     * draws no section.
     */
    it('is offered to a Text too, since on v8 that is the only name it has', () => {
      expect(schemaFor('Text').some((section) => section.id === 'multiStyleText')).toBe(true);
    });

    it('is offered to no other kind of node', () => {
      for (const type of ['Container', 'Sprite', 'Graphics', 'Spine', 'BitmapText']) {
        expect(schemaFor(type).some((section) => section.id === 'multiStyleText')).toBe(false);
      }
    });
  });

  /**
   * The tab is where a section is drawn, and it is declared here rather than
   * worked out by the panel from the layout. Everything a node has by virtue of
   * being a Container names no tab and lands in the default one.
   */
  describe('tabs', () => {
    it('leaves the Container sections in the default tab', () => {
      expect(schemaFor('Container').every((section) => section.tab === undefined)).toBe(true);
    });

    it('gives Spine a tab of its own', () => {
      expect(schemaFor('Spine').find((section) => section.id === 'spine')?.tab).toBe('Spine');
    });

    /** A texture id belongs next to the transform, not behind a tab. */
    it('keeps the Sprite section in the default tab', () => {
      expect(schemaFor('Sprite').find((section) => section.id === 'sprite')?.tab).toBeUndefined();
    });

    /** A tag is an override of the style right above it, so it shares its tab. */
    it('draws the tag styles under the Text tab', () => {
      const sections = schemaFor('MultiStyleText');
      const text = sections.find((section) => section.id === 'text');
      const tags = sections.find((section) => section.id === 'multiStyleText');

      expect(tags?.tab).toBe(text?.tab);
    });
  });

  /**
   * Every section a Container has draws rows, bar one: the snippet writes the
   * same fields out as source, which is markup no descriptor can describe.
   */
  it('gives every section that draws rows a generic layout', () => {
    const drawn = schemaFor('Container').filter((section) => section.id !== 'objectSnippet');

    expect(drawn.every((section) => section.layout === 'generic')).toBe(true);
  });

  /**
   * A duplicate key would make one editor silently shadow another — both would
   * read the same value and the second write would win.
   *
   * Within a tab rather than within a type: only one tab is drawn at a time, so
   * a key can be offered in two of them — which is how the Text tab shows the
   * rows that place the caption without leaving them out of General.
   *
   * Among the sections that draw editors, too. The Object snippet declares the
   * very fields General draws — deliberately, so that folding General does not
   * take the values it needs off the wire — and shadows nothing, because it
   * draws no editor at all.
   */
  it('has no duplicate keys within a tab', () => {
    for (const type of ['Container', 'Sprite', 'Text', 'Spine', 'MultiStyleText']) {
      const byTab = new Map<string | undefined, string[]>();

      for (const section of schemaFor(type)) {
        if (section.id === 'objectSnippet') continue;

        const keys = byTab.get(section.tab) ?? [];
        byTab.set(section.tab, [...keys, ...section.fields.map((field) => field.key)]);
      }

      for (const keys of byTab.values()) {
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it('labels every field', () => {
    const unlabelled = schemaFor('Container')
      .flatMap((section) => section.fields)
      .filter((field) => field.label === '');

    expect(unlabelled).toEqual([]);
  });

  /**
   * Every node in a Pixi scene is a Container, so an unrecognised type is not
   * a reason to show an empty panel. Falling back also means a new node type
   * is useful from the moment the tree can name it.
   */
  it('falls back to the Container schema for a type it does not know', () => {
    expect(keysOf('Unknown')).toEqual(keysOf('Container'));
  });

  it('gives the same answer every time it is asked', () => {
    expect(schemaFor('Container')).toEqual(schemaFor('Container'));
  });

  /**
   * The schema crosses the bridge as JSON on every selection change, so it has
   * to survive the trip.
   */
  it('is serializable', () => {
    expect(() => JSON.stringify(schemaFor('Container'))).not.toThrow();
  });
});
