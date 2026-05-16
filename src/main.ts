import { Application } from 'pixi.js';

const app = new Application();

await app.init({
  width: window.innerWidth,
  height: window.innerHeight,
  background: '#1a1a1a',
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});

document.body.appendChild(app.canvas);