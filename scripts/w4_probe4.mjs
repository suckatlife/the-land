import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const m = window.__atmosphere.glitterLayer.mask;
  const src = m.texture.source.resource;
  const isCanvas = src instanceof HTMLCanvasElement;
  if (!isCanvas) return { isCanvas, srcType: src?.constructor?.name };
  const cx = src.getContext('2d');
  const sample = (x, y) => cx.getImageData(x, y, 1, 1).data.join(',');
  // total alpha coverage
  const d = cx.getImageData(0, 0, src.width, src.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 10) lit++;
  return {
    isCanvas, w: src.width, h: src.height,
    litFrac: (lit / (d.length / 4)).toFixed(3),
    corner: sample(10, 10), center: sample(src.width >> 1, src.height >> 1),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
