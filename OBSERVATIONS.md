# OBSERVATIONS — Fable run, 2026-06-10

How I watched: a headless harness (`scripts/observe.ts`) that runs the sim 54,000
ticks (30 viewer-minutes) and logs the full event stream with timestamps, plus
Playwright screenshots of the live app (`scripts/screenshot.mjs`). Two seeds
observed headless, one watched live.

## The big discovery: every civilization lives exactly 57 seconds

In 30 minutes of observed sim time, **every single civ** lived ~56–60s
(born→died), with a dying window (declining→died) of 10–13s. Constitution,
ambition, fortune — none of it matters to lifespan. The cause is a sim bug:
`advanceCivPhase` calls `vary(base)` — which rolls `base * (1 ± 0.6)` — **every
tick**, so a phase ends as soon as `phaseAge` exceeds the *minimum* possible
roll. The intended ±60% lifespan variation collapses to a deterministic
`base × 0.4` for all three phases: 480 + 800 + 320 ticks ≈ 53s, plus vitality
ramp. The dying window is always ~11s.

This is the root of "civilizations don't feel like protagonists." There are no
old empires and no doomed youths — everyone gets the same metronome. Jeopardy
is impossible when every death is on schedule.

## Catastrophes are a metronome too

14 catastrophes in 30 min: gaps of 1m45s–2m40s, *trending tighter* as the world
saturates (settled fraction pins the pressure build rate at its cap). Severity
is mostly low (9 of 14 under 0.4). Affected civs usually 0–1 — the vitality-hit
radius rarely catches anyone because civs die of old age before the blast
matters to them. So the most dramatic system in the sim mostly lands as: some
tiles quietly turn grey-brown, a red line appears in the log. No buildup, no
release, no aftermath. The viewer never knows pressure exists.

## The event log is a torrent

2,557 events in 30 min ≈ one narrated line every 0.7 seconds. Colony landfalls
spam hardest (an expedition fires every few seconds early on), then city falls
and the birth/death churn from the 57s lifespans. With LOG_MAX=5 and 22s
lifetime, lines scroll before you can read them. **Suspense needs quiet.** A
world where something is always happening is a world where nothing matters.

## What the screenshots show

- Bright, even, cheerful daylight palette. White-cream page background. The
  world looks like a pleasant board, not a place where dread can build.
- No visual channel exists for "something is wrong": no vignette, no sky, no
  tint shift. The pressure variable has zero visual surface.
- Catastrophe arrival has no punctuation — no flash, no shake, no epicenter
  mark. Equal visual weight to a tile decaying of old age.
- The building sprites, era tints, city markers, and labels are genuinely good
  bones. Territory is legible; civs have distinct colors; names are readable.
  The substrate for rooting-for-someone exists — it's the time structure and
  the affect that are missing.

## What almost-works

- The narration prose is already era-flavored and decent; it's drowned by volume.
- `catastrophePressure` builds exactly like a dread variable should — slowly,
  with contributions from settlement density and era. It's just invisible.
- The ember system guarantees survivors but nobody narrates the survival. A
  near-miss currently looks identical to not being involved at all.
- The civ bar panel shows decline (▼) but a 11s dying window makes it a blip.

## Where the wow gap is biggest

1. **Time variance.** Fix the phase-roll bug → some civs die in a minute, some
   endure ten. Long-lived civs become landmarks the viewer knows by name.
2. **Pressure surfaced.** Omens in the log + a slow ambient darkening = the
   viewer learns the world's tell. After one catastrophe they'll recognize the
   signs the second time. That's when "uh oh" becomes possible.
3. **Arrival as release.** The impact moment needs ~2 seconds of visual
   punctuation, and the aftermath needs narration for who was spared.
