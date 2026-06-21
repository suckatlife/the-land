// Capture era settlement tells. Usage: node scripts/skyline_shot.mjs <url> <outdir>
import { chromium } from 'playwright';
const [url, outdir='/tmp/sky'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2560, height: 1920 } });
page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
for (let i=0;i<3;i++){ await page.click('#skip').catch(()=>{}); await page.waitForTimeout(400); }
const setEra = (era) => page.evaluate((e)=>{
  let n=0; for (const c of window.__sim.civs.values()) if (c.phase!=='dead'){ c.era=e; for (const city of c.cities) city.prominence=1; n++; }
  return n;
}, era);
for (const era of ['medieval','industrial','modern']) {
  const n = await setEra(era);
  await page.waitForTimeout(2500); // let tells ease in
  await page.screenshot({ path: `${outdir}/sky_${era}.png` });
  console.log(`saved sky_${era}.png (${n} civs)`);
}
await browser.close();
