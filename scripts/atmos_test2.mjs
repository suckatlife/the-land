import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=fable01', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
// Severe asteroid brewing, near-fire pressure
await page.evaluate(() => {
  const sim = window.__sim;
  sim.catastrophePressure = 0.95; sim.pressureNoise = 0.2;
  sim.brewing = { type: 'asteroid', severity: 0.9, omenStage: 3 };
});
await page.waitForTimeout(13000);
await page.screenshot({ path: '/tmp/landshots/v2_asteroid_severe.png' });
// catch the flash within ~0.2s of fire
await page.evaluate(() => { window.__sim.catastrophePressure = 1.01; });
await page.waitForTimeout(220);
await page.screenshot({ path: '/tmp/landshots/v2_impact_flash.png' });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/landshots/v2_aftermath.png' });
// moderate plague for the mid-range look
await page.evaluate(() => {
  const sim = window.__sim;
  sim.catastrophePressure = 0.93; sim.pressureNoise = 0.2;
  sim.brewing = { type: 'plague', severity: 0.5, omenStage: 2 };
});
await page.waitForTimeout(13000);
await page.screenshot({ path: '/tmp/landshots/v2_plague_moderate.png' });
await browser.close();
