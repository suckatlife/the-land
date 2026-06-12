import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=7b70e0', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
await page.evaluate(() => document.getElementById('skip').click()); // mature world
await page.waitForTimeout(8000);
const fps0 = await page.evaluate(() => new Promise(res => {
  let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(f / 2); };
  requestAnimationFrame(loop);
}));
console.log('FPS (mature world, all systems):', fps0);
// daylight: rivers, shallows, smoke, shimmer
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.30));
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/landshots/w5_day.png' });
// night: city lights
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.78));
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/landshots/w5_night.png' });
// celestial triggers
await page.evaluate(() => window.__atmosphere.triggerCelestial('aurora'));
await page.waitForTimeout(9000);
await page.screenshot({ path: '/tmp/landshots/w5_aurora.png' });
await page.evaluate(() => window.__atmosphere.triggerCelestial('comet'));
await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/landshots/w5_comet.png' });
await browser.close();
