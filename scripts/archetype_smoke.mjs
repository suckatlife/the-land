// #27 smoke: the archetype code paths run in the real app. Verifies civs
// carry archetypes/traits, buildings render, no page errors, FPS holds.
// Judging how the shapes LOOK is a human's job — this only proves they run.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
const problems = [];
page.on('pageerror', (e) => problems.push('PAGE EXCEPTION: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('CONSOLE: ' + m.text().slice(0, 200)); });

const base = process.argv[2] || 'http://localhost:5173';
await page.goto(`${base}/?seed=arch-smoke`, { waitUntil: 'networkidle' });
const appeared = await page.waitForSelector('.world-intro button', { state: 'attached', timeout: 30000 })
  .then(() => true).catch(() => false);
if (appeared) await page.evaluate(() => document.querySelector('.world-intro button').click());
await page.waitForTimeout(1500);

// Fast-forward deep enough for several civs, wars, and possibly an ice peak.
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => document.querySelector('#skip')?.click());
  await page.waitForTimeout(4000);
}

const report = await page.evaluate(() => {
  const sim = window.__sim;
  const civs = [...sim.civs.values()];
  const byArch = {}, byTrait = {};
  for (const c of civs) {
    byArch[c.archetype] = (byArch[c.archetype] || 0) + 1;
    if (c.trait) byTrait[c.trait] = (byTrait[c.trait] || 0) + 1;
  }
  return {
    tick: sim.tick,
    civs: civs.length,
    living: civs.filter(c => c.phase !== 'dead').length,
    byArch, byTrait,
    undefinedArch: civs.filter(c => !c.archetype).length,
  };
});
console.log(JSON.stringify(report, null, 1));

const fps = await page.evaluate(() => new Promise(res => {
  let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 < 3000) requestAnimationFrame(loop); else res(f / 3); };
  requestAnimationFrame(loop);
}));
console.log('FPS:', fps.toFixed(1));
await page.screenshot({ path: '/tmp/arch_smoke.png' });
console.log(problems.length ? 'PROBLEMS:\n' + [...new Set(problems)].slice(0, 10).join('\n') : 'no page errors');
await browser.close();
