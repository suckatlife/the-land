import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.76));
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const a = window.__atmosphere;
  const star = a.starLayer;
  const glit = a.glitterLayer;
  const g0 = glit.children[0];
  return {
    star: {
      parent: !!star.parent, pos: { x: star.x, y: star.y }, rot: star.rotation,
      children: star.children.map(c => ({ alpha: c.alpha, bounds: (() => { const b = c.getLocalBounds(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() })),
    },
    glitter: {
      parent: !!glit.parent, masked: !!glit.mask, children: glit.children.length,
      first: g0 ? { alpha: g0.alpha, x: Math.round(g0.x), w: Math.round(g0.width), h: Math.round(g0.height), blend: g0.blendMode, tint: g0.tint.toString(16) } : null,
    },
    light: a.light(),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
