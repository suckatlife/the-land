import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=51f518', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
// skip deep — each skip is 5000 ticks; 8 skips ~= 40k (industrial-ish)
for (let i = 0; i < 8; i++) { await page.evaluate(() => document.getElementById('skip').click()); await page.waitForTimeout(2500); }
let eras = await page.evaluate(() => { const e={}; for (const c of window.__sim.civs.values()) if(c.phase!=='dead') e[c.era]=(e[c.era]||0)+1; return {eras:e, prog:window.__sim.eraProgress, tick:window.__sim.tick}; });
console.log('after 8 skips:', JSON.stringify(eras));
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.30));
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/landshots/era_industrial_day.png' });
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.78));
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/landshots/era_industrial_night.png' });
// skip further to post
for (let i = 0; i < 6; i++) { await page.evaluate(() => document.getElementById('skip').click()); await page.waitForTimeout(2500); }
eras = await page.evaluate(() => { const e={}; for (const c of window.__sim.civs.values()) if(c.phase!=='dead') e[c.era]=(e[c.era]||0)+1; return {eras:e, prog:window.__sim.eraProgress, tick:window.__sim.tick}; });
console.log('after 14 skips:', JSON.stringify(eras));
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.78));
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/landshots/era_post_night.png' });
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.30));
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/landshots/era_post_day.png' });
await browser.close();
