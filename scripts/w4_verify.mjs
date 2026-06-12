import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000);
// Night + severe asteroid brewing: omen star must dominate the field
await page.evaluate(() => {
  window.__atmosphere.setTimeOfDay(0.80);
  const sim = window.__sim;
  sim.catastrophePressure = 0.92; sim.pressureNoise = 0.15;
  sim.brewing = { type: 'asteroid', severity: 0.85, omenStage: 3 };
});
await page.waitForTimeout(11000);
await page.screenshot({ path: 'celestial_calibration/omen_star_over_field.png' });
// let it fire: impact + scar + glitter all together
await page.evaluate(() => { window.__sim.catastrophePressure = 1.01; });
await page.waitForTimeout(4000);
await page.screenshot({ path: 'celestial_calibration/aftermath_night.png' });
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0; const t0 = performance.now();
  const loop = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(frames / 2); };
  requestAnimationFrame(loop);
}));
console.log('FPS:', fps);
await browser.close();
