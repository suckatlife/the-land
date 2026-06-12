import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=51f518', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
await page.evaluate(() => document.getElementById('skip').click());
await page.waitForTimeout(8000);
// force a wonder + verify roads/boats visible
await page.evaluate(() => {
  const civs = [...window.__sim.civs.values()].filter(c => c.phase !== 'dead');
  const big = civs.sort((a, b) => b.cities.length - a.cities.length)[0];
  if (big) big.wonder = { row: big.originRow, col: big.originCol };
});
await page.waitForTimeout(3000); // cadence rebuild picks it up
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.30));
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/landshots/w6_day2.png' });
// storm test
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.78));
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/landshots/w6_night.png' });
await browser.close();
