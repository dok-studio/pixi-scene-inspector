import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PixiAdapter } from '../adapters/types.js';
import type { Session } from '../runtime/session.js';
import {
  readFrame,
  readRecord,
  readTextureAggregate,
  resetStats,
  setRecording,
  setStatsClock,
  statsArmed,
} from './frame.js';

/**
 * A session with a renderer that draws when told to, so a test can decide when
 * a frame happened instead of waiting for one.
 */
function fakeSession(options: { attached?: boolean; counter?: boolean } = {}) {
  let attached = options.attached ?? true;
  // A renderer the counter cannot find a draw path on answers null, the way a
  // canvas renderer or an unfamiliar backend would.
  const counted = options.counter ?? true;

  const consumers = new Set<(renderMs: number) => void>();
  let released = 0;
  let draws = 0;

  let walks = 0;

  const adapter = {
    textures: () => {
      walks += 1;
      return [];
    },
    textureInfo: () => ({ gpuSize: 0, isLoaded: false }),
    // The counter is its own handle: releasing goes through the object that
    // installed the wrap, not back through the adapter.
    drawCounter: () =>
      counted
        ? {
            total: () => draws,
            release: () => {
              released += 1;
            },
          }
        : null,
  } as unknown as PixiAdapter;

  const session = {
    adapter: () => (attached ? adapter : null),
    frame: {
      subscribe(consumer: (renderMs: number) => void) {
        consumers.add(consumer);
        return () => consumers.delete(consumer);
      },
      refresh: () => undefined,
      requestFrame: () => undefined,
      get installed() {
        return consumers.size > 0;
      },
    },
  } as unknown as Session;

  return {
    session,
    /**
     * One rendered frame, with however many draw submissions it made and
     * however long the render itself took.
     */
    render(perFrame = 0, renderMs = 0) {
      draws += perFrame;
      for (const consumer of [...consumers]) consumer(renderMs);
    },
    get hooked() {
      return consumers.size > 0;
    },
    get released() {
      return released;
    },
    /** The page lost its renderer — a reload, or a game that tore it down. */
    detach() {
      attached = false;
    },
    /** How many times the renderer texture list has been walked. */
    get walks() {
      return walks;
    },
  };
}

/** Five minutes, the panel's own default. */
const KEEP_MS = 300_000;

let now = 0;

beforeEach(() => {
  now = 0;
  setStatsClock(() => now);
  resetStats();
});

afterEach(() => {
  resetStats();
  setStatsClock(() => performance.now());
});

