// Succession harness. Finds a patch of ruins in a developed world, crops onto
// it, and shoots the same ground as the wood grows over it — so the stages
// (raw → scrub → saplings → wood, with the soil mark and road ghosts under it)
// can be judged as a sequence rather than guessed at from one frame.
// Advances by moving the world clock, since real succession takes ~3 minutes.
// Usage: node scripts/succession_shot.mjs <url> <outdir>
import { chromium } from 'playwright';

const [url, outdir] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

for (let i = 0; i < 4; i++) {
  await page.evaluate(() => document.getElementById('skip').click());
  await page.waitForTimeout(700);
}
await page.waitForTimeout(2000);

// Find the densest cluster of ruins and centre on it.
const spot = await page.evaluate(() => {
  let best = null;
  // Near, ice-free latitudes only: a cluster at the pole is under the sheet and
  // behind the depth haze, where nothing can be judged.
  for (let r = 4; r < 92; r += 3) {
    for (let c = 4; c < 92; c += 3) {
      if (r + c < 80 || r + c > 150) continue;
      let n = 0;
      for (let dr = -4; dr <= 4; dr++)
        for (let dc = -4; dc <= 4; dc++)
          if (window.__sim.tiles[r + dr]?.[c + dc]?.state === 'ruin') n++;
      if (!best || n > best.n) best = { r, c, n };
    }
  }
  return best && { ...best, ...window.__succ.at(best.r, best.c) };
});
console.log('ruin cluster:', JSON.stringify(spot));
if (!spot || spot.n < 4) { console.log('no ruins found — rerun'); await browser.close(); process.exit(1); }
const clip = { x: Math.max(0, spot.x - 400), y: Math.max(0, spot.y - 230), width: 800, height: 460 };

// Ruin ages are measured against the world clock, so pushing the clock forward
// ages the wood without waiting three minutes per stage.
for (const [name, advance] of [['t0_raw', 0], ['t1_scrub', 1100], ['t2_saplings', 3000], ['t3_wood', 6000]]) {
  await page.evaluate((a) => { if (a) window.__sim.tick += a; window.__succ.bake(); }, advance);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outdir}/succ_${name}.png`, clip });
  console.log('saved', name, JSON.stringify(await page.evaluate(() => window.__succ.stats())));
}
await browser.close();
