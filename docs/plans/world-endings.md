# Plan — apocalypses that actually end a world

**Status:** proposal, for review. Nothing here is built.
**Scope:** how a world's life ends and the next begins. No new civ mechanics.

---

## 1. The problem, measured

The whole ending is five lines (`src/main.ts:6993`):

```ts
function beginWorldEnding() {
  const outcome = resolveWorldEnding(...);   // classify, retrospectively
  accumulator = 0;
  resetWorld(randomSeed(), outcome.kind, outcome);   // the world is replaced
  blackout = 1; blackoutHold = BLACKOUT_HOLD;        // 0.7s black, 1.8s fade
}
```

So at `tick >= endTick` the world is **swapped instantly**, and the viewer gets
**2.5 seconds** of black. Three consequences:

- **The world never dies — it is replaced.** No tile changes state, no civ
  falls, nothing is unmade. The land, which this project calls the
  protagonist, is not involved in its own ending.
- **`WORLD_ENDINGS` is a caption, not an event.** All seven kinds are chosen
  *after the fact* by `resolveWorldEnding()` scoring accumulated history. A
  world that never flooded can be titled *The Drowned World* — the score is a
  thumb on the scale, not a record of anything the viewer watched.
- **There is no approach.** `BLIGHT` ramps on `cycleFrac` and is the only
  signal that the end is near. It is a desaturation, easy to miss.

**What "much larger than an in-cycle disaster" has to mean.** The map is
96×96 = 9,216 tiles. Current catastrophe radii (`SIM`, `sim.ts:358-380`):

| event | radius | ≈ tiles | ≈ share of map |
| --- | --- | --- | --- |
| minor/moderate | 18 | 1,000 | 11% |
| flood | 22 | 1,500 | 16% |
| earthquake | 26 | 2,100 | 23% |
| severe (asteroid/plague/volcano) | 32 | 3,200 | 35% |

A bigger circle is not the answer: `severeRadius` already covers a third of the
world and reads as a regional disaster. **An apocalypse has to differ in kind —
global by construction, and slow enough to watch.**

---

## 2. The central tension, stated honestly

`CLAUDE.md`: *"If a change makes the world louder, busier or more saturated, it
is probably the wrong change. Quiet wins."* An apocalypse is loud. The two
acceptance tests in `docs/archive/BRIEF.md` are the calm test and the
point-at-the-damage test.

**Proposed resolution: scale and duration, not saturation and speed.** Deep
time's apocalypse is a minute of inevitability, not a three-second explosion.
The frame should get *emptier and stranger*, not brighter and busier. A meteor
is one slow light and then a long grey year — not a fireball.

This is the thing most worth arguing with in review.

---

## 3. Constraints a proposal must not break

- **Determinism.** `sim.ts` draws from a seeded stream (Turn 08). Any
  `Math.random()` in the sim silently breaks shared-world links.
- **No Pixi in `sim.ts`.** The sim owns *what* is destroyed; the renderer owns
  what it looks like.
- **30 ticks/sec floor**, and the frame is **fill-bound, not object-bound**.
  The late-era frame is already the most expensive in the world's life, and it
  carries two fullscreen screen-blend layers whose cost has never been
  measured. The ending lands exactly there.
- **No per-tile rewrite of the whole map.** Sea-level epochs were parked twice
  for precisely this (biome texture cache thrash). Whatever the Deluge does, it
  cannot reclassify 9,216 tiles.
- **Everything runs on `worldClock`**, so pause and the speed control move the
  apocalypse too.

---

## 4. Three architectures

**A. Renderer-only finale.** A scripted spectacle in `main.ts`; the sim is
untouched and still swaps at `endTick`.
*For:* zero determinism risk, no sim changes, fastest to ship.
*Against:* the land does not actually change, so the ending is a cutscene
played over a world that is fine. Fails the project's own thesis, and a viewer
can tell — the roads and cities are still there under the fire.

**B. Sim-driven cataclysm.** The sim gains an apocalypse phase that really
unmakes tiles and kills civs; the renderer reacts to the events it already
consumes.
*For:* the land is the protagonist; the aftermath is real and inspectable.
*Against:* the most sim risk, and the destruction has to stay inside the cache
and frame budget.

**C. Hybrid — recommended.** The sim owns a small amount of *truth*: an
`apocalypse` phase with a kind, a `0→1` progress scalar, and a front (a line, a
radius, or a level). Tile destruction happens through the **existing**
catastrophe path, just aimed globally and repeatedly. The renderer stages the
spectacle from the events it already receives.
*Why:* it reuses `catastrophe` events, omens, `spared` narration and the
`fadedDeadCivs` repaint rather than inventing a parallel system, and it keeps
the sim's new surface area to one enum plus one float.

---

## 5. The shape: four acts

