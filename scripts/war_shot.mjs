// War-scale A/B. Develops a world, lights ONE set of fronts, then shoots the
// same front at each scale under test — battles live ~9s, which is enough to
// scrub the knob between screenshots. Comparing across separate runs is
// meaningless here: the sim is unseeded and fronts are transient.
// Crop coords come from __war.list(), which runs tile→screen through the
// curvature, so the clip lands on the fight instead of hunting for it.
// Usage: node scripts/war_shot.mjs <url> <outdir> [scales...]
import { chromium } from 'playwright';

const [url, outdir, ...scaleArgs] = process.argv.slice(2);
const scales = scaleArgs.length ? scaleArgs.map(Number) : [1.0, 1.7];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2600, height: 1500 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

for (let i = 0; i < 4; i++) {
  await page.evaluate(() => document.getElementById('skip').click());
  await page.waitForTimeout(600);
}
await page.evaluate(() => {
  for (const c of window.__sim.civs.values()) if (c.phase !== 'dead') c.era = 'industrial';
});
await page.waitForTimeout(2000);

// Light the fronts once. The debug entry has a 50% create gate and a 6-battle
// cap, so it takes several attempts to reliably get one.
await page.evaluate(() => {
  const sel = document.getElementById('dbg-spawn');
  const idx = [...sel.options].findIndex((o) => o.textContent.includes('War / battle'));
  for (let i = 0; i < 12; i++) { sel.value = sel.options[idx].value; sel.dispatchEvent(new Event('change')); }
});
await page.waitForTimeout(400);

const fronts = await page.evaluate(() => window.__war.list());
if (!fronts.length) { console.log('no fronts lit — rerun'); await browser.close(); process.exit(1); }
const f = fronts[0];
console.log('front at', JSON.stringify(f));
const clip = { x: Math.max(0, f.x - 200), y: Math.max(0, f.y - 115), width: 400, height: 230 };

for (const scale of scales) {
  await page.evaluate((s) => { window.__war.scale = s; }, scale);
  await page.waitForTimeout(250);
  const path = `${outdir}/war_s${String(scale).replace('.', '_')}.png`;
  await page.screenshot({ path, clip });
  console.log('saved', path);
}
await browser.close();
