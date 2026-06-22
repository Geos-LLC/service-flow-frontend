/**
 * ProofPix integration — same-device pairing authorize page (PR 4).
 *
 * URL: /integrations/proofpix/authorize?return_to=<proofpix-url>
 *
 * Flow:
 *   1. Read & validate ?return_to against an allowlist of safe prefixes.
 *      Rejecting bad inputs HERE protects against open-redirect / token
 *      exfiltration (a malicious return_to could otherwise capture the
 *      pairing token via referrer / network logs).
 *   2. If no SF session (no authToken in localStorage), redirect to
 *      /signin with ?continue=... so the user lands back here after
 *      auth.
 *   3. Hit POST /api/integrations/proofpix/connect/token/issue with the
 *      SF bearer JWT → mints a 60-second single-use base64url token.
 *   4. window.location.replace(return_to + '?token=...&workspace=...')
 *      → OS deep-link handoff into ProofPix-native. Replace (not assign)
 *      so the back button doesn't return to a stale token-leaking URL.
 *
 * Why not a backend route: SF auth is JWT-in-localStorage, not cookies.
 * A bare backend GET can't see the JWT, and passing it via ?jwt=...
 * would leak it through referrer headers on the subsequent 302 to
 * proofpix://. Pure-frontend with localStorage access is the only model
 * compatible with SF's existing auth envelope.
 */

import { useEffect, useState } from 'react';

const ALLOWED_RETURN_PREFIXES = ['proofpix://', 'https://proofpix.app/'];

const API_BASE =
  process.env.REACT_APP_API_URL ||
  'https://service-flow-backend-production-4568.up.railway.app/api';

function isAllowedReturnTo(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  return ALLOWED_RETURN_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function decodeJwtUserId(jwtString) {
  // Parse the JWT payload (no signature verification — frontend can't,
  // and doesn't need to; the backend re-verifies on /connect/token/issue).
  // We just need the userId claim so we can pass workspace= back.
  try {
    const parts = jwtString.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
    const id = payload.userId ?? payload.id;
    if (id == null) return null;
    return String(id);
  } catch {
    return null;
  }
}

export default function ProofPixAuthorize() {
  const [status, setStatus] = useState('starting');
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('return_to');

      // 1. Validate return_to BEFORE doing anything else — protects
      //    against open-redirect abuse + token exfiltration.
      if (!isAllowedReturnTo(returnTo)) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(
            'Invalid return_to URL. Expected a proofpix:// or https://proofpix.app/ destination.'
          );
        }
        return;
      }

      // 2. Auth check. If unauthenticated, bounce to /signin with a
      //    continue= param so the login flow returns to this exact
      //    authorize URL.
      const sfJwt = localStorage.getItem('authToken');
      if (!sfJwt) {
        const continueUrl = `/integrations/proofpix/authorize?return_to=${encodeURIComponent(returnTo)}`;
        window.location.replace(`/signin?continue=${encodeURIComponent(continueUrl)}`);
        return;
      }

      // 3. Mint a single-use pairing token. Backend requires SF JWT.
      if (!cancelled) setStatus('minting');
      let pairToken;
      try {
        const res = await fetch(`${API_BASE}/integrations/proofpix/connect/token/issue`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sfJwt}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          const code = errBody?.error?.code || `HTTP_${res.status}`;
          const message = errBody?.error?.message || `Token mint failed (${res.status}).`;
          throw new Error(`${code}: ${message}`);
        }
        const body = await res.json();
        pairToken = body.token;
        if (!pairToken) throw new Error('Empty token in response.');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(err.message || 'Could not generate pairing token.');
        return;
      }

      // 4. Build the deep-link with the token + workspace id. Workspace
      //    is the SF user id (see backend spec — SF has no separate
      //    company abstraction).
      const userId = decodeJwtUserId(sfJwt) || '';
      const separator = returnTo.includes('?') ? '&' : '?';
      const target =
        `${returnTo}${separator}token=${encodeURIComponent(pairToken)}` +
        `&workspace=${encodeURIComponent(userId)}`;

      if (!cancelled) setStatus('redirecting');
      // Replace (not assign) so the back button doesn't return to a
      // stale URL containing the pairing token in the query string.
      window.location.replace(target);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '420px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
        }}
      >
        {status === 'error' ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
            <h1 style={{ fontSize: '20px', margin: '0 0 8px', color: '#0f172a' }}>
              Couldn't connect to ProofPix
            </h1>
            <p style={{ fontSize: '14px', color: '#475569', margin: 0 }}>{errorMessage}</p>
            <button
              type="button"
              onClick={() => window.history.back()}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                fontSize: '14px',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              Go back
            </button>
          </>
        ) : (
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
        )}
      </div>
    </div>
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
