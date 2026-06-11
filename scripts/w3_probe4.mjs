import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5175/?seed=w3labels', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => document.getElementById('skip').click());
await page.waitForTimeout(20000);
const res = await page.evaluate(() => {
  window.__atmosphere.setCurvature(0); window.__atmosphere.setPerspective(0);
  const s = 0.68, x0 = -1600, y0 = -110;
  const planeX = window.innerWidth / 2 + x0 * s;
  const planeY = window.innerHeight * 0.16 + y0 * s;
  const toScreen = (c) => ({ sx: planeX + (c.x - x0) * s, sy: planeY + (c.y - y0) * s });
  const markers = window.__layers.cityMarkersContainer.children
    .filter(c => c.constructor.name === 'Graphics')
    .map(toScreen);
  const inView = markers.filter(p => p.sx > 50 && p.sx < 1550 && p.sy > 50 && p.sy < 850);
  const labels = window.__layers.labelLayer.children.map(l => ({ ...toScreen(l), text: l.text, alpha: l.alpha }));
  return { total: markers.length, inView: inView.length, sample: inView[0] ?? null, labels: labels.filter(l => l.sy > 50 && l.sy < 850).slice(0, 3) };
});
console.log(JSON.stringify(res, null, 1));
if (res.sample) {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/landshots/w3_marker_zoom2.png',
    clip: { x: res.sample.sx - 150, y: res.sample.sy - 90, width: 300, height: 180 } });
}
await browser.close();
