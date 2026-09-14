import type { Spritesheet } from 'pixi.js';
import { Particle, ParticleContainer } from 'pixi.js';

import { CELL } from '../config.js';
import type { Cell } from '../logic/grid.js';
import { centreOf } from '../logic/grid.js';

/**
 * The sparks thrown off when a berry is eaten.
 *
 * A `ParticleContainer` rather than a container of sprites, because that is
 * what a game would use — and it shows in the tree as a single node with no
 * children, since v8 keeps particles in `particleChildren` where the inspector
 * deliberately does not walk. That is worth seeing rather than hiding.
 */
export interface Effects {
  root: ParticleContainer;
  burst(cell: Cell): void;
  update(deltaSeconds: number): void;
}

const BURST_COUNT = 14;
const LIFETIME = 0.55;

interface Spark {
  particle: Particle;
  vx: number;
  vy: number;
  life: number;
}

export function createEffects(sheet: Spritesheet): Effects {
  const texture = sheet.textures['spark'];
  if (texture === undefined) throw new Error('the sheet has no spark frame');

  const root = new ParticleContainer({ label: 'fx', dynamicProperties: { position: true, scale: true, alpha: true } });
  const sparks: Spark[] = [];

  return {
    root,

    burst(cell) {
      const centre = centreOf(cell, CELL);

      for (let i = 0; i < BURST_COUNT; i += 1) {
        const angle = (i / BURST_COUNT) * Math.PI * 2;
        const speed = 40 + Math.random() * 70;

        const particle = new Particle({
          texture,
          x: centre.x,
          y: centre.y,
          anchorX: 0.5,
          anchorY: 0.5,
        });

        root.addParticle(particle);
        sparks.push({
          particle,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: LIFETIME,
        });
      }
    },

    update(deltaSeconds) {
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i]!;

        spark.life -= deltaSeconds;

        if (spark.life <= 0) {
          root.removeParticle(spark.particle);
          sparks.splice(i, 1);
          continue;
        }

        const fade = spark.life / LIFETIME;

        spark.particle.x += spark.vx * deltaSeconds;
        spark.particle.y += spark.vy * deltaSeconds;
        spark.particle.alpha = fade;
        spark.particle.scaleX = fade;
        spark.particle.scaleY = fade;
      }

      if (sparks.length > 0) root.update();
    },
  };
}
