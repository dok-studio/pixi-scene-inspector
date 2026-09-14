import type { Json, Revisioned } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { createAdapter } from '../../adapters/index.js';
import type { Node, PixiAdapter } from '../../adapters/types.js';
import { readValues, writeValue } from './values.js';

/**
 * Reading and writing the values behind the schema.
 *
 * Two things carry weight here. Values are revisioned like everything else, so
 * a selected node that is not changing costs one walk over a handful of keys
 * and no payload. And a write is checked against the schema before it lands —
 * `scene.setProp` is a command from another process, and the only writes it
 * may perform are the ones the schema declares.
 */

type Fake = Record<string, unknown>;

function nodeWithAdapter(): { node: Fake; adapter: PixiAdapter } {
  const node: Fake = {
    includeInBuild: true,
    measurable: true,
    _didLocalTransformChangeId: 0,
    children: [],
    destroyed: false,
    visible: true,
    renderable: true,
    alpha: 1,
    zIndex: 0,
    rotation: 0,
    position: { x: 10, y: 20 },
    scale: { x: 1, y: 1 },
  };

  const adapter = createAdapter({ stage: node, renderer: { renderPipes: {} } });
  if (adapter === null) throw new Error('expected an adapter');

  return { node, adapter };
}

/**
 * A node on the older line, where PixiJS's own name is still `name`.
 *
 * `renderer.events` is what the version check reads to say v7 — a v8 fake
 * would answer nothing for `name`, which is the whole point of the adapter
 * method and the wrong end from which to test the rule above it.
 */
function legacyNodeWithAdapter(): { node: Fake; adapter: PixiAdapter } {
  const node: Fake = {
    children: [],
    destroyed: false,
    visible: true,
    renderable: true,
    alpha: 1,
    zIndex: 0,
    rotation: 0,
    position: { x: 10, y: 20 },
    scale: { x: 1, y: 1 },
  };

  const adapter = createAdapter({ stage: node, renderer: { events: {} } });
  if (adapter === null) throw new Error('expected an adapter');

  return { node, adapter };
}

/** The same, duck-typed as a Sprite so the Sprite section is in its schema. */
function spriteWithAdapter(): { node: Fake; adapter: PixiAdapter } {
  const { node, adapter } = nodeWithAdapter();

  node['vertexTrimmedData'] = new Float32Array(0);
  node['indices'] = new Uint16Array(0);

  return { node, adapter };
}

function dataOf(result: Revisioned<Record<string, Json>>): Record<string, Json> {
  if ('unchanged' in result) throw new Error('expected data, got unchanged');
  return result.data;
}

describe('readValues', () => {
  it('reads the keys it was asked for', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(dataOf(readValues(adapter, node, ['alpha', 'visible']))).toEqual({
      alpha: 1,
      visible: true,
    });
  });

  /** The panel asks for what is on screen; nothing else is even looked at. */
  it('reads nothing beyond the keys it was asked for', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(Object.keys(dataOf(readValues(adapter, node, ['alpha'])))).toEqual(['alpha']);
  });

  it('reads a point as plain x and y', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(dataOf(readValues(adapter, node, ['position']))['position']).toEqual({ x: 10, y: 20 });
  });

  it('reports a key the node does not have as null', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(dataOf(readValues(adapter, node, ['nothingHere']))['nothingHere']).toBeNull();
  });

  it('reads nothing at all when asked for nothing', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(dataOf(readValues(adapter, node, []))).toEqual({});
  });

  describe('revisions', () => {
    it('answers unchanged while the values stand still', () => {
      const { node, adapter } = nodeWithAdapter();
      const first = readValues(adapter, node, ['alpha', 'position']);

      expect(readValues(adapter, node, ['alpha', 'position'], first.rev)).toEqual({
        rev: first.rev,
        unchanged: true,
      });
    });

    it('sends data again once a value moves', () => {
      const { node, adapter } = nodeWithAdapter();
      const first = readValues(adapter, node, ['alpha']);

      node['alpha'] = 0.5;

      expect(readValues(adapter, node, ['alpha'], first.rev)).toHaveProperty('data');
    });

    /**
     * Alpha, scale and rotation all live between 0 and 1, where an integer
     * fingerprint would fold every value together and report a still node.
     */
    it('notices a change smaller than one', () => {
      const { node, adapter } = nodeWithAdapter();
      node['alpha'] = 0.5;
      const first = readValues(adapter, node, ['alpha']);

      node['alpha'] = 0.7;

      expect(readValues(adapter, node, ['alpha'], first.rev)).toHaveProperty('data');
    });

    it('notices one component of a point moving', () => {
      const { node, adapter } = nodeWithAdapter();
      const first = readValues(adapter, node, ['position']);

      (node['position'] as { y: number }).y = 21;

      expect(readValues(adapter, node, ['position'], first.rev)).toHaveProperty('data');
    });

    /** Two keys swapping values must not fold into the same fingerprint. */
    it('notices two values trading places', () => {
      const { node, adapter } = nodeWithAdapter();
      node['alpha'] = 1;
      node['zIndex'] = 0;
      const first = readValues(adapter, node, ['alpha', 'zIndex']);

      node['alpha'] = 0;
      node['zIndex'] = 1;

      expect(readValues(adapter, node, ['alpha', 'zIndex'], first.rev)).toHaveProperty('data');
    });

    it('sends data when the panel asks for a different set of keys', () => {
      const { node, adapter } = nodeWithAdapter();
      const first = readValues(adapter, node, ['alpha']);

      expect(readValues(adapter, node, ['alpha', 'visible'], first.rev)).toHaveProperty('data');
    });
  });
});

