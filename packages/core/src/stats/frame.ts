import type { StatsFrame, StatsRecord, StatsTextures } from '@scene-inspector/protocol';

import type { DrawCounter } from '../adapters/drawCalls.js';
import type { Session } from '../runtime/session.js';
import { createRecorder, type Recorder } from './record.js';
import { readTextureStats } from './textures.js';

/**
 * The per-frame numbers, and the hook that produces them.
 *
 * **Arming the live figures is implicit: the poll is the consumer.** Asking for
 * a frame installs the hook; not asking for two seconds takes it off again. The
 * panel mounts one tab at a time, so closing the Stats tab stops the polls on
 * its own, and rule 5 — a render hook only while something needs a frame — is
 * kept without a command whose only job is to say so.
 *
 * Recording is armed explicitly, because it has to outlive that poll: it keeps
 * running while the Scene tab is open, which is exactly when nothing is asking
 * for a frame. It takes *itself* off after a minute with no reader, which is
 * what closing DevTools looks like from in here.
 *
 * A module singleton, like the Spine event log: there is one page and one
 * panel, and threading this through the session would buy nothing.
 */

/** How long the live figures go unread before the hook comes off. */
const LIVE_IDLE_MS = 2_000;

/** The recording's own resolution, deliberately not the panel's poll rate. */
const SAMPLE_MS = 100;

/** How long the frame window is. Frames outside it no longer count towards FPS. */
const WINDOW_MS = 1_000;

/**
 * How often texture memory is re-read while nobody is watching the tab.
 *
 * It is a walk over every texture the renderer holds, not a counter, and while
 * the tab is open it is not done here at all — the panel polls
 * `stats.textures`, and that runs in an `eval`, off the frame. This is the
 * fallback for a recording that keeps going with nobody polling: the figure
 * still has to appear in the samples, but a five-second-old one costs nothing
 * and the walk lands inside a rendered frame, which is where it is worth being
 * rare.
 */
const TEXTURE_IDLE_MS = 5_000;

const MB = 1024 * 1024;

interface Memory {
  usedJSHeapSize?: unknown;
  jsHeapSizeLimit?: unknown;
}

/**
 * The JS heap where the browser reports one.
 *
 * Guarded, unlike the previous project's read, which was unconditional and
 * throws outside Chromium. Absent is null, and the panel draws no chart for it
 * rather than a flat zero that would read as "no memory used".
 */
