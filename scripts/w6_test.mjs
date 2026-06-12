import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=51f518', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
const fpsFresh = await page.evaluate(() => new Promise(res => {
  let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(f / 2); };
  requestAnimationFrame(loop);
}));
console.log('FPS fresh world (with caching):', fpsFresh);
await page.evaluate(() => document.getElementById('skip').click());
await page.waitForTimeout(10000);
const fps = await page.evaluate(() => new Promise(res => {
  let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(f / 2); };
  requestAnimationFrame(loop);
}));
console.log('FPS mature world:', fps);
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.30));
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/landshots/w6_day.png' });
const probe = await page.evaluate(() => ({
  pending: window.__sim.pendingSettlements.length,
  wonders: [...window.__sim.civs.values()].filter(c => c.wonder).length,
}));
console.log(JSON.stringify(probe));
await browser.close();