Times are **world-seconds** (so they compress with the speed control).

| act | now | proposed | what happens |
| --- | --- | --- | --- |
| 1. Omen | — | ~40s | The world knows. Reuse the 3-stage omen machinery at world scale: sky lean, narration, animals/boats stop. `BLIGHT` already ramps here — fold it in rather than adding a second signal. |
| 2. Onset | — | ~12s | The event becomes visible and unmistakable. One arrival, not a barrage. |
| 3. The unmaking | — | ~35s | The land actually changes. Civs fall on-screen — see §5a, this does **not** happen for free. Loud by *extent*, not brightness. |
| 4. Silence | 2.5s | ~15s | **Hold the aftermath.** The most valuable second in the sequence is the one where nothing happens and the viewer looks at what is left. Then the card, then black. |

Total ~100 world-seconds against a world life of ~9.7–16.2 real minutes
(`endTick` is 58–97% of `worldCycleTicks` 30000 at 30 ticks/s) — roughly 10% of
a life spent ending. Act 4 is the cheapest and probably the highest-value part
of the whole proposal.

### 5a. Civs do not die just because you hit them — a correction from review

Reusing the catastrophe path cannot make act 3 lethal. Verified in source:

- `sim.ts:1853` — `civ.vitality = Math.max(0.05, civ.vitality - scaledHit)`.
  Every catastrophe clamps to a **0.05 vitality floor**, so no catastrophe can
  kill a civ, however severe.
- `sim.ts:977` — death only happens after a full `declining` phase, and
  `decliningDuration` is **1500 ticks** plus variation, i.e. ~50 world-seconds.
  That is longer than acts 3 and 4 combined.
- `sim.ts:1932` — a declining civ can **rally** out of it.

So a civ struck at the start of the unmaking is still alive, declining and
possibly recovering when the next world begins. The apocalypse needs its own
terminal path:

1. **Apocalypse hits ignore the vitality floor.** The 0.05 clamp exists so a
   regional disaster maims rather than erases; an apocalypse is the case it was
   written to exclude. Pass the floor as a parameter rather than adding a
   second code path.
2. **Suppress `rally` while the apocalypse runs.** Pulling out of it is a good
   story during a world's life and the wrong one during its end.
3. **A terminal transition, not a faster decline.** A civ reduced below a tile
   threshold by the apocalypse goes to `dead` directly, so the deaths land
   inside act 3 where they can be seen, instead of trickling through act 4.

**But the requirement is not "everything dies."** `drowned` reads *"the last
cities keep their lights above a rising sea"*; survivors on high ground are the
picture. The real requirement is: **whatever deaths the apocalypse causes must
complete before act 4, and survival must be a deliberate outcome of the
apocalypse's shape rather than an artifact of decline timing.** Each catalogue
entry below should state its intended survivor profile.

---

## 6. The catalogue

Six candidates. **Not** one per `WORLD_ENDINGS` kind — see §7.

**1. Impact — *The World of Ash***
One light grows over ~12s, arrives off-centre, then a ring of destruction walks
outward from the impact as repeated `asteroid` catastrophes along an expanding
front. Then the sky closes for the rest of the sequence.
*Reuses:* asteroid catastrophe, ash/soot atmosphere (industrial air is already
a warm ash tint), `spared` narration for the far side of the world.
*Distinct because:* it has a **point of origin** you can point at afterwards —
the strongest fit for the point-at-the-damage test.
*Cost:* low. *Risk:* the arrival is the one moment that wants to be bright;
keep it small and slow or it becomes a video game.

**2. The Deluge — *The Drowned World***
Sea level rises as a **shoreline wash layer that moves without touching cached
biome tiles** (the cheap approach STATE §6C identified for sea-level epochs).
Coastal tiles drown outward-in; civs lose their ports first, then their capitals.
*Reuses:* flood catastrophe, existing water rendering, `waterFraction` which
`resolveWorldEnding` already measures.
*Distinct because:* it is **directional and readable** — you watch the coastline
eat the map, and the last survivors are always on high ground.
*Cost:* medium — the wash layer is new. *Risk:* it must not become a blue slab;
same failure mode ice had.

**3. The Shaking — *global earthquake***
No single centre. Rifts open along fault lines across the whole map over ~30s;
structures fall in waves; the terraform queue widens chasms.
*Reuses:* earthquake catastrophe, the rift/terraform machinery.
*Distinct because:* it is the only one that is **everywhere at once**, and it
leaves permanent geometry — the scars are the story.
*Cost:* medium. *Risk:* screen shake is the obvious move and the wrong one —
motion sickness, and it is loud in exactly the banned way. Shake almost nothing.

