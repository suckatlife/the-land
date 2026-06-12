import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1190, height: 920 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000);
// daylight default
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.30));
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/landshots/curve_day_default.png' });
// night (his framing) default
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.80));
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/landshots/curve_night_default.png' });
// overshoot
await page.evaluate(() => { window.__atmosphere.setCurvature(1); window.__atmosphere.setPerspective(1); });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/landshots/curve_night_overshoot.png' });
await browser.close();
