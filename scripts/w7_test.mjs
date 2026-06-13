import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=51f518', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000);
// 1. Volcano: force severe volcano brewing and fire
await page.evaluate(() => {
  const sim = window.__sim;
  sim.catastrophePressure = 1.01;
  sim.brewing = { type: 'volcano', severity: 0.8, omenStage: 3 };
});
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/landshots/w7_volcano.png' });
// 2. Rift: severe earthquake
await page.evaluate(() => {
  const sim = window.__sim;
  sim.catastrophePressure = 1.01;
  sim.brewing = { type: 'earthquake', severity: 0.85, omenStage: 3 };
});
await page.waitForTimeout(12000); // rift carves progressively
await page.screenshot({ path: '/tmp/landshots/w7_rift.png' });
const tf = await page.evaluate(() => window.__sim.terraform ? window.__sim.terraform.queue.length : 'done');
console.log('rift queue remaining:', tf);
// 3. Meteors at night
await page.evaluate(() => {
  window.__atmosphere.setTimeOfDay(0.78);
  window.__atmosphere.triggerCelestial('meteors');
});
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/landshots/w7_meteors.png' });
// 4. Constellation
const named = await page.evaluate(() => window.__atmosphere.nameConstellation());
console.log('constellation drawn:', named);
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/landshots/w7_constellation.png' });
const fps = await page.evaluate(() => new Promise(res => {
  let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(f / 2); };
  requestAnimationFrame(loop);
}));
console.log('FPS:', fps);
await browser.close();
