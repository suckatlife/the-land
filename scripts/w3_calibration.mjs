// Calibration shots: curvature 0 (old build) / defaults / 1+1 (overshoot).
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=w3base', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000);
await page.evaluate(() => { window.__atmosphere.setTimeOfDay(0.30); window.__atmosphere.setSeasonOfYear(0.30); });
await page.waitForTimeout(1000);
const shots = [
  ['0_flat_current_build', 0, 0],
  ['1_default', null, null], // ATMOS defaults
  ['2_overshoot', 1, 1],
];
for (const [name, c, p] of shots) {
  await page.evaluate(([cc, pp]) => {
    if (cc === null) { window.__atmosphere.setCurvature(0.55); window.__atmosphere.setPerspective(0.45); }
    else { window.__atmosphere.setCurvature(cc); window.__atmosphere.setPerspective(pp); }
  }, [c, p]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `curvature_calibration/${name}.png` });
  console.log('saved', name);
}
await browser.close();
