// Final integration watch: natural pacing, no forced state. Screenshots
// every 75s across ~6 min (one full day cycle is 6 min).
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=finalwatch', { waitUntil: 'networkidle' });
for (let i = 0; i <= 5; i++) {
  await page.waitForTimeout(75000);
  const s = await page.evaluate(() => ({
    t: window.__atmosphere.timeOfDay().toFixed(2),
    season: window.__atmosphere.seasonOfYear().toFixed(2),
    dread: window.__atmos.dread.toFixed(2),
    tick: window.__sim.tick,
  }));
  console.log(`shot ${i}: dayT=${s.t} season=${s.season} dread=${s.dread} tick=${s.tick}`);
  await page.screenshot({ path: `/tmp/watch/final_${i}.png` });
}
await browser.close();
