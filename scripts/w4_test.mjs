import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000);
// morning sun low east; noon; afternoon; dusk handoff; night moon; deep night
const shots = [
  ['morning', 0.04], ['noon', 0.26], ['afternoon', 0.45],
  ['dusk', 0.56], ['night_moonrise', 0.66], ['midnight', 0.76], ['dawn', 0.97],
];
for (const [name, t] of shots) {
  await page.evaluate((tt) => window.__atmosphere.setTimeOfDay(tt), t);
  await page.waitForTimeout(1600);
  const L = await page.evaluate(() => window.__atmosphere.light());
  console.log(name, JSON.stringify({ az: L.azimuth.toFixed(2), alt: L.altitude.toFixed(2), int: L.intensity.toFixed(2), day: L.isDay, night: L.nightness.toFixed(2) }));
  await page.screenshot({ path: `celestial_calibration/${name}.png` });
}
await browser.close();
