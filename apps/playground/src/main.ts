import { Application, Container, Graphics, Text } from 'pixi.js';

/**
 * A bare PixiJS v8 page: an application on the global, and a scene with enough
 * shape to have something to walk. It exists so `npm run playground` starts and
 * the workspace builds; the stand the panel is developed against is written on
 * top of this.
 */
const app = new Application();

await app.init({ background: '#1a1a1e', resizeTo: window, antialias: true });
document.querySelector('#stage')!.append(app.canvas);

// The inspector finds the application through the global, the same way it does
// on a real page.
(globalThis as { __PIXI_APP__?: Application }).__PIXI_APP__ = app;

const scene = new Container({ label: 'scene' });
app.stage.addChild(scene);

const box = new Graphics().roundRect(-60, -60, 120, 120, 16).fill('#4c6ef5');
box.label = 'box';
box.position.set(app.screen.width / 2, app.screen.height / 2);
scene.addChild(box);

const caption = new Text({
  text: 'playground',
  style: { fill: '#e8e8ec', fontFamily: 'sans-serif', fontSize: 18 },
});
caption.label = 'caption';
caption.anchor.set(0.5, 0);
caption.position.set(box.x, box.y + 80);
scene.addChild(caption);

app.ticker.add((ticker) => {
  box.rotation += 0.01 * ticker.deltaTime;
});
