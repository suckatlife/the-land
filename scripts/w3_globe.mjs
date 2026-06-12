import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1190, height: 920 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=c4e5ff', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
await page.evaluate(() => document.getElementById('skip').click()); // mature world like his shots
await page.waitForTimeout(8000);
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.30));
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/landshots/globe_day.png' });
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.78));
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/landshots/globe_night.png' });
await browser.close();
