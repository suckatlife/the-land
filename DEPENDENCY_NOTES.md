# DEPENDENCY_NOTES — Fable run 2026-06-10

- `playwright` (devDependency) — headless screenshots for visual evaluation during the run. Not imported by any production code. Chromium headless-shell lives in ~/.cache/ms-playwright; system libs (libnspr4/libnss3/libasound2) extracted to /tmp/pwlibs (ephemeral, not in repo).
- `tsx` — used via `npx -y tsx` to run the headless observation harness; never installed into package.json.
- Audio is procedural Web Audio API (src/audio.ts) — no libraries, no audio files.
- No runtime dependencies added. No external assets added (yet — will log here if any).

## Analytics — 2026-08-19

- `posthog-js` (runtime dependency) — product analytics behind the `trackEvent`
  wrapper in `src/analytics.ts`. Loaded by DYNAMIC import, so it is not in the
  initial bundle and is never fetched at all when the viewer has opted out or no
  project key is configured. `npm audit --omit=dev` reports 0 vulnerabilities.
- `@vercel/analytics` is no longer imported. It remains in `package.json` for
  now so the Vercel provider can be restored in one edit if the account ever
  moves to Pro; remove it if that stops being the plan.
- Analytics sends nothing without `VITE_POSTHOG_KEY`. See `ANALYTICS.md`.
