# Fable Run Brief — the-land, June 2026

**Date queued:** [fill in]
**Expected duration:** ~3-4 hours of effective work within a single 5-hour usage window
**Priority:** focused — single-dimension intervention, shippable output expected
**Model:** Claude Fable 5
**Branch:** `fable-run-<YYYY-MM-DD>` (do not commit to main)

## Important: this run overrides parts of CLAUDE.md

The standing `CLAUDE.md` describes a collaborative working mode: Lawrence is the taste/design lead at the keyboard, you implement, small diffs, no whole-file pastes. That mode is suspended for this run only. After this run completes, CLAUDE.md's normal mode resumes.

For this run specifically:

- **You are making taste calls.** Lawrence won't be at the keyboard. The aesthetic anchors below are your reference.
- **No "show me small diffs" — you are working on a branch.** Commit frequently to the branch instead.
- **Architecture changes are permitted** if they genuinely unlock the visual/experiential goal. This is the run where the project gets to grow new tools.

**Document precedence:** `STATE_2026-06-10.md` is authoritative on the current state of the code. `CLAUDE.md` has drifted in significant ways (terrain channels, scene layers, return shape of `step()`, the entire city tier, catastrophes, building sprites, auto-cataclysm). See the "Drift from CLAUDE.md" section of STATE for the explicit list. Where the two disagree, STATE wins.

Where they don't disagree, CLAUDE.md's hard-won knowledge is still authoritative and worth preserving: the snapshot-before-mutate pattern in `step()`, the `fadedDeadCivs` repaint guard, `maxDecaysPerCivPerTick` decay capping, capital protection while civ has > 1 tile, breakaway flood-fill throttled to every 15 ticks, era-inheritance at birth, name-memory radius, seed persistence round-trip, and the "no Pixi imports in sim.ts" rule. These are not negotiable.

## The brief

Lawrence's broader read on the current state of the-land: visually competent but flat, story is atomic rather than continuous, events happen without buildup or aftermath. There are three dimensions where the project falls short of "something someone would actually want to watch":

1. **Visual atmosphere** — flat tints, no lighting/depth/weather/sky, world feels like a board rather than a place
2. **Story continuity** — narration is event-atomic; no threads spanning eras, civilizations don't feel like protagonists
3. **Suspense** — catastrophes hit from nowhere; no foreshadowing, jeopardy, or buildup

**This run is about suspense only.** Atmosphere and story will be addressed in subsequent runs. Do not split attention across all three; you will not have time, and the result will dilute. If during your work you spot small atmosphere or story wins that emerge naturally from the suspense work, take them — but do not pursue them as primary goals.

### Suspense — what to build

The catastrophe system already exists with severity tiers, pressure accumulation (`catastrophePressure` builds every tick), and four types (plague, asteroid, flood, earthquake). The pressure variable is *literally a foreshadowing variable* that's never surfaced. Right now, the world knows a catastrophe is coming and the viewer doesn't. Close that gap.

Suspense requires three things, and you should consider all three:

- **Foreshadowing.** Omens, signs, signals that pressure is building. Could be ambient (sky tint shift, narrator notes drought, a tremor of biome color change), discrete (omens fire as events as pressure crosses thresholds, narrated specifically), or both. Era should shape the omens — neolithic civs might "see the auguries fail," modern civs might "watch the barometers fall."
- **Jeopardy.** A civ visibly in trouble before it dies. The viewer needs time to notice and to root or dread. This may mean slowing some kinds of death, surfacing per-civ vitality decline visually or narratively, or having declining civs do desperate-feeling things (last expedition, last city founded, last name evolved).
- **Uncertainty.** The moment where you don't know if they'll survive. Near-misses matter. A catastrophe that lands at the edge of a civ but doesn't finish them is more memorable than one that erases them cleanly. Consider whether the ember system can be tuned to create more close-call survivals.

The catastrophe arriving should feel like a release of accumulated dread, not a surprise.

### Test

A new viewer watches for 10 minutes and **feels real tension at least once** — a moment of "uh oh, something is coming" followed by either dread when it arrives or relief when it spares someone they'd noticed.

That's the bar. One genuine moment of felt tension. If you achieve that, the run is a success. If you achieve three, it's a great run.

## Starting move

Before changing anything:

