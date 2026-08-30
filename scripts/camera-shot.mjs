/** Screenshot the drift at several points in its cycle.
 *
 *  The failure this is looking for is specific: the ocean apron used to be
 *  exactly the capture rect, and the render texture clears outside it, so a pan
 *  could uncover a transparent strip INSIDE the planet with sky showing
 *  through. Extremes of the path are where that would appear, so those are the
 *  frames taken.
 */
import { chromium } from 'playwright';
const port = process.argv[2] || '4600';
const out = process.argv[3] || 'runs/camera';
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__layers, { timeout: 20000 });
await page.waitForTimeout(3500);

// Drive the camera directly rather than waiting ~200s of wall clock for the
// sine to reach its extremes.
for (const [name, t] of [['t000', 0], ['t049-maxX', 49.25], ['t098', 98.5], ['t030', 30.5]]) {
  const cam = await page.evaluate((tv) => {
    const w = window;
    const A = { ampX: 110, ampY: 44, periodX: 197, periodY: 122 };
    const cx = Math.sin((tv / A.periodX) * Math.PI * 2) * A.ampX;
    const cy = Math.sin((tv / A.periodY) * Math.PI * 2 + 1.3) * A.ampY;
    const world = w.__layers.world;
    // Same transform updateCamera() applies, so the screenshot shows the real
    // thing rather than an approximation of it.
    const CAP = { x0: -1600, y0: -110 };
    const scale = world.scale.x;
    world.x = (-CAP.x0 - cx) * scale;
    world.y = (-CAP.y0 - cy) * scale;
    return { cx: Math.round(cx), cy: Math.round(cy) };
  }, t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${name}: camX=${cam.cx} camY=${cam.cy}`);
}
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
await browser.close();