/**
 * Two declared keys are not fields on the node. The previous project
 * special-cased both in the middle of its generic reducer; here they are named.
 */
describe('the keys that are not fields', () => {
  it('answers `type` from the adapter’s own detection', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(dataOf(readValues(adapter, node, ['type']))['type']).toBe('Container');
  });

  it('reads `scaleXY` off one axis', () => {
    const { node, adapter } = nodeWithAdapter();
    (node['scale'] as { x: number }).x = 0.5;

    expect(dataOf(readValues(adapter, node, ['scaleXY']))['scaleXY']).toBe(0.5);
  });

  it('writes `scaleXY` to both axes', () => {
    const { node, adapter } = nodeWithAdapter();

    writeValue(adapter, node, 'scaleXY', 2);

    expect(node['scale']).toEqual({ x: 2, y: 2 });
  });

  it('refuses a `scaleXY` that is not a number', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(writeValue(adapter, node, 'scaleXY', 'big')).toBe(false);
    expect(node['scale']).toEqual({ x: 1, y: 1 });
  });

  /**
   * v8 keeps the application's own id in `label` as well, and the panel has a
   * row for that already — two rows saying the same thing is one row of noise,
   * and it moves everything under it. v6/v7 have no `label` at all, so there
   * the id is the only place that name appears and it stays.
   */
  describe('`id` beside `label`', () => {
    it('says nothing when `label` already says it', () => {
      const { node, adapter } = nodeWithAdapter();
      node['id'] = 'hero';
      node['label'] = 'hero';

      expect(dataOf(readValues(adapter, node, ['id']))['id']).toBeNull();
    });

    it('answers where there is no `label` to say it', () => {
      const { node, adapter } = nodeWithAdapter();
      node['id'] = 'hero';

      expect(dataOf(readValues(adapter, node, ['id']))['id']).toBe('hero');
    });

    it('answers when `label` says something else', () => {
      const { node, adapter } = nodeWithAdapter();
      node['id'] = 'hero';
      node['label'] = 'Hero sprite';

      expect(dataOf(readValues(adapter, node, ['id']))['id']).toBe('hero');
    });
  });

  /**
   * The third name, and the last asked: `id`, `label` and `name` are one thing
   * under three owners, and a node names itself in exactly one of them.
   */
  describe('`name` behind the other two', () => {
    it('answers where neither `id` nor `label` says anything', () => {
      const { node, adapter } = legacyNodeWithAdapter();
      node['name'] = 'hero';

      expect(dataOf(readValues(adapter, node, ['name']))['name']).toBe('hero');
    });

    it('says nothing when `label` already says it', () => {
      const { node, adapter } = legacyNodeWithAdapter();
      node['name'] = 'hero';
      node['label'] = 'Hero sprite';

      expect(dataOf(readValues(adapter, node, ['name']))['name']).toBeNull();
    });

    it('says nothing when the application named the node through `id`', () => {
      const { node, adapter } = legacyNodeWithAdapter();
      node['name'] = 'hero';
      node['id'] = 42;

      expect(dataOf(readValues(adapter, node, ['name']))['name']).toBeNull();
    });

    // A blank one is not an answer, and must not silence the name below it.
    it('answers past an empty `label`', () => {
      const { node, adapter } = legacyNodeWithAdapter();
      node['name'] = 'hero';
      node['label'] = '';

      expect(dataOf(readValues(adapter, node, ['name']))['name']).toBe('hero');
    });

    it('says nothing for an unnamed node', () => {
      const { node, adapter } = legacyNodeWithAdapter();

      expect(dataOf(readValues(adapter, node, ['name']))['name']).toBeNull();
    });

    /**
     * v8 renamed the field and left a deprecated getter over `label` behind it.
     * Reading that would print a warning in the page's console, four times a
     * second, to be told what the `Label` row already says.
     */
    it('is never read on v8, deprecation and all', () => {
      const { node, adapter } = nodeWithAdapter();
      let asked = 0;
      Object.defineProperty(node, 'name', {
        get: () => {
          asked += 1;
          return 'hero';
        },
      });

      expect(dataOf(readValues(adapter, node, ['name']))['name']).toBeNull();
      expect(asked).toBe(0);
    });
  });

  /**
   * `textureId` is the application's, not PixiJS's: the previous project read
   * the field and wrote it through `setTextureId`, because assigning the field
   * changes a string while the sprite goes on drawing the texture it had.
   */
  describe('`textureId`', () => {
    it('reads the field', () => {
      const { node, adapter } = spriteWithAdapter();
      node['textureId'] = 'hero.png';

      expect(dataOf(readValues(adapter, node, ['textureId']))['textureId']).toBe('hero.png');
    });

    it('writes through the setter the application provides', () => {
      const { node, adapter } = spriteWithAdapter();
      const asked: string[] = [];
      node['setTextureId'] = (value: string) => {
        asked.push(value);
        node['textureId'] = value;
      };

      expect(writeValue(adapter, node, 'textureId', 'villain.png')).toBe(true);
      expect(asked).toEqual(['villain.png']);
    });

    it('writes the field where there is no setter', () => {
      const { node, adapter } = spriteWithAdapter();
      node['textureId'] = 'hero.png';

      expect(writeValue(adapter, node, 'textureId', 'villain.png')).toBe(true);
      expect(node['textureId']).toBe('villain.png');
    });

    it('refuses anything that is not a texture id', () => {
      const { node, adapter } = spriteWithAdapter();
      node['textureId'] = 'hero.png';

      expect(writeValue(adapter, node, 'textureId', 42)).toBe(false);
      expect(node['textureId']).toBe('hero.png');
    });

    /** The section is a Sprite's; a Container never declared the key. */
    it('is not writable on a node that does not offer it', () => {
      const { node, adapter } = nodeWithAdapter();

      expect(writeValue(adapter, node, 'textureId', 'hero.png')).toBe(false);
    });
  });

  it('refuses to write the type, since the schema marks it read-only', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(writeValue(adapter, node, 'type', 'Sprite')).toBe(false);
  });

  /**
   * What names a node is not the panel's to decide. A name is changed by the
   * tree's rename, which goes through `scene.mutate`; `id` and `classesList`
   * belong to the framework that put them there and reads them back, and a
   * caption whose classes were edited here would be styled by rules nobody
   * wrote. Refused in the page as well as undrawn in the panel — `scene.setProp`
   * arrives from another process, and a hidden editor is not a guard.
   */
  it('refuses to write what belongs to the application rather than to the panel', () => {
    const { node, adapter } = nodeWithAdapter();
    node['label'] = 'hero';
    node['id'] = 'hero-1';
    node['classesList'] = 'hud caption';

    expect(writeValue(adapter, node, 'label', 'villain')).toBe(false);
    expect(writeValue(adapter, node, 'id', 'villain-1')).toBe(false);
    expect(writeValue(adapter, node, 'classesList', 'hud muted')).toBe(false);

    expect(node['label']).toBe('hero');
    expect(node['id']).toBe('hero-1');
    expect(node['classesList']).toBe('hud caption');
  });
});

