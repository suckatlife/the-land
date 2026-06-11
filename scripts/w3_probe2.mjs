import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=w3labels', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => document.getElementById('skip').click());
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const L = window.__layers;
  const m = L.cityMarkersContainer;
  const lbl = L.labelLayer;
  const firstMarker = m.children[0];
  const firstLabel = lbl.children[0];
  return {
    markerChildren: m.children.length,
    markerVisible: m.visible, markerAlpha: m.alpha,
    labelChildren: lbl.children.length,
    first: firstMarker ? { x: firstMarker.x, y: firstMarker.y, visible: firstMarker.visible, alpha: firstMarker.alpha } : null,
    firstLbl: firstLabel ? { x: firstLabel.x, y: firstLabel.y, alpha: firstLabel.alpha, text: firstLabel.text } : null,
    worldChildren: L.world.children.map(c => c.constructor.name),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
