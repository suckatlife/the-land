import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=w3smoke', { waitUntil: 'networkidle' });
await page.waitForTimeout(12000);
await page.evaluate(() => {
  const sim = window.__sim;
  sim.catastrophePressure = 1.01;
  sim.brewing = { type: 'asteroid', severity: 0.7, omenStage: 3 };
});
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/landshots/w3v2_smoke.png' });
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0; const t0 = performance.now();
  const loop = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(frames / 2); };
  requestAnimationFrame(loop);
}));
console.log('FPS:', fps);
await browser.close();
