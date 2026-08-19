// Watch a running world and shoot it at fixed ages. The whole point of the
// auto-loop is that each agent LOOKS at the thing before changing it, and a
// world's character only emerges over minutes: at 1 minute it is neolithic and
// nearly empty, at 5 the map is contested, at 10 it is late-era and dense.
// Usage: node scripts/loop/observe.mjs <url> <outdir> [minutes...]
import { chromium } from 'playwright';

const [url, outdir, ...mins] = process.argv.slice(2);
const marks = (mins.length ? mins.map(Number) : [1, 5, 10]).sort((a, b) => a - b);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const problems = [];
page.on('pageerror', (e) => problems.push('EXCEPTION: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') problems.push('CONSOLE: ' + m.text().slice(0, 200)); });

await page.goto(url, { waitUntil: 'networkidle' });

// The world opens behind a doorway ("watch the world") and the sim stays at
// tick 0 until it is dismissed. Without this, every frame in the loop would be
// a screenshot of a static intro card and every turn would report a dead world.
// The doorway is built after the sprite atlases load, so it does not exist at
// networkidle — wait for it to be ATTACHED, not visible: the card animates in,
// and Playwright's visibility check will time out on a perfectly real button.
// Click through evaluate for the same reason.
const appeared = await page.waitForSelector('.world-intro button', { state: 'attached', timeout: 30000 })
  .then(() => true).catch(() => false);
if (appeared) {
  await page.evaluate(() => document.querySelector('.world-intro button').click());
  console.log('doorway dismissed');
} else {
  console.log('no doorway appeared within 30s');
}
await page.waitForTimeout(1500);
// Refuse to waste ten minutes shooting a world that never started.
const ticking = await page.evaluate(async () => {
  const t0 = window.__sim?.tick ?? -1;
  await new Promise((r) => setTimeout(r, 3000));
  return (window.__sim?.tick ?? -1) > t0;
});
if (!ticking) {
  // Print what the page complained about; aborting silently hid the real cause
  // for two runs.
  console.log('PROBLEMS: sim is not advancing — aborting before the clock starts');
  for (const p of [...new Set(problems)].slice(0, 10)) console.log('  ' + p);
  await browser.close();
  process.exit(1);
}

let elapsed = 0;
for (const m of marks) {
  await page.waitForTimeout((m - elapsed) * 60000);
  elapsed = m;
  const path = `${outdir}/t${String(m).padStart(2, '0')}m.png`;
  await page.screenshot({ path });
  // A one-line factual reading to sit beside each frame, so the handoff note
  // can say what was actually on screen and not just "looked fine".
  const s = await page.evaluate(() => {
    const w = window.__sim;
    const alive = [...w.civs.values()].filter((c) => c.phase !== 'dead');
    return {
      tick: w.tick,
      era: (window.__hier && w.eraProgress != null) ? +w.eraProgress.toFixed(2) : null,
      civs: alive.length,
      biggest: alive.length ? Math.max(...alive.map((c) => c.cities.length)) : 0,
      ice: w.iceExtent != null ? +w.iceExtent.toFixed(2) : null,
      character: w.character ? `${w.character.temperament}/${w.character.arc}` : null,
      fps: window.__rt ? window.__rt().tickerFPS : null,
    };
  }).catch(() => ({}));
  console.log(`${m}m ${JSON.stringify(s)} -> ${path}`);
}

console.log(problems.length ? `PROBLEMS(${problems.length}):\n` + [...new Set(problems)].slice(0, 10).join('\n') : 'PROBLEMS: none');
await browser.close();
process.exit(problems.some((p) => p.startsWith('EXCEPTION')) ? 1 : 0);
