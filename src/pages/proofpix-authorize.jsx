/**
 * ProofPix integration — same-device pairing authorize page.
 *
 * URL: /integrations/proofpix/authorize?return_to=<proofpix-url>
 *
 * Two paths:
 *
 * ─── Mobile UA ─────────────────────────────────────────────────────
 *   1. Validate ?return_to against an allowlist (open-redirect guard).
 *   2. If no SF session, bounce to /signin?continue=… so login lands
 *      the user back here.
 *   3. POST /api/integrations/proofpix/connect/token/issue → mints a
 *      60s single-use base64url token.
 *   4. window.location.replace(return_to + '?token=…&workspace=…').
 *      If the OS hands off, the tab goes hidden and we're done. If we
 *      remain visible for LAUNCH_TIMEOUT_MS, assume the deep-link had
 *      no registered handler (app not installed) and fall through to
 *      the desktop QR panel.
 *
 * ─── Desktop UA ────────────────────────────────────────────────────
 *   Same 1–3, but skip step 4 (proofpix:// has no handler on desktop
 *   and produces `Failed to launch … the scheme does not have a
 *   registered handler` on every browser). Render the QR panel
 *   immediately so the user can scan with their phone.
 *
 * Why not a backend route: SF auth is JWT-in-localStorage, not
 * cookies. A bare backend GET can't see the JWT, and passing it via
 * ?jwt=… would leak it through Referer on the subsequent redirect to
 * proofpix://. Pure-frontend with localStorage access is the only
 * model compatible with SF's existing auth envelope.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const ALLOWED_RETURN_PREFIXES = ['proofpix://', 'https://proofpix.app/'];

// Universal-link entry point on the ProofPix landing page. iOS AASA and
// Android assetlinks are registered against www.proofpix.app for the
// /connect path, so this URL:
//   • opens the ProofPix app directly if installed (AASA / App Links
//     handoff, no browser rendering step)
//   • falls through to the SPA install-nudge page if the app is missing
// This is what the QR encodes so scanning works on any phone regardless
// of app-install state — safer than embedding the raw proofpix:// scheme
// which dead-ends on missing-app phones.
const UNIVERSAL_CONNECT_URL = 'https://www.proofpix.app/connect';

const API_BASE =
  process.env.REACT_APP_API_URL ||
  'https://service-flow-backend-production-4568.up.railway.app/api';

// If the mobile-UA deep-link launch leaves us visible longer than
// this, assume the OS has no handler for proofpix:// and drop into
// the QR panel. Chosen empirically: iOS Safari's app-launch prompt
// resolves inside ~1–2s; 2.5s is comfortably above that without
// making a failed launch feel laggy.
const LAUNCH_TIMEOUT_MS = 2500;

function isAllowedReturnTo(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  return ALLOWED_RETURN_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function decodeJwtPayload(jwtString) {
  // Parse the JWT payload (no signature verification — frontend can't,
  // and doesn't need to; the backend re-verifies on /connect/token/issue).
  try {
    const parts = jwtString.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

function decodeJwtUserId(jwtString) {
  const payload = decodeJwtPayload(jwtString);
  if (!payload) return null;
  const id = payload.userId ?? payload.id;
  if (id == null) return null;
  return String(id);
}

// A stale `authToken` in localStorage would get rejected by the backend
// with INVALID_TOKEN. Check exp locally BEFORE hitting the API so we can
// bounce the user through /signin instead of surfacing the backend's
// terse rejection copy. Small clock-skew grace (5s).
function isJwtExpired(jwtString) {
  const payload = decodeJwtPayload(jwtString);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() >= (payload.exp - 5) * 1000;
}

function isMobileUA() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

class PairMintError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Mints a single-use pairing token and builds the deep-link URL. Used
// both on first mount and by the "Generate new code" button when the
// 60s TTL runs out with the QR still on screen. Throws PairMintError
// with a stable `code` so both call sites can share the same
// error-handling switch (401 → nuke local JWT + signin bounce,
// 404 → workspace-owner remediation copy, everything else → error card).
async function mintPairingToken(sfJwt, returnTo) {
  const res = await fetch(`${API_BASE}/integrations/proofpix/connect/token/issue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sfJwt}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    // Bare 404 with no body = flag gate at proofpix-service.js is off
    // for this deployment (see proofpix-service.js:99-103). Surface the
    // per-workspace-owner remediation copy so a team member whose owner
    // hasn't enabled the integration gets an actionable message instead
    // of the INVALID_TOKEN wall the 2026-07-22 report flagged.
    if (res.status === 404) {
      throw new PairMintError(
        'INTEGRATION_DISABLED',
        'Ask your workspace owner to enable the ProofPix integration in Settings → Integrations.'
      );
    }
    const errBody = await res.json().catch(() => null);
    const backendCode = errBody?.error?.code || `HTTP_${res.status}`;
    // 401 INVALID_TOKEN post-login → JWT rejected server-side (secret
    // rotation, signing mismatch, etc). Caller nukes the stale token
    // and bounces through /signin.
    if (res.status === 401 && backendCode === 'INVALID_TOKEN') {
      throw new PairMintError('UNAUTHENTICATED', 'Session expired.');
    }
    const message = errBody?.error?.message || `Token mint failed (${res.status}).`;
    throw new PairMintError(backendCode, message);
  }

  const body = await res.json();
  if (!body.token) throw new PairMintError('EMPTY_TOKEN', 'Empty token in response.');

  const userId = decodeJwtUserId(sfJwt) || '';
  const tokenParam = encodeURIComponent(body.token);
  const workspaceParam = encodeURIComponent(userId);
  const separator = returnTo.includes('?') ? '&' : '?';

  // deepLinkUrl honors the caller-provided returnTo (typically
  // proofpix://connect) — used for the mobile-UA direct launch where
  // we WANT the raw scheme so an installed app opens without any
  // browser interstitial.
  const deepLinkUrl =
    `${returnTo}${separator}token=${tokenParam}` +
    `&workspace=${workspaceParam}`;

  // scanUrl is always the universal-link version — used for the QR and
  // the mobile "Try opening it directly" retry link, both of which
  // benefit from the landing-page install-nudge fallback if the target
  // phone doesn't have ProofPix installed.
  const scanUrl = `${UNIVERSAL_CONNECT_URL}?token=${tokenParam}&workspace=${workspaceParam}`;

  // Backend returns expires_in in seconds (see /connect/token/issue
  // response: expires_in: Math.floor(CONNECT_TOKEN_TTL_MS / 1000)).
  // Fall back to 60s if omitted so the countdown still runs.
  const ttlSec = typeof body.expires_in === 'number' ? body.expires_in : 60;
  return { deepLinkUrl, scanUrl, expiresAt: Date.now() + ttlSec * 1000 };
}

function bounceToSignin(returnTo) {
  const continueUrl = `/integrations/proofpix/authorize?return_to=${encodeURIComponent(returnTo)}`;
  window.location.replace(`/signin?continue=${encodeURIComponent(continueUrl)}`);
}

export default function ProofPixAuthorize() {
  const [status, setStatus] = useState('starting');
  const [errorMessage, setErrorMessage] = useState(null);
  const [deepLinkUrl, setDeepLinkUrl] = useState(null);
  const [scanUrl, setScanUrl] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [regenerating, setRegenerating] = useState(false);

  const returnToRef = useRef(null);
  const sfJwtRef = useRef(null);
  const launchTimerRef = useRef(null);
  const visListenerRef = useRef(null);
  const isMobile = isMobileUA();

  // Countdown ticker for the QR panel. Runs whenever we have an
  // expiresAt (i.e. a token is minted and on screen).
  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const handleRegenerate = useCallback(async () => {
    if (regenerating || !returnToRef.current || !sfJwtRef.current) return;
    setRegenerating(true);
    try {
      const result = await mintPairingToken(sfJwtRef.current, returnToRef.current);
      setDeepLinkUrl(result.deepLinkUrl);
      setScanUrl(result.scanUrl);
      setExpiresAt(result.expiresAt);
    } catch (err) {
      if (err.code === 'UNAUTHENTICATED') {
        localStorage.removeItem('authToken');
        bounceToSignin(returnToRef.current);
        return;
      }
      setStatus('error');
      setErrorMessage(err.message || 'Could not generate pairing token.');
    } finally {
      setRegenerating(false);
    }
  }, [regenerating]);

  // Retry the OS handoff. Uses the universal-link URL (not the raw
  // proofpix:// scheme) so a phone that doesn't have ProofPix falls
  // through to the landing page install-nudge instead of dead-ending.
  const handleRetryLaunch = useCallback(() => {
    if (!scanUrl) return;
    window.location.assign(scanUrl);
  }, [scanUrl]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('return_to');

      if (!isAllowedReturnTo(returnTo)) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(
            'Invalid return_to URL. Expected a proofpix:// or https://proofpix.app/ destination.'
          );
        }
        return;
      }
      returnToRef.current = returnTo;

      const sfJwt = localStorage.getItem('authToken');
      if (!sfJwt || isJwtExpired(sfJwt)) {
        bounceToSignin(returnTo);
        return;
      }
      sfJwtRef.current = sfJwt;

      if (!cancelled) setStatus('minting');
      let mintResult;
      try {
        mintResult = await mintPairingToken(sfJwt, returnTo);
      } catch (err) {
        if (cancelled) return;
        if (err.code === 'UNAUTHENTICATED') {
          localStorage.removeItem('authToken');
          bounceToSignin(returnTo);
          return;
        }
        setStatus('error');
        setErrorMessage(err.message || 'Could not generate pairing token.');
        return;
      }
      if (cancelled) return;

      setDeepLinkUrl(mintResult.deepLinkUrl);
      setScanUrl(mintResult.scanUrl);
      setExpiresAt(mintResult.expiresAt);

      if (isMobile) {
        // Try the OS handoff. If it succeeds the tab goes hidden; we
        // listen for visibilitychange to cancel the fallback watchdog.
        // If we're still visible after LAUNCH_TIMEOUT_MS, no app
        // claimed the scheme — fall through to the QR panel so the
        // user can scan with a *different* phone that has ProofPix.
        setStatus('redirecting');

        const onVis = () => {
          if (document.visibilityState === 'hidden' && launchTimerRef.current) {
            clearTimeout(launchTimerRef.current);
            launchTimerRef.current = null;
          }
        };
        document.addEventListener('visibilitychange', onVis);
        visListenerRef.current = onVis;

        launchTimerRef.current = setTimeout(() => {
          launchTimerRef.current = null;
          if (!cancelled && document.visibilityState === 'visible') {
            setStatus('awaiting_scan');
          }
        }, LAUNCH_TIMEOUT_MS);

        // Replace (not assign) so the back button doesn't return to a
        // stale URL containing the pairing token in the query string.
        window.location.replace(mintResult.deepLinkUrl);
      } else {
        // Desktop: proofpix:// has no handler here, skip straight to QR.
        setStatus('awaiting_scan');
      }
    })();

    return () => {
      cancelled = true;
      if (launchTimerRef.current) {
        clearTimeout(launchTimerRef.current);
        launchTimerRef.current = null;
      }
      if (visListenerRef.current) {
        document.removeEventListener('visibilitychange', visListenerRef.current);
        visListenerRef.current = null;
      }
    };
  }, [isMobile]);

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {status === 'error' && (
          <ErrorView message={errorMessage} onBack={() => window.history.back()} />
        )}

        {status === 'awaiting_scan' && (
          <ScanView
            scanUrl={scanUrl}
            secondsLeft={secondsLeft}
            expired={secondsLeft <= 0}
            onRegenerate={handleRegenerate}
            regenerating={regenerating}
            isMobile={isMobile}
            onRetryLaunch={handleRetryLaunch}
          />
        )}

        {(status === 'starting' || status === 'minting' || status === 'redirecting') && (
          <SpinnerView status={status} />
        )}
      </div>
    </div>
  );
}

function ErrorView({ message, onBack }) {
  return (
    <>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
      <h1 style={{ fontSize: '20px', margin: '0 0 8px', color: '#0f172a' }}>
        Couldn't connect to ProofPix
      </h1>
      <p style={{ fontSize: '14px', color: '#475569', margin: 0 }}>{message}</p>
      <button type="button" onClick={onBack} style={secondaryButtonStyle}>
        Go back
      </button>
    </>
  );
}

function SpinnerView({ status }) {
  return (
    <>
      <Spinner />
      <h1 style={{ fontSize: '20px', margin: '16px 0 8px', color: '#0f172a' }}>
        Connecting to ProofPix…
      </h1>
      <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
        {status === 'starting' && 'Verifying your Service Flow session.'}
        {status === 'minting' && 'Generating a one-time pairing token.'}
        {status === 'redirecting' && 'Opening ProofPix on this device.'}
      </p>
    </>
  );
}

function ScanView({
  scanUrl,
  secondsLeft,
  expired,
  onRegenerate,
  regenerating,
  isMobile,
  onRetryLaunch,
}) {
  const countdownColor =
    expired ? '#dc2626' : secondsLeft <= 15 ? '#d97706' : '#64748b';

  return (
    <>
      <h1 style={{ fontSize: '20px', margin: '0 0 8px', color: '#0f172a' }}>
        Scan with your phone
      </h1>
      <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 20px' }}>
        Open the ProofPix app on your phone, then scan this code with your camera.
      </p>

      <div
        style={{
          display: 'inline-block',
          padding: '16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          opacity: expired ? 0.35 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {scanUrl && (
          <QRCodeSVG value={scanUrl} size={200} level="M" includeMargin={false} />
        )}
      </div>

      <p style={{ fontSize: '13px', color: countdownColor, margin: '16px 0 0' }}>
        {expired ? 'Code expired' : `Expires in ${secondsLeft}s`}
      </p>

      {expired && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          style={{ ...primaryButtonStyle, marginTop: '12px' }}
        >
          {regenerating ? 'Generating…' : 'Generate new code'}
        </button>
      )}

      {isMobile && !expired && (
        <p style={{ fontSize: '13px', color: '#64748b', margin: '20px 0 0' }}>
          Already have ProofPix on this phone?{' '}
          <button type="button" onClick={onRetryLaunch} style={linkButtonStyle}>
            Try opening it directly
          </button>
        </p>
      )}

      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '20px 0 0' }}>
        Don't have ProofPix yet? Scan anyway — you'll get an install link.
      </p>
    </>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: '40px',
        height: '40px',
        margin: '0 auto',
        border: '3px solid #e2e8f0',
        borderTopColor: '#1976F2',
        borderRadius: '50%',
        animation: 'proofpix-spin 0.8s linear infinite',
      }}
    >
      <style>{`@keyframes proofpix-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#f8fafc',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  padding: '24px',
};

const cardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '420px',
  width: '100%',
  textAlign: 'center',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
};

const primaryButtonStyle = {
  padding: '10px 20px',
  fontSize: '14px',
  border: 'none',
  borderRadius: '8px',
  backgroundColor: '#1976F2',
  color: '#ffffff',
  cursor: 'pointer',
  fontWeight: 500,
};

const secondaryButtonStyle = {
  marginTop: '20px',
  padding: '10px 20px',
  fontSize: '14px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  color: '#0f172a',
  cursor: 'pointer',
};

const linkButtonStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#1976F2',
  cursor: 'pointer',
  fontSize: 'inherit',
  textDecoration: 'underline',
};