describe('readFrame', () => {
  it('answers null and stays off a page with nothing attached', () => {
    const page = fakeSession({ attached: false });

    expect(readFrame(page.session)).toBeNull();
    expect(page.hooked).toBe(false);
  });

  it('arms the hook on the first poll — the poll is the consumer', () => {
    const page = fakeSession();

    expect(statsArmed()).toBe(false);
    readFrame(page.session);

    expect(statsArmed()).toBe(true);
    expect(page.hooked).toBe(true);
  });

  it('takes the hook off once the polls stop', () => {
    const page = fakeSession();
    readFrame(page.session);

    // Frames keep arriving; nobody is reading them any more.
    now = 2_500;
    page.render();

    expect(statsArmed()).toBe(false);
    expect(page.hooked).toBe(false);
    expect(page.released).toBe(1);
  });

  it('puts the draw counter back on a page whose renderer has gone', () => {
    const page = fakeSession();
    readFrame(page.session);
    expect(statsArmed()).toBe(true);

    // The branch that used to leave the wraps on: disarming happens *because*
    // there is no adapter, so anything released by asking the adapter again was
    // released by nobody.
    page.detach();

    expect(readFrame(page.session)).toBeNull();
    expect(statsArmed()).toBe(false);
    expect(page.released).toBe(1);
  });

  it('keeps the hook while the polls keep coming', () => {
    const page = fakeSession();

    for (let at = 0; at < 5_000; at += 100) {
      now = at;
      readFrame(page.session);
      page.render();
    }

    expect(statsArmed()).toBe(true);
  });

  it('reports zero for a single frame rather than a rate invented from it', () => {
    const page = fakeSession();
    readFrame(page.session);

    now = 16;
    page.render();
    now = 20;

    expect(readFrame(page.session)?.fps).toBe(0);
  });

  it('measures the rate over the window', () => {
    const page = fakeSession();
    readFrame(page.session);

    // Eleven frames, 16 ms apart: ten intervals over 160 ms is 62.5/s.
    for (let i = 1; i <= 11; i += 1) {
      now = i * 16;
      page.render();
    }

    const frame = readFrame(page.session);
    expect(frame?.fps).toBe(62.5);
    expect(frame?.frameMs).toBe(16);
  });

  it('falls to zero on a scene that has stopped drawing, not to a stale figure', () => {
    const page = fakeSession();
    readFrame(page.session);

    for (let i = 1; i <= 10; i += 1) {
      now = i * 16;
      page.render();
    }
    expect(readFrame(page.session)?.fps).toBeGreaterThan(0);

    // A poll keeps the hook armed; no frame arrives for over a second.
    now = 1_300;
    const stalled = readFrame(page.session);

    expect(stalled).toEqual(expect.objectContaining({ fps: 0, frameMs: 0, frames: 0 }));
  });

  /**
   * The claim the whole chart rests on: a mean hides a stutter, and this is the
   * figure that does not. One frame of 120 ms among sixteens moves `frameMs` by
   * a few milliseconds and `worstFrameMs` all the way.
   */
  it('reports the worst frame in the window, not the average one', () => {
    const page = fakeSession();
    readFrame(page.session);

    for (let i = 1; i <= 10; i += 1) {
      now = i * 16;
      page.render();
    }
    // One long gap, then back to normal.
    now = 280;
    page.render();
    for (let i = 1; i <= 5; i += 1) {
      now = 280 + i * 16;
      page.render();
    }

    const frame = readFrame(page.session);
    expect(frame?.worstFrameMs).toBe(120);
    expect(frame?.frameMs).toBeLessThan(30);
  });

  it('measures the render itself, which the frame time does not separate', () => {
    const page = fakeSession();
    readFrame(page.session);

    now = 16;
    page.render(0, 4);
    now = 32;
    page.render(0, 6);

    const frame = readFrame(page.session);
    expect(frame?.renderMs).toBe(5);
    // The frame took sixteen; five of it was drawing, and the rest was not.
    expect(frame?.frameMs).toBe(16);
  });

  /**
   * The render time was measured, not derived from the distance between two
   * frames, so unlike the rest it means something with one frame in the window.
   */
  it('has a render time with a single frame, where the rates have none', () => {
    const page = fakeSession();
    readFrame(page.session);

    now = 16;
    page.render(0, 7);

    const frame = readFrame(page.session);
    expect(frame?.renderMs).toBe(7);
    expect(frame?.fps).toBe(0);
    expect(frame?.worstFrameMs).toBe(0);
  });

  it('reports draw calls per frame, not per poll', () => {
    const page = fakeSession();
    readFrame(page.session);

    now = 16;
    page.render(20);
    now = 32;
    page.render(20);

    expect(readFrame(page.session)).toEqual(
      expect.objectContaining({ drawCalls: 20, frames: 2 }),
    );
  });

  /**
   * A renderer whose draw path could not be found reports nothing, not nought.
   * A flat line along the floor is a claim — "this scene draws nothing" — and
   * it is the wrong one; it also hides the failure, which is how a counter
   * looking in the wrong place went unnoticed once already.
   */
  it('says nothing about draw calls on a renderer it cannot count', () => {
    const page = fakeSession({ counter: false });
    readFrame(page.session);

    now = 16;
    page.render();
    now = 32;
    page.render();

    const frame = readFrame(page.session);
    expect(frame?.drawCalls).toBeNull();
    // The rest is still measured: no counter is not no readings.
    expect(frame?.frames).toBe(2);
  });

  it('counts each frame once, however many readers there are', () => {
    const page = fakeSession();
    readFrame(page.session);

    now = 16;
    page.render(30);

    expect(readFrame(page.session)?.drawCalls).toBe(30);
    // The count in the page never resets, so a second read sees no frames
    // rather than the same frame again.
    expect(readFrame(page.session)?.frames).toBe(0);
  });
});