describe('writeValue', () => {
  it('writes a declared property', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(writeValue(adapter, node, 'alpha', 0.25)).toBe(true);
    expect(node['alpha']).toBe(0.25);
  });

  it('writes one component of a point without replacing it', () => {
    const { node, adapter } = nodeWithAdapter();
    const point = node['position'];

    writeValue(adapter, node, 'position', { x: 3, y: 4 });

    expect(node['position']).toBe(point);
    expect(point).toEqual({ x: 3, y: 4 });
  });

  /**
   * `setProp` arrives from another process. Checking the key against the schema
   * is what keeps it a property editor rather than a way to write anything at
   * all onto any object reachable from a node.
   */
  it('refuses a key the schema does not declare', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(writeValue(adapter, node, 'constructor.prototype.polluted', true)).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('refuses a key that only looks like a declared one', () => {
    const { node, adapter } = nodeWithAdapter();

    expect(writeValue(adapter, node, 'alphaSomethingElse', 1)).toBe(false);
  });

  it('leaves the node untouched when it refuses', () => {
    const { node, adapter } = nodeWithAdapter();
    const before = { ...node };

    writeValue(adapter, node, 'notAProperty', 1);

    expect(node).toEqual(before);
  });
});

/** The core never sees a real Pixi node here — only what the adapter exposes. */
describe('the adapter is the only way in', () => {
  it('reads through the adapter rather than off the node', () => {
    const { node } = nodeWithAdapter();
    const reads: string[] = [];
    const spy = {
      ...(createAdapter({ stage: node, renderer: { renderPipes: {} } }) as PixiAdapter),
      getProp: (target: Node, path: string) => {
        reads.push(path);
        return (target as Fake)[path] as Json;
      },
    };

    readValues(spy, node, ['alpha', 'zIndex']);

    expect(reads).toEqual(['alpha', 'zIndex']);
  });
});

