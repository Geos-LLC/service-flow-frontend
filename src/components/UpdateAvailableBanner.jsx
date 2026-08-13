import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useBuildVersion } from '../hooks/useBuildVersion';

/**
 * Fixed bottom-right toast that appears when `/version.json` reports a
 * newer build than the one this tab loaded. Clicking "Reload" hard-reloads.
 *
 * Renders nothing when no update is available. Safe to mount once at the
 * app root — the underlying hook handles polling + cleanup.
 *
 * Ported from Leadbridge and HireFunnel to unblock the "operators sit on
 * stale bundles for days because their tab has been open for a week"
 * failure mode.
 */
const UpdateAvailableBanner = () => {
  const { updateAvailable, reload } = useBuildVersion();
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 16px',
        borderRadius: 14,
        background: '#0f172a',
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'Montserrat, inherit',
        boxShadow: '0 10px 32px rgba(0,0,0,0.22)',
        maxWidth: 'calc(100vw - 40px)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <RefreshCw size={14} aria-hidden="true" />
        Update available
      </span>
      <button
        type="button"
        onClick={reload}
        style={{
          padding: '7px 16px',
          borderRadius: 8,
          background: '#3b82f6',
          color: '#ffffff',
          border: 0,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'Montserrat, inherit',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}
        title="Reload to pick up the latest version"
      >
        Reload
      </button>
    </div>
  );
};

export default UpdateAvailableBanner;
