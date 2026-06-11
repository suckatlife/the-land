import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=w3labels', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => document.getElementById('skip').click());
await page.waitForTimeout(12000); // labels fade in
await page.screenshot({ path: '/tmp/landshots/w3_labels_full.png' });
await browser.close();
