// Window-1 visual test: day-cycle keyframes + all four scar types.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=atmos01', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

// Day-cycle keyframes (scrub + brief settle for sky regen)
for (const [name, t] of [['dawn', 0.0], ['noon', 0.25], ['dusk', 0.52], ['night', 0.80]]) {
  await page.evaluate((tt) => window.__atmosphere.setTimeOfDay(tt), t);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `/tmp/landshots/w1_day_${name}.png` });
}

// Scars: force one of each type at spread-out locations via the sim's own pipeline
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.25));
await page.waitForTimeout(500);
const types = ['asteroid', 'earthquake', 'flood', 'plague'];
for (let i = 0; i < types.length; i++) {
  await page.evaluate((args) => {
    const sim = window.__sim;
    sim.catastrophePressure = 1.01; // fire next tick
    sim.brewing = { type: args.type, severity: 0.55, omenStage: 3 };
  }, { type: types[i] });
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: '/tmp/landshots/w1_scars_fresh.png' });
await page.waitForTimeout(45000);
await page.screenshot({ path: '/tmp/landshots/w1_scars_45s.png' });
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0; const t0 = performance.now();
  const loop = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(frames / 2); };
  requestAnimationFrame(loop);
}));
console.log('FPS ~', fps);
await browser.close();
