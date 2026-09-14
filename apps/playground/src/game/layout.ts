import type { Application, Container } from 'pixi.js';

import { DESIGN_HEIGHT, DESIGN_WIDTH } from './config.js';

/**
 * Keeps the fixed-size stage centred in whatever space the pane gives it.
 *
 * The design size never changes — see `config.ts` — so the whole of the layout
 * is one uniform scale and a centring offset. Uniform because a stretched grid
 * of squares stops being a grid of squares; centred because the leftover space
 * should fall evenly rather than all on one side.
 *
 * **The `ResizeObserver` is the load-bearing part.** PixiJS's `resizeTo` listens
 * for `window.resize` and nothing else, so a canvas told to follow an element
 * follows it only when the *window* changes. On this stand the pane is resized
 * far more often than the window is — every drag of the splitter between the
 * game and the panel — and without this the canvas kept its old size while the
 * pane shrank underneath it, leaving the arena cropped and off-centre.
 *
 * @returns a teardown for the observer.
 */
export function fitStage(app: Application, root: Container, host: HTMLElement): () => void {
  const apply = (): void => {
    const scale = Math.min(app.screen.width / DESIGN_WIDTH, app.screen.height / DESIGN_HEIGHT);

    root.scale.set(scale);
    root.position.set(
      Math.round((app.screen.width - DESIGN_WIDTH * scale) / 2),
      Math.round((app.screen.height - DESIGN_HEIGHT * scale) / 2),
    );
  };

  apply();

  // `resize()` re-reads `resizeTo`; the renderer then emits `resize`, which lays
  // the stage out again. Calling `apply` here as well covers the case where the
  // element moved without changing size, which emits nothing.
  const observer = new ResizeObserver(() => {
    app.resize();
    apply();
  });

  observer.observe(host);
  app.renderer.on('resize', apply);

  return () => {
    observer.disconnect();
    app.renderer.off('resize', apply);
  };
}
