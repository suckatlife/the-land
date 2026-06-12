import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const a = window.__atmosphere;
  const stage = a.skyLayer.parent;
  return {
    skyIdx: stage.getChildIndex(a.skyLayer),
    starIdx: stage.getChildIndex(a.starLayer),
    stageChildren: stage.children.map(c => c.constructor.name),
    starWorldAlpha: a.starLayer.children[1].worldAlpha ?? 'n/a',
    maskInfo: (() => {
      const m = a.glitterLayer.mask;
      return m ? { type: m.constructor.name, w: m.width, h: m.height, x: m.x, y: m.y } : null;
    })(),
  };
});
console.log(JSON.stringify(info, null, 1));
// glitter masked again, 3x, noon — does the mask kill it?
await page.evaluate(() => {
  window.__atmosphere.setTimeOfDay(0.26);
  window.__atmosphere.setGlitterStrength(3);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/landshots/w4_glitter_masked3x.png' });
await browser.close();
