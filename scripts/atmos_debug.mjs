import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=fable01', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const sim = window.__sim;
  sim.catastrophePressure = 0.95;
  sim.pressureNoise = 0.2;
  sim.brewing = { type: 'asteroid', severity: 0.9, omenStage: 3 };
});
await page.waitForTimeout(12000);
const state = await page.evaluate(() => ({
  dread: window.__atmos.dread,
  tintAlpha: window.__atmos.tintAlpha,
  vigAlpha: window.__atmos.vigAlpha,
  pressure: window.__sim.catastrophePressure,
  brewing: window.__sim.brewing,
}));
console.log(JSON.stringify(state, null, 1));
await page.screenshot({ path: '/tmp/landshots/atmos_debug.png' });
await browser.close();
