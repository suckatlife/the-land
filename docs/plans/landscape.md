# Plan — where The Land sits, and what to take from its neighbours

**Status:** draft, for review. Nothing built.
**Evidence:** **[V]** primary source read · **[E]** third-party estimate ·
**[R]** secondary/reported · **[I]** inference. Unmarked claims are about this
repository and were checked against the code.

**Origin:** the named-lives proposal (#22) reasoned from a single comparable,
and Lawrence's read was that a named person may not suit a passive screensaver.
That is #22's own first open question answered — and it exposed that we had been
reasoning from one neighbour. This widens the frame first.

---

## 1. What The Land actually is

| | |
| --- | --- |
| world | 96×96 isometric, seeded — **terrain and sim core are deterministic; complete runs are not** (#25) |
| a world's life | 10–17 real minutes, then it ends and another begins |
| what it can announce | **23 event kinds** — births, colonies, breakaways, conquests, plagues, wonders, migrations, rifts, land bridges, rallies, last flights, ice advance and retreat |
| catastrophes / endings | 5 / 7 |
| persistence | last 10 worlds archived locally with epitaph and stats |
| distribution | web, PWA, offline-capable, free |

**There is almost no agency over the world.** Eight controls — pause, speed,
chronicle, archive, new world, share, stay awake, fullscreen — and none is *aimed*
at the world: you cannot place, build, nudge or smite, and rerolling is the only
deliberate influence, which is total rather than partial.

**But "not one affects what happens" would be false**, and the reason matters.
`timeScale` multiplies `worldSeconds`, which is handed once per *rendered frame*
to unseeded, world-mutating systems like `updateFires` and `maybeOutbreak`
(`main.ts:7350`). Changing speed therefore changes their thresholds and the
points in history at which they fire — **the speed control alters what happens,
not merely how fast you watch it.** That is a side effect of #25 rather than a
design decision, and it is one more reason to settle #25 before building on the
zero-agency framing.

## 2. The category has a name, and three literatures already describe it

This matters for design *and* for how the thing is described publicly.

- **"Software toy"** — Will Wright. Crawford's line: if no goals are attached,
  it is a toy; with goals it is a challenge. **SimCity could not find a
  publisher for years precisely because it had no win condition.** [R]
- **"Non-game"** — Iwata: *"entertainment that really doesn't have a winner, or
  even a real conclusion."* [V]
- **"Zero-player game"** — Björk & Juul (2012) give it an academic frame, and
  put The Land in category 1, **setup-only**: input at configuration, then
  autonomous. [V] ([jesperjuul.net](https://www.jesperjuul.net/text/zeroplayergames/))

Townscaper's store page says *"an experimental passion project. More of a toy
than a game"* and holds **95.3% across 21,604 reviews** [V]. **Leading with
"toy, not game" is a filter that recruits the right audience** and pre-empts the
"it's just a screensaver" objection by agreeing with it first.

## 3. The test — better than the two axes I first proposed

My draft asked "which pleasures survive zero agency". That is still useful, but
the research supplies a sharper and more principled version.

**Kaplan's Attention Restoration Theory** distinguishes **soft fascination** —
effortless attention that *leaves mental space for reflection* (clouds, water,
fire) — from **hard fascination**, which captures attention completely. The
literature standardly classifies video games as *hard*, and therefore
non-restorative. [R]

> **The test: can a viewer think about something else while watching?**

If yes, The Land is soft fascination — restorative, and categorically different
from every game it will be compared to. **Any feature requiring tracking — a
score, a threat, a timer, a fast cadence — converts it to hard, and lands it in
the non-restorative bucket with everyone else.**

This gives a principled reason to reject good-sounding features, and it is the
strongest available articulation of why no-score/no-agency is load-bearing
rather than decorative.

**The agency-survival test still applies as a second filter**, and WorldBox
shows why:

| WorldBox payoff | survives zero agency? |
| --- | --- |
| godlike tools / power trip | ❌ — and this is most of its marketing |
| terrain painting, world-building | ❌ |
| roleplay, "make your own stories" | ⚠️ the *reading* survives, the *authoring* does not |
| watching civs grow, colonise, war, fall | ✅ fully |
| emergent unexpected events | ✅ |
| destruction spectacle | ⚠️ only if system-caused |
| **"wallpaper" use** | ✅ — *and this is our entire product* |

Verbatim from a WorldBox player: *"This game is like a wallpaper for me tbh, I
usually just start a world and leave it to act as my background."* [V]

## 4. Five findings that change what we should build

**a. WorldBox's failure mode is the most useful thing in the research.** Its
negative reviews cluster on *"you've seen everything after half an hour"*, and
PC Gamer notes runs *"almost always ending with a boredom-killing nuclear
bomb."* [R] **The nuke is a boredom valve — the player manufacturing an event
because watching ran out.**

The Land has no nuke. It has **a scheduled apocalypse the viewer can neither
trigger nor prevent.** That is the same valve, automated and dignified, and it
is a design *advantage* over our closest thematic cousin rather than a
limitation. It also means the endings work already shipped was more load-bearing
than it looked.

**b. Civ's most-missed feature is a non-interactive timelapse.** The end-game
replay — watch your whole history play back as a map — was removed from modern
Civ, and players rebuilt it as a mod. [R] **An intensely interactive game's
most-mourned feature is the part with no interaction in it.** The Land is that
feature, unbundled and made the whole product.

**c. Dwarf Fortress generates history before the player arrives.** Worldgen and
legends mode produce hundreds of years of events *independent of* any player,
browsable as an encyclopedia.

**A correction, because the obvious evidence is the wrong evidence:** an earlier
draft cited Boatmurdered here. Boatmurdered is a **succession fortress** —
players taking turns actively running a fort — so it is emphatically
*agency-full* and cannot support a claim about agency-free storytelling. The
claim survives on narrower ground: worldgen and legends are non-interactive *by
construction*. But whether legends mode is **loved and used, or admired and
abandoned**, is still unverified (§10) — and that is what direction 1 actually
rests on.

**d. You cannot curate seeds, so watchability is set by your worst worlds.**
Tyler Hobbs on long-form generative art: *"the artist needs to ensure that bad
results are extremely rare"* — he spent two months on QA for *Fidenza*. [V]
The Land is structurally long-form generative art: seeded, uncurated, output
straight to the viewer, viewer sees many outputs.

**e. Uncertainty is the resource, not event density.** Eno's *Music for
Airports* liner notes, and the underquoted half: *"conventional background music
is produced by stripping away all sense of doubt and uncertainty (and thus all
genuine interest)"* [V]. Slow-TV reception research agrees — **waiting is what
makes an arrival an event.** When The Land feels boring the instinct will be to
add events; the evidence says make outcomes genuinely uncertain and *visible as
pending* instead.

## 5. The gaps, now evidenced rather than asserted

**a. Identity is one bit deep** — though "one bit" understates what exists, and
an earlier draft of this line was wrong to say a `Civ` varies only by three
scalars. It also carries a rolled `phaseDuration`, a generated `name`, and an
`era` **fixed at birth**, and era already drives visible treatment: city-light
colour and density read differently for a medieval civ than an industrial one
(`main.ts:3288`).

**What is absent is archetype and trait** — nothing that makes one civ *behave*
unlike another beyond the scalars, and nothing carried from its history. Any
archetype design must extend that existing model rather than assume a blank
slate. Matthews et al. on glanceable
displays: pick a recognisable feature and **exaggerate it** — naturalistic
encoding reads as noise at a glance. And keep it constant across eras, or the
viewer re-learns every era. [V]

**Independently corroborated.** Asked for ideas without access to this analysis,
Codex ranked civilisation identity **first** as well, and added a refinement
worth keeping: *traits must influence simulation behaviour rather than merely
produce text.* That is Mark Johnson's chains-of-meaning arrived at from a
different direction. Two independent paths reaching the same gap is the
strongest evidence in this document.

**And it is cheaper than it looks, because the pattern already exists at world
scale.** `FORM_CIV` in `sim.ts` already bends civilisation behaviour by the
world's geography, under the comment *"Geography as culture. An archipelago is a
world of many small seafaring peoples; a continent is a world of a few large
land empires."* Six world forms and seven temperaments already vary a world's
character. **Civ-level archetypes are an extension of a shipped idea, not a new
system** — the same move applied one level down.

**b. The history is announced but never kept.** 23 event kinds fire and scroll
past in a log that turns over every 9.5 seconds. James Ryan's *Curating
Simulated Storyworlds* argues emergent narrative arises **in the meeting between
systems and curators**, and that *"such automatic curation is greatly assisted
by the simulation maintaining extensive records of its generated phenomena."*
[V] We have state; we do not have a chronicle.

**c. What accumulates is thin, not absent.** An earlier draft said "nothing
accumulates", which is wrong: `archiveCurrentWorld()` already stores **up to ten
worlds** in `localStorage` with epitaph, ending, era and civ counts, and the
archive UI revisits them. That is a shipped retention mechanism.

The narrower gap is **event-level history and cross-world continuity** — the
archive keeps a summary card *per world*, not what happened inside one, and
nothing carries between them. Idle-game retention levers mostly do *not*
transfer: exponential numbers, prestige and offline progress all assume the
player owns something. What does transfer is the *shape* — leaving and returning
should be rewarded by **legible change**.

**d. The camera never moves**, so nothing can be shown; everything competes at
one scale. On a phone in portrait you see a fragment of coastline.

**e. The world may not run while the tab is hidden.** Fizek names three separable
pleasures of passive play: watching, systemic change, and **"knowing that the
game keeps unfolding in the background."** [V] A world that pauses when you look
away does not unfold — it *waits*, which is a weaker relationship. Worth being
deliberate about rather than defaulting.

## 6. What The Land already has right

Worth stating, because a comparison tends to only find gaps.

- **An ending, named and earned.** Spiel et al. reject endlessness as a
  criterion of the form and propose *"multiple closed narratives which can
  potentially be serialised"* — which is exactly world → apocalypse → new world.
  Lantz on *Universal Paperclips*: *"at the end, it's done and **it lets you
  go**."* [V]
- **The duration is right, by three independent convergences.** Eno's *Music for
  Airports* tracks run **6–16½ minutes**; Apple TV Aerial clips ~6 minutes; a
  world here is **10–17**. Three traditions landed in the same band. [V]
- **The thesis has a 1982 precedent.** Eno's *On Land* liner notes: *"the
  landscape has ceased to be a backdrop for something else to happen in front
  of; instead, everything that happens is a part of the landscape."* [V]
  Compare `CLAUDE.md`: *"The land is the protagonist; civilizations are
  weather."* **Operationally this argues against a figure/ground split in the
  rendering** — if civs read as sprites over inert terrain we have exactly the
  backdrop relationship Eno rejected. `ruinEra` and name memory are already the
  right mechanic; the argument is to push them harder.
- **The nonfiction premium.** Nothing is scripted, so events carry the weight of
  *things that happened*. **But it is fragile:** the moment a viewer suspects
  the apocalypse is on a timer rather than caused, it collapses. Worth auditing
  whether `worldFateForSeed` visibly *earns* its outcome.

## 7. Directions, ranked by evidence rather than taste

**Note on the ordering, added after Codex's independent suggestions (#26):** it
ranked *civilisation identity* first, where this list has it fifth (direction 5).
Both processes found the gap; they disagree on when to do it. The argument for
moving it up is that direction 1 — a chronicle — is only as good as the material
it curates, and a chronicle about civilisations that differ by colour is a dull
one. That makes identity arguably a **prerequisite** for direction 1 rather than
a competitor. Recorded as a live disagreement rather than resolved here.

1. **A chronicle, then auto-curate it.** Append-only event log — founded, first
   contact, crossing attempted, colony broke away, capital fell, era advanced —
   with tick, location, participants. Then let the *system* curate: an epitaph
   per fallen civ, a summary per world. Highest leverage here: cheap, orthogonal
   to rendering, `endings.ts` already has `WorldHistory` and
   `rememberWorldEvents` doing most of the plumbing, and it solves three
   problems at once — the recentering payoff, the "systemic change" pleasure,
   and shareability. *(Ryan; DF legends; Paradox's Chronicle.)*
2. **QA the floor, not the ceiling.** Use the existing headless fast-forward to
   hunt degenerate seeds — one civ steamrolls by tick 2000, a 90% ocean world,
   extinction in the first era, nothing ever crosses water. Grade N seeds on
   coarse metrics and inspect the bottom decile. *(Hobbs.)*
3. **Budget the notification level.** Most change should be **change-blind**;
   reserve **make-aware** for a small set — a civ's death, a first ocean
   crossing, an era advance, the apocalypse. Nothing interrupts. Express it as a
   rate. *(Pousman & Stasko.)*
4. **Audit every unconditioned random draw.** Mark Johnson's rule for the
   culture-generating roguelike: *"nothing is intended to appear in the world
   that is only related to itself."* [V] **This is the concrete antidote to
   "looks like noise"** — the phrase already in `CLAUDE.md`. We do it well in
   three places (`evolveName`, `inheritedEraFor`, `coreRadius`); the work is
   finding what is left.
5. **Exaggerate one feature per encoding, constant across eras.** *(Matthews.)*
6. **Bind the world to the viewer's real clock and season.** *Reflection* shifts
   with time of day and season and ships seasonal updates; Aerials show real
   local time. [V] We have a day-night cycle; tying its phase to the viewer's
   actual time is the cheapest available differentiator — and none of the direct
   competitors in §9 do it.
7. **Ownership of the telling, not of the world.** Civ's replay works because
   it is *your* empire. We cannot give ownership of the world; we can give
   ownership of **the record** — a shareable link to a seed *with its
   chronicle*, an end-of-world card worth posting.
8. **Decide whether the world ticks while hidden.** *(Fizek.)*

**Named lives (#22) does not make this list.** WorldBox's individual-unit
pleasure is substantially *"I did that to that guy"*, which fails §3's second
test. The one countervailing note: Ryan observes that a 96×96 world of
territories is geopolitical material, and **personal is what people retell.**
Unresolved rather than settled — but not a priority.

## 8. Monetisation — including a correction to advice I already gave

**I told Lawrence to start with itch.io and a tip jar. That was wrong on the
mechanics.** itch's own documentation: *"all HTML5 games on itch.io are set up
to only take payments as **donations**. If you'd like to sell access to your game
you should set its 'Kind of Game' to Downloadable."* [V] Browser builds cannot
be sold there, only tipped. Browser-playable does convert **~37% of viewers into
plays vs ~6% for download-only** [E] — a large attention win and a revenue loss
at the same time.

**Where things like this actually sell: Steam.** Review counts [V], revenue [E]:

| | price | reviews | % pos |
| --- | --- | --- | --- |
| Wallpaper Engine | $4.99 | 1,011,328 | 97.6% |
| WorldBox | $19.99 | 56,349 | 95.3% |
| Townscaper | $5.99 | 21,604 | 95.3% |
| **Mountain** | **$0.99** | 16,294 | 88.2% |
| Kind Words | $4.99 | ~8,936 | 98.2% |

**But read it carefully: generic ambient product is a graveyard** — one
"Sea Aquarium Screensaver" at $3.99 has **zero reviews**. There is no ambient
category that lifts you. **Being ambient is not a market; being a specific thing
is.** Valve's 2026 tag overhaul removed "Ambient" for lack of products and added
**"Desktop Companion"**, which is a better shelf. [R]

**The anchor fact:** Dwarf Fortress earned **$15,635 in its last full donation
month and $7,230,124 in its first Steam month** — same product, same audience,
free version still live and not cannibalised. [V]

**Two free distribution moves available today**, since this is already a web
app: **Wallpaper Engine natively imports HTML wallpapers** [V], as do Lively
(Windows) and Plash (macOS). Zero revenue, but it reaches an audience that has
already paid for exactly this behaviour on their screen.

**Price band from comparables: $3–8.** And the failure mode to avoid, from Line
Rider: **it failed by bolting a game onto a toy to justify a price.**

## 9. Competitors exist now, and none has traction

- **IMAGINERY** (itch, ~July 2026) — browser civ sim, *"you don't manage
  anything"*, **deterministic seeds**, and a **"documentary camera" that
  automatically follows significant events.** Korean-only UI. Zero replies on
  its announcement. [V]
- **GODSIM** — *"a live, persistent civilization simulator… 24/7, whether anyone
  is watching or not"*; free to watch, **pay to drop your own civ**; ~2-week
  seasons, world archived at the end. Auto-camera follows wars. [R]
- **AEON** — free open-source browser god-game. [R]

**The form is being independently discovered right now, mostly by AI-assisted
solo builders, and none of them has traction.** That validates the idea and
warns that the idea alone is not a moat. GODSIM has something we do not: a
**monetisation mechanic native to passivity**, and a shared world rather than a
private one. IMAGINERY has already built §7.6's auto-camera.

## 10. Still open — for Codex

Codex's reviewer works on this repo but its research mode needs a Codex cloud
environment, which is not yet configured. When it is, the questions worth
independent verification are:

1. **Dwarf Fortress legends mode: loved and used, or admired and abandoned?**
   §5b leans on the former and the research could not settle it. If it is
   admired-and-unused, direction 1 needs rethinking.
2. **NRK Slow TV viewership.** The circulating figures were not verifiable
   against NRK's own press office; do not publish them.
3. **Whether §3's soft/hard fascination test is the right frame**, or imported
   too neatly from a literature about parks.
4. Anything in §9 — the competitor picture is the thinnest-sourced section here.

## 11. Optional agency — Lawrence's direction, and what the evidence says

> *"Maybe agency is optional. It's nice as a screensaver but you can also
> interact if you want to."*

This answers the biggest open question with "both", and the research is
unusually specific about it — supportive in three places, with one sharp
warning.

**Supportive.** Townscaper is a toy with agency and *no goals* — 95.3% across
21,604 reviews [V] — so agency-without-goals is a proven form, not a
contradiction. Kaplan's soft fascination is about whether attention is
*demanded*, not whether input is *possible*: an interaction that is never
required, never urgent and never punished does not obviously convert soft to
hard. And **GODSIM already ships this exact shape** — free to watch, pay to drop
a civ onto the map — which makes it the one competitor with a monetisation
mechanic native to passivity (§9).

**The warning, and it is the most specific finding in the whole research.**
WorldBox players *"almost always end with a boredom-killing nuclear bomb"* [R]
— **agency becomes the boredom valve.** The moment a viewer can manufacture an
event, waiting stops being content and starts being dead time, and §4e's
"uncertainty is the resource" collapses with it. Our scheduled apocalypse is
currently that valve, automated. **Optional agency must not be able to replace
it.**

**Which suggests separating two things this document had been conflating:**

**a. Agency over the camera — take it, it is nearly free.** Choosing where to
look, following a civilisation, holding on a coastline. It changes nothing in
the world, so it cannot manufacture spectacle, cannot break determinism, and
cannot fail §3's test. It also solves §5d and the portrait-mobile framing
problem, and IMAGINERY has already built exactly this as a *"documentary
camera"* (§9). **This is probably the single best next feature in the document.**

**b. Agency over the world — scarce, early, irreversible.** The safe shape is
the *gardener*, not the god: a decision that is made and then handed over.
Seeding a civilisation, naming one, choosing where the first people land — one
input at the start, then you watch what it becomes. Björk & Juul's category 1 is
literally **"setup-only"**: input at configuration, then autonomous. That is the
category The Land is already in, and this kind of agency **stays inside it**.

**The design rules that follow:**

1. **Nothing that manufactures spectacle.** No smite, no meteor button, no
   disaster menu. That is the WorldBox valve and it would cost us the apocalypse.
2. **Never required, never urgent, never punished.** The default path is doing
   nothing, and doing nothing must never feel like missing out.
3. **Setup-shaped where possible** — decisions before or early, not continuously.
4. **It must survive being ignored.** If the piece is worse when nobody touches
   it, the screensaver has been sacrificed for the toy.
5. **Determinism is *already* broken, which changes this constraint.** An
   earlier draft said a seed reproduces a world exactly. **It does not** — see
   **#25**. `CLAUDE.md`'s invariant covers `sim.ts`, but six renderer systems
   (plague, fires, volcanoes, floods, droughts) combine unseeded `Math.random()`
   with writes to `simWorld.tiles`, `biomeMap` and `elevationMap`, so two people
   opening the same link already get **different histories**. Any agency design
   has to be decided *after* #25, not on top of a guarantee that is not kept.

**What this changes elsewhere:** it makes §8's monetisation question much more
interesting. GODSIM's model — watch free, pay to participate — is the only
mechanic found anywhere that charges for something *without* taking anything
away from the passive viewer. That is worth more thought than the $3–8 desktop
build.

## 12. Open questions for Lawrence

1. **Which agency?** §11 argues camera-agency is nearly free and world-agency
   should be setup-shaped. Is "seed a civilisation and watch what it becomes"
   the right one, or is even that too much?
2. **Does anything crossing between worlds break the thesis?** §5c says
   accumulation is the missing retention shape; §6 says the ending *letting you
   go* is a strength. These pull against each other.
3. **Should the world tick while the tab is hidden?**
4. **Is a $3–8 desktop build worth building at all**, given the web version
   stays free and the honest revenue expectation is small — or is GODSIM's
   watch-free/pay-to-participate the better shape now that agency is on the
   table?