**4. Supervolcano — *ashfall***
One caldera opens, then the world greys from that quarter outward as ash falls;
crops fail ahead of the front; the sun dims for the rest of the world's life.
*Reuses:* volcano catastrophe (which already has eruption FX), smog/pollution
tinting, blight.
*Distinct because:* the **kill is indirect** — the ash starves the world rather
than smashing it, so civs die of cold and hunger far from the volcano.
*Cost:* lowest of the four — most of this machinery exists.
*Risk:* overlaps visually with Impact's ash sky. They must not look the same;
the differentiator is the origin (a mountain, not the sky) and the pacing.

**5. The Long Winter — *ice closes***
Ice already exists and already drives `long_winter` scoring. The apocalypse
version: it never recedes, and it closes to the equator.
*Reuses:* nearly everything. *Cost:* lowest. *Risk:* least novel; it is an
existing system turned up. Include it because it is nearly free.

**6. Cascade / the quiet end** — a world that simply runs out. No event; the
last civs decline, the roads go to seed, and the lights go out one by one.
*Why include it:* if every world ends in spectacle, spectacle becomes wallpaper
and the calm test suffers. **The quiet ending is what makes the loud ones land.**

*It needs its own terminal schedule, for the same reason §5a does.* Ordinary
decline cannot deliver it: a `rising` or `stable` civ may not enter decline for
minutes, and `decliningDuration` then adds ~50 world-seconds, so act 4 would
begin with cities still lit — the one thing the quiet end promises not to do.
Proposal: at `commitTick` the quiet end takes a **fade schedule** — surviving
civs are ordered (smallest first, or furthest from the last capital) and given
death ticks spread across act 3, so the lights go out one by one and the last
goes out before the silence. Rallies suppressed for the same window. The quiet
end is *scheduled*, not merely *unforced* — otherwise it is indistinguishable
from the anticlimax we are trying to fix.

---

## 7. Not every ending should be an apocalypse

`WORLD_ENDINGS` has seven kinds and only three are disasters:

| kind | apocalypse? |
| --- | --- |
| `drowned` | yes — the Deluge |
| `ash` | yes — Impact or Supervolcano |
| `long_winter` | yes — the ice closes |
| `rewilded` | no — the land outlives its makers; that is act 3 of a quiet end |
| `world_empire` | no |
| `exodus` | no — the cities leave; that wants its own ending, not a disaster |
| `garden` | **emphatically no** — "an age learned how to remain" |

Making `garden` explode would be a bug, not a feature. The proposal is
**apocalypses for the three violent kinds, a real ending sequence for all
seven.** Acts 1 and 4 apply to every world; acts 2 and 3 are what differ.

---

## 8. Which apocalypse a world gets

Today `worldFateForSeed()` rolls `endTick` and an `affinity` from the seed, and
`resolveWorldEnding()` scores accumulated history with the affinity as a
+1.15 thumb.

The problem this creates for us: the ending kind is currently only known **at**
`endTick`, but act 1 has to start ~90 world-seconds *earlier*. So the choice
must be made in advance.

- **Option 1 — seed-rolled in advance.** Deterministic and simple, but a desert
  world can be told it will drown.
- **Option 2 — earned.** Run the existing scoring early, at ~85% of life, and
  commit to the winner. Coherent: a flooded world drowns, a volcanic one ashes.
  Costs one extra scoring pass; the scores can still shift after commitment,
  which we would have to accept and document.
- **Option 3 — recommended.** Commit at ~85% using the existing scores *with*
  the seed affinity as the same +1.15 thumb, then **lock the kind**.
  Determinism preserved, and the card at the end finally describes something
  the viewer watched.

Option 3 also fixes an existing defect for free: today the title can contradict
the world's history.

### 8a. Lock the kind, not the outcome — a correction from review

"Move the `resolveWorldEnding()` call earlier" is the wrong implementation of
option 3, and would introduce a bug. That function returns `epitaph`,
`highestEra`, `livingCivilizations` and `cities`, and `archiveCurrentWorld()`
persists `outcome.epitaph` and `outcome.highestEra` into the permanent archive
(`main.ts:6863`, `:6872`). Resolving at 85% would snapshot all of it **before
the apocalypse happens**, so the Chronicle would record a drowned world's flood
count from before the Deluge, and would miss every death the ending caused.

Split it in two:

- **`commitEndingKind(world, biomes, history, fate) -> WorldEndingKind`**,
  called at `commitTick` (§8b). Scoring only; this is what act 1 needs and the
  only thing locked. It takes `biomes` because the `drowned` score compares
  `waterFraction(biomes)` against `history.initialWaterFraction`, and
  `SimWorld` does not carry the biome map — omitting it would either lose
  post-creation flooding from the early classification or fork the scorer.
- **`resolveWorldEnding(..., committedKind)`** still runs at the true end, with
  the kind passed in rather than re-scored. Epitaph, era, survivor counts and
  the archive entry are all computed *after* the apocalypse, and therefore
  describe it.

