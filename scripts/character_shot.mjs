// Planetary-biography harness. Loads several seeds, reports each world's rolled
// temperament and arc, and shoots each one — the test is whether the worlds are
// distinguishable AT A GLANCE, not whether the numbers differ.
// Usage: node scripts/character_shot.mjs <baseurl> <outdir> [seeds...]
import { chromium } from 'playwright';

const [url, outdir, ...seedArgs] = process.argv.slice(2);
const seeds = seedArgs.length ? seedArgs : ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];

const browser = await chromium.launch();
for (const seed of seeds) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
  await page.goto(`${url}?seed=${seed}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => document.getElementById('skip').click());
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(1500);
  const ch = await page.evaluate(() => ({
    base: window.__world.character(),
    now: window.__world.now(),
    age: window.__world.age(),
    ice: +window.__sim.iceExtent.toFixed(2),
  }));
  console.log(seed.padEnd(9), ch.base.temperament.padEnd(9), ch.base.arc.padEnd(14),
    'ice', String(ch.ice).padEnd(5),
    'fert', ch.now.fertility.toFixed(2), 'dry', ch.now.drought.toFixed(2), 'flood', ch.now.flood.toFixed(2));
  await page.screenshot({ path: `${outdir}/char_${seed}.png` });
  await page.close();
}
await browser.close();
