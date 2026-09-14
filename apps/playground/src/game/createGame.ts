import { Application, Container } from 'pixi.js';

import { loadGameAssets, loadSpineAssets } from './assets.js';
import { ARENA_X, ARENA_Y, DYING_MS, STEP_MS } from './config.js';
import { fitStage } from './layout.js';
import type { Dir } from './logic/grid.js';
import { queueDirection } from './logic/input.js';
import { createLoop } from './logic/loop.js';
import type { Mode } from './logic/state.js';
import { createState, resetState } from './logic/state.js';
import { step } from './logic/step.js';
import { createArena } from './scene/arena.js';
import { createBackground } from './scene/background.js';
import { createEffects } from './scene/fx.js';
import { createFood, placeFoodSprite } from './scene/food.js';
import { createFrame } from './scene/frame.js';
import { createHud } from './scene/hud.js';
import { createSnake } from './scene/snake.js';
import { createHead } from './spine/head.js';
import { createMascot } from './spine/mascot.js';

/** What the stand may read off the game, once per frame at most. */
export interface GameStatus {
  score: number;
  length: number;
  mode: Mode;
  paused: boolean;
  phase: 'playing' | 'dying' | 'over';
  fps: number;
  spine: boolean;
}

/**
 * What the stand may do to the game.
 *
 * Deliberately narrow, and the only thing that crosses the line: the stand is
 * React and the DOM, the game is PixiJS and a fixed step, and neither imports
 * the other.
 */
export interface GameHandle {
  setMode(mode: Mode): void;
  setPaused(paused: boolean): void;
  restart(): void;
  onStatus(listener: (status: GameStatus) => void): () => void;
  destroy(): void;
}

const ARROWS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

