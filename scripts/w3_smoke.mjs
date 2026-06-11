import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=w3smoke', { waitUntil: 'networkidle' });
await page.waitForTimeout(15000); // let civs settle and label appear
// all four types in sequence
for (const type of ['asteroid', 'earthquake', 'flood', 'plague']) {
  await page.evaluate((t) => {
    const sim = window.__sim;
    sim.catastrophePressure = 1.01;
    sim.brewing = { type: t, severity: 0.6, omenStage: 3 };
  }, type);
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: '/tmp/landshots/w3_smoke_scars.png' });
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0; const t0 = performance.now();
  const loop = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(frames / 2); };
  requestAnimationFrame(loop);
}));
console.log('FPS (software renderer):', fps);
// labels-on-cities check: zoom crop around a capital
await page.waitForTimeout(8000);
await page.screenshot({ path: '/tmp/landshots/w3_smoke_labels.png', clip: { x: 400, y: 250, width: 800, height: 450 } });
await browser.close();