1. Read `CLAUDE.md` for working style and known invariants.
2. Read `STATE_2026-06-10.md` for what the simulation actually does right now — this is far more accurate than CLAUDE.md on current behavior.
3. Run the current build (`npm run dev`). Watch it for at least 10 minutes. Take notes.
4. Write `OBSERVATIONS.md` with: what's currently surprising, what's currently flat, what almost-works, what feels broken or off-tone, where the "wow gap" is biggest.
5. Write `PLAN.md` with your hypothesis about what intervention would most improve the watching experience, and your first 2-3 moves. Commit it. Then start.

The PLAN.md isn't a contract — you can revise it as you go. It's there to force you to commit to a direction rather than wandering.

**A framing note for this single-window run:** You have one 5-hour usage window on Max 5x. Fable burns those limits roughly twice as fast as Opus. Practically that means you have maybe 3-4 hours of effective work before the window closes. Plan accordingly:

- **Avoid full framework changes** (no Three.js migration, no rendering rewrite). They are permitted in theory (see Permissions) but unrealistic in this time budget. Stay in PixiJS for this run.
- **Prefer surfacing existing variables over adding new systems.** `catastrophePressure` is a foreshadowing variable that already exists; it just isn't visible. Tuning + narration + a small visual signal probably beats a new mechanic.
- **Commit early and often** so progress is preserved if the window closes earlier than expected. Every meaningful change → commit.
- **Write `FABLE_RUN_SUMMARY.md` before you think you need to.** If you have to choose between one more code change and writing the summary, write the summary. The summary is the artifact Lawrence will actually evaluate; uncommitted code without context is harder to recover from.

The existing systems are likely *building blocks* you should use, not obstacles to route around. `catastrophePressure`, the event log, the narrator infrastructure, and civ vitality are all already in place. Read for these latent affordances before adding new ones.

## Aesthetic anchors

Reference points: SimEarth's emergence, Dwarf Fortress's history generation, Italo Calvino's *Invisible Cities*, Borges's *The Library of Babel*, Annie Dillard's deep-time prose. **Not** Civilization, **not** Spore, **not** Banished. The texture is literary, slightly melancholy, occasionally funny, never gamey.

**What "good" looks like:**
- A new viewer watches for 10 minutes and is surprised at least 3 times
- Era-flavored naming feels like it could be real
- Civilizations have *legibility* — you can root for one without being told to
- Narrator prose (if any) is specific. "The Empire fell" is bad. "The last potter in Vehl-Em fired one final bowl, unaware" is good.
- Visual changes accumulate; the land remembers
- Mistakes and oddities are preserved; the system doesn't sand off interesting edges

**What "bad" looks like:**
- Chaos for the sake of chaos
- Generic fantasy naming ("Aelarion," "Thordrun")
- Narrator over-explaining what the visuals already showed
- UI implying this is a game (score, win states, player agency beyond watching)
- Documentary-style overlays that explain emergent events
- Speeding up so fast the deep-time feeling becomes a blur

When in doubt: *would Calvino describe what's on screen as worth describing?*

## Permissions: what you can pull in

The standing project is a Vite + PixiJS 8 + TypeScript app. For this single-window run, **stay in PixiJS.** Three.js, WebGL shader pipelines, or other framework additions are too expensive for the time budget. They remain options for future longer runs.

PixiJS itself has a lot of headroom — filters, blend modes, custom shaders via `PIXI.Filter`, particle containers, additional canvas layers. If you need atmospheric or visual signals for suspense (sky tint, vignette, screen-wide pressure visualization), use Pixi-native tools.

**External assets (sprites, textures, audio):**

- **Allowed**, but only from clearly-licensed free sources. Acceptable: Kenney.nl, OpenGameArt CC0, Freesound CC0/attribution, Itch.io free packs with permissive licenses, Wikimedia public domain, NASA imagery, public-domain texture sites.
- All external assets go in `public/sprites/external/<source-name>/` or `public/audio/external/<source-name>/`.
- For each external source, drop a `LICENSE.txt` in the folder with the license terms and the source URL.
- Log every external asset addition in `DEPENDENCY_NOTES.md` with: filename, source URL, license, attribution needed (yes/no).
- **Do not** download from sites with ambiguous licensing, "free for personal use" terms, or copyrighted material. When in doubt, skip it.

**Audio (relevant for suspense):**

- Allowed under the same licensing rules as visual assets. Particularly relevant for this run — a low rising drone before a catastrophe is one of the most powerful suspense tools available.
- If you add audio, build it so it's **muted by default** with an unobtrusive toggle. The-land is a screensaver — sudden sound when someone opens the page is hostile.
- Ambient/generative is preferred over looped tracks. Procedurally-triggered event sounds (pressure crossing threshold → distant bell, catastrophe → bass impact) are good. Background music tracks are usually not the right move for this aesthetic.

