import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=atmos02', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
// Night + severe flood brewing: dread should lean the night sky cold
await page.evaluate(() => {
  window.__atmosphere.setTimeOfDay(0.80);
  const sim = window.__sim;
  sim.catastrophePressure = 0.93; sim.pressureNoise = 0.2;
  sim.brewing = { type: 'flood', severity: 0.8, omenStage: 2 };
});
await page.waitForTimeout(11000);
await page.screenshot({ path: '/tmp/landshots/w1_night_dread.png' });
const pre = await page.evaluate(() => ({ dread: window.__atmos.dread, log: document.body.innerText.slice(0, 0) }));
console.log('night dread:', pre.dread.toFixed(2));
// Let it fire; verify scar appears (impact path)
await page.evaluate(() => { window.__sim.catastrophePressure = 1.01; });
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/landshots/w1_night_aftermath.png' });
// Manual button path at noon
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.25));
await page.waitForTimeout(1000);
await page.evaluate(() => document.getElementById('catastrophe').click());
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/landshots/w1_manual_scar.png' });
console.log('smoke done');
await browser.close();
