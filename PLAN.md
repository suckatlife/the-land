# PLAN — suspense run, 2026-06-10

## Hypothesis

Suspense fails here for three reasons, in order: (1) all civs live identical
57-second lives (a sim bug), so there are no protagonists to fear for; (2) the
catastrophe system telegraphs nothing — pressure is invisible and cadence is
metronomic; (3) there is no quiet — 85 events/min makes every signal noise.
Fix the time structure first, then surface the pressure, then punctuate the
arrival. Narration and a slow ambient visual are the cheapest channels with
the highest dread-per-line-of-code.

## Moves (each one commits)

1. **Lifespan variance (sim).** Roll phase duration once on phase entry, store
   it on the civ. Tune durations so median life ≈ 2–3 min with a long tail
   (rare decade-civs). Lengthen `decliningDuration` so the dying window is
   ~30–90s — long enough to notice and dread. Verify with observe.ts
   distribution stats.

2. **Brewing catastrophes (sim).** When pressure crosses ~0.5, pre-roll the
   coming catastrophe's type + severity into `world.brewing`. Emit `omen`
   events at escalating thresholds (~0.55 / 0.8 / 0.93), type-specific and
   era-aware. Make pressure build irregular (noise + occasional lulls) so the
   cadence isn't a metronome. `applyCatastrophe` consumes `brewing`.

3. **Aftermath legibility (sim).** `spared` events for civs whose capital sat
   just outside the radius (the near-miss made visible). A rare `rally`:
   a declining civ with high fortune can return to stable once — uncertainty
   needs both outcomes to be possible. Desperate last expeditions for
   declining civs, flagged so the narrator can treat them as flight.

4. **Narration (render).** Era × type flavored omen lines (neolithic auguries,
   modern barometers). Spared/rally/last-flight lines. Throttle the torrent:
   drop colony spam, raise city-fall thresholds, aim for a few lines/min so
   omens stand out. Omens get their own visual treatment in the log.

5. **Ambient dread (render).** A screen-edge vignette + world tint that eases
   with pressure, hued by brewing type (plague: sickly pallor; flood: cold
   blue; asteroid: dusk amber; earthquake: dust). Subtle — half-noticed is the
   goal. For asteroids, a small star that brightens in the sky over the final
   stretch. Pressure falls → the air clears over ~10s (relief is part of it).

6. **Arrival punctuation (render).** ~2s of impact: flash for asteroid, shake
   for earthquake, dark pulse for plague, surge tint for flood. Then the
   vignette releases.

7. **Verify by watching.** Screenshots through a full pressure cycle; long
   observe runs for pacing stats. Iterate tunables. Summary docs.

## Risks / notes

- Move 1 changes global pacing — biggest taste call of the run. Justified: it
  is a bug, and the brief's jeopardy requirement depends on it.
- Sim stays Pixi-free: sim emits events + exposes `catastrophePressure` and
  `brewing`; renderer reads them. No new deps in prod code (playwright/tsx are
  dev-only analysis tools).
- Audio drone is the strongest tool I'm deferring — only if time remains after
  the visual loop works (muted by default per brief).
