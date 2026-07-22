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

function decodeJwtPayload(jwtString) {
  // Parse the JWT payload (no signature verification — frontend can't,
  // and doesn't need to; the backend re-verifies on /connect/token/issue).
  // Returns null if the token is malformed.
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
// with INVALID_TOKEN, which is what the fresh-install-plus-login bug was
// surfacing on 2026-07-22. Check exp locally BEFORE hitting the API so
// we can bounce the user back through /signin instead of surfacing the
// backend's terse rejection copy.
function isJwtExpired(jwtString) {
  const payload = decodeJwtPayload(jwtString);
  if (!payload || typeof payload.exp !== 'number') return true;
  // Small clock-skew grace (5s) — cheaper than getting rejected by the
  // backend, walking back to /signin, and re-doing the round-trip.
  return Date.now() >= (payload.exp - 5) * 1000;
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

      // 2. Auth check. If unauthenticated OR the stored JWT has already
      //    expired, bounce to /signin with a continue= param so the login
      //    flow returns to this exact authorize URL. Checking exp
      //    client-side (in addition to the null check) means a fresh
      //    install with a stale ghost token from an earlier session
      //    doesn't sail into the backend and come back with the
      //    generic INVALID_TOKEN copy — we send them through /signin
      //    the same way an unauth'd user goes.
      const sfJwt = localStorage.getItem('authToken');
      const needsSignin = !sfJwt || isJwtExpired(sfJwt);
      if (needsSignin) {
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
          // 404 = feature flag off on this SF instance (bare 404 with no
          // body from proofpix-service's flag gate). Surface the
          // per-workspace-admin remediation copy instead of the generic
          // "token mint failed" line — a team member or an admin whose
          // owner hasn't enabled the integration would otherwise hit the
          // same INVALID_TOKEN wall as an actually-broken token, which
          // is exactly what the 2026-07-22 report flagged.
          if (res.status === 404) {
            throw new Error(
              'INTEGRATION_DISABLED: Ask your workspace owner to enable the ProofPix integration in Settings → Integrations.'
            );
          }
          const errBody = await res.json().catch(() => null);
          const code = errBody?.error?.code || `HTTP_${res.status}`;
          // 401 INVALID_TOKEN post-login almost always means the JWT
          // was somehow rejected by the backend (secret rotation,
          // signing mismatch, etc). Nuke the stale credential so the
          // next attempt starts clean.
          if (res.status === 401 && code === 'INVALID_TOKEN') {
            localStorage.removeItem('authToken');
            const continueUrl = `/integrations/proofpix/authorize?return_to=${encodeURIComponent(returnTo)}`;
            window.location.replace(`/signin?continue=${encodeURIComponent(continueUrl)}`);
            return;
          }
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
