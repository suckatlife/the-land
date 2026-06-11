# RUN_LOG — Fable run 2026-06-10

- 00:00 Read CLAUDE.md, STATE, BRIEF. Branch fable-run-2026-06-10 created.
- 00:15 Built headless observe harness (scripts/observe.ts) + playwright screenshots (scripts/screenshot.mjs, dev-dep only).
- 00:30 Found the vary()-per-tick bug: all civs live ~57s, zero variance. Catastrophes metronomic at ~2min. Event log ~85 lines/min.
- 00:40 OBSERVATIONS.md + PLAN.md written. Starting move 1: lifespan variance.
- 01:10 Lifespan fix verified (median 3m, tail to 7m41s; dying windows 21-79s). Committed.
- 01:40 Brewing/omen/rally/last-flight/refugee systems in sim; 72 omen lines; log quiet-gating. Committed.
- 02:05 Atmosphere layer: pressure-driven multiply tint + vignette hued by brewing type, omen star, impact flash/shake. First pass too subtle — measured via __atmos debug handle, raised ceilings, verified by screenshot. Committed.
- 02:20 Procedural Web Audio: dread drone + omen bell + impact thump, muted by default, context suspended while muted. 12-min integration watch running.
