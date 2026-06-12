import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=51f518', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
// force an expedition for the screenshot
await page.evaluate(() => {
  const sim = window.__sim;
  const civ = [...sim.civs.values()].find(c => c.phase !== 'dead');
  if (civ) sim.expeditions.push({ civId: civ.id, row: 48, col: 48, dirRow: 0.3, dirCol: 0.95, age: 10, trail: [{row:47,col:44},{row:47,col:45},{row:48,col:46},{row:48,col:47}], desperate: false });
});
await page.waitForTimeout(800);
const sx = await page.evaluate(() => {
  const e = window.__sim.expeditions[window.__sim.expeditions.length - 1];
  const s = 0.68, x0 = -1600, y0 = -110;
  return { x: window.innerWidth / 2 + x0 * s + ((e.col - e.row) * 16 - x0) * s, y: window.innerHeight * 0.24 + y0 * s + ((e.col + e.row) * 8 - y0) * s };
});
await page.screenshot({ path: '/tmp/landshots/exp_style.png', clip: { x: sx.x - 120, y: sx.y - 80, width: 240, height: 160 } });
await browser.close();