export async function createGame(host: HTMLElement): Promise<GameHandle> {
  const app = new Application();

  /*
   * `resizeTo` is the host, not the window.
   *
   * The window belongs to the whole page here, panel included, so a canvas
   * measured against it would be half again too wide and the arena would sit
   * off-centre behind the split.
   */
  await app.init({ background: '#0b0e13', resizeTo: host, antialias: true, autoDensity: true });
  host.append(app.canvas);

  // The inspector finds the application through the global, as on a real page.
  (globalThis as { __PIXI_APP__?: Application }).__PIXI_APP__ = app;

  // The bitmap font measures its family when it is installed — see `hud.ts`.
  await document.fonts.ready;

  const spineReady = await loadSpineAssets();
  const assets = await loadGameAssets();

  const world = new Container({ label: 'world' });
  app.stage.addChild(world);

  const arena = createArena();
  const head = createHead(assets.sheet, spineReady);
  const snake = createSnake(assets.sheet, head);
  const food = createFood(assets.sheet);
  const effects = createEffects(assets.sheet);
  const hud = createHud(assets.frame, spineReady ? createMascot() : null);

  arena.play.addChild(food, snake.root, effects.root);

  // The board sits below the HUD band and inside the margin the frame needs.
  arena.root.position.set(ARENA_X, ARENA_Y);

  // The frame is laid over the arena rather than inside it, so it can glow past
  // the edge the arena mask clips to — see `scene/frame.ts`.
  const frame = createFrame();
  frame.position.set(ARENA_X, ARENA_Y);

  world.addChild(createBackground(assets.tile), arena.root, frame, hud.root);

  const releaseLayout = fitStage(app, world, host);

  const random = Math.random;
  /*
   * Step, not run, is the mode the stand opens in.
   *
   * The point of this page is to be inspected and photographed, and a snake
   * that is already moving gives whoever opens it a few seconds before it dies
   * into a restart. Standing still, the scene keeps whatever shape it is put
   * into for as long as it takes to read the tree, open a section, or frame a
   * shot; an arrow advances it one cell when that is wanted.
   */
  const state = createState('step', random);
  const loop = createLoop();

  let paused = false;
  let dyingFor = 0;

  /*
   * Milliseconds since the last discrete move.
   *
   * In `run` the accumulator already knows this, but in `step` nothing advances
   * on its own and there was no clock at all — so the stand drew every frame at
   * an interpolation of zero, which is the *previous* position. The snake sat a
   * whole cell behind the state, and every arrow press looked like a move in the
   * old direction. This is that missing clock: an arrow starts it, and the step
   * plays out over the same `STEP_MS` a running step takes.
   */
  let sinceStep = STEP_MS;
  let listener: ((status: GameStatus) => void) | null = null;

  placeFoodSprite(food, state.food);

  let lastReport: GameStatus | null = null;

  /**
   * Tells the toolbar what changed — and only when something did.
   *
   * This is called from the ticker, so calling it unconditionally would put a
   * React state update on every frame and re-render the whole left pane sixty
   * times a second. That alone cost more than half the frame rate when it was
   * written that way. The frame counter is the one field that changes
   * constantly, so it is rounded to five and compared like the rest.
   */
  const report = (): void => {
    if (listener === null) return;

    const status: GameStatus = {
      score: state.score,
      length: state.body.length,
      mode: state.mode,
      paused,
      phase: state.phase,
      fps: Math.round(app.ticker.FPS / 5) * 5,
      spine: spineReady,
    };

    const previous = lastReport;
    const same =
      previous !== null &&
      (Object.keys(status) as (keyof GameStatus)[]).every((key) => previous[key] === status[key]);

    if (same) return;

    lastReport = status;
    listener(status);
  };

  /** One discrete move, and everything that reacts to it. */
  const advanceOnce = (): void => {
    const events = step(state, random);

    sinceStep = 0;

    if (events.ate) {
      placeFoodSprite(food, state.food);
      effects.burst(state.body[0]!);
      head.playBite();
    }

    if (events.died) {
      dyingFor = 0;
      head.playDie();
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const dir = ARROWS[event.code];
    if (dir === undefined) return;

    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]')) {
      return;
    }

    // The arrows are the game's; the panel's own hotkeys are letters and never
    // collide with them. Taking the key stops the page scrolling under the canvas.
    event.preventDefault();

    if (state.phase === 'over') {
      resetState(state, random);
      placeFoodSprite(food, state.food);
      loop.reset();
      head.playIdle();
      queueDirection(state, dir);
      report();
      return;
    }

    const taken = queueDirection(state, dir);

    /*
     * In `step` mode an arrow *is* the clock: nothing advances on its own, so
     * the press both steers and moves. A refused turn still steps, or the snake
     * would freeze whenever somebody leaned on the direction it is already
     * travelling.
     */
    if (state.mode === 'step' && !paused) {
      if (!taken) state.queue.length = 0;
      advanceOnce();
      loop.reset();
      report();
    }
  };

  window.addEventListener('keydown', onKeyDown);

  app.ticker.add((ticker) => {
    const elapsed = ticker.deltaMS;
    const seconds = elapsed / 1000;

    if (!paused) {
      if (state.phase === 'playing' && state.mode === 'run') {
        loop.advance(elapsed, advanceOnce);
      }

      if (state.phase === 'dying') {
        dyingFor += elapsed;
        if (dyingFor >= DYING_MS) state.phase = 'over';
      }

      /*
       * The skeleton is advanced here rather than by its own ticker, so a pause
       * stops the pose while the renderer keeps drawing. That is what lets the
       * panel scrub a track and be the only thing moving the head.
       */
      head.update(seconds);
      effects.update(seconds);
    }

    if (!paused) sinceStep = Math.min(STEP_MS, sinceStep + elapsed);

    snake.render(state, sinceStep / STEP_MS, seconds);
    hud.setScore(state.score);
    report();
  });

  return {
    setMode(mode) {
      state.mode = mode;
      state.queue.length = 0;
      loop.reset();
      report();
    },

    setPaused(next) {
      paused = next;
      loop.reset();
      report();
    },

    restart() {
      resetState(state, random);
      placeFoodSprite(food, state.food);
      loop.reset();
      head.playIdle();
      report();
    },

    onStatus(next) {
      listener = next;
      // A new subscriber has seen nothing yet, whatever the last report said.
      lastReport = null;
      report();

      return () => {
        if (listener === next) listener = null;
      };
    },

    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      releaseLayout();

      const global = globalThis as { __PIXI_APP__?: Application };
      if (global.__PIXI_APP__ === app) delete global.__PIXI_APP__;

      app.destroy(true, { children: true });
    },
  };
}
