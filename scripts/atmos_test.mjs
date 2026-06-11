import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=fable01', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000); // let some civs settle
// Force a severe asteroid brewing near full pressure
await page.evaluate(() => {
  const sim = window.__sim;
  sim.catastrophePressure = 0.90;
  sim.pressureNoise = 0.3; // slow the build so we can watch
  sim.brewing = { type: 'asteroid', severity: 0.85, omenStage: 2 };
});
await page.waitForTimeout(9000); // dread ease-in
await page.screenshot({ path: '/tmp/landshots/atmos_asteroid_brewing.png' });
// Let it fire naturally and catch aftermath
await page.evaluate(() => { window.__sim.catastrophePressure = 0.999; });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/landshots/atmos_impact.png' });
await page.waitForTimeout(7000);
await page.screenshot({ path: '/tmp/landshots/atmos_aftermath.png' });
// Flood brewing for hue check
await page.evaluate(() => {
  const sim = window.__sim;
  sim.catastrophePressure = 0.92;
  sim.brewing = { type: 'flood', severity: 0.5, omenStage: 2 };
});
await page.waitForTimeout(9000);
await page.screenshot({ path: '/tmp/landshots/atmos_flood_brewing.png' });
await browser.close();
