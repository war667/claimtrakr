import React from 'react';
import { useLocation } from 'react-router-dom';

const PAGE_TITLES = {
  '/':          'Dashboard',
  '/map':       'Claim Map',
  '/table':     'Claims Table',
  '/targets':   'Targets',
  '/ingestion': 'Data Ingestion',
};

export default function TopBar() {
  const { pathname } = useLocation();
  const base = '/' + pathname.split('/')[1];
  const title = PAGE_TITLES[base] || 'ClaimTrakr';

  return (
    <header style={{
      height: '52px',
      background: '#ffffff',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      flexShrink: 0,
    }}>
      <h1 style={{
        margin: 0,
        fontSize: '16px',
        fontWeight: 600,
        color: '#111827',
      }}>
        {title}
      </h1>
    </header>
  );
}
