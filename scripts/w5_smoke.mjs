import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=7b70e0', { waitUntil: 'networkidle' });
await page.waitForTimeout(10000);
await page.evaluate(() => {
  window.__atmosphere.setTimeOfDay(0.45);
  const sim = window.__sim;
  sim.catastrophePressure = 0.94; sim.pressureNoise = 0.15;
  sim.brewing = { type: 'plague', severity: 0.7, omenStage: 3 };
});
await page.waitForTimeout(10000);
await page.screenshot({ path: '/tmp/landshots/w5_brewing.png' });
await page.evaluate(() => { window.__sim.catastrophePressure = 1.01; });
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/landshots/w5_aftermath.png' });
const fps = await page.evaluate(() => new Promise(res => {
  let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(f / 2); };
  requestAnimationFrame(loop);
}));
console.log('FPS post-impact:', fps);
await browser.close();
