import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=atmos03', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await page.evaluate(() => {
  window.__atmosphere.setTimeOfDay(0.42); // late afternoon
  const sim = window.__sim;
  sim.catastrophePressure = 0.95; sim.pressureNoise = 0.15;
  sim.brewing = { type: 'earthquake', severity: 0.85, omenStage: 3 };
});
await page.waitForTimeout(12000);
await page.screenshot({ path: '/tmp/landshots/w2_storm_gathering.png' });
await browser.close();
