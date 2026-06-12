import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await page.evaluate(() => { window.__atmosphere.setTimeOfDay(0.78); window.__atmosphere.setStarBrightness(1.2); });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/landshots/w4_night_full.png' });
const probe = await page.evaluate(() => {
  const a = window.__atmosphere;
  const bright = a.starLayer.children[1];
  return { brightAlpha: bright.alpha, layerPos: { x: a.starLayer.x, y: a.starLayer.y }, rot: a.starLayer.rotation,
    visible: a.starLayer.visible, layerAlpha: a.starLayer.alpha };
});
console.log(JSON.stringify(probe));
await browser.close();
