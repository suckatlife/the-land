import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseURL = process.env.BASE_URL ?? 'http://localhost:5388';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

await page.goto(`${baseURL}/?seed=reflection-test&debug=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__atmosphere?.light, null, { timeout: 120_000 });

async function reflectionPathAt(timeOfDay) {
  await page.evaluate(time => window.__atmosphere.setTimeOfDay(time), timeOfDay);
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const atmosphere = window.__atmosphere;
    const reflection = atmosphere.glitterLayer.children[0];
    const scale = 0.68;
    const project = (x, y) => atmosphere.project(
      (x + 1600) * scale,
      (y + 110) * scale,
    );
    return {
      light: atmosphere.celestialPosition(),
      top: project(reflection.x, reflection.y),
      observer: project(
        reflection.x + Math.tan(reflection.skew.x) * reflection.height,
        reflection.y + reflection.height,
      ),
      screenCenterX: innerWidth / 2,
    };
  });
}

const sunPath = await reflectionPathAt(0.44);  // sun at 80% azimuth
await page.screenshot({ path: '/tmp/the-land-sun-reflection.jpg', type: 'jpeg', quality: 60 });
const moonPath = await reflectionPathAt(0.64); // moon at 20% azimuth
await page.screenshot({ path: '/tmp/the-land-moon-path.jpg', type: 'jpeg', quality: 60 });
for (const [kind, path] of [['sun', sunPath], ['moon', moonPath]]) {
  if (path.light?.kind !== kind) throw new Error(`Expected ${kind}, got ${path.light?.kind}`);
  if (Math.abs(path.top.x - path.light.x) > 3) {
    throw new Error(`${kind} reflection missed light: ${JSON.stringify(path)}`);
  }
  if (Math.abs(path.observer.x - path.screenCenterX) > 3) {
    throw new Error(`${kind} reflection missed observer: ${JSON.stringify(path)}`);
  }
}
const speed = page.locator('[data-control="speed"]');
const clickSpeed = () => page.evaluate(() => document.querySelector('[data-control="speed"]')?.click());
const labels = [await speed.textContent()];
for (let i = 0; i < 4; i++) {
  await clickSpeed();
  labels.push(await speed.textContent());
}
if (labels.join(',') !== '1x,2x,4x,8x,1x') {
  throw new Error(`Unexpected speed cycle: ${labels.join(' -> ')}`);
}

for (let i = 0; i < 2; i++) await clickSpeed(); // 1x -> 2x -> 4x
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

await clickSpeed(); // 8x
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

const result = { sunPath, moonPath, labels, at4x, at8x, screenshots: ['/tmp/the-land-sun-reflection.jpg', '/tmp/the-land-moon-path.jpg'] };
await writeFile('/tmp/the-land-reflection-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