function heap(): { used: number; limit: number } | null {
  try {
    const memory = (performance as unknown as { memory?: Memory }).memory;
    if (typeof memory !== 'object' || memory === null) return null;

    const used = memory.usedJSHeapSize;
    const limit = memory.jsHeapSizeLimit;
    if (typeof used !== 'number' || typeof limit !== 'number') return null;

    return { used: used / MB, limit: limit / MB };
  } catch {
    return null;
  }
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

interface Hook {
  release: () => void;
  counter: DrawCounter | null;
}

interface Textures {
  at: number;
  count: number;
  onGpu: number;
  gpuBytes: number;
}

interface State {
  hook: Hook | null;
  /** Frame timestamps inside the window, oldest first. */
  stamps: number[];
  /** What each of those renders cost, in the same order. */
  renders: number[];
  /** Frames since the panel last read, so it can be told the scene is not drawing. */
  frames: number;
  /** The counter total when the panel last read. */
  drawAt: number;
  /** Draw submissions since then. */
  draws: number;
  /** `-Infinity` until the panel has actually read once — see `wanted`. */
  lastLiveRead: number;
  recorder: Recorder | null;
  recordStart: number;
  lastSample: number;
  /** The counter total, and the frames, at the last sample the recorder took. */
  sampleDrawAt: number;
  sampleFrames: number;
  textures: Textures | null;
}

const state: State = {
  hook: null,
  stamps: [],
  renders: [],
  frames: 0,
  drawAt: 0,
  draws: 0,
  lastLiveRead: Number.NEGATIVE_INFINITY,
  recorder: null,
  recordStart: 0,
  lastSample: 0,
  sampleDrawAt: 0,
  sampleFrames: 0,
  textures: null,
};

/** Injectable so the tests do not have to wait for real seconds to pass. */
let clock: () => number = () => performance.now();

export function setStatsClock(next: () => number): void {
  clock = next;
}

/**
 * Whether anything still needs the hook.
 *
 * `lastLiveRead` starts at negative infinity rather than at zero, and the
 * difference is not academic: a clock that begins near zero at page load would
 * make "never read" look like "read a moment ago", and a recording started and
 * stopped in the first two seconds of a page would leave the proxy on.
 */
function wanted(now: number): boolean {
  return state.recorder !== null || now - state.lastLiveRead < LIVE_IDLE_MS;
}

/** Whether the Stats tab is polling, which is the only thing that ever does. */
function watched(now: number): boolean {
  return now - state.lastLiveRead < LIVE_IDLE_MS;
}

/**
 * Reads the renderer's textures and remembers the answer.
 *
 * The one piece of sampling that is a walk rather than a counter, so where it
 * runs matters: called from the panel's poll it is off the frame, called from
 * the sampler it is inside one.
 */
function readTextures(session: Session, now: number): Textures {
  const adapter = session.adapter();
  const stats = adapter === null ? { count: 0, onGpu: 0, gpuBytes: 0 } : readTextureStats(adapter);

  const fresh: Textures = { at: now, count: stats.count, onGpu: stats.onGpu, gpuBytes: stats.gpuBytes };
  state.textures = fresh;

  return fresh;
}

/**
 * The figure a sample should carry, without walking if it can help it.
 *
 * While the tab is watched the panel is already re-reading this once a second
 * from its own poll, so the sampler takes whatever that left and does no work
 * inside the frame at all. With nobody watching there is no poll to take it
 * from, and it falls back to reading it here, rarely.
 */
function textureValues(session: Session, now: number): Textures {
  const cached = state.textures;
  if (cached === null) return readTextures(session, now);
  if (watched(now)) return cached;

  return now - cached.at < TEXTURE_IDLE_MS ? cached : readTextures(session, now);
}

/** What `stats.textures` answers. Refreshes the copy the sampler reads. */
export function readTextureAggregate(session: Session): StatsTextures | null {
  if (session.adapter() === null) return null;

  const { count, onGpu, gpuBytes } = readTextures(session, clock());

  return { count, onGpu, gpuBytes };
}

/**
 * FPS and mean frame time over the window.
 *
 * Both come from the window rather than from what arrived since the last poll,
 * and that is what keeps a slow game readable: at 5 fps a 100 ms poll sees no
 * frame at all most of the time, and a figure derived from that would flicker
 * between five and zero. A scene that has actually stopped empties the window
 * within a second and reads zero, which is the answer that matters.
 */
function fromWindow(now: number): {
  fps: number;
  frameMs: number;
  renderMs: number;
  worstFrameMs: number;
} {
  // The two arrays are one record with two columns: a stamp and what the render
  // at that stamp cost. They are trimmed together so that everything below is
  // measured over the same second and the figures can be read against one
  // another.
  while (state.stamps.length > 0 && now - (state.stamps[0] ?? 0) > WINDOW_MS) {
    state.stamps.shift();
    state.renders.shift();
  }

  /*
   * The render time is the one figure that means something with a single frame
   * in the window: it was measured, not derived from the distance between two.
   */
  let spent = 0;
  for (const render of state.renders) spent += render;
  const renderMs = state.renders.length === 0 ? 0 : round(spent / state.renders.length, 2);

  const first = state.stamps[0];
  const last = state.stamps[state.stamps.length - 1];

  // One frame says nothing about a rate. The previous project's answer here was
  // the whole lifetime of the page divided into one frame.
  if (state.stamps.length < 2 || first === undefined || last === undefined) {
    return { fps: 0, frameMs: 0, renderMs, worstFrameMs: 0 };
  }

  const span = last - first;
  if (span <= 0) return { fps: 0, frameMs: 0, renderMs, worstFrameMs: 0 };

  // The longest gap, not the average one: a stutter is a single interval, and
  // averaging is the operation that hides it.
  let worst = 0;
  for (let at = 1; at < state.stamps.length; at += 1) {
    worst = Math.max(worst, (state.stamps[at] ?? 0) - (state.stamps[at - 1] ?? 0));
  }

  const intervals = state.stamps.length - 1;

  return {
    fps: round((intervals * 1000) / span, 1),
    frameMs: round(span / intervals, 2),
    renderMs,
    worstFrameMs: round(worst, 2),
  };
}

function sample(session: Session, now: number): void {
  const recorder = state.recorder;
  if (recorder === null || now - state.lastSample < SAMPLE_MS) return;

  state.lastSample = now;

  const { fps, frameMs, renderMs, worstFrameMs } = fromWindow(now);
  const counter = state.hook?.counter ?? null;
  const textures = textureValues(session, now);
  const used = heap();

  /*
   * Per frame, exactly as the live reading is.
   *
   * This used to record `counter.total()` — the lifetime tally — so the
   * recorded series was a ramp that only ever climbed, and the high it
   * reported was every draw since the panel opened rather than the worst
   * frame in it. A hundred and twenty thousand, beside a chart whose peak was
   * thirty.
   */
  const total = counter === null ? 0 : counter.total();
  const drawCalls =
    state.sampleFrames === 0
      ? 0
      : Math.round((total - state.sampleDrawAt) / state.sampleFrames);

  state.sampleDrawAt = total;
  state.sampleFrames = 0;

  recorder.push(Math.round(now - state.recordStart), [
    fps,
    frameMs,
    renderMs,
    worstFrameMs,
    drawCalls,
    textures.count,
    textures.onGpu,
    round(textures.gpuBytes / MB, 2),
    ...(used === null ? [] : [round(used.used, 1)]),
  ]);
}

function disarm(): void {
  if (state.hook === null) return;

  /*
   * The counter is released through the handle armed with it, not by asking the
   * adapter again.
   *
   * The one caller that matters here is `readFrame` on a page with no adapter —
   * it disarms precisely because `session.adapter()` came back null, so
   * releasing through the adapter was a no-op in the only branch that needed it
   * most, and the wraps stayed on the page's context with nobody reading the
   * count. A renderer swapped between arm and disarm had the mirror problem:
   * the adapter resolves its renderer when asked, so it would have put back the
   * new one's draw functions and left the old one's wrapped.
   */
  state.hook.release();
  state.hook.counter?.release();
  state.hook = null;
  state.stamps = [];
  state.renders = [];
  state.frames = 0;
  state.draws = 0;
  state.drawAt = 0;
  state.sampleDrawAt = 0;
  state.sampleFrames = 0;
  state.textures = null;
}

function arm(session: Session): void {
  if (state.hook !== null) return;

  // The renderer may have been swapped since the last poll, and nothing may be
  // counted on the old one — the same first step `overlay.config` takes.
  session.frame.refresh();

  const counter = session.adapter()?.drawCounter() ?? null;
  state.drawAt = counter === null ? 0 : counter.total();
  state.sampleDrawAt = state.drawAt;
  state.sampleFrames = 0;

  const release = session.frame.subscribe((renderMs) => {
    const now = clock();

    // Checked on the frames it would otherwise be counting, so no timer is
    // needed to notice that nobody is reading any more.
    if (!wanted(now)) {
      disarm();
      return;
    }

    if (state.recorder !== null && state.recorder.expired(now)) {
      state.recorder = null;
      if (!wanted(now)) {
        disarm();
        return;
      }
    }

    state.stamps.push(now);
    state.renders.push(renderMs);
    state.frames += 1;
    state.sampleFrames += 1;
    if (counter !== null) state.draws = counter.total() - state.drawAt;

    sample(session, now);
  });

  state.hook = { release, counter };
}

/**
 * The live figures, arming the hook on the way.
 *
 * @returns null when nothing is attached, so the panel can say the tab has
 * nothing to report instead of drawing a screen of zeros.
 */
export function readFrame(session: Session): StatsFrame | null {
  if (session.adapter() === null) {
    disarm();
    return null;
  }

  const now = clock();
  state.lastLiveRead = now;
  arm(session);

  const { fps, frameMs, renderMs, worstFrameMs } = fromWindow(now);
  const counter = state.hook?.counter ?? null;
  const frames = state.frames;
  const draws = state.draws;

  state.frames = 0;
  state.draws = 0;
  if (counter !== null) state.drawAt = counter.total();

  const used = heap();

  return {
    fps,
    frameMs,
    renderMs,
    worstFrameMs,
    // Per frame, not per poll: a number that grew with how often the panel
    // asked would say more about the inspector than about the game. Null rather
    // than nought where there is no counter at all — see `StatsFrame`.
    drawCalls: counter === null ? null : frames === 0 ? 0 : Math.round(draws / frames),
    frames,
    heapMB: used === null ? null : round(used.used, 1),
  };
}

/**
 * How far back to keep, in milliseconds. Zero stops the recording.
 *
 * A running recording is **retuned** rather than restarted: the window is the
 * only thing that changed, and throwing the samples away because somebody asked
 * to keep more of them would be the opposite of what they asked.
 */
export function setRecording(session: Session, keepMs: number): void {
  if (keepMs <= 0) {
    state.recorder = null;
    if (!wanted(clock())) disarm();
    return;
  }

  if (state.recorder !== null) {
    state.recorder.keep(keepMs);
    return;
  }

  if (session.adapter() === null) return;

  const now = clock();

  state.recordStart = now;
  state.lastSample = 0;
  state.recorder = createRecorder(
    [
      'fps',
      'frameMs',
      'renderMs',
      'worstFrameMs',
      'drawCalls',
      'textures',
      'texturesOnGpu',
      'gpuMB',
      // Declared only where the browser has it. A field that could never carry
      // a value would need a sentinel for "unavailable", and the panel would
      // have to know about it; leaving it out says the same with nothing.
      ...(heap() === null ? [] : ['heapMB']),
    ],
    Date.now(),
    now,
    keepMs,
  );

  arm(session);
}

/** @returns null when nothing is being recorded, which is how the panel is told. */
export function readRecord(since: number): StatsRecord | null {
  const recorder = state.recorder;
  if (recorder === null) return null;

  return recorder.read(since, clock());
}

/** Diagnostics and tests: whether the render hook is currently on. */
export function statsArmed(): boolean {
  return state.hook !== null;
}

/** Tests only: forgets everything, as a fresh page would. */
export function resetStats(): void {
  state.hook = null;
  state.stamps = [];
  state.renders = [];
  state.frames = 0;
  state.drawAt = 0;
  state.draws = 0;
  state.lastLiveRead = Number.NEGATIVE_INFINITY;
  state.recorder = null;
  state.recordStart = 0;
  state.lastSample = 0;
  state.sampleDrawAt = 0;
  state.sampleFrames = 0;
  state.textures = null;
}
