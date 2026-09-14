import type { Spritesheet } from 'pixi.js';
import { Container, Sprite } from 'pixi.js';

import { CELL } from '../config.js';
import type { Cell } from '../logic/grid.js';
import { angleOf, centreOf } from '../logic/grid.js';
import type { GameState } from '../logic/state.js';
import type { DragonHead } from '../spine/head.js';

/**
 * The snake: a Spine head and a row of sprites behind it.
 *
 * Segments are pooled and labelled `segment-01`, `segment-02`, … — a list that
 * grows as the game does, which is the clearest thing the tree has to show. The
 * padding is there so `segment-02` sorts beside `segment-01` rather than beside
 * `segment-20`.
 */
export interface Snake {
  root: Container;
  head: DragonHead;
  /**
   * Lays the body out for the current state.
   *
   * @param alpha how far the current step has come, 0…1.
   * @param deltaSeconds the frame, for the turn — which is eased in real time
   *   rather than against the step, so the head keeps turning in `step` mode
   *   where a step is over the instant it is asked for.
   */
  render(state: GameState, alpha: number, deltaSeconds: number): void;
}

const label = (index: number): string => `segment-${String(index + 1).padStart(2, '0')}`;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Turns towards a heading the short way round.
 *
 * Without this the head spins three quarters of a circle whenever it turns from
 * facing up (-π/2) to facing left (π) — the numbers are adjacent as directions
 * and as far apart as they get as angles.
 */
function turnTowards(current: number, target: number, t: number): number {
  let delta = (target - current) % (Math.PI * 2);

  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;

  return current + delta * t;
}

export function createSnake(sheet: Spritesheet, head: DragonHead): Snake {
  const root = new Container({ label: 'snake' });
  const segments: Sprite[] = [];

  const body = sheet.textures['segment'];
  const tail = sheet.textures['segment-tail'];
  if (body === undefined || tail === undefined) throw new Error('the sheet has no snake frames');

  const segmentAt = (index: number): Sprite => {
    let sprite = segments[index];

    if (sprite === undefined) {
      sprite = new Sprite({ texture: body, label: label(index) });
      sprite.anchor.set(0.5);
      segments[index] = sprite;
      // Behind the head, which is added last and stays last.
      root.addChildAt(sprite, index);
    }

    return sprite;
  };

  root.addChild(head.node);

  return {
    root,
    head,

    render(state, alpha, deltaSeconds) {
      const { body: cells, previous, phase } = state;
      // Nothing slides while the death animation plays: the snake has stopped.
      const t = phase === 'playing' ? alpha : 1;

      for (let index = 0; index < cells.length; index += 1) {
        const cell = cells[index]!;
        /*
         * Every part moves from where it was to where it is — the head included,
         * which is the whole point of keeping `previous`. Interpolating towards
         * the cell *ahead* instead would draw the body a step in front of the
         * state it belongs to, and would leave the head with nothing to aim at.
         */
        const was: Cell = previous[index] ?? cell;
        const from = centreOf(was, CELL);
        const to = centreOf(cell, CELL);

        const target = index === 0 ? head.node : segmentAt(index - 1);

        target.position.set(lerp(from.x, to.x, t), lerp(from.y, to.y, t));

        if (index > 0) {
          const sprite = target as Sprite;

          sprite.texture = index === cells.length - 1 ? tail : body;
          sprite.visible = true;
        }
      }

      // Segments the snake has outgrown stay in the pool but off the board.
      for (let index = cells.length - 1; index < segments.length; index += 1) {
        const spare = segments[index];
        if (spare !== undefined) spare.visible = false;
      }

      /*
       * The turn is eased in real time, not against the step.
       *
       * Tying it to the step meant the head never turned at all in `step` mode:
       * there the interpolation is zero at the moment the arrow is pressed, and
       * zero times any angle is no rotation — so the head sat pointing right
       * forever while the body walked away underneath it.
       *
       * The exponential form is what keeps it independent of the frame rate: at
       * 30 fps and at 144 the head takes the same time to come round.
       */
      head.setHeading(
        turnTowards(head.heading(), angleOf(state.dir), 1 - Math.exp(-deltaSeconds * 16)),
      );
    },
  };
}
