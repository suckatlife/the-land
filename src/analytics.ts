import { inject, track, type BeforeSendEvent } from '@vercel/analytics';

type AnalyticsEventMap = {
  visit_started: { visitor_status: 'new' | 'returning' };
  engagement_reached: { minutes: 1 | 5 | 10 };
  world_shared: { method: 'native' | 'clipboard' };
  fullscreen_toggled: { enabled: boolean; source: 'control' | 'double_click' };
  wake_lock_toggled: { enabled: boolean };
  pwa_installed: { source: 'browser_prompt' | 'standalone_launch' };
  chronicle_toggled: { enabled: boolean };
  world_generated: { source: 'manual' | 'automatic' };
};

type EventProperties = Record<string, string | number | boolean | null>;
const VISITED_KEY = 'theLand:analyticsVisited';
const VISIT_SESSION_KEY = 'theLand:analyticsVisitSession';
const PWA_INSTALL_KEY = 'theLand:analyticsPwaInstalled';
let analyticsEnabled = false;

function privacyPreferenceEnabled(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Analytics should never interfere with the experience when storage is unavailable.
  }
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Analytics should never interfere with the experience when storage is unavailable.
  }
}

function removeWorldDetails(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url, window.location.origin);
  url.search = '';
  url.hash = '';
  return { ...event, url: url.toString() };
}

export function trackEvent<Name extends keyof AnalyticsEventMap>(
  name: Name,
  properties: AnalyticsEventMap[Name],
): void {
  if (!analyticsEnabled) return;
  track(name, properties as EventProperties);
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
  };

  window.setInterval(update, 1000);
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

export function initializeAnalytics(): void {
  if (privacyPreferenceEnabled()) return;

  inject({
    mode: import.meta.env.DEV ? 'development' : 'production',
    debug: import.meta.env.DEV,
    beforeSend: removeWorldDetails,
  });
  analyticsEnabled = true;

  if (readSession(VISIT_SESSION_KEY) === null) {
    const returning = readLocal(VISITED_KEY) !== null;
    writeSession(VISIT_SESSION_KEY, '1');
    writeLocal(VISITED_KEY, '1');
    trackEvent('visit_started', { visitor_status: returning ? 'returning' : 'new' });
  }
  startEngagementTracking();
  startInstallTracking();
}