**AI-generated images/textures:**

- **Allowed if and only if you already have API credentials available** (e.g., an existing key in `.env`, or an MCP tool exposing image generation).
- **Do not** set up new accounts, sign up for services, or attempt to acquire credentials. If no credentials are present, skip this avenue.
- If you do generate images, log every generation in `DEPENDENCY_NOTES.md` with the prompt, model used, and where the output is stored.
- For a suspense-focused run, AI imagery is probably not the highest-leverage use of time. Prefer it if you find a specific need (e.g., omen icons, sky textures) rather than building toward it.

**New JS/TS dependencies (libraries, packages):**

- Allowed if they meaningfully advance the run.
- Flag every new dependency in `DEPENDENCY_NOTES.md` *before* installing, with a one-line rationale.
- Avoid heavy frameworks. For audio, the Web Audio API is built in — try that before adding Tone.js or similar.

## Hard constraints (do not relax these)

- **Branch only.** All work on `fable-run-<YYYY-MM-DD>`. No commits to `main`. No force-pushes. No history rewrites.
- **No network calls in production code.** The app fetches no remote data at runtime. Asset bundling happens at build time; the running app is offline.
- **No telemetry, analytics, fingerprinting, or third-party scripts.** None.
- **No monetization scaffolding, ads, paywalls, "buy me a coffee" widgets, or commerce.** Nothing.
- **No remote push without instruction.** Local branch only unless Lawrence says otherwise.
- **Do not delete existing `SESSION_LOG_*.md`, `JOURNAL.md`, or any prior log files.** Append, don't replace.
- **Preserve seed persistence** (URL param → localStorage → random). Don't break this when refactoring HUD code.
- **The `fadedDeadCivs` repaint behavior is load-bearing.** If you refactor the change-tracking, preserve the per-civ-death repaint or you'll reintroduce a bug Lawrence already paid for once.

## Definition of done

You're done when ONE of the following is true:

1. Your usage window is approaching its limit (you'll see warnings as you near it). At that point: stop adding code, commit what you have, write `FABLE_RUN_SUMMARY.md`, and end the session.
2. You've shipped a suspense intervention that meaningfully passes the test (a viewer feels real tension at least once in 10 minutes), AND you've written `FABLE_RUN_SUMMARY.md`. Stop. Don't try to layer on atmosphere or story — those are future runs.
3. You've encountered a question that genuinely needs Lawrence's aesthetic judgment and cannot be deferred.

For #3: use it sparingly. The point of a Fable run is that you can try things and back out. Default to "try it, evaluate honestly, document the attempt." Use `QUESTIONS.md` only for decisions that would meaningfully alter the *nature* of the project.

**On window-approaching:** Claude Code shows usage warnings as you near the limit. When you see one, switch into "wrap-up mode" — commit, write the summary, leave the work in a clean state. A run that ends with a clean summary at 80% of intended scope is far more valuable than one that hits the limit mid-edit with no summary written.

## Outputs expected on the branch

- The improved code itself, committed frequently
- `OBSERVATIONS.md` — initial read of current state
- `PLAN.md` — hypothesis and first moves (revisable)
- `RUN_LOG.md` — append-only ship's log, terse dated entries throughout
- `DEPENDENCY_NOTES.md` — every new dep, asset, and AI-generated image
- `FABLE_RUN_SUMMARY.md` — the final write-up, with these sections:
  1. What I tried (including dead ends)
  2. What works now that didn't before
  3. What I learned about the project
  4. Three creative directions to take it next
  5. Honest self-assessment of the 10-minute test
- `QUESTIONS.md` — only if you encountered something needing Lawrence's call

## A note from Lawrence

This is the first focused Fable run on this project. We picked suspense as the target dimension because it has the most clearly-identified leverage (`catastrophePressure` is already a foreshadowing variable that just isn't surfaced) and because it's the most mechanistic of the three dimensions — most likely to land cleanly in one window.

If this run works, atmosphere and story get their own runs in subsequent days. If this run reveals that suspense actually depends on atmosphere or story in ways I didn't see, say so in the summary and we'll re-plan.

If you find yourself defaulting to safe, conventional choices because that's the path of least resistance, push past that. If you find yourself doing weird things just to seem creative, also push past that. The aim is the genuine middle: thoughtful, specific, surprising in the small ways.

The summary doc matters as much as the code. Show me your thinking.

Good luck. See you in the morning.
