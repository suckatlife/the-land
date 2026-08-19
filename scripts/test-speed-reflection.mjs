import { chromium } from 'playwright';

const baseURL = process.env.BASE_URL ?? 'http://localhost:5388';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

await page.goto(`${baseURL}/?seed=reflection-test&debug=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__atmosphere?.light, null, { timeout: 120_000 });
const speed = page.locator('[data-control="speed"]');
const labels = [await speed.textContent()];
for (let i = 0; i < 4; i++) {
  await speed.click();
  labels.push(await speed.textContent());
}
if (labels.join(',') !== '1x,2x,4x,8x,1x') {
  throw new Error(`Unexpected speed cycle: ${labels.join(' -> ')}`);
}

for (let i = 0; i < 2; i++) await speed.click(); // 1x -> 2x -> 4x
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.76));
await page.waitForTimeout(100);
const at4x = await page.evaluate(() => {
  const atmosphere = window.__atmosphere;
  const [base, glintA, glintB] = atmosphere.glitterLayer.children;
  return {
    speed: document.querySelector('[data-control="speed"]')?.textContent,
    light: atmosphere.light(),
    alpha: [base.alpha, glintA.alpha, glintB.alpha],
  };
});

await speed.click(); // 8x
await page.evaluate(() => window.__atmosphere.setTimeOfDay(0.76));
await page.waitForTimeout(100);
const at8x = await page.evaluate(() => {
  const atmosphere = window.__atmosphere;
  const [base, glintA, glintB] = atmosphere.glitterLayer.children;
  return {
    speed: document.querySelector('[data-control="speed"]')?.textContent,
    light: atmosphere.light(),
    alpha: [base.alpha, glintA.alpha, glintB.alpha],
  };
});

for (const sample of [at4x, at8x]) {
  if (sample.light.isDay) throw new Error(`${sample.speed}: expected moonlight`);
  if (Math.abs(sample.alpha[0] * 2 - 0.20) > 0.01) {
    throw new Error(`${sample.speed}: moon reflection was not 20%: ${sample.alpha}`);
  }
  if (Math.abs(sample.alpha[1] - sample.alpha[2]) > 0.001) {
    throw new Error(`${sample.speed}: reflection glints were not steady: ${sample.alpha}`);
  }
}
if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);

await page.screenshot({ path: '/tmp/the-land-moon-reflection.jpg', type: 'jpeg', quality: 60 });
console.log(JSON.stringify({ labels, at4x, at8x, screenshot: '/tmp/the-land-moon-reflection.jpg' }, null, 2));
await browser.close();
