import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.76));
await page.waitForTimeout(1000);
// isolate: black background, no glaze
await page.evaluate(() => {
  window.__atmosphere.skyLayer.visible = false;
  window.__atmosphere.glazeLayer.visible = false;
});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/landshots/w4_stars_isolated.png' });
// also: glitter unmasked at noon, max strength
await page.evaluate(() => {
  window.__atmosphere.skyLayer.visible = true;
  window.__atmosphere.glazeLayer.visible = true;
  window.__atmosphere.setTimeOfDay(0.26);
  window.__atmosphere.setGlitterStrength(3);
  window.__atmosphere.setWaterMask(null);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/landshots/w4_glitter_unmasked.png' });
await browser.close();
