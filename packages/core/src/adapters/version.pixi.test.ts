// @vitest-environment happy-dom
import './canvasStub.js';

import * as v6 from 'pixi-v6';
import * as v7 from 'pixi-v7';
import { Container, VERSION } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { detect } from '../runtime/detect.js';
import { detectVersion } from './version.js';

/**
 * The only place in the core allowed to import the real `pixi.js` — the linter
 * enforces that for everything else (see eslint.config.js).
 *
 * Why it exists: every other test checks the duck-typing against fakes written
 * by the same hand as the heuristic itself, which proves internal consistency
 * and says nothing about the real library. Markers like `_updateFlags` are
 * Pixi internals nobody promised to keep. This test catches the moment they
 * disappear — a red CI beats a silent "PixiJS not detected" in the field.
 *
 * `pixi.js` is a devDependency of the core here. It never reaches production
 * code.
 */
describe('detectVersion against the real PixiJS', () => {
  it('parses the version the library reports itself', () => {
    expect(detectVersion({ pixi: { VERSION } })).toEqual({ major: 8, version: VERSION });
  });

  it('recognises v8 from the shape of a real Container', () => {
    const stage = new Container();

    expect(detectVersion({ stage })).toEqual({ major: 8, version: null });
  });

  it('detection finds a real stage on a global', () => {
    const stage = new Container();
    const result = detect({ __PIXI_STAGE__: stage });

    expect(result?.source).toBe('__PIXI_STAGE__');
    expect(result?.stage).toBe(stage);
  });

  /**
   * Guard against a silent drift: if the installed PixiJS becomes v9, this
   * fails here rather than somewhere inside detection, and it is obvious what
   * needs revisiting.
   */
  it('is running against v8 — otherwise the heuristics need revisiting', () => {
    expect(VERSION.startsWith('8.')).toBe(true);
  });
});

/**
 * The v6/v7 half of the same guard, for the markers that live on the renderer
 * rather than on a node.
 *
 * A renderer cannot be instantiated here — it needs a WebGL context, and these
 * tests run in plain Node. But both libraries register their systems and
 * plugins on the `Renderer` class at import time, so what a live renderer will
 * carry can be read off the class itself. That is enough to prove the two
 * markers `duckTypeMajor` relies on are still there, and still exclusive to
 * one line each.
 */
describe('duck-typing markers on the real v6 and v7 renderers', () => {
  it('v6 registers the interaction plugin the detector looks for', () => {
    expect(Object.keys(v6.Renderer.__plugins)).toContain('interaction');
  });

  /** The whole reason `events` can stand for "v7 or newer" after ruling out v8. */
  it('v7 replaced it with the EventSystem', () => {
    const systems = v7.Renderer.__systems as Record<string, unknown>;

    expect(Object.keys(systems)).toContain('events');
    expect(Object.keys(v7.Renderer.__plugins)).not.toContain('interaction');
  });

  it('the installed libraries really are v6 and v7', () => {
    expect(v6.VERSION.startsWith('6.')).toBe(true);
    expect(v7.VERSION.startsWith('7.')).toBe(true);
  });
});
