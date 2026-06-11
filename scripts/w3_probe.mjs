import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });
await page.goto('http://localhost:5175/?seed=w3labels', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => document.getElementById('skip').click());
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const sim = window.__sim;
  let cities = 0, living = 0;
  for (const c of sim.civs.values()) if (c.phase !== 'dead') { living++; cities += c.cities.length; }
  return { living, cities, tick: sim.tick };
});
console.log(JSON.stringify(info));
await browser.close();
