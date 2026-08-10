// Controlled A/B for the hierarchy pass: ONE world, shot twice — once with the
// pass on, once with __hier.flat() applied. The sim uses unseeded randomness,
// so two separate page loads diverge; this is the only way to compare fairly.
// Usage: node scripts/hier_ab.mjs <url> <outdir> [skips] [forceEra]
import { chromium } from 'playwright';

const [url, outdir, skipsArg, forceEra] = process.argv.slice(2);
const skips = Number(skipsArg ?? 4);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

for (let i = 0; i < skips; i++) {
  await page.evaluate(() => document.getElementById('skip').click());
  await page.waitForTimeout(600);
}
if (forceEra) {
  await page.evaluate((era) => {
    for (const c of window.__sim.civs.values()) if (c.phase !== 'dead') c.era = era;
  }, forceEra);
  await page.waitForTimeout(4000);
}
// The sim keeps running between the two frames (~2.5s ≈ 75 ticks of drift),
// which is far less divergence than two separate page loads.
await page.screenshot({ path: `${outdir}/ab_on.png` });
console.log('saved on');

await page.evaluate(() => window.__hier.flat());
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outdir}/ab_off.png` });
console.log('saved off');

await browser.close();
