// Aftermath-readability harness. Develops a world, fires a catastrophe, then
// crops onto the wound at a series of ages so the outside-in recovery can be
// judged: fresh (colour drained, silhouette hard), mid-heal (edges greening
// back), and late (only the faint permanent remainder).
// Usage: node scripts/quiet_shot.mjs <url> <outdir> [ages in seconds...]
import { chromium } from 'playwright';

const [url, outdir, ...ageArgs] = process.argv.slice(2);
const ages = ageArgs.length ? ageArgs.map(Number) : [3, 40, 100];

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
  for (const c of window.__sim.civs.values()) if (c.phase !== 'dead') c.era = 'modern';
});
await page.waitForTimeout(3000);

// Fire a few catastrophes: the point of this feature is legibility AMONG dense
// settlement, so an epicentre on empty coast proves nothing. Score each wound
// by how much built land it actually covers and judge the busiest one.
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    const sel = document.getElementById('dbg-spawn');
    const idx = [...sel.options].findIndex((o) => o.textContent.includes('Catastrophe (random)'));
    sel.value = sel.options[idx].value;
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(1500);
}

const zones = await page.evaluate(() => window.__hier.zones().map((z) => {
  let built = 0;
  const R = Math.ceil(z.radius);
  for (let r = Math.max(0, z.row - R); r <= Math.min(95, z.row + R); r++)
    for (let c = Math.max(0, z.col - R); c <= Math.min(95, z.col + R); c++)
      if (window.__sim.tiles[r][c].state === 'built' || window.__sim.tiles[r][c].state === 'ruin') built++;
  return { ...z, built };
}));
if (!zones.length) { console.log('no quiet zone created — rerun'); await browser.close(); process.exit(1); }
zones.sort((a, b) => b.built - a.built);
console.log('zones by settled coverage:', JSON.stringify(zones.map((z) => z.built)));
const z = zones[0];
console.log('wound at', JSON.stringify(z));
const clip = { x: Math.max(0, z.x - 450), y: Math.max(0, z.y - 260), width: 900, height: 520 };

let elapsed = 0;
for (const age of ages) {
  await page.waitForTimeout(Math.max(0, (age - elapsed)) * 1000);
  elapsed = age;
  const path = `${outdir}/quiet_${String(age).padStart(3, '0')}s.png`;
  await page.screenshot({ path, clip });
  console.log('saved', path);
}
await browser.close();
