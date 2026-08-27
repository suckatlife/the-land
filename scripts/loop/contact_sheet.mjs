#!/usr/bin/env node
// Composite a turn's before/after frames into ONE reviewable image.
//
// turn.sh already shoots the world at 1, 5 and 10 minutes in both phases — six
// frames that are the strongest evidence this project produces, and the only
// thing a live Vercel preview cannot give you, because a preview shows *now*
// and never *the change*. They were being written into runs/, which is
// gitignored, so they died on whatever machine made them.
//
// Six 900KB PNGs per turn is not something a public repo should carry. One
// downscaled sheet is ~150KB, renders inline in a PR on a phone, and puts
// before directly above after at the same minute mark — which is the
// comparison actually being made.
//
// No new dependency: Playwright is already a devDependency for observe.mjs.
//
//   node scripts/loop/contact_sheet.mjs runs/08-claude
//   node scripts/loop/contact_sheet.mjs runs/08-claude out.jpg
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const turnDir = process.argv[2];
if (!turnDir) {
  console.error('usage: contact_sheet.mjs <runs/turn-id> [out.jpg]');
  process.exit(2);
}
const outPath = process.argv[3] || path.join(turnDir, 'contact-sheet.jpg');
const turnId = path.basename(turnDir);

// Columns come from whatever `before` actually shot, so a run with MINUTES
// overridden composites correctly instead of silently dropping frames.
const beforeDir = path.join(turnDir, 'before');
const afterDir = path.join(turnDir, 'after');
if (!fs.existsSync(beforeDir) && !fs.existsSync(afterDir)) {
  console.error(`No before/ or after/ in ${turnDir}`);
  process.exit(1);
}
const frames = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^t\d+m\.png$/.test(f)).sort()
    : [];

const cols = [...new Set([...frames(beforeDir), ...frames(afterDir)])].sort();
if (cols.length === 0) {
  console.error(`No tNNm.png frames found under ${turnDir}`);
  process.exit(1);
}

const label = (f) => {
  const m = f.match(/^t(\d+)m\.png$/);
  return m ? `${parseInt(m[1], 10)} min` : f;
};

const cell = (phase, f) => {
  const rel = `${phase}/${f}`;
  return fs.existsSync(path.join(turnDir, rel))
    ? `<img src="${rel}" alt="${phase} ${label(f)}">`
    : `<div class="missing">no frame</div>`;
};

const row = (phase, name) => `
      <div class="rowlabel">${name}</div>
      ${cols.map((f) => `<div class="cell">${cell(phase, f)}</div>`).join('')}`;

const stamp = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  /* Muted and quiet, so the frames carry the page — the project's own taste
     rule applied to its own instrumentation. */
  :root { --ink:#E4E7E3; --faint:#7E8A85; --ground:#121614; --line:#28312E; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--ground); color:var(--ink);
         font: 400 13px ui-monospace, "DejaVu Sans Mono", monospace; }
  .sheet { width:1800px; padding:22px 24px 24px; }
  header { display:flex; align-items:baseline; gap:14px; margin-bottom:16px; }
  h1 { margin:0; font-size:19px; font-weight:400; letter-spacing:.02em; }
  .meta { color:var(--faint); font-size:12px; }
  .grid { display:grid; grid-template-columns:74px repeat(${cols.length}, 1fr);
          gap:10px; align-items:center; }
  .colhead { color:var(--faint); font-size:12px; letter-spacing:.14em;
             text-transform:uppercase; text-align:center; padding-bottom:2px; }
  .rowlabel { color:var(--faint); font-size:12px; letter-spacing:.14em;
              text-transform:uppercase; text-align:right; padding-right:4px; }
  .cell { aspect-ratio:16/9; background:#0c100e; border:1px solid var(--line);
          overflow:hidden; display:flex; }
  .cell img { width:100%; height:100%; object-fit:cover; display:block; }
  .missing { margin:auto; color:var(--faint); font-size:12px; }
  footer { margin-top:14px; color:var(--faint); font-size:11px; line-height:1.6; }
</style>
<div class="sheet">
  <header>
    <h1>${turnId}</h1>
    <span class="meta">before / after &middot; same seed &middot; ${stamp}</span>
  </header>
  <div class="grid">
    <div></div>
    ${cols.map((f) => `<div class="colhead">${label(f)}</div>`).join('')}
    ${row('before', 'before')}
    ${row('after', 'after')}
  </div>
  <footer>
    Terrain is identical across a column: one fixed seed per turn, both phases.
    A difference is the change, not the dice. Civ history still diverges.
  </footer>
</div>`;

// Written next to the frames so relative <img src> resolves over file://.
// Embedding six PNGs as data URIs would mean a ~7MB document for no gain.
const tmpHtml = path.join(turnDir, '.contact-sheet.html');
fs.writeFileSync(tmpHtml, html);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await page.goto('file://' + path.resolve(tmpHtml));
  await page.waitForLoadState('networkidle');
  const sheet = page.locator('.sheet');
  await sheet.screenshot({ path: outPath, type: 'jpeg', quality: 82, scale: 'css' });
} finally {
  await browser.close();
  fs.rmSync(tmpHtml, { force: true });
}

const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`contact sheet: ${outPath} (${kb} KB, ${cols.length} marks)`);
