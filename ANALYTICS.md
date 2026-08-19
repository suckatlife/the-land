# Analytics plan

The Land uses PostHog through `src/analytics.ts`. The wrapper keeps event names
and privacy controls in one place so the provider can be changed without
touching product code.

## Why PostHog and not Vercel Web Analytics

Vercel Web Analytics is cookie-free and was the original choice, but Vercel
restricts custom events to Pro/Enterprise. This account is on **Hobby**
(`billing_plan: hobby`, verified against the Vercel API on 2026-08-19), so every
custom event in the table below would have been accepted by the call site and
silently dropped before reaching a dashboard — the worst failure mode for
analytics, since the graphs look like real zeros. Only `src/analytics.ts`
changed; no call site moved.

## Privacy rules

- No cookies, accounts, persistent user IDs, world seeds, shared URLs, Chronicle text, or saved-world data are sent.
- Autocapture, session recording, heatmaps, person profiles and feature-flag
  requests are all disabled explicitly in `posthog.init`.
- Provider persistence is `memory`, so the analytics library writes nothing to
  disk and a reload is a fresh anonymous id.
- The provider is loaded by dynamic import, so an opted-out viewer — or a build
  with no project key — never downloads or parses the analytics library at all.
- Query parameters and URL fragments are stripped from every pageview and event.
- Do Not Track and Global Privacy Control disable analytics entirely.
- Browser storage contains only boolean-like visit/session and installation-counted markers.
- Engagement is accumulated only while the document is visible.

## Events

| Event | Trigger | Properties |
| --- | --- | --- |
| `visit_started` | Once per eligible browser-tab session | `visitor_status`: `new` or `returning` |
| `engagement_reached` | At 1, 5, and 10 visible minutes | `minutes`: `1`, `5`, or `10` |
| `world_shared` | After native sharing or clipboard copy succeeds | `method`: `native` or `clipboard` |
| `fullscreen_toggled` | The browser's own `fullscreenchange`, so one actual state change is one event | `enabled`, `source`: `control`, `double_click` or `system` (e.g. leaving with Esc) |
| `wake_lock_toggled` | After Stay Awake is enabled successfully or intentionally disabled | `enabled` |
| `pwa_installed` | Browser install confirmation, or the first detected standalone launch | `source` |
| `chronicle_toggled` | Chronicle is turned on or off from public controls | `enabled` |
| `world_generated` | A new random world begins manually or after a completed cycle | `source`: `manual` or `automatic` |

## Deliberately not tracked

- The debug HUD's `reroll` button, and revisiting a world from the archive.
  Neither is a new world beginning in the product sense, and the archive path
  works from a stored seed.
- The static About, Privacy, Terms and Support pages send no pageview; analytics
  initialises only on the world experience.

## Operations

Analytics is inert until two environment variables are set at build time:

| Variable | Required | Meaning |
| --- | --- | --- |
| `VITE_POSTHOG_KEY` | yes | PostHog project API key. Absent -> the contract still runs but nothing is sent and the library is never loaded. |
| `VITE_POSTHOG_HOST` | no | Defaults to `https://us.i.posthog.com`. Set for EU or self-hosted. |

Configure them in the Vercel project (Production and Preview) before expecting
data. Because the key is absent by default, merging this work does not begin
collecting anything on its own.

## Verifying in a browser

In a dev build the wrapper records every emitted event on
`window.__analyticsLog` (dev only, never in production). That makes the whole
verification checklist runnable with no project key and no dashboard access:
open the world, exercise a control, and read the array.

Two Playwright scripts automate the checklist against a dev server:

```
npm run dev -- --port 5701 --strictPort
node scripts/analytics_check.mjs http://localhost:5701             # 11 checks, fast
node scripts/analytics_check_engagement.mjs http://localhost:5701  # 6 checks, ~2 min
```

They cover session/visit counting, URL stripping, DNT and GPC, duplicate
control events, engagement timing with visibility pausing, and the share path.
