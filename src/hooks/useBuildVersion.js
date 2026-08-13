import { useEffect, useState } from 'react';

/**
 * Detects when a newer frontend build has shipped while this tab has been
 * open.
 *
 * Mechanism:
 *   - scripts/build-with-version.js injects REACT_APP_BUILD_VERSION (git
 *     short SHA) at build time AND writes the same value to /version.json
 *     after the bundle is emitted.
 *   - At runtime, this hook fetches /version.json periodically. If the
 *     fetched version differs from the embedded REACT_APP_BUILD_VERSION,
 *     the tab is stale → the consumer (UpdateAvailableBanner) prompts the
 *     user to reload.
 *
 * Polling cadence:
 *   - On mount (once)
 *   - Every 5 minutes while the tab is mounted
 *   - On every visibilitychange → visible (the common case is a user
 *     switching back to a tab they left open for hours)
 *
 * Dev mode (NODE_ENV !== 'production') intentionally skips the poll —
 * /version.json isn't emitted by the dev server and HMR handles updates.
 *
 * Ported from Leadbridge/frontend/src/hooks/useBuildVersion.ts +
 * HireFunnel/src/app/dashboard/_components/useBuildVersion.ts. Diverges
 * only in that Service Flow is not a PWA so the service-worker refresh
 * branch is dropped.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useBuildVersion() {
  const current = process.env.REACT_APP_BUILD_VERSION || 'dev';
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    let cancelled = false;

    const check = async () => {
      try {
        const r = await fetch('/version.json', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        if (typeof j.version === 'string' && j.version && j.version !== current) {
          setLatest(j.version);
        }
      } catch {
        // Network blip or offline — try again on next tick. Deliberately
        // silent: a flaky connection shouldn't spam the console every 5 min.
      }
    };

    void check();
    const id = window.setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [current]);

  return {
    current,
    latest,
    updateAvailable: latest !== null && latest !== current,
    reload: () => {
      window.location.reload();
    },
  };
}
