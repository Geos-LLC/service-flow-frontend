import { Component } from 'react';
import { captureException } from '@fixprompt/browser';

export class FixPromptBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    captureException(error, { attrs: { boundary: 'FixPromptBoundary' } });
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            fontSize: 14,
            color: '#374151',
            textAlign: 'center',
            marginTop: 80,
            fontFamily: 'inherit',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 16, color: '#111827' }}>
            Something went wrong loading this page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              color: '#111827',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
