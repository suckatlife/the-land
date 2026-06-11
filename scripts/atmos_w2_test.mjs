import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=atmos03', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
// Seasons at noon
for (const [name, t] of [['spring', 0.05], ['summer', 0.27], ['autumn', 0.52], ['winter', 0.78]]) {
  await page.evaluate((tt) => {
    window.__atmosphere.setTimeOfDay(0.25);
    window.__atmosphere.setSeasonOfYear(tt);
  }, t);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/landshots/w2_season_${name}.png` });
}
// Cloud drift: two shots 20s apart at summer noon to see movement
await page.evaluate(() => window.__atmosphere.setSeasonOfYear(0.27));
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/landshots/w2_drift_a.png' });
await page.waitForTimeout(20000);
await page.screenshot({ path: '/tmp/landshots/w2_drift_b.png' });
// Dawn mist
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.0));
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/landshots/w2_dawn_mist.png' });
console.log('w2 visual test done');
await browser.close();
