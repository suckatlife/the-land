// Calibration at two viewports: Lawrence's (1330x916) and wide (1600x900).
import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const [vw, vh, tag] of [[1330, 916, 'narrow'], [1600, 900, 'wide']]) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.30));
  for (const [name, c, p] of [['0_flat', 0, 0], ['1_default', 0.62, 0.45], ['2_overshoot', 1, 1]]) {
    await page.evaluate(([cc, pp]) => { window.__atmosphere.setCurvature(cc); window.__atmosphere.setPerspective(pp); }, [c, p]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `curvature_calibration/${tag}_${name}.png` });
  }
  await page.close();
}
console.log('calibration saved');
await browser.close();
