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
      background: '#0f2039',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      flexShrink: 0,
    }}>
      <h1 style={{
        margin: 0,
        fontSize: '16px',
        fontWeight: 600,
        color: '#ffffff',
      }}>
        {title}
      </h1>
    </header>
  );
}
