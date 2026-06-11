import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=atmos03', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await page.evaluate(() => { window.__atmosphere.setTimeOfDay(0.25); window.__atmosphere.setSeasonOfYear(0.27); });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/landshots/w2_era_neolithic.png' });
await page.evaluate(() => { for (const c of window.__sim.civs.values()) c.era = 'industrial'; });
await page.waitForTimeout(40000); // era air eases over ~30s
await page.screenshot({ path: '/tmp/landshots/w2_era_industrial.png' });
await browser.close();
