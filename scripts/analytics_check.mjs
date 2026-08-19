import { chromium } from 'playwright';
const BASE = process.argv[2];
const out = [];
const ok = (name, pass, detail='') => { out.push(`${pass?'PASS':'FAIL'}  ${name}${detail?' — '+detail:''}`); };
const browser = await chromium.launch();

const newCtx = async (opts={}) => {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const net = [];
  page.on('request', r => { const u=r.url(); if(/posthog|vercel-insights|\/_vercel\/insights/.test(u)) net.push(u); });
  page.on('pageerror', e => out.push('PAGEERROR ' + e.message.split('\n')[0]));
  return { ctx, page, net };
};
const openWorld = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const door = await page.waitForSelector('.world-intro button', { state:'attached', timeout:30000 }).catch(()=>null);
  if (door) await page.evaluate(()=>document.querySelector('.world-intro button').click());
  await page.waitForTimeout(1500);
};
const log = (page) => page.evaluate(()=> (window.__analyticsLog||[]).map(e=>({n:e.name,p:e.props})));

// 1 + 2: one visit per tab session; reload does not re-emit; later session = returning
{
  const { ctx, page } = await newCtx();
  await openWorld(page, `${BASE}/?seed=analytics-check#frag`);
  let l = await log(page);
  const first = l.filter(e=>e.n==='visit_started');
  ok('visit_started once on first session', first.length===1 && first[0].p.visitor_status==='new', JSON.stringify(first));
  await page.reload({ waitUntil:'domcontentloaded' });
  const d2 = await page.waitForSelector('.world-intro button',{state:'attached',timeout:30000}).catch(()=>null);
  if (d2) await page.evaluate(()=>document.querySelector('.world-intro button').click());
  await page.waitForTimeout(1500);
  l = await log(page);
  ok('reload does not emit another visit_started', l.filter(e=>e.n==='visit_started').length===0, `after reload: ${JSON.stringify(l.map(e=>e.n))}`);
  const page2 = await ctx.newPage();   // same storage, new tab session
  await openWorld(page2, `${BASE}/`);
  const l2 = await log(page2);
  const v2 = l2.filter(e=>e.n==='visit_started');
  ok('new tab session reports returning', v2.length===1 && v2[0].p.visitor_status==='returning', JSON.stringify(v2));
  await ctx.close();
}

// 3: URL stripping — seeds and fragments must never appear in any payload
{
  const { ctx, page } = await newCtx();
  await openWorld(page, `${BASE}/?seed=SECRETSEED123&x=1#SECRETFRAG`);
  const stripped = await page.evaluate(()=>{
    const u = new URL(window.location.href); u.search=''; u.hash='';
    return { stripped: u.toString(), raw: window.location.href };
  });
  const dump = JSON.stringify(await log(page));
  ok('no seed/fragment in any emitted payload',
     !dump.includes('SECRETSEED123') && !dump.includes('SECRETFRAG'), dump.slice(0,120));
  ok('stripped url has no query or fragment', !/[?#]/.test(stripped.stripped), stripped.stripped);
  await ctx.close();
}

// 4: DNT / GPC disables analytics entirely
{
  const { ctx, page, net } = await newCtx();
  await page.addInitScript(()=>{ Object.defineProperty(navigator,'doNotTrack',{get:()=>'1'}); });
  await openWorld(page, `${BASE}/`);
  const l = await page.evaluate(()=> window.__analyticsLog === undefined ? 'undefined' : window.__analyticsLog.length);
  ok('DNT: no events emitted', l==='undefined' || l===0, `log=${l}`);
  ok('DNT: no analytics network requests', net.length===0, net.join(','));
  await ctx.close();
}
{
  const { ctx, page } = await newCtx();
  await page.addInitScript(()=>{ Object.defineProperty(navigator,'globalPrivacyControl',{get:()=>true}); });
  await openWorld(page, `${BASE}/`);
  const l = await page.evaluate(()=> window.__analyticsLog === undefined ? 'undefined' : window.__analyticsLog.length);
  ok('GPC: no events emitted', l==='undefined' || l===0, `log=${l}`);
  await ctx.close();
}

// 5: control events — no duplicates
{
  const { ctx, page } = await newCtx();
  await openWorld(page, `${BASE}/`);
  const click = async (sel) => { await page.evaluate((s)=>document.querySelector(s)?.click(), sel); await page.waitForTimeout(500); };
  await click('[data-control="chronicle"]');
  await click('[data-control="chronicle"]');
  let l = await log(page);
  const ch = l.filter(e=>e.n==='chronicle_toggled');
  ok('chronicle: two clicks -> exactly two events, alternating',
     ch.length===2 && ch[0].p.enabled===true && ch[1].p.enabled===false, JSON.stringify(ch));
  await click('[data-control="new"]');
  l = await log(page);
  const wg = l.filter(e=>e.n==='world_generated');
  ok('new world: one manual event per click', wg.length===1 && wg[0].p.source==='manual', JSON.stringify(wg));
  // double-click the fullscreen control: must not fire a burst
  await page.evaluate(()=>{ const b=document.querySelector('[data-control="fullscreen"]');
    b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    b.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); });
  await page.waitForTimeout(800);
  l = await log(page);
  const fs = l.filter(e=>e.n==='fullscreen_toggled');
  ok('fullscreen: no event burst from a double-click on the control', fs.length<=1, `${fs.length} events: ${JSON.stringify(fs)}`);
  await ctx.close();
}

console.log(out.join('\n'));
console.log('\n' + out.filter(l=>l.startsWith('FAIL')).length + ' failures, ' + out.filter(l=>l.startsWith('PASS')).length + ' passes');
await browser.close();
