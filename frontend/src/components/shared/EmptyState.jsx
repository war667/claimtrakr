import React from 'react';

export default function EmptyState({ icon = '📭', title, message, action }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
      color: '#4b6079',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>{icon}</div>
      {title && (
        <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: '#ffffff', fontWeight: 600 }}>
          {title}
        </h3>
      )}
      {message && (
        <p style={{ margin: '0 0 16px', fontSize: '14px', maxWidth: '400px', color: '#94a3b8' }}>
          {message}
        </p>
      )}
      {action}
    </div>
  );
}
