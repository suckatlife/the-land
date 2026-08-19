import { chromium } from 'playwright';
const BASE = process.argv[2];
const out = [];
const ok = (n,p,d='') => out.push(`${p?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);
const browser = await chromium.launch();
const open = async (ctx, url) => {
  const page = await ctx.newPage();
  page.on('pageerror', e=>out.push('PAGEERROR '+e.message.split('\n')[0]));
  await page.goto(url, {waitUntil:'domcontentloaded'});
  const d = await page.waitForSelector('.world-intro button',{state:'attached',timeout:30000}).catch(()=>null);
  if (d) await page.evaluate(()=>document.querySelector('.world-intro button').click());
  await page.waitForTimeout(1000);
  return page;
};
const log = p => p.evaluate(()=> (window.__analyticsLog||[]).map(e=>({n:e.name,p:e.props})));

// Engagement: 1-minute threshold fires exactly once, and hidden time does not count.
{
  const ctx = await browser.newContext();
  const page = await open(ctx, `${BASE}/`);
  await page.waitForTimeout(35000);
  let l = await log(page);
  ok('engagement: nothing at ~35 visible seconds', l.filter(e=>e.n==='engagement_reached').length===0);
  // Hide for 40s — this must NOT count toward the minute.
  await page.evaluate(()=>{ Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});
    document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(40000);
  l = await log(page);
  ok('engagement: hidden time does not accumulate', l.filter(e=>e.n==='engagement_reached').length===0,
     `after 35s visible + 40s hidden: ${l.filter(e=>e.n==='engagement_reached').length} events`);
  await page.evaluate(()=>{ Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true});
    document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(30000);
  l = await log(page);
  const eng = l.filter(e=>e.n==='engagement_reached');
  ok('engagement: fires exactly once at 1 visible minute', eng.length===1 && eng[0].p.minutes===1, JSON.stringify(eng));
  await ctx.close();
}

// Share: clipboard fallback counts once, and only on success.
{
  const ctx = await browser.newContext({ permissions:['clipboard-read','clipboard-write'] });
  const page = await open(ctx, `${BASE}/?seed=SHARESEED`);
  await page.evaluate(()=>{ delete navigator.share; });   // force the clipboard branch
  await page.evaluate(()=>document.querySelector('[data-control="share"]')?.click());
  await page.waitForTimeout(1200);
  const l = await log(page);
  const sh = l.filter(e=>e.n==='world_shared');
  ok('share: exactly one clipboard event', sh.length===1 && sh[0].p.method==='clipboard', JSON.stringify(sh));
  ok('share: no seed in payload', !JSON.stringify(l).includes('SHARESEED'));
  const clip = await page.evaluate(()=>navigator.clipboard.readText().catch(()=>''));
  ok('share: the SHARED link still carries the seed (product behaviour intact)', clip.includes('seed='), clip.slice(0,60));
  await ctx.close();
}
console.log(out.join('\n'));
console.log('\n'+out.filter(l=>l.startsWith('FAIL')).length+' failures, '+out.filter(l=>l.startsWith('PASS')).length+' passes');
await browser.close();
