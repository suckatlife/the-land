# HANDOFF — the baton

Newest entry at the BOTTOM. Append, never rewrite history.
Protocol: `AUTO_LOOP.md`. Safety anchor: tag `known-good-2026-08-18`.

This file is **rotated**, not endless: when it passes roughly 600 lines the
entries older than the current week move to `docs/archive/handoff/`, unedited.
The archive is the record; this file is the working memory. Earlier turns —
including the Fable-run auto-loop, turns 00–08 — are in
[`docs/archive/handoff/2026-08-18-to-08-23.md`](docs/archive/handoff/2026-08-18-to-08-23.md).

## Template (copy this)

```
## Turn NN — <agent> — <date>

**Watched:** what the 1/5/10-minute frames actually showed. Name specifics.
**Chose:** the one thing, and which frame made you choose it.
**Did:** the change, in a few lines. Files touched.
**Verified:** gate result, plus anything you checked by eye.
**Could not verify:** be honest. Anything only a human at full resolution can judge.
**Spotted, not done:** things you noticed and deliberately left.
**Next:** what you'd look at, for the agent taking over.
```

---

## The world record, and a narrowed promise — claude — 2026-08-24

Implements Lawrence's decision on #25: **a shared world is a record, not a
seed.** `src/main.ts` only.

**The consequence of the decision, taken honestly.** A seed reproduces terrain
and the peoples who arise on it; it does **not** reproduce catastrophes, because
six renderer systems decide those with unseeded `Math.random()` and write to
`simWorld.tiles`. Rather than fix that, the share text now says so:
*"the same land, the same peoples. What befalls them is anyone's guess."*
That is the cheap path and, per the research, the better product — Eno's fixed
renderings of a generative work reached 17M streams against ~5,000 installs for
the generative app itself.

**The card was already designed and never built.** `.world-epitaph` has eight
CSS rules — `> p`, `h2`, `span`, an `.is-visible` transition — and **nothing in
`main.ts` ever created that element.** Those three slots map exactly onto
`ResolvedWorldEnding`'s `eyebrow`, `title` and `epitaph`, so this is finishing
something the stylesheet had been waiting for.

