/**
 * Settings → Integrations → ProofPix.
 *
 * Fetches the caller's active ProofPix devices from
 * GET /api/integrations/proofpix/connections (SF JWT auth) and renders:
 *
 *   • Loading → skeleton card.
 *   • Zero devices → "Connect this workspace" card that bounces through
 *     /integrations/proofpix/authorize (mints token + deep-links or
 *     renders QR on desktop).
 *   • ≥1 device → "Connected devices" list + "Connect another device"
 *     link. Just-paired arrivals (?paired=1 in the URL) surface a
 *     dismissable green success banner at the top.
 *
 * Auth: reads authToken from localStorage — same envelope as the
 * authorize page. 401 bounces through /signin?continue=/settings/proofpix
 * so an expired-JWT admin doesn't dead-end on the error card.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const API_BASE =
  process.env.REACT_APP_API_URL ||
  'https://service-flow-backend-production-4568.up.railway.app/api';

// How long the fresh-pair success banner stays before auto-dismissing.
// Kept short — it's a signal, not a modal; the devices list below is
// the persistent proof of "you are connected."
const PAIRED_BANNER_DISMISS_MS = 5000;

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function bounceToSigninHere() {
  window.location.replace(
    `/signin?continue=${encodeURIComponent('/settings/proofpix')}`
  );
}

export default function ProofPixIntegrationSettings() {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [connections, setConnections] = useState([]);
  // Per-device disconnect state — keyed by connection.id so multiple
  // simultaneous disconnects each get their own spinner without a
  // shared "busy" flag blocking the others.
  const [disconnectingIds, setDisconnectingIds] = useState(() => new Set());
  const [showPairedBanner, setShowPairedBanner] = useState(
    new URLSearchParams(location.search).get('paired') === '1'
  );

  const loadConnections = useCallback(async () => {
    const sfJwt = localStorage.getItem('authToken');
    if (!sfJwt) {
      bounceToSigninHere();
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/integrations/proofpix/connections`, {
        headers: { Authorization: `Bearer ${sfJwt}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('authToken');
        bounceToSigninHere();
        return;
      }
      if (res.status === 404) {
        // Flag gate is off for this deployment — treat as "integration
        // not available" rather than "not connected", so the copy matches
        // reality (there's nothing the admin can do from here).
        setErrorMessage(
          'The ProofPix integration is not enabled on this workspace. Ask an admin to turn it on.'
        );
        setConnections([]);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load devices (HTTP ${res.status}).`);
      }
      const body = await res.json();
      setConnections(Array.isArray(body?.connections) ? body.connections : []);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load ProofPix devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Auto-dismiss the fresh-pair banner.
  useEffect(() => {
    if (!showPairedBanner) return undefined;
    const id = setTimeout(() => setShowPairedBanner(false), PAIRED_BANNER_DISMISS_MS);
    return () => clearTimeout(id);
  }, [showPairedBanner]);

  const handleConnect = () => {
    const returnTo = encodeURIComponent('proofpix://connect');
    window.location.href = `/integrations/proofpix/authorize?return_to=${returnTo}`;
  };

  const handleDisconnect = useCallback(
    async (connection) => {
      // Native confirm is fine here — a modal dialog would be
      // over-engineered for a one-line "are you sure" on a
      // reversible-ish action (they can re-pair from the same page).
      const label = connection.device_label || connection.device_model || 'this device';
      if (!window.confirm(`Disconnect ${label} from Service Flow?`)) return;

      const sfJwt = localStorage.getItem('authToken');
      if (!sfJwt) {
        bounceToSigninHere();
        return;
      }
      setDisconnectingIds((prev) => new Set(prev).add(connection.id));
      try {
        const res = await fetch(
          `${API_BASE}/integrations/proofpix/connections/${encodeURIComponent(connection.id)}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${sfJwt}` } }
        );
        if (res.status === 401) {
          localStorage.removeItem('authToken');
          bounceToSigninHere();
          return;
        }
        // 204 = revoked, 404 = already gone (from another tab / device).
        // Both are user-visible successes — just refresh the list.
        if (res.status === 204 || res.status === 404) {
          await loadConnections();
          return;
        }
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Disconnect failed (HTTP ${res.status}).`);
      } catch (err) {
        setErrorMessage(err.message || 'Failed to disconnect device.');
      } finally {
        setDisconnectingIds((prev) => {
          const next = new Set(prev);
          next.delete(connection.id);
          return next;
        });
      }
    },
    [loadConnections]
  );

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: '24px' }}>
        <a href="/settings" style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none' }}>
          ← Back to Settings
        </a>
      </div>

      <h1 style={{ fontSize: '24px', margin: '0 0 8px', color: '#0f172a' }}>ProofPix</h1>
      <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 24px', lineHeight: 1.6 }}>
        Attach before/after photos captured in ProofPix directly to Service Flow jobs. Photos show
        up automatically in the customer's Files tab.
      </p>

      {showPairedBanner && (
        <PairedBanner onDismiss={() => setShowPairedBanner(false)} />
      )}

      {loading && <SkeletonCard />}

      {!loading && errorMessage && <ErrorCard message={errorMessage} onRetry={loadConnections} />}

      {!loading && !errorMessage && connections.length === 0 && (
        <>
          <ConnectCard onConnect={handleConnect} />
          <LaptopTipCard />
        </>
      )}

      {!loading && !errorMessage && connections.length > 0 && (
        <>
          <DevicesCard
            connections={connections}
            onConnectAnother={handleConnect}
            onDisconnect={handleDisconnect}
            disconnectingIds={disconnectingIds}
          />
          <LaptopTipCard />
        </>
      )}
    </div>
  );
}

function PairedBanner({ onDismiss }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '12px',
        padding: '14px 18px',
        marginBottom: '16px',
      }}
      role="status"
    >
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: '#dcfce7',
          color: '#16a34a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        ✓
      </div>
      <div style={{ flex: 1, fontSize: '14px', color: '#166534' }}>
        Device paired successfully.
      </div>
      <button type="button" onClick={onDismiss} style={dismissButtonStyle} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={cardStyle}>
      <div style={{ height: '18px', width: '40%', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '12px' }} />
      <div style={{ height: '12px', width: '80%', backgroundColor: '#f1f5f9', borderRadius: '4px', marginBottom: '8px' }} />
      <div style={{ height: '12px', width: '60%', backgroundColor: '#f1f5f9', borderRadius: '4px' }} />
    </div>
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '16px', margin: '0 0 8px', color: '#0f172a' }}>
        Couldn't load ProofPix devices
      </h2>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px', lineHeight: 1.5 }}>
        {message}
      </p>
      <button type="button" onClick={onRetry} style={secondaryButtonStyle}>
        Try again
      </button>
    </div>
  );
}

function ConnectCard({ onConnect }) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '16px', margin: '0 0 8px', color: '#0f172a' }}>
        Connect this workspace
      </h2>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.5 }}>
        Tap below on the device where ProofPix is installed. We'll generate a one-time pairing
        token, hand off to ProofPix, and bring you back when it's connected.
      </p>
      <button type="button" onClick={onConnect} style={primaryButtonStyle}>
        Connect ProofPix
      </button>
    </div>
  );
}

function DevicesCard({ connections, onConnectAnother, onDisconnect, disconnectingIds }) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '16px', margin: '0 0 4px', color: '#0f172a' }}>
        Connected devices
      </h2>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
        {connections.length === 1
          ? '1 device is paired with this workspace.'
          : `${connections.length} devices are paired with this workspace.`}
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
        {connections.map((conn, idx) => (
          <DeviceRow
            key={conn.id}
            connection={conn}
            isFirst={idx === 0}
            onDisconnect={onDisconnect}
            isDisconnecting={disconnectingIds.has(conn.id)}
          />
        ))}
      </ul>

      <button type="button" onClick={onConnectAnother} style={secondaryButtonStyle}>
        Connect another device
      </button>
    </div>
  );
}

function DeviceRow({ connection, isFirst, onDisconnect, isDisconnecting }) {
  const title =
    connection.device_label ||
    connection.device_model ||
    'Unnamed device';

  // "iPhone 15 Pro • iOS 18.2" — either half is optional. Empty string
  // if the mobile client sent neither (pre-metadata-rollout rows).
  const modelParts = [];
  if (connection.device_model && connection.device_model !== connection.device_label) {
    modelParts.push(connection.device_model);
  }
  if (connection.os_name || connection.os_version) {
    modelParts.push([connection.os_name, connection.os_version].filter(Boolean).join(' '));
  }
  const modelLine = modelParts.join(' • ');

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 0',
        borderTop: isFirst ? '1px solid #e2e8f0' : 'none',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          backgroundColor: '#eff6ff',
          color: '#1976F2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          fontWeight: 600,
          flexShrink: 0,
        }}
        aria-hidden
      >
        📱
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '14px',
              color: '#0f172a',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          {connection.role && <RoleBadge role={connection.role} />}
        </div>

        {modelLine && (
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
            {modelLine}
          </div>
        )}

        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
          Connected {formatDate(connection.created_at)}
          {connection.last_used_at && ` • Last used ${formatDate(connection.last_used_at)}`}
        </div>

        {(connection.paired_from_ip || connection.last_seen_ip) && (
          <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
            {connection.last_seen_ip
              ? `Last seen from ${connection.last_seen_ip}`
              : `Paired from ${connection.paired_from_ip}`}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDisconnect(connection)}
        disabled={isDisconnecting}
        style={{
          ...disconnectButtonStyle,
          opacity: isDisconnecting ? 0.5 : 1,
          cursor: isDisconnecting ? 'default' : 'pointer',
        }}
      >
        {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
      </button>
    </li>
  );
}

function RoleBadge({ role }) {
  const isAdmin = role === 'admin';
  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '2px 8px',
        borderRadius: '999px',
        backgroundColor: isAdmin ? '#eef2ff' : '#f1f5f9',
        color: isAdmin ? '#4338ca' : '#475569',
      }}
    >
      {isAdmin ? 'Admin' : role.replace(/_/g, ' ')}
    </span>
  );
}

function LaptopTipCard() {
  return (
    <div style={tipCardStyle}>
      <h3 style={{ fontSize: '13px', margin: '0 0 8px', color: '#475569', fontWeight: 600 }}>
        On a laptop without ProofPix installed?
      </h3>
      <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
        The Connect button shows a QR code — open ProofPix on your phone and scan it. The desktop
        tab will refresh automatically once the pair completes.
      </p>
    </div>
  );
}

const pageStyle = {
  maxWidth: '720px',
  margin: '0 auto',
  padding: '32px 24px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const cardStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '16px',
};

const tipCardStyle = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '20px',
};

const primaryButtonStyle = {
  padding: '10px 20px',
  fontSize: '14px',
  fontWeight: 500,
  border: 'none',
  borderRadius: '8px',
  backgroundColor: '#1976F2',
  color: '#ffffff',
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  padding: '9px 18px',
  fontSize: '14px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  color: '#0f172a',
  cursor: 'pointer',
};

const dismissButtonStyle = {
  background: 'none',
  border: 'none',
  padding: '4px 8px',
  color: '#166534',
  cursor: 'pointer',
  fontSize: '20px',
  lineHeight: 1,
};

const disconnectButtonStyle = {
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 500,
  border: '1px solid #fecaca',
  borderRadius: '6px',
  backgroundColor: '#ffffff',
  color: '#dc2626',
  flexShrink: 0,
};
