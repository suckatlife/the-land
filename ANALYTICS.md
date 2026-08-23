# Analytics plan

The Land uses Vercel Web Analytics through `src/analytics.ts`. The wrapper keeps event names and privacy controls in one place so the provider can be changed without touching product code.

## Privacy rules

- No cookies, accounts, persistent user IDs, world seeds, shared URLs, Chronicle text, or saved-world data are sent.
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
| `fullscreen_toggled` | After entering or leaving fullscreen succeeds | `enabled`, `source` |
| `wake_lock_toggled` | After Stay Awake is enabled successfully or intentionally disabled | `enabled` |
| `pwa_installed` | Browser install confirmation, or the first detected standalone launch | `source` |
| `chronicle_toggled` | Chronicle is turned on or off from public controls | `enabled` |
| `world_generated` | A new random world begins manually or after a completed cycle | `source`: `manual` or `automatic` |

## Operations

Web Analytics must be enabled for the Vercel project before deployment. Vercel limits custom events to Pro and Enterprise plans; pageviews still work on supported plans.

**Resolved 2026-08-23:** the project is on the **Pro** plan and Web Analytics is enabled on it, so custom events are supported and every event in the table above is live. The Hobby contingency — swapping the provider inside `src/analytics.ts` while keeping the call sites unchanged — is no longer needed, but the wrapper still makes it a one-file change if the plan ever lapses.