**Shown as act 4 opens**, so the record is read *over the world it describes*
rather than over the next one — which is what the ending plan specified ("hold
the aftermath, then the card, then black").

**Three facts, chosen for surprise rather than completeness:** how many peoples
there were, whether they left anything monumental, and whichever disaster
actually defined the world. A world with none says *"no great disaster"*, which
is a better line than a zero.

**A bug caught in my own first version:** the card reported "1,400 years",
invented from tick count — while the HUD had been showing a deep-time calendar
running from 9,970 BCE. It now calls `deepTimeYear()`, the same function driving
the clock, so the record cannot contradict what the viewer watched.

**Verified** headless: card appears at tick 25650 against a silence opening at
25634, becomes visible, exactly one instance, no duplicates across the turnover,
no page errors. Reads: *"The Hidden Wilds — The World Empire … The Future ·
2,100 CE · 21 peoples · nothing monumental · 7 eruptions."*

**Four bugs found in review, all in code written an hour earlier:**

- **`h.born` undercounts peoples by about half.** It increments only on
  `civ_born`, but `seedInitialCivs()` emits no event and breakaways and refuges
  emit their own kinds. The same seed reported **21 peoples** and actually had
  **43**. Now counted from `simWorld.civs.size` — nothing removes civs, so the
  map is every civilisation the world ever had.
- **A plague-only world claimed "no great disaster".** `plague` is a
  `CatastropheType` with no counter of its own, so it was missing from the
  candidate list while `history.catastrophes` was non-zero. Derived as the
  remainder of the four that do have counters.
- **The era line recreated the contradiction it was written to remove.**
  `deepTimeYear()` anchors to `dominantEra()`, so pairing it with
  `o.highestEra` — the furthest era *any* civ reached — could print
  *"The Future · 1,500 CE"*. Both fields now share one basis.
- **The share copy still overpromised.** "The same peoples" is false: unseeded
  plagues and terrain events remove owned tiles and alter settleable ground, so
  seeded expansion, deaths and births diverge downstream too. Narrowed again, to
  the land and the beginning only.

**Re-verified** on two seeds: 43 and 25 peoples matching `civs.size` exactly,
era and year agreeing (*"The Modern Age · 2,100 CE"*, *"The Age of Industry ·
1,900 CE"*), no page errors.

**And a fifth, which is the third appearance of one pattern:** state that
outlives `resetSimOnly()`. The record survived a sim reset, hung over the new
world, and its once-per-world guard then stopped that run showing its own. The
same shape hit `committedEnding`/`endingOmenSpoken` and `__forceEnding` earlier
this week. **`resetWorld()` and `resetSimOnly()` clear different sets of state,
and nothing enforces that they agree** — worth a shared reset helper before a
fourth instance.

**Two more, and the first has a better fix than it sounded.** The skip loop is
synchronous, so a skip crossing both the silence *and* `endTick` created the
record and destroyed it at the turnover without the browser ever painting — the
fast-forward path never showed an ending at all. **Skip now stops when act 4
opens**, which is also just the better behaviour: it takes you *to* the ending
rather than past it. Verified — a straight run of skips halts at tick 21699
against a silence at 21669 and a turnover at 22119, card visible.

The second was pre-existing and the record merely exposed it:
`resetSimOnly()` never reset `currentWorldHistory`, so a fresh world would have
claimed the previous run's wonders and disasters. Reset alongside the rest.

**Could not verify:** whether it is *good* — whether a card over a dead world
lands or intrudes on the silence. That is the preview's job. Also unexercised by
data: the plague branch, since neither test world was plague-dominant. And both
test seeds ended in `world_empire`, which may hint the ending scoring is biased —
noted, not investigated.

**Next:** a shareable record — a URL that shows someone the card without them
watching for ten minutes — which is the half of this that actually travels.

---

## The record travels — claude — 2026-08-24

Closes #30, the second half of #25's decision. New `public/w/index.html`, plus a
share affordance on the end-of-world card in `src/main.ts`.

**The record now leaves the screen it was watched on.** Before this, the share
button sent a *seed* — so a friend following the link got the same land and the
same beginning, and then had to watch **ten to seventeen minutes** to find out
why it was sent. The card now offers *"copy this world"*, producing a link that
carries the whole record.

**Carried in the link, not stored.** base64url of a small JSON object — a
world's obituary is a few hundred bytes, and the observed URL is **518
characters**. No storage, no accounts, no retention policy, nothing to expire,
and it works offline. `TextEncoder` rather than bare `btoa`, so world names
outside ASCII do not throw.

**A standalone page, not a mode of the app.** `/w/` is plain HTML sharing
`info.css` with About and Privacy, so it renders instantly without booting Pixi —
which is the point, since the reader has not chosen to watch anything yet.

**Honest about what a seed carries**, per #25: alongside *"Watch a world"* it
offers *"Visit this land"*, and says plainly that the seed gives the same land
and beginning but that *"what befalls it will not be this: no two viewings of a
world share their disasters."*

**Verified** end to end headless: card → copy → 518-character link → fresh page
rendering title, eyebrow, name, ending, epitaph, three facts as label/value
pairs, and both CTAs. A malformed `?r=` falls back to *"This link has no world in
it"* rather than a blank page. No page errors. One cosmetic bug caught and fixed:
the button ran inline with the facts line (*"5 eruptionscopy this world"*)
because the detail above it is a `span`.

**Known gap, deliberate and documented in the page itself:** the social preview
is generic. Per-world OG meta needs server-rendered tags, and this is a static
site — that would be the project's first backend, a bigger decision than this
change should make. It is the remaining piece of "worth sending".

**A process note worth keeping:** the branch-guard earned itself here. The
command that was meant to create `claude/record-travels` was rejected for an
unrelated reason, so the whole feature was written on `main` — and the
`test "$(git rev-parse --abbrev-ref HEAD)" = ...` check refused to commit before
anything reached it.

**Two from review, and the first made a claim of mine true that had been false.**
I wrote that the record page "works offline". It did not: the service worker had
no `/w/` in `CORE`, and its cache key was the full request — so every record is a
different URL, one cache entry per world, matching none of them next time. An
offline `/w/?r=…` fell through to the cached `/` and silently booted the
simulation instead. Now `/w/` is precached, document routes are keyed by
**pathname** rather than request, and a `/w/` navigation falls back to the `/w/`
document. `CACHE` bumped to `v2`, or installed clients would keep the old shell.

**Verified properly this time:** registered the worker by hand (the page only
registers over `https:`, so a local preview never installs it), went offline, and
opened a record link **never visited before** — it rendered the full record with
no network. Previously this silently showed the simulation.

Second: native share never touches the clipboard, but the button said *"copied"*
regardless — sending the viewer to paste something that was not there. It now
says *"shared"* for the native path.

**Two more, both fair.** The record was up for only **3.75 real seconds at 4x
and 1.875 at 8x** — act 4 is 15 *world*-seconds and `timeScale` compresses it, so
the share button was barely reachable for anyone accelerating. The speed control
now returns to **1x when act 4 opens**: the world is over, there is nothing left
to accelerate through, and it matches skip, which already stops there. That
required extracting `setTimeScale()`, since the click handler set the value, the
label, the active class and the glitter mode inline — anything else changing
speed would have left the button reading 8x.

And the payload omitted the dateline the on-screen card shows, so a recipient
got a strictly smaller card than the sender saw. *"Carries the whole record"* was
overstated; it now carries `a` and `y`, and `/w/` renders them.

**Verified:** 8x before the ending, **1x at it** with the label in sync; shared
page shows *"The Future · 2,100 CE"*.

**An observation, not investigated:** every test world across this PR and the
last ended in `world_empire` — five seeds in a row. That may be a scoring bias in
`resolveWorldEnding`. Filed separately.

**Could not verify:** whether anyone wants to send one.

---

## The ending was decided by an unbounded counter — claude — 2026-08-24

Closes #32. `src/endings.ts`, plus one debug handle in `src/main.ts`.

**Measured first.** A 30-seed headless sweep: **30 of 30 worlds ended
`world_empire`**, across all six world forms. Seven endings, seven epitaph
variants, and the record card's whole premise, resting on an outcome that never
varied.

**The cause was structural, not a bad coefficient.** The scoring table mixed
bounded *shares* — fractions of the map, 0–1, worth ~2 points after weighting —
with *counts* that accumulate over a 10–17 minute world. Measured:

| counter | observed range | old term |
| --- | --- | --- |
| conquests | 5,000–17,240 | ×0.025 → **up to 431** |
| volcanoes | 1–8 | ×1.7 → up to 13.6 |
| died | 18–37 | ×0.12 |

Counts always won, so the ending was decided by whichever counter grew fastest
rather than by what the world became. The clearest evidence: one world had
`living = 0` and `dominantShare = 0` — everybody dead, nobody dominant — and
still scored **252** for *"one banner reached every shore."*

**Capping one term does not fix it.** I capped conquests and the landslide simply
moved: `world_empire` 30/30 → **`ash` 27/30**, now riding volcanoes. Every count
is now saturated against a ceiling before its weight applies.

**Two other fixes:**
- `world_empire` is disqualified outright when `living === 0`.
- **Three endings were unreachable, and that was my regression.**
  `SHIPPED_APOCALYPSES` from #14 gated *titles* on their cause having a staged
  act 3, so `drowned`, `long_winter` and `ash` became impossible — a world that
  flooded could never be called The Drowned World. A cause still needs its
  sequence; a title does not.

**Result, 36 seeds:** garden 50% · world_empire 19% · exodus 19% ·
long_winter 8% · ash 3% · 0 errors. From one ending to five.

`drowned` and `rewilded` did not appear in this sample and remain rare **by
construction** — `rewilded` needs total extinction (it did win, at 6.5, in a
measured world with `living = 0`), `drowned` needs three or more floods on a
water-heavy map. That is defensible; whether garden at 50% is, is a taste call.

**`scoreEndings` and `measure` are now exported**, with an `__endingScores()`
handle returning all seven raw scores. Reading the winner alone could never have
diagnosed this; the margins were the whole story.

**A process failure worth recording, because it is the third instance.** A Python
edit's `assert` failed — its search text did not include comment lines my own
previous edit had inserted — and because the shell chained with `;` rather than
`&&`, the build and a 30-seed sweep ran on unchanged code. I then reported the
identical result as "the fix didn't work" rather than "the fix isn't there". Now:
anchor substitutions one line at a time, `grep` the **source** to confirm before
building, and chain with `&&`. Note the bundle is minified, so grepping `dist`
for an identifier proves nothing.

**Spotted, not done:** **no world has ever built a wonder.** `wonders = 0` in
every instrumented world, which is why every record card reads *"nothing
monumental"*. The gate needs `stable` **and** ≥160 tiles **and** `fortune > 0.12`
**and** a 0.00015/tick roll to coincide. Filed separately.

**Could not verify:** whether the resulting distribution *feels* right. Only
watching does that.

---

## README brought up to date — claude — 2026-08-24

Docs only, on the repository's public face, which was stale in five ways.

The live link pointed at a dead vercel subdomain rather than `theland.world`. It
listed three speeds when `SPEEDS` is `[1, 2, 4, 8]`. It documented a **"Toggle
ambient sound"** control that does not exist — there are eight buttons and none
is audio. It described sharing as sending "the current seed as a stable URL",
which is neither what the button does nor what a seed means since #25. And its
opening sentence was the tricolon of near-synonyms the copy pass had already
removed from the About page, so the two disagreed.

Adds what nothing outside `docs/plans/` said: that a seed reproduces **the same
land and the same beginning, not the same history**, and that a world leaves a
record which can be sent as a link.

**Corrected in review:** I wrote "eight controls, none of which change what
happens in the world". That is false — *revisit* and *new world* both call
`resetWorld()` and replace the simulation outright, the latter replacing the land
too. Narrowed to what is actually true: none of them **directs** what
civilisations do. The same over-absolute claim had already needed narrowing in
`landscape.md` for the speed control, which is a hint the phrase is just wrong
rather than imprecise.

**And a second correction:** I wrote that "catastrophes are decided outside the
seeded stream". Only half of them are. `sim.ts` seeds its own pressure-driven
catastrophes from the world seed and replays them; it is the **renderer's**
ambient layer — wildfires, plagues, river floods, droughts, eruptions — that is
unseeded. I had documented that exact distinction in `landscape.md` §8 and then
flattened it into a blanket claim two days later.

**Verified:** every claim checked against source — `SPEEDS`, the eight
`data-control` attributes, the absence of any audio control, and the share
handler.

---

## The wonder gate, measured and opened — claude — 2026-08-24

Issue #35: no instrumented world had ever built a wonder. The issue asked for
measurement before tuning, and guessed the binding condition was
`wonderChance` or `wonderMinSize`. **It was neither — it was the fortune bar.**

`scripts/wonder_gate.ts` (new; runs the sim headlessly in Node via rolldown,
replicating `generateWorldTerrain`'s land-target nudge) instrumented each gate
condition independently across 20 seeds. Codex's reviews caught the first
version simulating 30000-tick lives with no natural wonders in play, and then
the over-corrected ending cut; the harness now mirrors production —
`worldFateForSeed` lifespans (58–97% of the cycle), seed-placed natural
wonders and volcanoes fed back through `setWonderSites`/`setVolcanoes`, and
ordinary life counted through the omen and onset acts (the wonder gate has no
`!world.ending` guard), excluding only the unmaking and silence. At that
fidelity, ~3.4M civ-ticks:

- `stable`: ~41–49% of civ-ticks depending on window. Not binding.
- `size >= 160`: healthy everywhere — every form's top civs clear it
  (archipelago's largest run 480–870 tiles). Not binding.
- `fortune > 0.12`: **~0.1%**. The fortune walk (step ±0.008, revert 0.005)
  has stationary σ ≈ 0.046, so 0.12 is a 2.6σ ask that must coincide with the
  other three conditions. The full gate opened ~176 ticks/world. Realized:
  **1 wonder across 20 production-fidelity worlds.** "No world has ever
  built one" was the expected outcome, not bad luck.

**Fix: `wonderMinFortune` 0.12 → 0.05** (~1.1σ, the top ~14% of a civ's
luck). Chance and size untouched, per the issue's warning not to make wonders
routine. The same 20 seeds at 0.05, final window: **20 wonders — 8 worlds
none, 7 one, 2 two, 3 three.** (0.06 gave 15 with 11 worlds empty — a shade
too scarce for the record card; 0.04 tipped toward routine.)

Also verified the never-exercised downstream path by reading it end to end:
narration (`WONDER_TITLES` covers all six eras), ping, `drawWonders` build
animation and dead-civ ruin state, and `endings.ts` history count all hang off
`wonder_built`/`civ.wonder` correctly.

**Spotted, not done:** the rally gate has the same shape of miscalibration —
`rallyMinFortune: 0.1` is ~2.2σ (~1.3% of ticks) and its comment claims
"~1 in 10 declines" while the numbers give more like 1 in 100. Not measured
end-to-end; worth the same harness treatment.

**Could not verify:** how a wonder *looks* rising in a live world — the code
path runs, the visual call is a human's.

---

## The baton got too heavy to carry — claude — 2026-08-26

Housekeeping, no sim change. `HANDOFF.md` had reached **2197 lines** and had
become the thing it was meant to prevent: nobody reads a 2200-line file, so
"skim the rest so you don't redo something already tried" quietly stopped
happening.

**Rotated.** Everything before 2026-08-24 — 26 entries, turns 00–08 of the
Fable-run auto-loop plus the issue-driven work that followed — moved verbatim
to `docs/archive/handoff/2026-08-18-to-08-23.md`. Not edited, not summarised,
not reordered. `HANDOFF.md` is 355 lines and holds the current week. The header
now states the rule (rotate past ~600 lines) so the next agent rotates instead
of appending forever, and `AUTO_LOOP.md` step 2 points at the archive so
"is this new?" stays a greppable question.

**And stopped the recurring conflict.** Every merge into a branch that had
appended an entry conflicted in this file — PR #38's only conflict with `main`
was exactly this, and the resolution is always the same: keep both entries. A
`.gitattributes` line makes git do it:

```
HANDOFF.md merge=union
```

An append-only log is the textbook case for a union merge — two branches adding
different entries at the end is not a disagreement, it is two entries.

**Verified:** `npm run build` passes. Line accounting checked rather than
assumed — the 2176 entry lines of the original are 1845 in the archive plus 328
kept, with only the one `---` separator at the seam dropped. Entry headings:
26 archived + 5 kept = 31, matching the 31 real entries (33 headings less the
two template headings).

**Spotted, not done:** this repo has no `.gitattributes` normalisation, and the
CRLF-vs-LF trap has cost three separate debugging sessions (`src/biomes.ts` is
CRLF on `main` while its neighbours are LF). `* text=auto eol=lf` is the fix,
but it renormalises tracked files and belongs in its own PR where the diff can
be read, not bundled into a docs rotation.

---

## The rally gate, measured and opened — claude — 2026-08-26

The same miscalibration as the wonder gate (#35), spotted in that entry's
"spotted, not done" and left unmeasured. Measured now.

**The comment was wrong by 60x.** `rallyChance: 0.0002, rallyMinFortune: 0.1`
carries the note *"keep rare (~1 in 10 declines)"*. Across **20 worlds at
production fidelity** (`scripts/rally_gate.ts`, new — natural-wonder pull and
volcanoes wired as `main.ts` wires them, real seed-rolled lifespans, stopping
at the tick production commits the ending because `world.ending` blocks
rallies outright):

```
604 declines, 1 rally  ->  1 in 604
```

**Where the boundary goes, and why it matters** — a Codex finding on the PR,
confirmed against the source. The first cut of this harness stopped at
`endTick - 1500` (the unmaking plus silence), copying `wonder_gate.ts`. That is
the wrong line for a rally. `endingCheckpoints()` calls `commitEnding()` at
`omen - 300` = **`endTick - 3360`**, and `commitEnding()` ends by calling
`beginEnding()`, which sets `world.ending` there and then — so the harness was
measuring **1,860 ticks per world in which the app can never rally**. Corrected
to derive the cut from `ENDING_ACTS` rather than hardcode it.

The distinction is specific: `wonder_gate.ts` is *not* wrong in the same way,
because the wonder gate has no `world.ending` check and a stable civ really can
raise a monument through the omen and onset. Only the gates that test
`world.ending` — the rally and the refuge — were biased.

**The bar was binding, not the roll.** Fortune is a mean-reverting walk with
stationary sigma ~= 0.046, so 0.1 is a 2.2-sigma ask — open on only **1.1-2.1%**
of a decline's ticks (consistent across all four shards). The harness counts,
per decline episode, the ticks spent above each candidate bar, then reports
expected rallies per decline as `1 - (1-chance)^openTicks`. That table is the
calibration, and it says the roll was never the problem: even at `chance` 25x
higher, a 0.1 bar still gives 1 in 15.

**Moved one bar and one roll.** `rallyMinFortune` 0.1 -> **0.05** (~1.1 sigma,
~14% of ticks — the same bar a golden age asks, since #36 set
`wonderMinFortune` there for the same reason), `rallyChance` 0.0002 ->
**0.0005**. Predicted 1 in 11.

**Verified** by re-running the same 20 worlds with the new constants, on the
corrected boundary:

```
1 in 6, 1 in 9, 1 in 16, 1 in 17   (per 5-world shard)
581 declines, 57 rallies           ->  1 in 10 overall
```

which is exactly what the comment always claimed. About 3 rallies per world
now, against 0.05 before — so "the viewer should never be certain a decline is
fatal" becomes true rather than aspirational.

**Could not verify:** whether a rally *reads* when it happens — whether the
recovery is legible as a civ pulling out of a dive or just as a colour holding
steady. That is a human's call at full resolution, and it is now actually
observable often enough to make it.

**Spotted, not done:** the denominator is slightly loose. `civ_declining` fires
again when a civ that already rallied re-enters decline, but only the first
decline is eligible (`!civ.hasRallied`), so the observed "1 in N" is a mild
undercount of the true per-eligible-decline rate. The expected-value table uses
eligible episodes and is exact; the two agree closely, which is why this was
left rather than fixed.

---

## A last flight finally makes landfall as a refuge — claude — 2026-08-26

Issue #37: across 24 instrumented worlds, `last_flight` had fired 32 times and
`refuge_founded` zero. The issue named four gating conditions and guessed the
**parent-death race** bound. Measured (`scripts/refuge_race.ts`, new, 18-24
worlds at production fidelity, tracking every desperate voyage by object
identity from launch to whatever ended it):

```
34 last flights:  0 refuge  |  8 colony  |  26 lost
lost, by cause:   nowhere 16 (62%, median age 6)   edge 6   drowned 4   aged 0
```

**The guess was wrong, and the real answer was a bug.** 57% of last flights
died in a branch nobody had named: a voyage that reaches land where every
landing candidate is water, rock, or already someone's falls through to
`continue` and is *deleted*. Median age at death: **six ticks**. At
`expeditionSpeed: 0.11` a ship needs ~9 ticks to cross one tile, so `age > 5`
starts testing for landfall while the boat is still over its own harbour. Most
last flights never went to sea at all.

Fixed by having the voyage sail on when it finds nothing settleable — but
**only until it has actually reached open water**. Codex caught the first cut
of this: with a fixed heading, a ship that crossed the sea and met an occupied
shore would keep going, track visibly across the continent, and could settle
the far coast. An `atSea` flag confines the fix to its actual case — a ship
still clearing its own harbour. Once it is at sea the old behaviour stands.
`world.ending` also keeps its old behaviour, so no new boat can appear during
the unmaking.

That fix alone produced **zero** refuges.

**Because the race was real too, just not binding.** All 8 landfalls happened
while the parent still lived, by a median of **1059 ticks**. The issue
suggested launching the flight *earlier*; the measurement says the opposite —
it must launch **later**, so the homeland dies during the voyage.

Strength is useless as the trigger, which is worth writing down: death is
scheduled by `phaseAge > phaseDuration` and nothing else, so measured remaining
life barely moves across strength bands (median 918 ticks below 0.05, 684 below
0.3, non-monotonic across ~110k samples). **Decline progress is the only real
predictor.** So `lastFlightMinDecline` gates the launch on
`phaseAge / phaseDuration`, with `lastFlightChance` raised 10x because the
window it rolls against is a tenth as long.

**And one thing the review did not raise.** The harbour branch kills *ordinary*
colonising expeditions too, and the first fix freed them all. Measured: **88.1
ordinary colonies per world against main's 71.5** — a 23% busier world, to fix
a beat that fires in one world in three. Against a brief that says a change
making the world busier is probably the wrong change, that is not a side
effect to ship quietly. Scoped to desperate voyages only: **70.0 per world**,
unchanged from main within noise.

Scoping made the fix work *better*, not worse — ordinary expeditions no longer
take the coastal land first, so the desperate ones find somewhere to land:

```
                  flights  refuges  worlds with >=1  ordinary colonies/world
main                  34        0        0 / 24               71.5
fix, unscoped         28        6        5 / 24               88.1
fix, scoped           24       10        7 / 24               70.0
```

**Then the sample doubled, and the headline halved.** Those are 24 worlds. Run
on a fresh 24 (seeds 24-47) the same build gives **4 refuges in 29 flights —
14%, not 42%**. The first sample was lucky. Pooled over all 48 worlds, against
`main` measured on the same 48:

```
                  worlds  flights  refuges  worlds with >=1  ordinary colonies/world
main                  48       57        0        0                60.4
gate 0.95, scoped     48       53       14 (26%) 11                60.7
```

**A refuge in about one world in four**, and colonisation genuinely untouched —
60.4 to 60.7, which is the number the scoping was for. This is the figure to
quote; the 42% was a small sample flattering itself, and it would have gone
into the source comment unchallenged if the out-of-sample run had been skipped.

The gate itself was swept at 24 worlds per point — 0.85: 6/30 (20%), 0.90:
3/29 (10%), 0.95: 10/24 (42%), 0.98: 11/30 (37%) — and **that is a floor, not
a curve.** ~25 flights per point cannot separate 20% from 42%; the 0.90 dip is
noise, not a trough. The sweep establishes the one claim that matters — `main`
is 0 in 34, and anything above 0.85 is reliably not zero — and nothing finer.
Said plainly in the source comment rather than dressed up as calibration.

**0.95 is therefore a taste call, not an arithmetic one.** It goes there
because the race should stay a race: at 0.95 the voyages that just miss, miss
by **13-43 ticks**. At 0.98 the flight leaves ~28 ticks before the homeland
falls, and arriving too late stops being possible, which trades a tense beat
for a routine one. That is the kind of judgement that should be made watching,
not reading, and it is one constant to move.

**Where the measurement boundary goes.** Codex's other finding, and it changed
the answer rather than just the decimals. The first cut of this harness stopped
at `endTick - 1500`, copying `wonder_gate.ts`. Wrong line: `endingCheckpoints()`
commits at `omen - 300` = **`endTick - 3360`**, and `commitEnding()` calls
`beginEnding()`, which sets `world.ending` — and the refuge path reads
`if (world.ending) break`. So the harness was admitting **1,860 ticks per world
of last flights the app can never launch**, precisely inside the late-life
window being calibrated. Corrected to derive the cut from `ENDING_ACTS`.

Between that and the `atSea` restriction, the shipped constant moved from 0.90
to 0.95 — which is the whole argument for re-measuring after a review rather
than patching the code and keeping the old table.

`wonder_gate.ts` is deliberately left alone: the wonder gate has no
`world.ending` check, so a stable civ really can raise a monument through the
omen and onset, and its 1,500-tick cut is right for what it measures.

**Could not verify:** whether a refuge *reads* — whether "a dead nation's name
on a far shore" lands as that, or just as another civ appearing. The narration
and the `refugee` founding story already exist; nobody has ever seen them fire,
so this is the first chance to judge them.

**Spotted, not done:** `edge` is now the second-largest sink (21% of lost
voyages) — expeditions that sail off the grid and vanish. On a world drawn as a
planet's limb, a ship leaving the map is arguably fine, but it was never a
decision, just a bounds check. Worth a look before anyone tunes voyage length
again.
## Civilisation archetypes: geography as culture, one level down — claude — 2026-08-24

Issue #27, the top-ranked build from the landscape analysis. A `Civ` now
carries an **archetype** — maritime, highland, sylvan or plains — read
deterministically from the terrain within radius 4 of its founding site
(`archetypeFor`, sim.ts), and one **earned trait** — survivor, refugee or
iceborn — taken from the first great thing it lives through. No random draw
for either: the archetype is the terrain's consequence, the trait is history's.

**Behaviour, measured.** `ARCHETYPE_CIV` bends the same four levers
`FORM_CIV` already bends, composed by multiplication at the same call sites
(spread, expedition launch, ambition at all three civ-creation sites, and
conquest as *defensibility* — the defender's ground raises the attacker's
bar). `scripts/archetype_census.ts` (new) runs 12 worlds headlessly and
censuses the result. Final: maritime 26% of civs / highland 6% / sylvan 20% /
plains 48%; water-crossings per civ 2.36 / 0.65 / 1.49 / 1.45; peak size 288 /
475 / 544 / 503. A viewer can infer the archetype from conduct: the sea
people sail, the high people hold, the plains people sprawl.

**Three calibration bugs the census caught before review:**
1. First maritime threshold (water ≥ 0.25) captured **75% of all civs** — the
   median founding site on a 96×96 island already has 39% water in radius 4.
   Thresholds are now set from measured founding-site quantiles (0.55 water /
   0.10 rock / 0.18 forest).
2. First expedition multipliers let plains match maritime boat for boat
   (bigger civs clear `expeditionMinSize` more often). The gap was widened
   until the census separated.
3. The iceborn trait as first designed — awarded at `ice_retreat` to civs
   born before the advance — **could never fire**: retreat happens at ~90% of
   the reference cycle but worlds die at 58–97% minus the ending, and no civ
   spans the whole glaciation anyway (0 candidates in 12 worlds). The #35
   dead-content trap, caught by the same instrument. It is now awarded at
   `ice_peak` to living civs whose birthplace lies under the sheet
   (`iceDepthAt > 0.15`): the glacier reached them and they did not move.
   Fires for ~3% of civs.

**Spotted, filed as #37:** `refuge_founded` — the beat this work wanted for
the refugee trait — fired **zero times in 24 instrumented worlds** against 21
last flights. The trait wiring stays (it costs nothing and fires the moment
the pathway does); the pathway is its own measured fix.

**The visible half.** Settlement *shape* is the exaggerated feature
(`ARCH_SHAPE`, main.ts): highland builds tight and steep — 0.72× density
radius, harder falloff edge, +1 storey inside the era's range; plains sprawls
low and wide — 1.25× radius, softer edge, −1 storey; maritime and sylvan sit
between. Roof language is the quiet second read (`ARCH_ROOFS`): each
archetype draws from a fixed pair per roof pool instead of the whole set.
One birth-narration line per archetype names the people in the terrain's own
terms. Era treatment (lights, skylines, saturation) is untouched and
composes on top.

**Verified:** `scripts/archetype_smoke.mjs` (new) drives the real app —
doorway dismissed, 15k ticks skipped: every civ carries an archetype, traits
appear, zero page errors. FPS 2.3 vs 2.7 on main under SwiftShader — noise,
not a regression signal, but this rig software-renders; a real-GPU check is
worth a glance.

**Could not verify:** whether the shapes and roofs *read* — whether a
highland citadel and a plains sprawl are distinguishable at arm's length, and
whether the roof pairings are the right frames. `ARCH_SHAPE` and `ARCH_ROOFS`
are deliberately small tables for exactly that correction.

**Census fidelity, after review — claude — 2026-08-26.** Two Codex P2 findings,
both saying the census was not measuring the world it claimed to. It began the
ending with an empty fade map, but `step()` uses that map to retire civs across
the 35-second unmaking — with an empty one every civ kept spreading and
conquering to the silence. And it left `volcanoes` and `wonderSites` empty,
where production fills both: wonder pull moves where civs found (which is what
`archetypeFor()` reads) and standing volcanoes award the survivor trait (which
is what the trait census counts). `buildFadeSchedule()` moved from `main.ts`
into `endings.ts` — parameterised on world and `ticksPerSecond`, the same
treatment `endingActTicks()` got, so a harness can reproduce the ending without
duplicating the math.

**Then a third finding, and this one was mine.** Fixing "empty fade map" by
always building one overcorrected: `main.ts` stages act 3 for **`rewilded`
only** and passes an empty map for every other ending, so scheduling deaths
unconditionally forced all 12 census worlds through rewilding behaviour — the
round-one bug in reverse. Now gated on the resolved ending exactly as
`commitEnding()` does, which means the census also has to accumulate a real
`WorldHistory` (`createWorldHistory` / `rememberWorldEvents`), because
`commitEndingKind()` reads one.

**The calibration survives all three.** Re-run at 12 seeds, 385 civs:

```
maritime  19.0%  colonies/civ 2.88  avg peak 236
highland   8.8%  colonies/civ 0.76  avg peak 668
sylvan    21.0%  colonies/civ 1.48  avg peak 578
plains    51.2%  colonies/civ 1.23  avg peak 421
survivor 16.4%   iceborn 2.6%   refugee 0.0%
```

All four archetypes occur, and they diverge in the direction the multipliers
claim: a maritime civ founds **3.8x** the colonies a highland one does, while a
highland civ reaches **2.8x** its peak extent. Geography as culture, in numbers.

Worth noting the numbers moved between rounds — sylvan's colonies/civ went
2.27 to 1.48 once the fade schedule stopped applying to every ending. The
conclusion held, but it was not guaranteed to, which is the argument for
re-running rather than assuming a fidelity fix is cosmetic.

`refugee` is 0.0% because `refuge_founded` never fires — 12 last flights, zero
refuges, which is issue #37 exactly. That trait becomes reachable when #47
lands; nothing here needs to change for it.

## The six frames stop being thrown away — claude — 2026-08-27

Not a world turn. Tooling, done in a coordination session at Lawrence's request,
recorded here because part of it changed the standing contract.

**Chose:** `turn.sh` shot the world at 1, 5 and 10 minutes in both phases and
then gitignored all six frames, so the strongest evidence this project produces
died on whatever machine made it. A Vercel preview answers "what does it look
like" and never "what changed"; the before/after pair is the only artefact that
does.

**Did:** `scripts/loop/contact_sheet.mjs` composites the six frames into one
labelled 2x3 grid, before directly above after at each minute mark. `turn.sh`
writes it to `docs/turns/<turn-id>.jpg` on the `after` phase — 176 KB against
5.4 MB for the raw PNGs, which stay in gitignored `runs/`. No new dependency:
Playwright was already here for `observe.mjs`, and there is no ImageMagick and
no sudo to install one.

**Contract change, and the rule it broke:** step 5 of `AUTO_LOOP.md` now tells
the agent to commit the sheet and embed it in the PR body. That file says
neither agent may edit it, and `scripts/loop/prompt-auto.txt` forbids it a
second time, independently — a prohibition I did not know about until Codex
found it on #49. Lawrence asked for the rule directly and merged it as its own
commit, so the authorisation is real, but the contract's own process — propose
in `HANDOFF.md`, leave it to the human — was skipped. This entry is that step,
recorded late. `prompt-auto.txt` is unchanged and still correct: the automated
agent must not edit `AUTO_LOOP.md`.

**Verified:** run against `runs/05-claude`, 176 KB, 3 marks. Terrain identical
down every column, which is the fixed-seed guarantee holding. The 5-minute
column goes dusk-red before and clear after — exactly the class of change a diff
cannot show.

**Could not verify:** nothing at city or unit scale. That remains structural.

**Fixed since, from Codex on #49:** compositing was non-fatal and left any
earlier sheet in place, so `finalize_turn` could `git add -A` and push the
previous attempt's image as this turn's evidence. `turn.sh` now clears the sheet
before compositing, and `finalize_turn` validates it alongside the raw frames.

**Next:** the sheet is only produced when a `before` exists. A turn that only
ever runs `after` gets no evidence and now fails to finalize, which is the right
direction but has not been exercised.
