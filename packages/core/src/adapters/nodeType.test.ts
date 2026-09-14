import { describe, expect, it } from 'vitest';

import { nodeType } from './nodeType.js';

/**
 * Node type detection is duck-typed rather than read off `constructor.name`:
 * production bundles are minified, and a subclass reports its own name anyway.
 *
 * v8 nodes carry `renderPipeId`, which is as close to a declared type as Pixi
 * gets. v6/v7 nodes have no such marker, so they are recognised by fields that
 * exist on exactly one class.
 */
describe('nodeType', () => {
  describe('v8, by renderPipeId', () => {
    it('recognises a Sprite', () => {
      expect(nodeType({ renderPipeId: 'sprite' })).toBe('Sprite');
    });

    it('recognises a Text', () => {
      expect(nodeType({ renderPipeId: 'text' })).toBe('Text');
    });

    it('recognises a BitmapText', () => {
      expect(nodeType({ renderPipeId: 'bitmapText' })).toBe('BitmapText');
    });

    it('recognises an HTMLText', () => {
      expect(nodeType({ renderPipeId: 'htmlText' })).toBe('HTMLText');
    });

    it('recognises a Graphics', () => {
      expect(nodeType({ renderPipeId: 'graphics' })).toBe('Graphics');
    });

    it('recognises a NineSliceSprite', () => {
      expect(nodeType({ renderPipeId: 'nineSliceSprite' })).toBe('NineSliceSprite');
    });

    it('recognises a TilingSprite', () => {
      expect(nodeType({ renderPipeId: 'tilingSprite' })).toBe('TilingSprite');
    });

    it('recognises a Mesh', () => {
      expect(nodeType({ renderPipeId: 'mesh' })).toBe('Mesh');
    });

    it('recognises a ParticleContainer', () => {
      expect(nodeType({ renderPipeId: 'particle' })).toBe('ParticleContainer');
    });

    it('recognises a plain Container', () => {
      const container = {
        includeInBuild: true,
        measurable: true,
        _didLocalTransformChangeId: 0,
      };

      expect(nodeType(container)).toBe('Container');
    });
  });

  describe('v6/v7, by structure', () => {
    it('recognises a Sprite', () => {
      expect(nodeType({ vertexTrimmedData: new Float32Array(0), indices: [] })).toBe('Sprite');
    });

    it('recognises a Text', () => {
      const text = { updateText: () => {}, drawLetterSpacing: () => {}, _render: () => {} };

      expect(nodeType(text)).toBe('Text');
    });

    it('recognises a BitmapText', () => {
      expect(nodeType({ _activePagesMeshData: [] })).toBe('BitmapText');
    });

    it('recognises an HTMLText', () => {
      expect(nodeType({ _foreignObject: {}, _svgRoot: {} })).toBe('HTMLText');
    });

    it('recognises a Graphics', () => {
      expect(nodeType({ drawRect: () => {}, drawPolygon: () => {} })).toBe('Graphics');
    });

    it('recognises a TilingSprite', () => {
      const tiling = { tileTransform: {}, uvRespectAnchor: false, uvMatrix: {} };

      expect(nodeType(tiling)).toBe('TilingSprite');
    });

    it('recognises a plain Container', () => {
      const container = { _maskRefCount: 0, _render: () => {}, _tempDisplayObjectParent: null };

      expect(nodeType(container)).toBe('Container');
    });
  });

  /**
   * Subclasses share their parent's markers, so the order of the checks is part
   * of the contract: the more specific type has to win.
   */
  describe('specific types win over the classes they extend', () => {
    it('an AnimatedSprite is not reported as a Sprite', () => {
      const animated = {
        renderPipeId: 'sprite',
        gotoAndPlay: () => {},
        play: () => {},
        stop: () => {},
        _isConnectedToTicker: false,
      };

      expect(nodeType(animated)).toBe('AnimatedSprite');
    });

    it('a Text is not reported as a Container', () => {
      const text = {
        renderPipeId: 'text',
        includeInBuild: true,
        measurable: true,
        _didLocalTransformChangeId: 0,
      };

      expect(nodeType(text)).toBe('Text');
    });

    it('a MultiStyleText is not reported as a Text', () => {
      const multi = {
        _textStyles: { default: {} },
        setTagStyle: () => {},
        // Everything a Text is, because the class extends one.
        updateText: () => {},
        drawLetterSpacing: () => {},
        _render: () => {},
      };

      expect(nodeType(multi)).toBe('MultiStyleText');
    });
  });

  /**
   * MultiStyleText is not part of PixiJS either: on the older line applications
   * install it over `Text`, so it carries every marker a Text has and needs its
   * own — the styles it keeps beside the node and the method it writes them
   * through. Not recognised by asking the version; the class says what it is.
   */
  describe('MultiStyleText', () => {
    it('recognises the tag styles and the setter together', () => {
      expect(nodeType({ _textStyles: {}, setTagStyle: () => {} })).toBe('MultiStyleText');
    });

    it('does not take a set of styles on its own for one', () => {
      expect(nodeType({ _textStyles: {} })).toBe('Unknown');
    });

    /**
     * On PixiJS 8 there is no such class. The game folds the feature into its own
     * `Text`, which reads its markup when the style it was handed carries
     * sub-styles — so the node is a Text, and naming it after a class the page
     * does not contain would be inventing one.
     */
    it('calls a text whose style carries tags a Text', () => {
      expect(nodeType({ renderPipeId: 'text2', style: { subStyles: {} } })).toBe('Text');
    });

    it('leaves a text with no tags alone', () => {
      expect(nodeType({ renderPipeId: 'text2', style: { fontSize: 12 } })).toBe('Text');
    });
  });

  /**
   * Spine is not part of PixiJS: the runtime is installed separately and may be
   * absent, so it is recognised by the skeleton's own fields.
   */
  describe('Spine', () => {
    it('recognises the v8 runtime', () => {
      expect(nodeType({ renderPipeId: 'spine' })).toBe('Spine');
    });

    it('recognises the v6/v7 runtime', () => {
      expect(nodeType({ spineData: {} })).toBe('Spine');
    });
  });

  it('falls back to Unknown for anything unrecognised', () => {
    expect(nodeType({ x: 0, y: 0 })).toBe('Unknown');
  });
});