/**
 * A text a game patched, and one PixiJS built.
 *
 * Both report as `Text` and share a schema, so the two settings only one of them
 * has cannot be told apart by type. The mark is `outputText`: the patched classes
 * on both PixiJS lines have it, neither library does.
 */
describe('the settings only a patched text has', () => {
  const plainText = (): { node: Fake; adapter: PixiAdapter } => {
    const { node, adapter } = nodeWithAdapter();
    node['renderPipeId'] = 'text';
    node['style'] = {};

    return { node, adapter };
  };

  const patchedText = (style: Fake = {}): { node: Fake; adapter: PixiAdapter } => {
    const { node, adapter } = plainText();
    node['outputText'] = () => undefined;
    node['style'] = style;

    return { node, adapter };
  };

  const keys = ['style.flexFont', 'style.wordWrapHeight'];

  /** Absent reads as `null`, and a row with no value is not drawn. */
  it('offers neither on a text PixiJS built', () => {
    const { node, adapter } = plainText();

    expect(dataOf(readValues(adapter, node, keys))).toEqual({
      'style.flexFont': null,
      'style.wordWrapHeight': null,
    });
  });

  it('reads what a patched text has set', () => {
    const { node, adapter } = patchedText({ flexFont: true, wordWrapHeight: 40 });

    expect(dataOf(readValues(adapter, node, keys))).toEqual({
      'style.flexFont': true,
      'style.wordWrapHeight': 40,
    });
  });

  /**
   * The one that makes the difference: a setting the style has not been given yet
   * still gets a row, because a `flexFont` nobody can see is a `flexFont` nobody
   * can switch on.
   */
  it('offers both on a patched text that has set neither', () => {
    const { node, adapter } = patchedText();

    expect(dataOf(readValues(adapter, node, keys))).toEqual({
      'style.flexFont': false,
      'style.wordWrapHeight': 0,
    });
  });
});

/**
 * A text that fits itself to a box remembers its size twice: what it is now, and
 * what it was before any shrinking. The class restores the first from the second
 * at the start of every pass, so a size written to only one of them survives
 * until the next relayout and then snaps back.
 */
describe('writing a size onto a text that shrinks itself', () => {
  it('writes the remembered size along with it', () => {
    const { node, adapter } = nodeWithAdapter();
    node['renderPipeId'] = 'text';
    node['style'] = { fontSize: 18, originalFontSize: 26 };

    writeValue(adapter, node, 'style.fontSize', 14);

    expect(node['style']).toEqual({ fontSize: 14, originalFontSize: 14 });
  });

  it('adds nothing to a style that does not remember one', () => {
    const { node, adapter } = nodeWithAdapter();
    node['renderPipeId'] = 'text';
    node['style'] = { fontSize: 18 };

    writeValue(adapter, node, 'style.fontSize', 14);

    expect(node['style']).toEqual({ fontSize: 14 });
  });
});

/**
 * A group switch, which is written differently from every other property.
 *
 * Two things are being checked here rather than one. That the switch itself
 * lands — a shadow through the style's own setter, a stroke through its width —
 * and that a switch handed the group's **settings** turns on and puts them back
 * in the same pass. The second is what makes the panel's memory possible at all:
 * two commands would be two crossings of the bridge, with no order between them
 * and nothing tying them together.
 */
