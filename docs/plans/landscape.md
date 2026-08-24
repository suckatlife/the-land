# Plan — where The Land sits, and what to take from its neighbours

**Status:** draft, for review **and for independent research**. Nothing here is
built. See §7 for what Codex is specifically asked to verify and add.

**Origin:** the named-lives proposal (#22) came from one comparable — WorldBox —
and Lawrence's read was that a named person may not suit a passive screensaver.
That is open question 1 of that plan answered, and it exposed the real gap:
**we have been reasoning from a single neighbour.** This document widens the
frame before proposing anything else.

---

## 1. What The Land actually is, precisely

Stated exactly, because most of the comparison depends on where the line falls.

| | |
| --- | --- |
| world | 96×96 isometric, seeded and deterministic |
| a world's life | 10–17 real minutes, then it ends and another begins |
| simulation | 30 ticks/sec; ~13.7k lines across sim, render and atmosphere |
| things the world can announce | **23 event kinds** — births, colonies, breakaways, conquests, plagues, wonders, migrations, rifts, land bridges, island births, rallies, last flights, ice advance and retreat |
| catastrophes | 5 — plague, asteroid, flood, earthquake, volcano |
| endings | 7 — drowned, long winter, ash, rewilded, world empire, exodus, garden |
| persistence | last 10 worlds archived locally with epitaph and stats |
| distribution | web, PWA, installable, offline-capable, free |

**The defining constraint: there is no agency over the world.** The viewer has
eight controls — pause, speed, chronicle, archive, new world, share, stay awake,
fullscreen — and **not one of them affects what happens.** They govern playback
and the window. You cannot place, build, nudge, save, or smite. Rerolling is the
only influence, and it is total rather than partial: you get a different world,
not a changed one.

That is a stronger constraint than most things it will be compared to, and it is
deliberate. `CLAUDE.md`: *"The land is the protagonist; civilizations are
weather."*

## 2. The two axes that matter

Almost everything worth comparing sits on a grid:

- **Agency** — from "you are a god" through "you nudge" to "you only watch"
- **Simulation depth** — from "pretty motion" through "systems with memory" to
  "a history you could write down"

The Land is **zero agency, high depth**, which is a genuinely thin corner. Most
high-depth simulations are games; most zero-agency software is shallow motion.

The productive question is therefore **not** "what does WorldBox do that we
could add" — it is:

> **Which pleasures of a deep simulation survive the removal of all agency, and
> which are actually pleasures *of* agency wearing a simulation's clothes?**

A feature can be excellent in WorldBox and worthless here purely because its
payoff was "I did that."

## 3. What The Land has that its neighbours mostly do not

Worth naming, because the temptation in a comparison is to only find gaps.

- **An ending, and a named one.** Most simulations run until you stop them. Here
  a world dies in one of seven ways and is given a title and an epitaph.
- **Deep time as the unit.** Not a session, not a level — a whole civilisational
  arc in a quarter of an hour.
- **A seed that reproduces a world exactly**, so a world is a six-character
  string that can be sent to someone.
- **Ruins that persist and are inherited** — new civs read the era of what came
  before them.
- **No failure state and nothing to optimise**, so there is no correct way to
  watch it.

## 4. Where the gaps probably are

Held loosely — this is the part §7 asks Codex to test rather than confirm.

**a. Identity is one bit deep.** Two civilisations differ by colour and nothing
else: same buildings, same behaviour, same silhouette. Worlds therefore differ
in *layout* but not much in *character*.

**b. Nothing accumulates for the viewer.** A world ends, ten are archived
locally, and that is the whole relationship. Nothing is learned, collected or
carried between worlds.

**c. The camera never moves.** It breathes, but the frame is fixed, so the
viewer cannot be *shown* anything — everything competes at the same scale, and
on a phone in portrait you see a fragment of coastline rather than a world.

**d. The history is announced but not kept.** 23 event kinds fire and scroll
past in a log that turns over every 9.5 seconds. There is no legend, no map of
what happened, no way to see the shape of a world after watching it.

**e. Watching is unrewarded.** Ten minutes and thirty seconds differ only in how
much you saw. Nothing marks having watched a world to its end.

## 5. Candidate directions, from the comparison rather than from taste

Deliberately framed as *questions this document should answer*, not as a
shopping list. Each needs the §2 test applied: does the payoff survive zero
agency?

1. **Visual identity per civilisation** — building language, not just colour.
2. **A camera that moves**, slowly, toward what is happening.
3. **A record of a world** that outlives it — the shape of a history, not a log.
4. **Something that accumulates across worlds** without becoming a game.
5. **Named lives** — parked at #22, revisit only if the research says identity
   matters at the individual scale rather than the cultural one.

## 6. What this document must not do

Recommend a feature because a game has it. Every comparable here is either
interactive, or shallow, or both, and the interesting ones are interesting for
reasons that may not transfer. **A borrowed feature must survive the §2 test in
writing before it earns a line in §5.**

---

## 7. Research brief — for Codex

This is the part where a second, independent search is more valuable than a
review. Please **do your own research** and treat §§3–5 above as claims to test,
not as findings to polish. Contradicting them is the useful outcome.

**a. Passive software people actually valued.** Zero- or near-zero-agency
things: *Mountain* and *Everything* (David OReilly), *The Endless Forest*,
Brian Eno and Peter Chilvers' *Bloom* / *Scape* / *Reflection*, Wallpaper
Engine's ecosystem, Apple's Aerial screensavers, aquarium and terrarium apps,
ambient streams. **Where the absence of interaction was the point, what did
people say made it hold up?** Find cases we have not thought of.

**b. WorldBox specifically, from its players rather than its store page.** What
do reviews and community discussion say is the actual pleasure — and how much of
each is "I did that"? A ranked list of its pleasures by *how well they survive
losing agency* would be the single most useful thing you could produce.

**c. Deep-history simulations.** Dwarf Fortress world gen and legends mode,
Ultima Ratio Regum, Songs of Syx, Civilization's end-of-game replay. Legends
mode is the closest thing anywhere to §4d — **is a browsable history actually
loved, or admired and unused?**

**d. Watchability, as literature rather than vibes.** Ambient and glanceable
display research, generative art practice, slow media, idle-game design on what
makes a tab stay open. Principles we can apply, with sources.

**e. Anything we are missing.** The most useful answer may be a category not
listed — a comparable, a research area, or a reason this whole framing is wrong.

**Please flag disagreement explicitly.** If §4's gaps are not the real gaps, or
§1's zero-agency constraint is a mistake rather than a feature, say so plainly.
That is more useful than corroboration.

## 8. Open questions for Lawrence

1. Is zero agency permanent, or the current setting? A single "nudge" — one
   intervention per world — is a different product and a much larger market.
2. Does anything crossing between worlds break the thesis, or is *"the land is
   the protagonist"* compatible with a viewer who accumulates?
3. Is the 10–17 minute world the right unit, or is the real ambient use a thing
   left on for hours, which no current design decision serves?
