// Natural-wonder visual check. Usage: node scripts/nw_shot.mjs <url> <outdir>
import { chromium } from 'playwright';
const [url, outdir] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (err) => console.log('PAGE EXCEPTION:', err.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
const list = await page.evaluate(() => (window.__wonders ? window.__wonders.list() : []));
console.log('wonders:', JSON.stringify(list));
await page.screenshot({ path: `${outdir}/nw_rest.png` });
console.log('saved nw_rest.png');
// Force the volcano to erupt and catch it mid-burst.
await page.evaluate(() => window.__wonders && window.__wonders.erupt(8));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outdir}/nw_erupt.png` });
console.log('saved nw_erupt.png');
await browser.close();
