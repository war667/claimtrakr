import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function DisclaimerBanner() {
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);

  // Re-show on every navigation
  const [lastPath, setLastPath] = useState(location.pathname);
  if (location.pathname !== lastPath) {
    setLastPath(location.pathname);
    setDismissed(false);
  }

  if (dismissed) return null;

  return (
    <div style={{
      background: '#fef3c7',
      borderBottom: '1px solid #fbbf24',
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      fontSize: '13px',
      lineHeight: '1.5',
      color: '#92400e',
    }}>
      <span style={{ flexShrink: 0, marginTop: '1px' }}>⚠️</span>
      <span style={{ flex: 1 }}>
        <strong>INTERNAL RESEARCH TOOL</strong> — A closed claim does{' '}
        <strong>NOT</strong> confirm land is open to mineral location. All
        candidate targets require independent legal, land-status, and field
        verification before any staking decision is made.
      </span>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#92400e',
          fontSize: '16px',
          lineHeight: 1,
          padding: '0 2px',
          flexShrink: 0,
        }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
