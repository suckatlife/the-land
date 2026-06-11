import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5175/?seed=atmos01', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
const fps = () => page.evaluate(() => new Promise(res => {
  let frames = 0; const t0 = performance.now();
  const loop = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(frames / 2); };
  requestAnimationFrame(loop);
}));
console.log('baseline (no scars):', await fps());
await page.evaluate(() => {
  const sim = window.__sim;
  sim.catastrophePressure = 1.01;
  sim.brewing = { type: 'plague', severity: 0.55, omenStage: 3 };
});
await page.waitForTimeout(2000);
console.log('one scar:', await fps());
await browser.close();
