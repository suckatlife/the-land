# DEPENDENCY_NOTES — Fable run 2026-06-10

- `playwright` (devDependency) — headless screenshots for visual evaluation during the run. Not imported by any production code. Chromium headless-shell lives in ~/.cache/ms-playwright; system libs (libnspr4/libnss3/libasound2) extracted to /tmp/pwlibs (ephemeral, not in repo).
- `tsx` — used via `npx -y tsx` to run the headless observation harness; never installed into package.json.
- No runtime dependencies added. No external assets added (yet — will log here if any).
