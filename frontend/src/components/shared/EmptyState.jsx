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
      color: '#6b7280',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>{icon}</div>
      {title && (
        <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: '#374151', fontWeight: 600 }}>
          {title}
        </h3>
      )}
      {message && (
        <p style={{ margin: '0 0 16px', fontSize: '14px', maxWidth: '400px' }}>
          {message}
        </p>
      )}
      {action}
    </div>
  );
}
