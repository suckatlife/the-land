import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1330, height: 916 } });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:5175/?seed=51f518', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
// advance to a busy mid-era world (lots of civs, wars, era content)
for (let i=0;i<8;i++){ await page.evaluate(()=>document.getElementById('skip').click()); await page.waitForTimeout(2000); }
const seen = new Set();
const lineTimes = [];
const cats = {};
const start = Date.now();
const DUR = 6*60*1000;
while (Date.now()-start < DUR) {
  const lines = await page.evaluate(() => {
    const panel=[...document.querySelectorAll('div')].find(d=>d.style.cssText.includes('bottom: 12px')&&d.style.cssText.includes('left: 12px'));
    return panel?[...panel.children].map(c=>c.textContent.trim()):[];
  });
  for (const l of lines) if (l && !seen.has(l)) {
    seen.add(l); lineTimes.push(Date.now()-start);
    // categorize
    const cat = /contest|burning|come to blows|smoulder|falls quiet|burns itself/.test(l) ? 'war'
      : /falls to ruin|without a capital|remembered only|crumbles|fades from/.test(l) ? 'death/fall'
      : /astronomers|constellation/.test(l) ? 'constellation'
      : /mountain|fire|sea|earth|rift|island|causeway|sky|comet|moon|falling stars|aurora/.test(l) ? 'catastrophe/celestial'
      : /lamps burn|stones hum|age continues|age of|alone in/.test(l) ? 'ambient'
      : /breaks free|declares itself|colony|band crosses|raises|stir|rises|gathers/.test(l) ? 'civ life'
      : 'other';
    cats[cat]=(cats[cat]||0)+1;
  }
  await page.waitForTimeout(1500);
}
const min = DUR/60000;
console.log(`unique lines in ${min}min: ${seen.size} (${(seen.size/min).toFixed(1)}/min)`);
let maxBurst=0; for(let t=0;t<DUR;t+=5000){const n=lineTimes.filter(x=>x>=t&&x<t+20000).length;if(n>maxBurst)maxBurst=n;}
console.log(`busiest 20s window: ${maxBurst} lines`);
console.log('by category:', JSON.stringify(cats));
console.log('--- sample ---');
[...seen].slice(0,30).forEach(l=>console.log('  '+l));
await browser.close();