describe('setRecording', () => {
  it('keeps the hook on after the polls stop', () => {
    const page = fakeSession();
    setRecording(page.session, KEEP_MS);

    now = 5_000;
    page.render();

    expect(statsArmed()).toBe(true);
  });

  it('collects samples at its own rate, not the poll rate', () => {
    const page = fakeSession();
    setRecording(page.session, KEEP_MS);

    // Sixty frames over a second. A sample is taken on the first frame at or
    // past the interval, so they land on frame boundaries rather than exactly
    // every 100 ms — eight of them here, not sixty.
    for (let i = 1; i <= 60; i += 1) {
      now = i * 16;
      page.render(1);
    }

    const record = readRecord(0);
    const times = (record?.samples ?? []).map((sample) => sample[0] ?? 0);

    expect(times.length).toBe(8);
    expect(record?.dropped).toBe(0);
    for (const [at, time] of times.entries()) {
      if (at === 0) continue;
      expect(time - (times[at - 1] ?? 0)).toBeGreaterThanOrEqual(100);
    }
  });

  /**
   * The recorded figure is per frame, the same as the live one. It used to be
   * the counter's lifetime tally, so the recorded series only ever climbed and
   * the high it reported was every draw since the panel opened — a hundred and
   * twenty thousand beside a chart whose peak was thirty.
   */
  it('records draw calls per frame, not the tally since it started', () => {
    const page = fakeSession();
    setRecording(page.session, KEEP_MS);

    // Two hundred draws over ten frames, in each of two samples.
    for (let at = 1; at <= 20; at += 1) {
      now = at * 20;
      page.render(20);
    }

    const record = readRecord(0);
    const at = (record?.fields ?? []).indexOf('drawCalls');

    // Twenty a frame, whatever the recording's length: the tally would have
    // been in the hundreds by now.
    expect(record?.max[at]).toBe(20);
    expect(record?.min[at]).toBe(20);
  });

  it('starts every recording with a complete row', () => {
    const page = fakeSession();
    setRecording(page.session, KEEP_MS);

    now = 100;
    page.render(1);

    const record = readRecord(0);
    const first = record?.samples[0];
    const fields = record?.fields ?? [];

    expect(first?.[1]).toBe((1 << fields.length) - 1);
    expect(first?.length).toBe(2 + fields.length);
  });

  it('takes the hook off when recording stops and nobody is polling', () => {
    const page = fakeSession();
    setRecording(page.session, KEEP_MS);

    now = 5_000;
    setRecording(page.session, 0);

    expect(statsArmed()).toBe(false);
    expect(readRecord(0)).toBeNull();
  });

  it('leaves the hook on when recording stops but the panel is still polling', () => {
    const page = fakeSession();
    readFrame(page.session);
    setRecording(page.session, KEEP_MS);
    setRecording(page.session, 0);

    expect(statsArmed()).toBe(true);
  });

  it('takes itself off when nobody drains it, so a closed DevTools leaks nothing', () => {
    const page = fakeSession();
    setRecording(page.session, KEEP_MS);

    now = 61_000;
    page.render();

    expect(readRecord(0)).toBeNull();
    expect(statsArmed()).toBe(false);
  });

  /**
   * The walk is the one piece of sampling that is not a counter, and it lands
   * inside a rendered frame. While the panel is polling it should not happen
   * there at all: the poll already re-read it, off the frame.
   */
  it('does not walk the textures inside a frame while the panel is polling', () => {
    const page = fakeSession();
    setRecording(page.session, KEEP_MS);
    readTextureAggregate(page.session);

    const before = page.walks;
    for (let at = 100; at <= 3_000; at += 100) {
      now = at;
      readFrame(page.session);
      page.render();
    }

    expect(page.walks).toBe(before);
  });

  it('falls back to walking rarely once nobody is polling', () => {
    const page = fakeSession();
    setRecording(page.session, KEEP_MS);
    readTextureAggregate(page.session);

    const before = page.walks;
    // Twelve seconds of frames with no poll at all: two refreshes, not twelve.
    for (let at = 100; at <= 12_000; at += 100) {
      now = at;
      page.render();
    }

    expect(page.walks - before).toBe(2);
  });

  it('says nothing is recorded before recording starts', () => {
    expect(readRecord(0)).toBeNull();
  });
});
