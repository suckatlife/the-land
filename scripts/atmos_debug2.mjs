import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=fable01', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.evaluate(() => {
  document.getElementById('pause').click(); // freeze our ticker callback; Pixi keeps rendering
  const a = window.__atmos;
  a.vigS.alpha = 1.0;
  a.vigS.tint = 0x131f2b;
  a.tintG.alpha = 0.9;
  a.tintG.tint = 0x93a7bd;
});
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const a = window.__atmos;
  return {
    vig: { alpha: a.vigS.alpha, w: a.vigS.width, h: a.vigS.height, visible: a.vigS.visible,
           texValid: a.vigS.texture?.source?.resource != null, texW: a.vigS.texture?.width },
    tint: { alpha: a.tintG.alpha, visible: a.tintG.visible, blend: a.tintG.blendMode },
  };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: '/tmp/landshots/atmos_forced.png' });
await browser.close();
