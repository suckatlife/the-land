# RUN_LOG — Fable run 2026-06-10

- 00:00 Read CLAUDE.md, STATE, BRIEF. Branch fable-run-2026-06-10 created.
- 00:15 Built headless observe harness (scripts/observe.ts) + playwright screenshots (scripts/screenshot.mjs, dev-dep only).
- 00:30 Found the vary()-per-tick bug: all civs live ~57s, zero variance. Catastrophes metronomic at ~2min. Event log ~85 lines/min.
- 00:40 OBSERVATIONS.md + PLAN.md written. Starting move 1: lifespan variance.
- 01:10 Lifespan fix verified (median 3m, tail to 7m41s; dying windows 21-79s). Committed.
- 01:40 Brewing/omen/rally/last-flight/refugee systems in sim; 72 omen lines; log quiet-gating. Committed.
- 02:05 Atmosphere layer: pressure-driven multiply tint + vignette hued by brewing type, omen star, impact flash/shake. First pass too subtle — measured via __atmos debug handle, raised ceilings, verified by screenshot. Committed.
- 02:20 Procedural Web Audio: dread drone + omen bell + impact thump, muted by default, context suspended while muted. 12-min integration watch running.
- 02:55 12-min natural-pacing watch complete: calm 0-5min, fizzle brewing 5:00-7:30 (dread 0.33 then release), calm again, severe asteroid (0.69) brewing from 11:00 with star + amber dusk. Loop verified end-to-end. (One artifact: a mid-watch git operation triggered a Vite reload at ~1:15 — don't touch the repo during a watch.)
- 03:05 Post-watch tuning: fizzles whisper (sevFloor 0.22), air clears slower (easeOut 0.0015). Added epicenter shockwave rings in world space — impact now has a *where*. Production build passes.

## Atmosphere run, 2026-06-11
- 00:00 New BRIEF read. Branch fable-run-atmosphere-2026-06-11 created from suspense tip (NOTE: brief says suspense was merged to main — it wasn't; main is still pre-suspense. Flagged in OBSERVATIONS).
- 00:15 6-min re-orientation watch: calm world is flat airless noon; manual catastrophe untraceable at +30s (ring gone by +5s). OBSERVATIONS + PLAN written. Window 1 begins: sky, day/night glaze, persistent scars.
- 01:30 atmosphere.ts: sky + day/night glaze + scars implemented and wired. First pass: sky invisible (world overflowed viewport) and scars ~0.04 effective alpha. Fixed: composition block seats the scaled world in the sky; scar washes boosted.
- 02:00 Visual pass on all 4 day keyframes + all 4 scar types + night-dread composition. Smoke test: brewing -> omen -> impact -> scar verified end-to-end, both natural and manual paths. Build passes. WINDOW_1_NOTES written. Window 1 done.
