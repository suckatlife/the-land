import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=w3labels', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => document.getElementById('skip').click());
await page.waitForTimeout(25000); // let label alpha converge even at low FPS
const pos = await page.evaluate(() => {
  window.__atmosphere.setCurvature(0); window.__atmosphere.setPerspective(0);
  const m = window.__layers.cityMarkersContainer.children[0];
  // replicate centerWorld mapping: screen = plane.pos + (world - capture0) * scale
  const s = 0.68, x0 = -1600, y0 = -110;
  const planeX = window.innerWidth / 2 + x0 * s;
  const planeY = window.innerHeight * 0.16 + y0 * s;
  return { sx: planeX + (m.x - x0) * s, sy: planeY + (m.y - y0) * s, mx: m.x, my: m.y };
});
console.log(JSON.stringify(pos));
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/landshots/w3_marker_zoom.png',
  clip: { x: Math.max(0, pos.sx - 150), y: Math.max(0, pos.sy - 90), width: 300, height: 180 } });
await browser.close();