describe('the switches that own their group', () => {
  const styled = (style: Fake): { node: Fake; adapter: PixiAdapter } => {
    const { node, adapter } = nodeWithAdapter();
    node['renderPipeId'] = 'text';
    node['style'] = style;

    return { node, adapter };
  };

  describe('the stroke', () => {
    it('switches a v6/v7 stroke off by its width, leaving the colour', () => {
      const { node, adapter } = styled({ stroke: 'red', strokeThickness: 4, lineJoin: 'bevel' });

      expect(writeValue(adapter, node, 'style.strokeEnabled', false)).toBe(true);
      expect(node['style']).toEqual({ stroke: 'red', strokeThickness: 0, lineJoin: 'bevel' });
    });

    it('builds a v8 stroke where the style had none', () => {
      const { node, adapter } = styled({ stroke: null });

      expect(writeValue(adapter, node, 'style.strokeEnabled', true)).toBe(true);
      expect(node['style']).toEqual({ stroke: { width: 1 } });
    });

    it('writes nothing onto a style with no stroke at all', () => {
      const { node, adapter } = styled({ fontSize: 12 });

      expect(writeValue(adapter, node, 'style.strokeEnabled', true)).toBe(false);
      expect(node['style']).toEqual({ fontSize: 12 });
    });
  });

  describe('the shadow', () => {
    it('goes through the style, which turns a boolean into a whole shadow', () => {
      const { node, adapter } = styled({ dropShadow: true });

      expect(writeValue(adapter, node, 'style.dropShadow', false)).toBe(true);
      expect(node['style']).toEqual({ dropShadow: false });
    });
  });

  describe('coming back on with what the group had', () => {
    it('switches on and applies every setting in one write', () => {
      const { node, adapter } = styled({ dropShadow: false, dropShadowBlur: 0, dropShadowDistance: 0 });

      expect(
        writeValue(adapter, node, 'style.dropShadow', {
          'style.dropShadowBlur': 6,
          'style.dropShadowDistance': 3,
        }),
      ).toBe(true);

      expect(node['style']).toEqual({ dropShadow: true, dropShadowBlur: 6, dropShadowDistance: 3 });
    });

    it('restores a stroke width onto the stroke it has just built', () => {
      const { node, adapter } = styled({ stroke: null });

      expect(
        writeValue(adapter, node, 'style.strokeEnabled', { 'style.stroke.width': 8 }),
      ).toBe(true);

      expect(node['style']).toEqual({ stroke: { width: 8 } });
    });

    /**
     * The settings are not trusted for travelling beside a declared key: each one
     * is asked about separately, exactly as a write of its own would be.
     */
    it('ignores a setting the schema does not declare', () => {
      const { node, adapter } = styled({ dropShadow: false });

      writeValue(adapter, node, 'style.dropShadow', {
        'style.dropShadowBlur': 6,
        'constructor.prototype.polluted': true,
        notAProperty: 1,
      });

      expect(node['style']).toEqual({ dropShadow: true, dropShadowBlur: 6 });
      expect(({} as Fake)['polluted']).toBeUndefined();
    });

    /** A switch is the thing being flipped, not one of its group's settings —
     *  and refusing one keeps this a single pass rather than a nested program. */
    it('ignores a setting that is itself a switch', () => {
      const { node, adapter } = styled({ dropShadow: false, stroke: null });

      writeValue(adapter, node, 'style.dropShadow', { 'style.strokeEnabled': true });

      expect(node['style']).toEqual({ dropShadow: true, stroke: null });
    });

    it('refuses a value that is neither a boolean nor settings', () => {
      const { node, adapter } = styled({ dropShadow: false });

      expect(writeValue(adapter, node, 'style.dropShadow', 'yes')).toBe(false);
      expect(node['style']).toEqual({ dropShadow: false });
    });
  });
});

/**
 * A fill crosses the bridge in one shape for both PixiJS lines, which is what
 * lets the panel draw a ramp — and can be pasted nowhere. The source beside it
 * is the same gradient in the spelling this page actually uses, put there by the
 * one reader that has an adapter to ask.
 */
describe('readValues, on a gradient fill', () => {
  it('reports the gradient and how the page writes it', () => {
    const { node, adapter } = nodeWithAdapter();
    node['style'] = {
      fill: { type: 'linear', colorStops: [{ offset: 0, color: '#8ecaff' }] },
    };

    const fill = dataOf(readValues(adapter, node, ['style.fill']))['style.fill'];

    expect(fill).toMatchObject({ kind: 'gradient' });
    expect((fill as { source?: string }).source).toContain('colorStops');
  });

  it('leaves a plain colour as the colour it is', () => {
    const { node, adapter } = nodeWithAdapter();
    node['style'] = { fill: '#e6e6e6' };

    expect(dataOf(readValues(adapter, node, ['style.fill']))['style.fill']).toBe('#e6e6e6');
  });
});
