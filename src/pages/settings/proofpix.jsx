/**
 * Settings → Integrations → ProofPix.
 *
 * Single-purpose page: explains what the ProofPix integration does and
 * offers a "Connect ProofPix" button that bounces through the same-device
 * deep-link authorize flow (PR 4).
 *
 * v1 deliberately doesn't render the current connection state —
 * that surface lands when the "Active ProofPix devices" admin UI ships.
 * For now any connected device's refresh token lives on the device
 * itself; the server has the rows but no UI for them yet.
 */

export default function ProofPixIntegrationSettings() {
  const handleConnect = () => {
    // Same-device deep-link: SF mints a single-use 60s pairing token,
    // redirects to proofpix://connect?token=...&workspace=... — OS hands
    // off to ProofPix-native, which POSTs to /connect/redeem.
    const returnTo = encodeURIComponent('proofpix://connect');
    window.location.href = `/integrations/proofpix/authorize?return_to=${returnTo}`;
  };

  return (
    <div
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '32px 24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <a
          href="/settings"
          style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none' }}
        >
          ← Back to Settings
        </a>
      </div>

      <h1 style={{ fontSize: '24px', margin: '0 0 8px', color: '#0f172a' }}>
        ProofPix
      </h1>
      <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 24px', lineHeight: 1.6 }}>
        Attach before/after photos captured in ProofPix directly to Service Flow jobs.
        Photos show up automatically in the customer's Files tab.
      </p>

      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '16px', margin: '0 0 8px', color: '#0f172a' }}>
          Connect this workspace
        </h2>
        <p
          style={{
            fontSize: '13px',
            color: '#64748b',
            margin: '0 0 20px',
            lineHeight: 1.5,
          }}
        >
          Tap below on the device where ProofPix is installed. We'll generate a
          one-time pairing token, hand off to ProofPix, and bring you back when
          it's connected.
        </p>
        <button
          type="button"
          onClick={handleConnect}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#1976F2',
            color: '#ffffff',
            cursor: 'pointer',
          }}
        >
          Connect ProofPix
        </button>
      </div>

      <div
        style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        <h3 style={{ fontSize: '13px', margin: '0 0 8px', color: '#475569', fontWeight: 600 }}>
          On a laptop without ProofPix installed?
        </h3>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
          The deep-link won't resolve on the laptop. The Connect button will
          show a fallback with a QR code + typed code shortly — open ProofPix
          on your phone and scan, or type the code into the connect screen.
        </p>
      </div>
    </div>
  );
}