The scoring is shared, so the two cannot disagree about what happened — only
about when it was decided.

### 8b. Derive the commit tick from the sequence, not from a life fraction

"~85% of life" does not survive contact with the short worlds.
`worldFateForSeed()` rolls `lifeFraction = 0.58 + u * 0.39`, so:

| world | endTick | life @30tps | 85% leaves | sequence needs |
| --- | --- | --- | --- | --- |
| shortest (0.58) | 17,400 | 580s | **87s** | **102s** |
| longest (0.97) | 29,100 | 970s | 145s | 102s |

For roughly the shortest quarter of rolls, act 1 would have to begin before the
kind was known, or the later acts would silently compress. A fixed fraction is
simply the wrong parameterisation: the sequence has a fixed *duration*, so the
commit has a fixed *offset*.

```
SEQUENCE_TICKS = (40 + 12 + 35 + 15) * ticksPerSecond   // 3,060
COMMIT_MARGIN  = 300                                    // ~10s of slack
commitTick     = endTick - SEQUENCE_TICKS - COMMIT_MARGIN
```

That is 80.7% of life for the shortest world and 88.5% for the longest, and it
is right for both. It also means changing an act's duration moves the commit
automatically instead of silently eating the margin. Worth a startup assertion
that `commitTick` lands comfortably after civilisations first appear.

---

## 9. Performance

The ending lands in the most expensive part of a world's life. Proposed budget:

- **At most one new fullscreen layer**, reusing the glaze/airlight/blackout
  stack rather than adding to it.
- **No whole-map biome reclassification.** The Deluge is a moving wash; the
  Shaking writes scars, not terrain.
- **Measure before/after** — FPS through act 3 against the 60s preceding it,
  via a debug handle in the `__clocks()` style. The two unmeasured screen-blend
  layers are a standing warning here.

---

## 10. Verification

Headless, since none of this can be judged by an agent's eye:

1. **Determinism** — same seed twice: same apocalypse kind, same commit tick,
   same tile-state counts at `endTick`. This is the test Turn 08 established.
2. **Extent** — assert each apocalypse changes a share of the map no in-cycle
   catastrophe can reach (>60% touched vs severe's 35%).
3. **Pacing** — assert the four acts fire in order with the intended
   world-second durations under pause and at 4x.
4. **Frame cost** — FPS through act 3 vs the preceding minute.
5. **Coherence** — the printed ending title matches the apocalypse that ran.
6. **Deaths land in act 3** — no civ killed by the apocalypse is still in
   `declining` when act 4 begins, and no `rally` fires during the sequence. For
   the quiet end, assert the last scheduled death precedes act 4.
7. **The shortest world still fits** — force `lifeFraction` to its 0.58 floor
   and assert all four acts run at full duration with `commitTick` before
   act 1 begins.
8. **The archive describes the ending** — the persisted epitaph and
   `highestEra` reflect post-apocalypse state, not the 85% snapshot. Assert the
   archived flood/death counts differ from their values at commitment.

What cannot be verified without a display: whether any of it is *beautiful*, and
whether act 3 crosses from awe into noise. That is a preview judgement.

---

## 11. Phasing

- **Phase 1 — the shape.** Acts 1 and 4 for *every* ending, plus the quiet end
  (§6.6). No new apocalypse at all. This alone converts a 2.5-second swap into
  a real ending, and it is the cheapest, least risky part.
- **Phase 2 — one apocalypse.** Supervolcano or Impact (most reuse), plus §8
  option 3 so the card matches.
- **Phase 3 — the rest.** Deluge and the Shaking, which need new rendering.

Phase 1 is worth shipping alone. If it lands well the rest is decoration on a
working structure; if it doesn't, we learn that before building four disasters.

---

## 12. Open questions for review

1. Is ~100 world-seconds of ending too much of a 10–16 minute life?
2. Is act 4 (hold the silence) the highest-value part, as claimed — or is
   holding a dead world for 15s just dead air?
3. Does §2's "slow and large, not fast and bright" actually reconcile the
   apocalypse with the calm test, or is it a rationalisation?
4. Is §8 option 3's early commitment worth the risk that the world changes
   character in its last 15%?
5. Should the quiet end be common (say 1 world in 3) or rare?
6. §5a lets the apocalypse ignore the 0.05 vitality floor. Is that the right
   lever, or should the floor stay absolute and the apocalypse kill only
   through a separate terminal transition?
7. Should any apocalypse ever leave **zero** survivors, or is a witness always
   part of the picture?
8. §8b sizes the sequence at 3,060 ticks. If review shortens act 1 the commit
   moves later and the world gets less warning — is 40s of omen the part to
   protect, or the part to cut?
