// 12-minute integration watch: screenshots + narration + pressure trace.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto(`http://localhost:5175/?seed=${process.argv[2] ?? 'watch01'}`, { waitUntil: 'networkidle' });

const seenLines = new Set();
for (let t = 0; t <= 720; t += 15) {
  const state = await page.evaluate(() => ({
    tick: window.__sim.tick,
    p: window.__sim.catastrophePressure,
    noise: window.__sim.pressureNoise,
    brewing: window.__sim.brewing ? `${window.__sim.brewing.type}@${window.__sim.brewing.severity.toFixed(2)}` : null,
    dread: window.__atmos.dread,
    log: [...document.querySelectorAll('div')].filter(d => d.parentElement?.style.cssText.includes('bottom: 12px') && d.parentElement?.style.cssText.includes('left: 12px')).flatMap(d => [...d.children].map(c => c.textContent)),
  }));
  const newLines = state.log.filter(l => l && !seenLines.has(l));
  newLines.forEach(l => seenLines.add(l));
  const mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
  console.log(`${mm}:${ss} p=${state.p.toFixed(2)} n=${state.noise.toFixed(2)} dread=${state.dread.toFixed(2)} brewing=${state.brewing ?? '-'}${newLines.length ? '\n        | ' + newLines.join('\n        | ') : ''}`);
  if (t % 90 === 0) await page.screenshot({ path: `/tmp/watch/t${String(t).padStart(3, '0')}.png` });
  await page.waitForTimeout(15000);
}
await browser.close();
