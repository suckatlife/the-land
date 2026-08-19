// Product analytics for The Land.
//
// The point of this module is that it is the ONLY place that knows which
// analytics provider is in use. Every product call site goes through
// `trackEvent`, so swapping providers never touches the simulation UI.
//
// Provider: PostHog, configured as strictly as it can be configured. The
// original implementation used Vercel Web Analytics, which is cookie-free and a
// good fit, but Vercel restricts custom events to Pro/Enterprise and this
// account is on Hobby (verified against the Vercel API, 2026-08-19), so every
// custom event would have been silently dropped. See ANALYTICS.md.
//
// Privacy rules enforced here, not by convention:
//   - no autocapture, no session recording, no heatmaps
//   - no person profiles and no persistent identity (memory-only persistence,
//     so the provider writes nothing to disk and a reload is a new anonymous id)
//   - query strings and fragments are stripped from every URL and referrer,
//     which is what keeps world seeds and shared links out of analytics
//   - Do Not Track and Global Privacy Control disable analytics entirely
//
// The provider is loaded with a DYNAMIC import, so a viewer who has opted out
// (or any build with no project key) never downloads or parses the analytics
// library at all — "no analytics script is loaded" is then literally true,
// rather than true only of the network requests it would have made. It also
// keeps ~200KB of provider code out of the initial bundle for a page whose
// whole job is to start drawing quickly.
type PostHog = typeof import('posthog-js').default;

type AnalyticsEventMap = {
  visit_started: { visitor_status: 'new' | 'returning' };
  engagement_reached: { minutes: 1 | 5 | 10 };
  world_shared: { method: 'native' | 'clipboard' };
  fullscreen_toggled: { enabled: boolean; source: 'control' | 'double_click' | 'system' };
  wake_lock_toggled: { enabled: boolean };
  pwa_installed: { source: 'browser_prompt' | 'standalone_launch' };
  chronicle_toggled: { enabled: boolean };
  world_generated: { source: 'manual' | 'automatic' };
};

const VISITED_KEY = 'theLand:analyticsVisited';
const VISIT_SESSION_KEY = 'theLand:analyticsVisitSession';
const PWA_INSTALL_KEY = 'theLand:analyticsPwaInstalled';

const PROJECT_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const API_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';

// `enabled` means the event contract is live; `sending` means a provider is
// actually configured to receive it. They are deliberately separate: without a
// project key the events can still be observed locally for verification, but
// nothing leaves the browser.
let enabled = false;
let sending = false;
let posthog: PostHog | null = null;
// visit_started fires the moment analytics initialises, which is before a
// dynamically imported provider can possibly be ready. Hold anything emitted in
// that window and flush it once the provider loads, so the first visit of a
// session is not the one event that never arrives.
const pending: Array<{ name: string; properties: Record<string, unknown> }> = [];

// Dev-only record of everything the contract emitted, so the verification
// checklist can be run in a browser with no provider credentials at all.
// Never shipped to production and never contains anything not already in the
// event payload.
const emitted: Array<{ name: string; props: Record<string, unknown>; at: number }> = [];

function privacyPreferenceEnabled(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  const dnt = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
  return nav.globalPrivacyControl === true || dnt === '1' || dnt === 'yes';
}

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable is not an error worth surfacing */ }
}
function readSession(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* as above */ }
}

// The single most important privacy function in the file: everything that could
// carry a seed or a shared link is a URL, and this is what empties them.
function stripUrl(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value;
  try {
    const url = new URL(value, window.location.origin);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

const URL_PROPERTIES = new Set([
  '$current_url', '$referrer', '$initial_current_url', '$initial_referrer', '$pathname',
]);

function sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...properties };
  for (const key of Object.keys(out)) {
    if (URL_PROPERTIES.has(key)) out[key] = stripUrl(out[key]);
  }
  return out;
}

function currentUrl(): string {
  return String(stripUrl(window.location.href));
}

export function trackEvent<Name extends keyof AnalyticsEventMap>(
  name: Name,
  properties: AnalyticsEventMap[Name],
): void {
  if (!enabled) return;
  if (import.meta.env.DEV) emitted.push({ name, props: { ...properties }, at: Date.now() });
  if (!sending) return;
  const payload = { ...properties, $current_url: currentUrl() };
  if (!posthog) { pending.push({ name, properties: payload }); return; }
  posthog.capture(name, payload);
}

function startEngagementTracking(): void {
  const thresholds = [
    { seconds: 60, minutes: 1 },
    { seconds: 300, minutes: 5 },
    { seconds: 600, minutes: 10 },
  ] as const;
  const reached = new Set<number>();
  let visibleSeconds = 0;
  let visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
  let timer = 0;

  const update = () => {
    const now = performance.now();
    if (visibleSince !== null) {
      visibleSeconds += (now - visibleSince) / 1000;
      visibleSince = now;
    }
    for (const threshold of thresholds) {
      if (visibleSeconds >= threshold.seconds && !reached.has(threshold.seconds)) {
        reached.add(threshold.seconds);
        trackEvent('engagement_reached', { minutes: threshold.minutes });
      }
    }
    // Nothing left to reach: stop waking up once a second for the rest of the
    // session (a world can be left running for hours on a second screen).
    if (reached.size === thresholds.length && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };

  timer = window.setInterval(update, 1000);
  document.addEventListener('visibilitychange', () => {
    update();
    visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
  });
  window.addEventListener('pagehide', update);
}

function startInstallTracking(): void {
  const recordInstall = (source: AnalyticsEventMap['pwa_installed']['source']) => {
    if (readLocal(PWA_INSTALL_KEY)) return;
    writeLocal(PWA_INSTALL_KEY, '1');
    trackEvent('pwa_installed', { source });
  };

  window.addEventListener('appinstalled', () => recordInstall('browser_prompt'));

  const nav = navigator as Navigator & { standalone?: boolean };
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  if (isStandalone) recordInstall('standalone_launch');
}

async function loadProvider(): Promise<void> {
  try {
    const module = await import('posthog-js');
    const client = module.default;
    client.init(PROJECT_KEY!, {
      api_host: API_HOST,
      autocapture: false,              // no incidental DOM/click capture
      disable_session_recording: true, // never record the screen
      person_profiles: 'never',        // no person profiles, ever
      persistence: 'memory',           // provider writes nothing to disk
      respect_dnt: true,               // belt and braces alongside the check above
      capture_pageview: false,         // sent manually below, with a stripped URL
      capture_performance: false,
      advanced_disable_decide: true,   // no feature-flag/config round trip
      sanitize_properties: sanitizeProperties,
    });
    posthog = client;
    client.capture('$pageview', { $current_url: currentUrl() });
    for (const event of pending.splice(0)) client.capture(event.name, event.properties);
  } catch {
    // A provider that fails to load must not break the world; the contract
    // simply stops sending.
    sending = false;
    pending.length = 0;
  }
}

export function initializeAnalytics(): void {
  if (privacyPreferenceEnabled()) return;
  enabled = true;

  if (PROJECT_KEY) {
    sending = true;
    void loadProvider();
  }
  if (import.meta.env.DEV) {
    (window as unknown as { __analyticsLog?: typeof emitted }).__analyticsLog = emitted;
  }

  if (readSession(VISIT_SESSION_KEY) === null) {
    const returning = readLocal(VISITED_KEY) !== null;
    writeSession(VISIT_SESSION_KEY, '1');
    writeLocal(VISITED_KEY, '1');
    trackEvent('visit_started', { visitor_status: returning ? 'returning' : 'new' });
  }
  startEngagementTracking();
  startInstallTracking();
}
