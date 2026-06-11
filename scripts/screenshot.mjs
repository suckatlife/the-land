// Screenshot harness for visual evaluation. Not part of the build.
// Usage: node scripts/screenshot.mjs <url> <outdir> <...secondsToCapture>
import { chromium } from 'playwright';

const [url, outdir, ...times] = process.argv.slice(2);
const captures = times.length ? times.map(Number) : [5, 30, 60];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text()); });
page.on('pageerror', (err) => console.log('PAGE EXCEPTION:', err.message));
await page.goto(url, { waitUntil: 'networkidle' });

let elapsed = 0;
for (const t of captures) {
  await page.waitForTimeout((t - elapsed) * 1000);
  elapsed = t;
  const path = `${outdir}/shot_${String(t).padStart(4, '0')}s.png`;
  await page.screenshot({ path });
  console.log('saved', path);
}
await browser.close();
