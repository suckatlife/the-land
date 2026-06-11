import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=w3base', { waitUntil: 'networkidle' });
for (const [i, wait] of [[0, 8000], [1, 90000], [2, 90000], [3, 90000]]) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `/tmp/watch/w3pre_${i}.png` });
}
console.log('w3 pre-watch done');
await browser.close();
